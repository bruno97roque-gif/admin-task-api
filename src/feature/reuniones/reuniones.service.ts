import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { GoogleService } from '../google/google.service';
import {
  actualizarEvento,
  borrarEvento,
  configurarGrabacion,
  crearEvento,
  ErrorDeGoogle,
  leerArtefactos,
  type ArtefactosDelMeet,
} from '../google/google.cliente';
import {
  cambiaElEvento,
  codigoDeMeet,
  eventoDesdeReunion,
  limpiarCorreos,
} from '../google/evento.reglas';
import { Prisma, TipoNotificacion } from '../../lib/generated/prisma/client';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import {
  correspondeAvisar,
  limiteDeAviso,
  minutosQueFaltan,
  naceDentroDeLaVentana,
} from './reglas/aviso-previo.reglas';
import { puedeAgendarSobre, rolQueAgenda } from './reglas/quien-agenda.reglas';

const usuarioResumen = {
  select: { id: true, name: true, user: true, roleId: true, email: true },
} satisfies Prisma.UserDefaultArgs;

const reunionInclude = {
  proyecto: { select: { id: true, name: true } },
  creador: usuarioResumen,
  participantes: { select: { usuario: usuarioResumen } },
} satisfies Prisma.ReunionInclude;

type ReunionConRelaciones = Prisma.ReunionGetPayload<{
  include: typeof reunionInclude;
}>;

/** La reunión con los convocados ya aplanados (sin la fila del join). */
export type ReunionCompleta = Omit<ReunionConRelaciones, 'participantes'> & {
  participantes: ReunionConRelaciones['participantes'][number]['usuario'][];
};

/**
 * Cómo quedó el evento de Google después de editar la reunión. `undefined`
 * cuando la reunión no estaba en Google.
 */
export type SincronizacionGoogle = 'actualizada' | 'sin_cambios' | 'error';

/**
 * Qué pasó con la grabación al enviar al Calendar. `activada` incluye las
 * notas de Gemini; `activada_sin_notas` graba y transcribe pero Google no
 * aceptó las notas (la licencia no tiene Gemini).
 */
export type EstadoDeGrabacion =
  | 'activada'
  | 'activada_sin_notas'
  | 'desactivada'
  | 'no_disponible'
  | 'sin_meet';

const FORMATO_FECHA = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'full',
  timeStyle: 'short',
  timeZone: 'America/Lima',
});

/**
 * Reuniones que administración agenda con el equipo. Crear o reprogramar una
 * deja una notificación interna a cada convocado, con el link de Meet.
 */
@Injectable()
export class ReunionesService {
  private readonly logger = new Logger(ReunionesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
    private readonly google: GoogleService,
  ) {}

  async create(
    dto: CreateReunionDto,
    creadorId?: number,
  ): Promise<ReunionCompleta> {
    await this.validarProyecto(dto.proyectoId, creadorId);
    await this.validarParticipantes(dto.participantesIds);

    const fecha = new Date(dto.fecha);
    const ahora = new Date();

    const reunion = await this.prisma.reunion.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        fecha,
        // Vacío = todavía no hay link; lo carga administración cuando crea
        // el evento en Calendar, que es donde Meet se genera solo.
        linkMeet: dto.linkMeet ?? '',
        // Si se agenda para dentro de un rato corto, este mismo aviso hace de
        // recordatorio: se marca como avisada para que la tarea programada no
        // la vuelva a anunciar un minuto después.
        avisoPrevioAt: naceDentroDeLaVentana(fecha, ahora) ? ahora : null,
        // Encendida salvo que quien agenda la apague: pesa recién al enviar.
        grabarReunion: dto.grabarReunion ?? true,
        invitadosExternos: limpiarCorreos(dto.invitadosExternos ?? []),
        proyectoId: dto.proyectoId ?? null,
        creadorId: creadorId ?? null,
        participantes: {
          create: dto.participantesIds.map((usuarioId) => ({ usuarioId })),
        },
      },
      include: reunionInclude,
    });

    await this.notificaciones.notificar(dto.participantesIds, {
      tipo: TipoNotificacion.ReunionProgramada,
      titulo: 'Nueva reunión agendada',
      mensaje: this.describir(reunion),
      proyectoId: reunion.proyectoId,
    });

    // Si agenda alguien del equipo, administración se entera: es la que lleva
    // el orden de la agenda. Cuando agenda ella misma no se autoavisa, y a los
    // admins ya convocados no se les repite el mismo hecho.
    if (creadorId !== undefined && !(await this.esAdministracion(creadorId))) {
      const quien = reunion.creador?.name ?? 'Alguien del equipo';
      // Sin link es porque no tiene Workspace: administración tiene que
      // crear el evento en Calendar y mandar las invitaciones.
      const falta = reunion.linkMeet ? '' : ' — falta enviarla al Calendar';
      await this.notificaciones.notificarAdministracion(
        {
          tipo: TipoNotificacion.ReunionProgramada,
          titulo: `${quien} agendó una reunión${falta}`,
          mensaje: this.describir(reunion),
          proyectoId: reunion.proyectoId,
        },
        dto.participantesIds,
      );
    }

    return this.aplanar(reunion);
  }

  /** Todas, más próximas primero. Para administración. */
  async findAll(): Promise<ReunionCompleta[]> {
    const reuniones = await this.prisma.reunion.findMany({
      include: reunionInclude,
      orderBy: { fecha: 'asc' },
    });

    return reuniones.map((reunion) => this.aplanar(reunion));
  }

  /**
   * Las que convocan al usuario **o que él mismo agendó**. Sin lo segundo, el
   * que agenda una reunión donde no participa no la vería en ninguna parte.
   */
  async findMias(usuarioId: number): Promise<ReunionCompleta[]> {
    const reuniones = await this.prisma.reunion.findMany({
      where: {
        OR: [
          { participantes: { some: { usuarioId } } },
          { creadorId: usuarioId },
        ],
      },
      include: reunionInclude,
      orderBy: { fecha: 'asc' },
    });

    return reuniones.map((reunion) => this.aplanar(reunion));
  }

  async findOne(id: number): Promise<ReunionCompleta> {
    const reunion = await this.prisma.reunion.findUnique({
      where: { id },
      include: reunionInclude,
    });

    if (!reunion) {
      throw this.notFound(id);
    }

    return this.aplanar(reunion);
  }

  async update(
    id: number,
    dto: UpdateReunionDto,
    actorId?: number,
  ): Promise<ReunionCompleta & { google?: SincronizacionGoogle }> {
    const actual = await this.findOne(id);
    await this.verificarPuedeEditar(actual, actorId);

    if (dto.proyectoId !== undefined) {
      await this.validarProyecto(dto.proyectoId, actorId);
    }
    if (dto.participantesIds !== undefined) {
      await this.validarParticipantes(dto.participantesIds);
    }

    // `linkMeet` sale aparte porque el DTO lo acepta nulo («todavía no hay»)
    // y la columna no admite null: se guarda como cadena vacía.
    const { participantesIds, fecha, linkMeet, invitadosExternos, ...data } =
      dto;
    const nuevoLink = linkMeet === undefined ? undefined : (linkMeet ?? '');
    const ahora = new Date();

    // Si se movió la fecha, el aviso previo arranca de cero: el que se haya
    // mandado para el horario viejo ya no sirve. Salvo que la fecha nueva
    // caiga dentro de la ventana, donde el aviso de reprogramación alcanza.
    const nuevaFecha = fecha !== undefined ? new Date(fecha) : undefined;
    const reinicioDeAviso =
      nuevaFecha !== undefined &&
      nuevaFecha.getTime() !== actual.fecha.getTime()
        ? {
            avisoPrevioAt: naceDentroDeLaVentana(nuevaFecha, ahora)
              ? ahora
              : null,
          }
        : {};

    const reunion = await this.prisma.reunion.update({
      where: { id },
      data: {
        ...data,
        ...(nuevaFecha !== undefined && { fecha: nuevaFecha }),
        ...(nuevoLink !== undefined && { linkMeet: nuevoLink }),
        ...(invitadosExternos !== undefined && {
          invitadosExternos: limpiarCorreos(invitadosExternos),
        }),
        ...reinicioDeAviso,
        ...(participantesIds !== undefined && {
          participantes: {
            deleteMany: {},
            create: participantesIds.map((usuarioId) => ({ usuarioId })),
          },
        }),
      },
      include: reunionInclude,
    });

    // Se avisa a quien recién entra y, si cambió la fecha o el link, a todos
    // los que quedan. Al que sale no se le avisa: no hay nada que hacer.
    const anteriores = new Set(actual.participantes.map((u) => u.id));
    const actuales = reunion.participantes.map((fila) => fila.usuario.id);
    const nuevos = actuales.filter((usuarioId) => !anteriores.has(usuarioId));
    const seReprogramo =
      (fecha !== undefined &&
        new Date(fecha).getTime() !== actual.fecha.getTime()) ||
      (nuevoLink !== undefined && nuevoLink !== actual.linkMeet);

    const destinatarios = seReprogramo ? actuales : nuevos;

    await this.notificaciones.notificar(destinatarios, {
      tipo: TipoNotificacion.ReunionProgramada,
      titulo: seReprogramo ? 'Reunión reprogramada' : 'Nueva reunión agendada',
      mensaje: this.describir(reunion),
      proyectoId: reunion.proyectoId,
    });

    const actualizada = this.aplanar(reunion);
    const google = await this.sincronizarEdicion(actual, actualizada);

    return google === undefined ? actualizada : { ...actualizada, google };
  }

  /**
   * Borrar una reunión que ya está en Google cancela primero el evento, que es
   * lo que les avisa a los invitados. Si Google no responde, la reunión **no**
   * se borra: quedaría un evento huérfano con invitaciones vivas y sin nada
   * en el sistema que lo recuerde.
   */
  async remove(id: number, actorId?: number): Promise<ReunionCompleta> {
    const reunion = await this.findOne(id);
    await this.verificarPuedeEditar(reunion, actorId);

    if (reunion.googleEventId) {
      await this.cancelarEnGoogle(reunion.googleEventId);
    }

    await this.prisma.reunion.delete({ where: { id } });
    return reunion;
  }

  /**
   * **ENVIAR AL CALENDAR.** Crea el evento con la cuenta conectada de
   * administración: Google genera el Meet y manda las invitaciones. Después se
   * deja el Meet grabando y transcribiendo según la casilla de la reunión.
   *
   * No se envía dos veces: si otra petición la marcó mientras tanto, el
   * evento recién creado se borra para no dejar un duplicado.
   */
  async enviarAlCalendar(id: number): Promise<
    ReunionCompleta & {
      grabacion: EstadoDeGrabacion;
      detalleGrabacion?: string;
    }
  > {
    const reunion = await this.findOne(id);

    if (reunion.googleEventId) {
      throw new ConflictException('Esta reunión ya está en Google Calendar');
    }

    const { creado, grabacion, detalleGrabacion } =
      await this.google.conAccessToken(async (token) => {
        const creado = await crearEvento(token, eventoDesdeReunion(reunion));
        const resultado = creado.codigoMeet
          ? await this.aplicarGrabacion(
              token,
              creado.codigoMeet,
              reunion.grabarReunion,
              id,
            )
          : { grabacion: 'sin_meet' as const, detalleGrabacion: undefined };

        return { creado, ...resultado };
      });

    const marcada = await this.prisma.reunion.updateMany({
      where: { id, googleEventId: null },
      data: {
        googleEventId: creado.eventId,
        enviadaAt: new Date(),
        ...(creado.linkMeet ? { linkMeet: creado.linkMeet } : {}),
      },
    });

    if (marcada.count === 0) {
      await this.google
        .conAccessToken((token) => borrarEvento(token, creado.eventId))
        .catch((error) =>
          this.logger.error(
            `Quedó un evento duplicado en Google (${creado.eventId}) para la reunión ${id}`,
            error instanceof Error ? error.stack : String(error),
          ),
        );
      throw new ConflictException(
        'Esta reunión ya se estaba enviando a Google Calendar',
      );
    }

    const enviada = await this.findOne(id);

    // Si el link es nuevo, los convocados se enteran también por el sistema.
    if (creado.linkMeet && creado.linkMeet !== reunion.linkMeet) {
      await this.notificaciones.notificar(
        enviada.participantes.map((u) => u.id),
        {
          tipo: TipoNotificacion.ReunionProgramada,
          titulo: 'Ya está el link de la reunión',
          mensaje: this.describir(enviada),
          proyectoId: enviada.proyectoId,
        },
      );
    }

    return { ...enviada, grabacion, detalleGrabacion };
  }

  /**
   * **REVISAR LA GRABACIÓN** de una reunión ya enviada: vuelve a aplicar lo
   * que pide la casilla y devuelve lo que Google tiene guardado de verdad. El
   * recuadro del evento en Calendar no muestra este ajuste, así que es la
   * forma de comprobarlo (y de reintentar si falló al enviar).
   */
  async revisarGrabacion(id: number): Promise<{
    grabacion: EstadoDeGrabacion;
    detalleGrabacion?: string;
    enGoogle: ArtefactosDelMeet | null;
  }> {
    const reunion = await this.findOne(id);

    if (!reunion.googleEventId) {
      throw new ConflictException(
        'Esta reunión todavía no está en Google Calendar',
      );
    }

    const codigo = codigoDeMeet(reunion.linkMeet);
    if (!codigo) {
      return {
        grabacion: 'sin_meet',
        detalleGrabacion: 'La reunión no tiene un link de Meet válido',
        enGoogle: null,
      };
    }

    return this.google.conAccessToken(async (token) => {
      const resultado = await this.aplicarGrabacion(
        token,
        codigo,
        reunion.grabarReunion,
        id,
      );

      let enGoogle: ArtefactosDelMeet | null = null;
      try {
        enGoogle = await leerArtefactos(token, codigo);
      } catch (error) {
        this.logger.warn(
          `No se pudo leer la configuración del Meet de la reunión ${id}: ${String(error)}`,
        );
      }

      return { ...resultado, enGoogle };
    });
  }

  /**
   * Deja el Meet grabando (o no) según la casilla. Nunca lanza: el evento ya
   * existe y un fallo acá no debe deshacer nada. El motivo que da Google viaja
   * en `detalleGrabacion` para poder mostrarlo.
   */
  private async aplicarGrabacion(
    token: string,
    codigoMeet: string,
    activar: boolean,
    id: number,
  ): Promise<{ grabacion: EstadoDeGrabacion; detalleGrabacion?: string }> {
    try {
      const { notasDeGemini, motivoNotas } = await configurarGrabacion(
        token,
        codigoMeet,
        activar,
      );
      if (!activar) return { grabacion: 'desactivada' };
      if (notasDeGemini) return { grabacion: 'activada' };
      return { grabacion: 'activada_sin_notas', detalleGrabacion: motivoNotas };
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `No se pudo configurar la grabación de la reunión ${id}: ${detalle}`,
      );
      return { grabacion: 'no_disponible', detalleGrabacion: detalle };
    }
  }

  /**
   * Lleva la edición al evento de Google, si la reunión ya estaba allá. Un
   * fallo no deshace la edición en el sistema: se informa para que se pueda
   * corregir en Calendar.
   */
  private async sincronizarEdicion(
    antes: ReunionCompleta,
    despues: ReunionCompleta,
  ): Promise<SincronizacionGoogle | undefined> {
    const eventId = despues.googleEventId;
    if (!eventId) return undefined;

    const cambiaEvento = cambiaElEvento(antes, despues);
    const cambiaGrabacion = antes.grabarReunion !== despues.grabarReunion;
    if (!cambiaEvento && !cambiaGrabacion) return 'sin_cambios';

    try {
      await this.google.conAccessToken(async (token) => {
        if (cambiaEvento) {
          await actualizarEvento(token, eventId, eventoDesdeReunion(despues));
        }
        const codigo = codigoDeMeet(despues.linkMeet);
        if (cambiaGrabacion && codigo) {
          await configurarGrabacion(token, codigo, despues.grabarReunion);
        }
      });
      return 'actualizada';
    } catch (error) {
      this.logger.warn(
        `No se pudo actualizar en Google la reunión ${despues.id}: ${String(error)}`,
      );
      return 'error';
    }
  }

  private async cancelarEnGoogle(eventId: string): Promise<void> {
    try {
      await this.google.conAccessToken((token) => borrarEvento(token, eventId));
    } catch (error) {
      // Ya no existe en Google (lo borraron desde Calendar): no hay nada que cancelar.
      if (
        error instanceof ErrorDeGoogle &&
        (error.estado === 404 || error.estado === 410)
      ) {
        return;
      }

      if (error instanceof HttpException) {
        throw new ConflictException(
          'Esta reunión está en Google Calendar y ahora no hay acceso para cancelarla ahí. Reconecta Google desde Reuniones, o cancela el evento en Calendar y vuelve a intentarlo.',
        );
      }

      throw new BadGatewayException(
        'No pudimos cancelar el evento en Google Calendar. Intenta de nuevo en un momento.',
      );
    }
  }

  /**
   * Avisa a los convocados que la reunión está por empezar.
   *
   * Corre cada minuto y mira la ventana de los próximos cinco. La marca
   * `avisoPrevioAt` es la que evita repetir: se escribe con un `updateMany`
   * que exige que siga en `null`, así que si dos pasadas se cruzan (o hay más
   * de una instancia del API), solo una gana y el resto no manda nada.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async avisarReunionesProximas(): Promise<void> {
    const ahora = new Date();

    const proximas = await this.prisma.reunion.findMany({
      where: {
        avisoPrevioAt: null,
        fecha: { gte: ahora, lte: limiteDeAviso(ahora) },
      },
      include: reunionInclude,
    });

    for (const reunion of proximas) {
      if (!correspondeAvisar(reunion, ahora)) continue;

      // Gana la primera pasada que consiga marcarla; las demás ven 0 y salen.
      const marcada = await this.prisma.reunion.updateMany({
        where: { id: reunion.id, avisoPrevioAt: null },
        data: { avisoPrevioAt: ahora },
      });
      if (marcada.count === 0) continue;

      const minutos = minutosQueFaltan(reunion.fecha, ahora);

      try {
        await this.notificaciones.notificar(
          reunion.participantes.map((fila) => fila.usuario.id),
          {
            tipo: TipoNotificacion.ReunionProxima,
            titulo: `Tu reunión empieza en ${minutos} minuto${minutos === 1 ? '' : 's'}`,
            mensaje: this.describir(reunion),
            proyectoId: reunion.proyectoId,
          },
        );
      } catch (error) {
        // La reunión queda marcada igual: es preferible perder un aviso a
        // mandarlo en bucle cada minuto hasta que arranque.
        this.logger.error(
          `No se pudo avisar de la reunión ${reunion.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // ---------------------------------------------------------------------------

  private describir(
    reunion: Pick<
      ReunionCompleta,
      'titulo' | 'fecha' | 'linkMeet' | 'proyecto'
    >,
  ): string {
    const cuando = FORMATO_FECHA.format(reunion.fecha);
    const proyecto = reunion.proyecto ? ` (${reunion.proyecto.name})` : '';
    // Sin link todavía: la agendó alguien sin Workspace y administración
    // todavía no creó el evento en Calendar.
    const link = reunion.linkMeet
      ? ` · Link: ${reunion.linkMeet}`
      : ' · Falta el link de Meet';
    // Sin punto después de la hora: el formato ya termina en «p. m.».
    return `${reunion.titulo}${proyecto}: ${cuando}${link}`;
  }

  private aplanar(reunion: ReunionConRelaciones): ReunionCompleta {
    const { participantes, ...resto } = reunion;

    return {
      ...resto,
      participantes: participantes.map((fila) => fila.usuario),
    };
  }

  /**
   * El proyecto tiene que existir y, si quien agenda no es administración,
   * tiene que ser suyo: nadie convoca reuniones sobre proyectos ajenos.
   *
   * Una reunión sin proyecto (la «Reunión de equipo») no se acota: no toca el
   * trabajo de nadie en particular.
   */
  private async validarProyecto(
    proyectoId: number | null | undefined,
    actorId?: number,
  ): Promise<void> {
    if (proyectoId === undefined || proyectoId === null) return;

    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id: proyectoId, deletedAt: null },
      select: {
        id: true,
        name: true,
        estadoProyecto: true,
        disenadorId: true,
        desarrolladorId: true,
        usuarios: { select: { usuarioId: true } },
      },
    });

    if (!proyecto) {
      throw new BadRequestException(
        `El proyecto con id ${proyectoId} no existe`,
      );
    }

    if (actorId === undefined) return;

    const rol = rolQueAgenda(await this.rolDe(actorId), ROLES_ADMINISTRACION);

    const permitido = puedeAgendarSobre(
      rol,
      {
        estadoProyecto: proyecto.estadoProyecto,
        disenadorId: proyecto.disenadorId,
        desarrolladorId: proyecto.desarrolladorId,
        equipoIds: proyecto.usuarios.map((fila) => fila.usuarioId),
      },
      actorId,
    );

    if (!permitido) {
      // Al diseñador se le puede negar por dos motivos distintos y conviene
      // distinguirlos: «no es tuyo» se arregla pidiéndoselo a administración,
      // «ya salió de diseño» es que el proyecto avanzó y dejó de ser suyo.
      const esSuyo = proyecto.disenadorId === actorId;

      throw new ForbiddenException(
        rol === 'disenador' && esSuyo
          ? `«${proyecto.name}» ya salió de la etapa de diseño: esa reunión la agenda administración o el desarrollador`
          : `No estás asignado a «${proyecto.name}»: pídele a administración que agende esa reunión`,
      );
    }
  }

  private async validarParticipantes(usuariosIds: number[]): Promise<void> {
    const existentes = await this.prisma.user.findMany({
      where: { id: { in: usuariosIds }, active: true },
      select: { id: true },
    });

    const encontrados = new Set(existentes.map((u) => u.id));
    const faltan = usuariosIds.filter((id) => !encontrados.has(id));

    if (faltan.length > 0) {
      throw new BadRequestException(
        `Los usuarios con id ${faltan.join(', ')} no existen o están desactivados`,
      );
    }
  }

  /** El nombre del rol del usuario, o `null` si no se encuentra. */
  private async rolDe(usuarioId: number): Promise<string | null> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { rol: { select: { name: true } } },
    });

    return usuario?.rol.name ?? null;
  }

  /** ¿El usuario es `Admin` u `Owner`? Se resuelve por rol, no por persona. */
  private async esAdministracion(usuarioId: number): Promise<boolean> {
    return (
      rolQueAgenda(await this.rolDe(usuarioId), ROLES_ADMINISTRACION) ===
      'administracion'
    );
  }

  /**
   * Administración toca cualquier reunión; el resto, solo las que agendó.
   *
   * Una reunión sin creador (las que quedaron de antes, o cuyo creador se
   * borró) solo la maneja administración: no hay dueño a quien reconocerle
   * el permiso.
   */
  private async verificarPuedeEditar(
    reunion: ReunionCompleta,
    actorId: number | undefined,
  ): Promise<void> {
    if (actorId === undefined) {
      throw new ForbiddenException(
        'No se pudo identificar quién pide el cambio',
      );
    }

    if (reunion.creadorId === actorId) return;
    if (await this.esAdministracion(actorId)) return;

    throw new ForbiddenException(
      'Esta reunión la agendó otra persona: solo quien la creó o administración pueden tocarla',
    );
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Reunión con id ${id} no encontrada`);
  }
}
