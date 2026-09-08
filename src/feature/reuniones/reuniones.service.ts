import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Prisma, TipoNotificacion } from '../../lib/generated/prisma/client';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';
import {
  correspondeAvisar,
  limiteDeAviso,
  minutosQueFaltan,
  naceDentroDeLaVentana,
} from './reglas/aviso-previo.reglas';

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
  ) {}

  async create(
    dto: CreateReunionDto,
    creadorId?: number,
  ): Promise<ReunionCompleta> {
    await this.validarProyecto(dto.proyectoId);
    await this.validarParticipantes(dto.participantesIds);

    const fecha = new Date(dto.fecha);
    const ahora = new Date();

    const reunion = await this.prisma.reunion.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        fecha,
        linkMeet: dto.linkMeet,
        // Si se agenda para dentro de un rato corto, este mismo aviso hace de
        // recordatorio: se marca como avisada para que la tarea programada no
        // la vuelva a anunciar un minuto después.
        avisoPrevioAt: naceDentroDeLaVentana(fecha, ahora) ? ahora : null,
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

  /** Solo las que convocan al usuario. Para diseñadores y desarrolladores. */
  async findMias(usuarioId: number): Promise<ReunionCompleta[]> {
    const reuniones = await this.prisma.reunion.findMany({
      where: { participantes: { some: { usuarioId } } },
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

  async update(id: number, dto: UpdateReunionDto): Promise<ReunionCompleta> {
    const actual = await this.findOne(id);

    if (dto.proyectoId !== undefined) {
      await this.validarProyecto(dto.proyectoId);
    }
    if (dto.participantesIds !== undefined) {
      await this.validarParticipantes(dto.participantesIds);
    }

    const { participantesIds, fecha, ...data } = dto;
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
      (dto.linkMeet !== undefined && dto.linkMeet !== actual.linkMeet);

    const destinatarios = seReprogramo ? actuales : nuevos;

    await this.notificaciones.notificar(destinatarios, {
      tipo: TipoNotificacion.ReunionProgramada,
      titulo: seReprogramo ? 'Reunión reprogramada' : 'Nueva reunión agendada',
      mensaje: this.describir(reunion),
      proyectoId: reunion.proyectoId,
    });

    return this.aplanar(reunion);
  }

  async remove(id: number): Promise<ReunionCompleta> {
    const reunion = await this.findOne(id);
    await this.prisma.reunion.delete({ where: { id } });
    return reunion;
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

  private describir(reunion: ReunionConRelaciones): string {
    const cuando = FORMATO_FECHA.format(reunion.fecha);
    const proyecto = reunion.proyecto ? ` (${reunion.proyecto.name})` : '';
    // Sin punto después de la hora: el formato ya termina en «p. m.».
    return `${reunion.titulo}${proyecto}: ${cuando} · Link: ${reunion.linkMeet}`;
  }

  private aplanar(reunion: ReunionConRelaciones): ReunionCompleta {
    const { participantes, ...resto } = reunion;

    return {
      ...resto,
      participantes: participantes.map((fila) => fila.usuario),
    };
  }

  private async validarProyecto(
    proyectoId: number | null | undefined,
  ): Promise<void> {
    if (proyectoId === undefined || proyectoId === null) return;

    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id: proyectoId, deletedAt: null },
      select: { id: true },
    });

    if (!proyecto) {
      throw new BadRequestException(
        `El proyecto con id ${proyectoId} no existe`,
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

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Reunión con id ${id} no encontrada`);
  }
}
