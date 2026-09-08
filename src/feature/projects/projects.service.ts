import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { DefinirPlanCobrosDto } from './dto/plan-cobros.dto';
import { MarcarCobroDto } from './dto/marcar-cobro.dto';
import { ObservacionesDto } from './dto/observaciones.dto';
import { AsignarResponsablesDto } from './dto/asignar-responsables.dto';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';
import {
  EstadoProyecto,
  Grupo,
  HitoCobro,
  Prisma,
  TipoNotificacion,
  TipoProyecto,
  TipoRecordatorio,
} from '../../lib/generated/prisma/client';
import {
  aplicaCargaDeProductos,
  compuertasFaltantes,
  conservaLoAbonado,
  derivarGrupo,
  DIAS_PARA_ARCHIVAR,
  diasTranscurridos,
  esEstadoTerminal,
  esEtapaDeDiseno,
  estadoAlReactivar,
  etapaSoloDeAdministracion,
  ETAPAS_DISENO,
  hitoQueHabilita,
  hostingEsExigible,
  porcentajeDeReactivacion,
  recordatorioQueCorresponde,
  responsableDe,
  Responsable,
  RONDAS_CAMBIOS_INCLUIDAS,
  transicionInvalida,
  validarPlanDeCobros,
} from './reglas/flujo.reglas';

const usuarioResumen = {
  select: { id: true, name: true, user: true, roleId: true },
} satisfies Prisma.UserDefaultArgs;

const proyectoInclude = {
  seguimiento: { select: { id: true, name: true } },
  usuarios: {
    select: {
      usuario: { select: { id: true, name: true, user: true, roleId: true } },
    },
  },
  disenador: usuarioResumen,
  desarrollador: usuarioResumen,
  cobros: { orderBy: { id: 'asc' } },
  // Solo los pendientes: los resueltos son historia y viven en su propia ruta.
  recordatorios: {
    where: { resueltoAt: null },
    orderBy: { createdAt: 'asc' },
  },
  cotizaciones: { orderBy: { id: 'asc' } },
} satisfies Prisma.ProyectoInclude;

type ProyectoConRelaciones = Prisma.ProyectoGetPayload<{
  include: typeof proyectoInclude;
}>;

export type UsuarioAsignado =
  ProyectoConRelaciones['usuarios'][number]['usuario'];

export type ProyectoCompleto = Omit<ProyectoConRelaciones, 'usuarios'> & {
  usuarios: UsuarioAsignado[];
  /** Se desprende de la etapa y del grupo; no se elige a mano. */
  responsable: Responsable;
  /**
   * Días que el proyecto lleva esperando al cliente, contados desde que se
   * abrió el recordatorio más viejo que sigue pendiente. `null` si la pelota
   * está en Websy. Calculado: la columna `diasSinResponder` sigue siendo el
   * valor que carga administración a mano.
   */
  diasEsperandoAlCliente: number | null;
};

/** Resultado de registrar una ronda de cambios de diseño. */
export interface ResumenRondas {
  rondasUsadas: number;
  rondasIncluidas: number;
  /** Se agotaron las rondas del precio: todo cambio nuevo se cotiza aparte. */
  requiereCotizacionAdicional: boolean;
  proyecto: ProyectoCompleto;
}

/** Resultado de reactivar un proyecto archivado. */
export interface ResumenReactivacion {
  /** 25% si volvió antes del año; 50% si llegó al año o lo pasó. */
  porcentajeAReactivar: number;
  diasArchivado: number;
  /** Con 50% se rehacen inicio y diseño. */
  seRehaceInicioYDiseno: boolean;
  proyecto: ProyectoCompleto;
}

/** Una fila del ranking de diseñadores o desarrolladores para un mes dado. */
export interface AnaliticaPersonaMes {
  usuarioId: number;
  nombre: string;
  mes: string;
  cantidad: number;
}

/** Cuánto tardó un proyecto puntual en cerrar una etapa. */
export interface AnaliticaProyectoDuracion {
  proyectoId: number;
  nombre: string;
  dias: number;
}

/** Analítica de diseño y desarrollo: totales por mes, por persona, y duración. */
export interface Analitica {
  porMes: {
    mes: string;
    disenosFinalizados: number;
    desarrollosFinalizados: number;
  }[];
  disenadoresPorMes: AnaliticaPersonaMes[];
  desarrolladoresPorMes: AnaliticaPersonaMes[];
  duracionPromedio: {
    etapa: 'Diseno' | 'Desarrollo';
    promedioDias: number;
    cantidadProyectos: number;
    proyectos: AnaliticaProyectoDuracion[];
  }[];
}

/**
 * Un proyecto archivado, con la etapa en la que estaba justo antes de
 * archivarse (para poder ubicarlo de nuevo en su columna real en una vista
 * por etapas, en vez de perderlo en un genérico "Archivado").
 */
export interface ProyectoArchivado extends ProyectoCompleto {
  etapaAlArchivar: EstadoProyecto | null;
}

/** Estado que hace falta para decidir grupo, compuertas y recordatorios. */
interface EstadoDelProyecto {
  estadoProyecto: EstadoProyecto;
  tipoProyecto: TipoProyecto | null;
  materialMarcaRecibido: boolean;
  catalogoRecibido: boolean;
  hostingContratado: boolean;
  subidoProduccionAt: Date | null;
  capacitacionAt: Date | null;
  cobros: { hito: HitoCobro; cobrado: boolean }[];
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async create(
    createProjectDto: CreateProjectDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const {
      usuariosIds,
      fechaEntrega,
      planCobros,
      grupo,
      estadoProyecto,
      aprobadoPorJefatura,
      abonoInicialCobrado,
      ...data
    } = createProjectDto;

    await this.validarSeguimiento(data.seguimientoId);
    await this.validarUsuarios(usuariosIds);
    await this.validarAsignados(data.disenadorId, data.desarrolladorId);

    if (planCobros) {
      this.validarPlan(planCobros, aprobadoPorJefatura ?? false);
    }

    if (abonoInicialCobrado && !planCobros) {
      throw new BadRequestException(
        'No se puede marcar el abono inicial como cobrado sin mandar el plan de cobros',
      );
    }

    // El flujo arranca en Registro: ahí se crea el registro y se asignan
    // diseñador y desarrollador, antes del brief.
    const estado = estadoProyecto ?? EstadoProyecto.Registro;
    const ahora = new Date();

    const cobrosIniciales = (planCobros ?? []).map((item) => ({
      hito: item.hito,
      cobrado:
        item.hito === HitoCobro.AbonoInicial
          ? (abonoInicialCobrado ?? false)
          : false,
    }));

    const situacion: EstadoDelProyecto = {
      estadoProyecto: estado,
      tipoProyecto: data.tipoProyecto ?? null,
      materialMarcaRecibido: data.materialMarcaRecibido ?? false,
      catalogoRecibido: data.catalogoRecibido ?? false,
      hostingContratado: data.hostingContratado ?? false,
      subidoProduccionAt: null,
      capacitacionAt: null,
      cobros: cobrosIniciales,
    };

    // Crear un proyecto ya adelantado saltea el flujo: si el body pide una
    // etapa distinta de Registro, tiene que cumplir sus compuertas igual que
    // si hubiera llegado ahí con un PATCH.
    if (estado !== EstadoProyecto.Registro) {
      this.verificarCompuertas(situacion);
    }

    const grupoFinal = grupo ?? this.grupoDe(situacion);

    const proyecto = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.proyecto.create({
        data: {
          ...data,
          estadoProyecto: estado,
          grupo: grupoFinal,
          fechaEntrega: this.aFecha(fechaEntrega),
          fechaUltimoCambioEstado: ahora,
          usuarios: {
            create: (usuariosIds ?? []).map((usuarioId) => ({ usuarioId })),
          },
          ...(planCobros && {
            cobros: {
              create: planCobros.map((item) => ({
                hito: item.hito,
                porcentaje: item.porcentaje,
                cobrado:
                  item.hito === HitoCobro.AbonoInicial
                    ? (abonoInicialCobrado ?? false)
                    : false,
                fechaCobro:
                  item.hito === HitoCobro.AbonoInicial && abonoInicialCobrado
                    ? ahora
                    : null,
              })),
            },
          }),
        },
        select: { id: true },
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: creado.id,
          estadoAnterior: null,
          estadoNuevo: estado,
          grupoAnterior: null,
          grupoNuevo: grupoFinal,
          motivo: 'Registro del proyecto',
          usuarioId: actorId ?? null,
        },
      });

      await this.sincronizarRecordatorios(tx, creado.id, situacion, actorId);

      return tx.proyecto.findUniqueOrThrow({
        where: { id: creado.id },
        include: proyectoInclude,
      });
    });

    // Un alta ya adelantada a Diseño o Desarrollo también es una asignación.
    await this.notificarAsignaciones(null, proyecto);

    return this.aplanar(proyecto);
  }

  async findAll(): Promise<ProyectoCompleto[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: { deletedAt: null },
      orderBy: { id: 'asc' },
      include: proyectoInclude,
    });

    return proyectos.map((proyecto) => this.aplanar(proyecto));
  }

  async findByProgramer(idProgramador?: number): Promise<ProyectoCompleto[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        deletedAt: null,
        grupo: 'A',
        estadoProyecto: {
          notIn: [EstadoProyecto.ProyectoFinalizado, EstadoProyecto.Archivado],
        },
        ...(idProgramador !== undefined && {
          OR: [
            { desarrolladorId: idProgramador },
            { usuarios: { some: { usuarioId: idProgramador } } },
          ],
        }),
      },
      orderBy: { id: 'asc' },
      include: proyectoInclude,
    });

    return proyectos.map((proyecto) => this.aplanar(proyecto));
  }

  /** Cola del admin: lo trabado por el cliente (B) y lo que no pagó (C). */
  async findByAdmin(): Promise<ProyectoCompleto[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        deletedAt: null,
        grupo: { in: ['B', 'C'] },
        // Un proyecto archivado ya no se persigue: sale de la cola.
        estadoProyecto: { not: EstadoProyecto.Archivado },
      },
      orderBy: { id: 'asc' },
      include: proyectoInclude,
    });

    return proyectos.map((proyecto) => this.aplanar(proyecto));
  }

  /**
   * Tablero del diseñador: el tramo de diseño entero, no solo su primera etapa
   * (`ETAPAS_DISENO`). Un proyecto en `Avance de Diseño` o `Diseño Finalizado`
   * sigue siendo suyo hasta que pasa a desarrollo.
   */
  async findByDiseno(idDisenador?: number): Promise<ProyectoCompleto[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        deletedAt: null,
        grupo: 'A',
        estadoProyecto: { in: ETAPAS_DISENO },
        ...(idDisenador !== undefined && { disenadorId: idDisenador }),
      },
      orderBy: { id: 'asc' },
      include: proyectoInclude,
    });

    return proyectos.map((proyecto) => this.aplanar(proyecto));
  }

  /**
   * Proyectos ya archivados, aparte para que no se mezclen en la métrica.
   * Cada uno trae `etapaAlArchivar`: la etapa en la que estaba justo antes
   * de archivarse (leída del historial), para poder ubicarlo de nuevo en su
   * columna real en una vista por etapas.
   */
  async findArchivados(): Promise<ProyectoArchivado[]> {
    const proyectos = await this.prisma.proyecto.findMany({
      where: { deletedAt: null, estadoProyecto: EstadoProyecto.Archivado },
      orderBy: { archivadoAt: 'desc' },
      include: proyectoInclude,
    });

    const historialArchivado = await this.prisma.historialEtapa.findMany({
      where: {
        proyectoId: { in: proyectos.map((p) => p.id) },
        estadoNuevo: EstadoProyecto.Archivado,
      },
      orderBy: { createdAt: 'desc' },
      select: { proyectoId: true, estadoAnterior: true },
    });

    // `orderBy desc` + "no pisar si ya existe" da la fila más reciente por
    // proyecto: la última vez que se archivó, no la primera.
    const etapaAlArchivarPorProyecto = new Map<number, EstadoProyecto | null>();
    for (const fila of historialArchivado) {
      if (!etapaAlArchivarPorProyecto.has(fila.proyectoId)) {
        etapaAlArchivarPorProyecto.set(fila.proyectoId, fila.estadoAnterior);
      }
    }

    return proyectos.map((proyecto) => ({
      ...this.aplanar(proyecto),
      etapaAlArchivar: etapaAlArchivarPorProyecto.get(proyecto.id) ?? null,
    }));
  }

  /**
   * Proyectos que toca archivar: el diagrama dice «3 meses **sin respuesta del
   * cliente**, previo recordatorio», no 3 meses parado.
   *
   * Por eso se listan los que tienen un recordatorio abierto hace 90 días o
   * más. Los proyectos anteriores al flujo nuevo no tienen recordatorios, así
   * que para ellos se cae al criterio viejo —sin cambio de estado hace 90
   * días— pero acotado a Grupo B o C, que es donde la pelota está en el
   * cliente. Antes entraba cualquier proyecto parado, incluso uno en Grupo A
   * con desarrollo activo.
   */
  async findPorArchivar(): Promise<ProyectoCompleto[]> {
    const limite = new Date(
      Date.now() - DIAS_PARA_ARCHIVAR * 24 * 60 * 60 * 1000,
    );

    const proyectos = await this.prisma.proyecto.findMany({
      where: {
        deletedAt: null,
        estadoProyecto: {
          notIn: [EstadoProyecto.ProyectoFinalizado, EstadoProyecto.Archivado],
        },
        OR: [
          {
            recordatorios: {
              some: { resueltoAt: null, createdAt: { lte: limite } },
            },
          },
          {
            recordatorios: { none: { resueltoAt: null } },
            grupo: { in: ['B', 'C'] },
            fechaUltimoCambioEstado: { lte: limite },
          },
        ],
      },
      orderBy: { fechaUltimoCambioEstado: 'asc' },
      include: proyectoInclude,
    });

    return proyectos.map((proyecto) => this.aplanar(proyecto));
  }

  /**
   * Analítica de diseño y desarrollo: cuántos proyectos cerraron cada etapa
   * por mes (y quién los cerró), y cuánto tardan en promedio. Se calcula al
   * vuelo desde `historial_etapas`, no hay tabla propia.
   *
   * Solo mide lo que `historial_etapas` alcanzó a registrar: un proyecto que
   * ya había cerrado `Diseno`/`Desarrollo` antes de que existiera esa fila
   * (o antes de que existiera el estado `DesarrolloFinalizado`) no tiene la
   * marca de *entrada* a la etapa y queda afuera del promedio de duración,
   * aunque si tiene la marca de *cierre* sí cuenta para el total del mes.
   */
  async getAnalitica(): Promise<Analitica> {
    const ESTADOS_RELEVANTES: EstadoProyecto[] = [
      EstadoProyecto.Diseno,
      EstadoProyecto.DisenoFinalizado,
      EstadoProyecto.Desarrollo,
      EstadoProyecto.DesarrolloFinalizado,
    ];

    const [proyectos, historial] = await Promise.all([
      this.prisma.proyecto.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          disenadorId: true,
          desarrolladorId: true,
          disenador: { select: { name: true } },
          desarrollador: { select: { name: true } },
        },
      }),
      this.prisma.historialEtapa.findMany({
        where: { estadoNuevo: { in: ESTADOS_RELEVANTES } },
        orderBy: { createdAt: 'asc' },
        select: { proyectoId: true, estadoNuevo: true, createdAt: true },
      }),
    ]);

    // La primera fila de cada (proyecto, estado) es la primera vez que entró,
    // sin importar si después retrocedió y volvió a entrar: `orderBy asc` +
    // "no pisar si ya existe" alcanza para eso.
    const primeraEntrada = new Map<string, Date>();
    for (const fila of historial) {
      const clave = `${fila.proyectoId}:${fila.estadoNuevo}`;
      if (!primeraEntrada.has(clave)) {
        primeraEntrada.set(clave, fila.createdAt);
      }
    }

    const mesDe = (fecha: Date) => fecha.toISOString().slice(0, 7);
    const diasEntre = (desde: Date, hasta: Date) =>
      Math.round((hasta.getTime() - desde.getTime()) / (24 * 60 * 60 * 1000));

    const porMes = new Map<
      string,
      { disenosFinalizados: number; desarrollosFinalizados: number }
    >();
    const disenadoresPorMes = new Map<string, AnaliticaPersonaMes>();
    const desarrolladoresPorMes = new Map<string, AnaliticaPersonaMes>();
    const disenoProyectos: AnaliticaProyectoDuracion[] = [];
    const desarrolloProyectos: AnaliticaProyectoDuracion[] = [];

    const sumarMes = (
      mes: string,
      campo: 'disenosFinalizados' | 'desarrollosFinalizados',
    ) => {
      const actual = porMes.get(mes) ?? {
        disenosFinalizados: 0,
        desarrollosFinalizados: 0,
      };
      actual[campo] += 1;
      porMes.set(mes, actual);
    };

    const sumarPersona = (
      mapa: Map<string, AnaliticaPersonaMes>,
      usuarioId: number | null,
      nombre: string | undefined,
      mes: string,
    ) => {
      if (usuarioId == null || !nombre) return;
      const clave = `${usuarioId}:${mes}`;
      const actual = mapa.get(clave) ?? { usuarioId, nombre, mes, cantidad: 0 };
      actual.cantidad += 1;
      mapa.set(clave, actual);
    };

    for (const proyecto of proyectos) {
      const primerDiseno = primeraEntrada.get(
        `${proyecto.id}:${EstadoProyecto.Diseno}`,
      );
      const disenoFinalizado = primeraEntrada.get(
        `${proyecto.id}:${EstadoProyecto.DisenoFinalizado}`,
      );
      const primerDesarrollo = primeraEntrada.get(
        `${proyecto.id}:${EstadoProyecto.Desarrollo}`,
      );
      const desarrolloFinalizado = primeraEntrada.get(
        `${proyecto.id}:${EstadoProyecto.DesarrolloFinalizado}`,
      );

      if (disenoFinalizado) {
        const mes = mesDe(disenoFinalizado);
        sumarMes(mes, 'disenosFinalizados');
        sumarPersona(
          disenadoresPorMes,
          proyecto.disenadorId,
          proyecto.disenador?.name,
          mes,
        );

        if (primerDiseno) {
          disenoProyectos.push({
            proyectoId: proyecto.id,
            nombre: proyecto.name,
            dias: diasEntre(primerDiseno, disenoFinalizado),
          });
        }
      }

      if (desarrolloFinalizado) {
        const mes = mesDe(desarrolloFinalizado);
        sumarMes(mes, 'desarrollosFinalizados');
        sumarPersona(
          desarrolladoresPorMes,
          proyecto.desarrolladorId,
          proyecto.desarrollador?.name,
          mes,
        );

        if (primerDesarrollo) {
          desarrolloProyectos.push({
            proyectoId: proyecto.id,
            nombre: proyecto.name,
            dias: diasEntre(primerDesarrollo, desarrolloFinalizado),
          });
        }
      }
    }

    const promedio = (items: AnaliticaProyectoDuracion[]) =>
      items.length === 0
        ? 0
        : Math.round(
            (items.reduce((suma, item) => suma + item.dias, 0) / items.length) *
              10,
          ) / 10;

    return {
      porMes: [...porMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, valores]) => ({ mes, ...valores })),
      disenadoresPorMes: [...disenadoresPorMes.values()].sort((a, b) =>
        a.mes.localeCompare(b.mes),
      ),
      desarrolladoresPorMes: [...desarrolladoresPorMes.values()].sort((a, b) =>
        a.mes.localeCompare(b.mes),
      ),
      duracionPromedio: [
        {
          etapa: 'Diseno',
          promedioDias: promedio(disenoProyectos),
          cantidadProyectos: disenoProyectos.length,
          proyectos: disenoProyectos,
        },
        {
          etapa: 'Desarrollo',
          promedioDias: promedio(desarrolloProyectos),
          cantidadProyectos: desarrolloProyectos.length,
          proyectos: desarrolloProyectos,
        },
      ],
    };
  }

  async findOne(id: number): Promise<ProyectoCompleto> {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id, deletedAt: null },
      include: proyectoInclude,
    });

    if (!proyecto) {
      throw this.notFound(id);
    }

    return this.aplanar(proyecto);
  }

  /** Historial de cambios de etapa: la trazabilidad del proyecto. */
  async findHistorial(id: number) {
    await this.findOne(id);

    return this.prisma.historialEtapa.findMany({
      where: { proyectoId: id },
      orderBy: { createdAt: 'asc' },
      include: { usuario: { select: { id: true, name: true, user: true } } },
    });
  }

  /** Todos los recordatorios del proyecto, abiertos y ya resueltos. */
  async findRecordatorios(id: number) {
    await this.findOne(id);

    return this.prisma.recordatorioProyecto.findMany({
      where: { proyectoId: id },
      orderBy: { createdAt: 'desc' },
      include: { usuario: { select: { id: true, name: true, user: true } } },
    });
  }

  async update(
    id: number,
    updateProjectDto: UpdateProjectDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    const { usuariosIds, fechaEntrega, ...data } = updateProjectDto;

    if (data.seguimientoId !== undefined) {
      await this.validarSeguimiento(data.seguimientoId);
    }

    await this.validarUsuarios(usuariosIds);
    await this.validarAsignados(data.disenadorId, data.desarrolladorId);

    const estadoNuevo = data.estadoProyecto ?? actual.estadoProyecto;
    const cambiaDeEstado = estadoNuevo !== actual.estadoProyecto;

    const situacion: EstadoDelProyecto = {
      estadoProyecto: estadoNuevo,
      tipoProyecto: data.tipoProyecto ?? actual.tipoProyecto,
      materialMarcaRecibido:
        data.materialMarcaRecibido ?? actual.materialMarcaRecibido,
      catalogoRecibido: data.catalogoRecibido ?? actual.catalogoRecibido,
      hostingContratado: data.hostingContratado ?? actual.hostingContratado,
      subidoProduccionAt: actual.subidoProduccionAt,
      capacitacionAt: actual.capacitacionAt,
      cobros: actual.cobros,
    };

    if (cambiaDeEstado) {
      const invalida = transicionInvalida(
        actual.estadoProyecto,
        estadoNuevo,
        situacion.tipoProyecto,
      );

      if (invalida) {
        throw new ConflictException(invalida);
      }

      if (etapaSoloDeAdministracion(estadoNuevo)) {
        await this.verificarQueEsAdministracion(estadoNuevo, actorId);
      }

      this.verificarCompuertas(situacion);
    }

    // El grupo se recalcula solo; mandarlo explícito es la salida manual.
    const grupoNuevo = data.grupo ?? this.grupoDe(situacion);

    const ahora = new Date();

    const proyecto = await this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { id },
        data: {
          ...data,
          grupo: grupoNuevo,
          ...(cambiaDeEstado && {
            // Cualquier cambio de estado reinicia el contador de los 3 meses.
            fechaUltimoCambioEstado: ahora,
          }),
          ...(fechaEntrega !== undefined && {
            fechaEntrega: this.aFecha(fechaEntrega),
          }),
          ...(usuariosIds !== undefined && {
            usuarios: {
              deleteMany: {},
              create: usuariosIds.map((usuarioId) => ({ usuarioId })),
            },
          }),
        },
      });

      if (cambiaDeEstado || grupoNuevo !== actual.grupo) {
        await tx.historialEtapa.create({
          data: {
            proyectoId: id,
            estadoAnterior: actual.estadoProyecto,
            estadoNuevo,
            grupoAnterior: actual.grupo,
            grupoNuevo,
            usuarioId: actorId ?? null,
          },
        });
      }

      await this.sincronizarRecordatorios(tx, id, situacion, actorId);

      return tx.proyecto.findUniqueOrThrow({
        where: { id },
        include: proyectoInclude,
      });
    });

    // Avisos internos (campanita): al responsable que recién entra en juego y
    // a administración cuando hay que salir a cobrar.
    await this.notificarAsignaciones(actual, proyecto);
    if (cambiaDeEstado) {
      await this.notificarEtapaFinalizada(proyecto);
    }

    const ETAPAS_FINALIZADO_NOTIFICABLES: EstadoProyecto[] = [
      EstadoProyecto.DisenoFinalizado,
      EstadoProyecto.DesarrolloFinalizado,
      EstadoProyecto.ProyectoFinalizado,
    ];
    if (
      cambiaDeEstado &&
      ETAPAS_FINALIZADO_NOTIFICABLES.includes(estadoNuevo)
    ) {
      const etiqueta: Record<string, string> = {
        [EstadoProyecto.DisenoFinalizado]: 'Diseño Finalizado',
        [EstadoProyecto.DesarrolloFinalizado]: 'Desarrollo Finalizado',
        [EstadoProyecto.ProyectoFinalizado]: 'Proyecto Finalizado',
      };
      await this.notificaciones.enviarDiscord(
        `✅ **${proyecto.name}** llegó a *${etiqueta[estadoNuevo]}*.`,
      );
    }

    if (data.estadoPago !== undefined) {
      const porcentajeAnterior = this.parsearPorcentajePago(actual.estadoPago);
      const porcentajeNuevo = this.parsearPorcentajePago(data.estadoPago);

      // El 50% inicial (abono) es el punto de partida de la mayoría de los
      // proyectos: no es noticia. Recién avisa cuando sube por encima de eso.
      if (
        porcentajeAnterior !== null &&
        porcentajeNuevo !== null &&
        porcentajeNuevo > porcentajeAnterior &&
        porcentajeNuevo > 50
      ) {
        await this.notificaciones.enviarDiscord(
          `💰 **${proyecto.name}**: se pagó el ${porcentajeNuevo}% del proyecto.`,
        );
      }
    }

    return this.aplanar(proyecto);
  }

  /**
   * Define (o redefine) el plan de cobros. Los porcentajes los carga
   * administración a mano; acá solo se valida que sumen 100 y que el abono
   * inicial no baje del 30%.
   */
  async definirPlanDeCobros(
    id: number,
    dto: DefinirPlanCobrosDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    this.validarPlan(dto.cobros, dto.aprobadoPorJefatura ?? false);

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.cobros) {
        await tx.cobro.upsert({
          where: { proyectoId_hito: { proyectoId: id, hito: item.hito } },
          // Redefinir el plan cambia los porcentajes; lo ya cobrado se respeta.
          update: { porcentaje: item.porcentaje },
          create: {
            proyectoId: id,
            hito: item.hito,
            porcentaje: item.porcentaje,
          },
        });
      }

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo: `Plan de cobros: ${dto.cobros
            .map((item) => `${item.hito} ${item.porcentaje}%`)
            .join(' / ')}`,
          usuarioId: actorId ?? null,
        },
      });
    });

    return this.recalcularGrupo(id, actorId);
  }

  /** Marca un hito como cobrado (o lo revierte) y recalcula el grupo. */
  async marcarCobro(
    id: number,
    hito: HitoCobro,
    dto: MarcarCobroDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    const cobro = actual.cobros.find((item) => item.hito === hito);

    if (!cobro) {
      throw new BadRequestException(
        `El proyecto ${id} no tiene definido el hito ${hito}. Definí primero el plan de cobros.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cobro.update({
        where: { proyectoId_hito: { proyectoId: id, hito } },
        data: {
          cobrado: dto.cobrado,
          fechaCobro: dto.cobrado
            ? (this.aFecha(dto.fechaCobro) ?? new Date())
            : null,
        },
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo: dto.cobrado
            ? `Hito ${hito} cobrado`
            : `Hito ${hito} marcado como no cobrado`,
          usuarioId: actorId ?? null,
        },
      });
    });

    if (dto.cobrado) {
      await this.notificaciones.enviarDiscord(
        `💰 **${actual.name}**: se cobró el hito *${hito}*.`,
      );
    }

    return this.recalcularGrupo(id, actorId);
  }

  // -------------------------------------------------------------------------
  // Bloqueos del cliente (nodos A6, C1, B11)
  // -------------------------------------------------------------------------

  /** Material de marca: logo, fotos de banners y secciones. Frena el diseño. */
  marcarMaterialDeMarca(
    id: number,
    recibido: boolean,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    return this.actualizarBloqueo(
      id,
      { materialMarcaRecibido: recibido },
      motivo ??
        (recibido
          ? 'Material de marca recibido'
          : 'Material de marca pendiente'),
      actorId,
    );
  }

  /** Catálogo de productos: solo frena la carga de productos, no el desarrollo. */
  async marcarCatalogo(
    id: number,
    recibido: boolean,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (!aplicaCargaDeProductos(actual.tipoProyecto)) {
      throw new ConflictException(
        `El proyecto ${id} no es un e-commerce: no lleva catálogo de productos`,
      );
    }

    return this.actualizarBloqueo(
      id,
      { catalogoRecibido: recibido },
      motivo ?? (recibido ? 'Catálogo recibido' : 'Catálogo pendiente'),
      actorId,
    );
  }

  /** Hosting: se persigue al final, antes de subir a producción. */
  marcarHosting(
    id: number,
    contratado: boolean,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    return this.actualizarBloqueo(
      id,
      { hostingContratado: contratado },
      motivo ??
        (contratado ? 'Hosting contratado' : 'Hosting pendiente de contratar'),
      actorId,
    );
  }

  // -------------------------------------------------------------------------
  // Hitos del recorrido (nodos F1, A9, C3, B4, B13, B14)
  // -------------------------------------------------------------------------

  /**
   * Revisión de factibilidad: el desarrollador asignado revisa el diseño antes
   * de presentarlo. **No bloquea** —la única aprobación que frena el flujo es
   * la del cliente—, se registra para poder auditarlo.
   */
  registrarFactibilidad(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    return this.marcarHito(
      id,
      'factibilidadRevisadaAt',
      motivo ?? 'Revisión de factibilidad realizada',
      actorId,
    );
  }

  /**
   * El cliente aprobó el diseño (nodo A9). Se acepta desde cualquiera de las
   * tres etapas de diseño: la aprobación puede llegar sobre el avance o sobre
   * el diseño ya cerrado, y en las dos cierra el mismo nodo del diagrama.
   */
  async aprobarDiseno(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (!esEtapaDeDiseno(actual.estadoProyecto)) {
      throw new ConflictException(
        `El proyecto ${id} no está en diseño: está en ${actual.estadoProyecto}`,
      );
    }

    return this.marcarHito(
      id,
      'disenoAprobadoAt',
      motivo ?? 'El cliente aprobó el diseño',
      actorId,
    );
  }

  /** Carga de productos (nodo C3). Requiere el catálogo del cliente. */
  async cargarProductos(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (!aplicaCargaDeProductos(actual.tipoProyecto)) {
      throw new ConflictException(
        `El proyecto ${id} no es un e-commerce: no lleva carga de productos`,
      );
    }

    if (!actual.catalogoRecibido) {
      throw new ConflictException(
        `No se pueden cargar los productos del proyecto ${id}: falta el catálogo del cliente (plantilla llena y fotos)`,
      );
    }

    return this.actualizarBloqueo(
      id,
      { productosCargados: true },
      motivo ?? 'Productos cargados',
      actorId,
    );
  }

  /** Presentación de la web al cliente (nodo B4). */
  presentarWeb(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    return this.marcarHito(
      id,
      'presentadoAt',
      motivo ?? 'Web presentada al cliente',
      actorId,
    );
  }

  /**
   * Observaciones del cliente sobre la web (nodos B5 y B6). Las que caen fuera
   * del alcance aprobado generan una cotización adicional, pero **el proyecto
   * continúa igual** hacia el cobro de entrega: el diagrama no lo frena.
   */
  async registrarObservaciones(
    id: number,
    dto: ObservacionesDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (actual.presentadoAt === null) {
      throw new ConflictException(
        `El proyecto ${id} todavía no se presentó al cliente: no puede tener observaciones`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (!dto.dentroDelAlcance) {
        await tx.cotizacionAdicional.create({
          data: {
            proyectoId: id,
            motivo: dto.detalle,
            usuarioId: actorId ?? null,
          },
        });
      }

      await tx.proyecto.update({
        where: { id },
        data: dto.dentroDelAlcance
          ? // Vuelve a presentarse una vez aplicadas las correcciones.
            { presentadoAt: null }
          : {},
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo: dto.dentroDelAlcance
            ? `Observaciones dentro del alcance: ${dto.detalle}`
            : `Observaciones fuera del alcance (se cotizan aparte): ${dto.detalle}`,
          usuarioId: actorId ?? null,
        },
      });
    });

    return this.findOne(id);
  }

  /** Subida a producción (nodo B13). Exige el hosting contratado. */
  async subirAProduccion(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (!actual.hostingContratado) {
      throw new ConflictException(
        `No se puede subir a producción el proyecto ${id}: el cliente todavía no contrató el hosting`,
      );
    }

    return this.marcarHito(
      id,
      'subidoProduccionAt',
      motivo ?? 'Web subida a producción',
      actorId,
    );
  }

  /** Capacitación al cliente (nodo B14), último paso antes de la entrega. */
  async registrarCapacitacion(
    id: number,
    motivo?: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (actual.subidoProduccionAt === null) {
      throw new ConflictException(
        `El proyecto ${id} todavía no se subió a producción: la capacitación va después`,
      );
    }

    return this.marcarHito(
      id,
      'capacitacionAt',
      motivo ?? 'Capacitación al cliente realizada',
      actorId,
    );
  }

  /**
   * Registra una ronda de cambios de diseño. No bloquea cuando se agotan: el
   * sistema deja el proyecto como está y el caso se maneja internamente, solo
   * avisa que a partir de ahí todo cambio se cotiza aparte.
   */
  async registrarRondaDeCambios(
    id: number,
    motivo: string | undefined,
    actorId?: number,
  ): Promise<ResumenRondas> {
    const actual = await this.findOne(id);

    const rondasUsadas = actual.rondasCambiosUsadas + 1;
    const requiereCotizacionAdicional = rondasUsadas > RONDAS_CAMBIOS_INCLUIDAS;

    await this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { id },
        data: { rondasCambiosUsadas: rondasUsadas },
      });

      // Rondas agotadas: queda registrada la cotización para que administración
      // la persiga. El proyecto no se frena.
      if (requiereCotizacionAdicional) {
        await tx.cotizacionAdicional.create({
          data: {
            proyectoId: id,
            motivo:
              motivo ??
              `Ronda de cambios ${rondasUsadas}: fuera de las ${RONDAS_CAMBIOS_INCLUIDAS} incluidas`,
            usuarioId: actorId ?? null,
          },
        });
      }

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo:
            motivo ??
            `Ronda de cambios ${rondasUsadas} de ${RONDAS_CAMBIOS_INCLUIDAS} incluidas`,
          usuarioId: actorId ?? null,
        },
      });
    });

    return {
      rondasUsadas,
      rondasIncluidas: RONDAS_CAMBIOS_INCLUIDAS,
      requiereCotizacionAdicional,
      proyecto: await this.findOne(id),
    };
  }

  /** Archiva un proyecto trabado. Estado terminal, distinto de Finalizado. */
  async archivar(
    id: number,
    motivo: string | undefined,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (actual.estadoProyecto === EstadoProyecto.Archivado) {
      throw new ConflictException(`El proyecto ${id} ya está archivado`);
    }

    if (actual.estadoProyecto === EstadoProyecto.ProyectoFinalizado) {
      throw new ConflictException(
        `El proyecto ${id} está finalizado: no se archiva`,
      );
    }

    const ahora = new Date();
    const dias = actual.fechaUltimoCambioEstado
      ? diasTranscurridos(actual.fechaUltimoCambioEstado, ahora)
      : null;

    const proyecto = await this.prisma.$transaction(async (tx) => {
      const archivado = await tx.proyecto.update({
        where: { id },
        data: {
          estadoProyecto: EstadoProyecto.Archivado,
          archivadoAt: ahora,
          fechaUltimoCambioEstado: ahora,
        },
        include: proyectoInclude,
      });

      // Un proyecto archivado ya no se persigue: sus recordatorios se cierran.
      await tx.recordatorioProyecto.updateMany({
        where: { proyectoId: id, resueltoAt: null },
        data: { resueltoAt: ahora },
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: EstadoProyecto.Archivado,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo:
            motivo ??
            `Archivado tras ${dias ?? '?'} días sin respuesta. ` +
              (conservaLoAbonado(actual.estadoProyecto)
                ? 'Ya estaba en desarrollo: lo abonado se conserva.'
                : 'Lo abonado se pierde.'),
          usuarioId: actorId ?? null,
        },
      });

      return archivado;
    });

    await this.notificaciones.enviarDiscord(
      `📦 **${proyecto.name}** se archivó (90 días sin respuesta).`,
    );

    return this.aplanar(proyecto);
  }

  /**
   * Reactiva un proyecto archivado. No existe crédito a favor: devuelve cuánto
   * tiene que volver a pagar el cliente para retomar.
   */
  async reactivar(
    id: number,
    motivo: string | undefined,
    actorId?: number,
  ): Promise<ResumenReactivacion> {
    const actual = await this.findOne(id);

    if (actual.estadoProyecto !== EstadoProyecto.Archivado) {
      throw new ConflictException(
        `El proyecto ${id} no está archivado: no hay nada que reactivar`,
      );
    }

    const archivadoAt = actual.archivadoAt ?? actual.updatedAt;
    const ahora = new Date();
    const porcentaje = porcentajeDeReactivacion(archivadoAt, ahora);

    // El estado al que vuelve sale del historial: es el que tenía justo antes
    // de archivarse.
    const ultimoArchivado = await this.prisma.historialEtapa.findFirst({
      where: { proyectoId: id, estadoNuevo: EstadoProyecto.Archivado },
      orderBy: { createdAt: 'desc' },
      select: { estadoAnterior: true },
    });

    const estadoPrevio =
      ultimoArchivado?.estadoAnterior ?? EstadoProyecto.Brief;
    const estadoNuevo = estadoAlReactivar(estadoPrevio, porcentaje);

    const situacion: EstadoDelProyecto = {
      estadoProyecto: estadoNuevo,
      tipoProyecto: actual.tipoProyecto,
      materialMarcaRecibido: actual.materialMarcaRecibido,
      catalogoRecibido: actual.catalogoRecibido,
      hostingContratado: actual.hostingContratado,
      subidoProduccionAt: actual.subidoProduccionAt,
      capacitacionAt: actual.capacitacionAt,
      cobros: actual.cobros,
    };

    const grupoNuevo = this.grupoDe(situacion);

    const proyecto = await this.prisma.$transaction(async (tx) => {
      const reactivado = await tx.proyecto.update({
        where: { id },
        data: {
          estadoProyecto: estadoNuevo,
          grupo: grupoNuevo,
          archivadoAt: null,
          fechaUltimoCambioEstado: ahora,
        },
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: EstadoProyecto.Archivado,
          estadoNuevo,
          grupoAnterior: actual.grupo,
          grupoNuevo,
          motivo:
            motivo ??
            `Reactivación tras ${diasTranscurridos(archivadoAt, ahora)} días archivado: paga ${porcentaje}%`,
          usuarioId: actorId ?? null,
        },
      });

      await this.sincronizarRecordatorios(tx, id, situacion, actorId);

      void reactivado;

      return tx.proyecto.findUniqueOrThrow({
        where: { id },
        include: proyectoInclude,
      });
    });

    return {
      porcentajeAReactivar: porcentaje,
      diasArchivado: diasTranscurridos(archivadoAt, ahora),
      seRehaceInicioYDiseno: estadoNuevo !== estadoPrevio,
      proyecto: this.aplanar(proyecto),
    };
  }

  /**
   * Reasigna diseñador y/o desarrollador dejando `usuarios_proyectos` en
   * sincronía: el responsable saliente se desengancha del equipo y el entrante
   * se engancha, todo en la misma transacción. Al resto del equipo no lo toca.
   */
  async asignarResponsables(
    id: number,
    dto: AsignarResponsablesDto,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);
    await this.validarAsignados(dto.disenadorId, dto.desarrolladorId);

    const disenadorNuevo =
      dto.disenadorId !== undefined ? dto.disenadorId : actual.disenadorId;
    const desarrolladorNuevo =
      dto.desarrolladorId !== undefined
        ? dto.desarrolladorId
        : actual.desarrolladorId;

    // Sin early return aunque los responsables no cambien: la ruta también
    // sirve para reparar un join que quedó desfasado de las columnas.

    // Los que quedan como responsables no se sacan del equipo aunque estuvieran
    // ocupando el otro puesto (el mismo usuario puede ser los dos).
    const quedan = [disenadorNuevo, desarrolladorNuevo].filter(
      (usuarioId): usuarioId is number => typeof usuarioId === 'number',
    );

    const salen = [actual.disenadorId, actual.desarrolladorId].filter(
      (usuarioId): usuarioId is number =>
        typeof usuarioId === 'number' && !quedan.includes(usuarioId),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({
        where: { id },
        data: {
          disenadorId: disenadorNuevo,
          desarrolladorId: desarrolladorNuevo,
        },
      });

      if (salen.length > 0) {
        await tx.usuarioProyecto.deleteMany({
          where: { proyectoId: id, usuarioId: { in: salen } },
        });
      }

      if (quedan.length > 0) {
        await tx.usuarioProyecto.createMany({
          data: quedan.map((usuarioId) => ({ proyectoId: id, usuarioId })),
          skipDuplicates: true,
        });
      }

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo:
            dto.motivo ??
            `Responsables: diseñador ${actual.disenadorId ?? '—'} → ${disenadorNuevo ?? '—'}, desarrollador ${actual.desarrolladorId ?? '—'} → ${desarrolladorNuevo ?? '—'}`,
          usuarioId: actorId ?? null,
        },
      });
    });

    const proyecto = await this.findOne(id);

    // Si el proyecto ya está en Diseño o Desarrollo, el responsable nuevo
    // tiene trabajo desde hoy: se le avisa como si recién se lo asignaran.
    await this.notificarAsignaciones(actual, proyecto);

    return proyecto;
  }

  async asignarUsuarios(
    id: number,
    usuariosIds: number[],
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);
    await this.validarUsuarios(usuariosIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.usuarioProyecto.createMany({
        data: usuariosIds.map((usuarioId) => ({ proyectoId: id, usuarioId })),
        skipDuplicates: true,
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo: `Agregó al equipo a los usuarios: ${usuariosIds.join(', ')}`,
          usuarioId: actorId ?? null,
        },
      });
    });

    return this.findOne(id);
  }

  async quitarUsuario(
    id: number,
    usuarioId: number,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    const { count } = await this.prisma.$transaction(async (tx) => {
      const resultado = await tx.usuarioProyecto.deleteMany({
        where: { proyectoId: id, usuarioId },
      });

      if (resultado.count > 0) {
        await tx.historialEtapa.create({
          data: {
            proyectoId: id,
            estadoAnterior: actual.estadoProyecto,
            estadoNuevo: actual.estadoProyecto,
            grupoAnterior: actual.grupo,
            grupoNuevo: actual.grupo,
            motivo: `Quitó del equipo al usuario ${usuarioId}`,
            usuarioId: actorId ?? null,
          },
        });
      }

      return resultado;
    });

    if (count === 0) {
      throw new NotFoundException(
        `El usuario ${usuarioId} no está asignado al proyecto ${id}`,
      );
    }

    return this.findOne(id);
  }

  async remove(id: number, actorId?: number): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    const proyecto = await this.prisma.$transaction(async (tx) => {
      const eliminado = await tx.proyecto.update({
        where: { id },
        data: { deletedAt: new Date() },
        include: proyectoInclude,
      });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo: 'Eliminó el proyecto (borrado lógico)',
          usuarioId: actorId ?? null,
        },
      });

      return eliminado;
    });

    return this.aplanar(proyecto);
  }

  // -------------------------------------------------------------------------
  // Internos
  // -------------------------------------------------------------------------

  /**
   * Cambia una marca del recorrido y deja su fila en el historial. El grupo se
   * recalcula después porque varias de estas marcas lo mueven.
   */
  private async marcarHito(
    id: number,
    campo:
      | 'factibilidadRevisadaAt'
      | 'disenoAprobadoAt'
      | 'presentadoAt'
      | 'subidoProduccionAt'
      | 'capacitacionAt',
    motivo: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);
    const ahora = new Date();

    await this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({ where: { id }, data: { [campo]: ahora } });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo,
          usuarioId: actorId ?? null,
        },
      });
    });

    return this.recalcularGrupo(id, actorId);
  }

  /** Cambia un bloqueo del cliente y recalcula grupo y recordatorios. */
  private async actualizarBloqueo(
    id: number,
    data: Prisma.ProyectoUpdateInput,
    motivo: string,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.proyecto.update({ where: { id }, data });

      await tx.historialEtapa.create({
        data: {
          proyectoId: id,
          estadoAnterior: actual.estadoProyecto,
          estadoNuevo: actual.estadoProyecto,
          grupoAnterior: actual.grupo,
          grupoNuevo: actual.grupo,
          motivo,
          usuarioId: actorId ?? null,
        },
      });
    });

    return this.recalcularGrupo(id, actorId);
  }

  /** Recalcula el grupo desde el estado actual del proyecto y sus cobros. */
  private async recalcularGrupo(
    id: number,
    actorId?: number,
  ): Promise<ProyectoCompleto> {
    const actual = await this.findOne(id);

    if (esEstadoTerminal(actual.estadoProyecto)) {
      return actual;
    }

    const situacion: EstadoDelProyecto = {
      estadoProyecto: actual.estadoProyecto,
      tipoProyecto: actual.tipoProyecto,
      materialMarcaRecibido: actual.materialMarcaRecibido,
      catalogoRecibido: actual.catalogoRecibido,
      hostingContratado: actual.hostingContratado,
      subidoProduccionAt: actual.subidoProduccionAt,
      capacitacionAt: actual.capacitacionAt,
      cobros: actual.cobros,
    };

    const grupoNuevo = this.grupoDe(situacion);

    const proyecto = await this.prisma.$transaction(async (tx) => {
      if (grupoNuevo !== actual.grupo) {
        await tx.proyecto.update({
          where: { id },
          data: { grupo: grupoNuevo },
        });

        await tx.historialEtapa.create({
          data: {
            proyectoId: id,
            estadoAnterior: actual.estadoProyecto,
            estadoNuevo: actual.estadoProyecto,
            grupoAnterior: actual.grupo,
            grupoNuevo,
            motivo: 'Grupo recalculado',
            usuarioId: actorId ?? null,
          },
        });
      }

      await this.sincronizarRecordatorios(tx, id, situacion, actorId);

      return tx.proyecto.findUniqueOrThrow({
        where: { id },
        include: proyectoInclude,
      });
    });

    return this.aplanar(proyecto);
  }

  /**
   * Deja abierto el recordatorio que corresponda a lo que está trabando al
   * proyecto y cierra los demás. Un recordatorio abierto es lo que después
   * define, en `findPorArchivar`, que el proyecto está esperando al cliente.
   */
  private async sincronizarRecordatorios(
    tx: Prisma.TransactionClient,
    proyectoId: number,
    situacion: EstadoDelProyecto,
    actorId?: number,
  ): Promise<void> {
    const tipo: TipoRecordatorio | null = esEstadoTerminal(
      situacion.estadoProyecto,
    )
      ? null
      : recordatorioQueCorresponde(situacion);

    const abiertos = await tx.recordatorioProyecto.findMany({
      where: { proyectoId, resueltoAt: null },
      select: { id: true, tipo: true },
    });

    const sobrantes = abiertos.filter((r) => r.tipo !== tipo);

    if (sobrantes.length > 0) {
      await tx.recordatorioProyecto.updateMany({
        where: { id: { in: sobrantes.map((r) => r.id) } },
        data: { resueltoAt: new Date() },
      });
    }

    if (tipo !== null && !abiertos.some((r) => r.tipo === tipo)) {
      await tx.recordatorioProyecto.create({
        data: { proyectoId, tipo, usuarioId: actorId ?? null },
      });
    }
  }

  /** El grupo derivado, con el hosting exigible solo en el tramo final. */
  private grupoDe(situacion: EstadoDelProyecto): Grupo {
    return derivarGrupo({
      estadoProyecto: situacion.estadoProyecto,
      materialMarcaRecibido: situacion.materialMarcaRecibido,
      catalogoRecibido: situacion.catalogoRecibido,
      cobroPendiente: this.hayCobroPendiente(
        situacion.estadoProyecto,
        situacion.cobros,
      ),
      hostingPendiente:
        hostingEsExigible(situacion.estadoProyecto) &&
        !situacion.hostingContratado,
    });
  }

  /**
   * Las compuertas del diagrama: los ciclos ⟳ que impiden avanzar hasta que se
   * cumpla la condición. Antes solo se miraba el cobro, así que un proyecto sin
   * material de marca caía a Grupo B pero igual podía pasar a diseño.
   */
  private verificarCompuertas(situacion: EstadoDelProyecto): void {
    const motivos = compuertasFaltantes({
      estadoDestino: situacion.estadoProyecto,
      tipoProyecto: situacion.tipoProyecto,
      materialMarcaRecibido: situacion.materialMarcaRecibido,
      hostingContratado: situacion.hostingContratado,
      subidoProduccionAt: situacion.subidoProduccionAt,
      capacitacionAt: situacion.capacitacionAt,
      cobros: situacion.cobros,
    });

    if (motivos.length > 0) {
      throw new ConflictException(
        `No se puede pasar a ${situacion.estadoProyecto}: ${motivos.join('; ')}`,
      );
    }
  }

  private hayCobroPendiente(
    estado: EstadoProyecto,
    cobros: { hito: HitoCobro; cobrado: boolean }[],
  ): boolean {
    const hito = hitoQueHabilita(estado);

    if (hito === null || cobros.length === 0) {
      return false;
    }

    const cobro = cobros.find((item) => item.hito === hito);

    return cobro ? !cobro.cobrado : false;
  }

  private validarPlan(
    cobros: { hito: HitoCobro; porcentaje: number }[],
    aprobadoPorJefatura: boolean,
  ): void {
    const error = validarPlanDeCobros(cobros, aprobadoPorJefatura);

    if (error) {
      throw new BadRequestException(error);
    }
  }

  /** El ValidationPipe no transforma, así que la fecha llega como string ISO. */
  private aFecha(valor?: string | null): Date | null {
    return valor ? new Date(valor) : null;
  }

  /**
   * `estadoPago` es texto libre ("50%", "Pagado", "80"...); se intenta leer
   * el primer número como porcentaje. Si no hay ninguno, no se puede comparar.
   */
  /**
   * Corta el paso a las etapas reservadas a administración
   * (`etapaSoloDeAdministracion`). El rol sale de la base y no del token: el
   * payload solo trae `roleId`, y los ids difieren entre entornos.
   *
   * Sin actor (ruta pública, hoy ninguna) no se bloquea nada: quien puede
   * llamar sin token ya pasó por los guards globales.
   */
  private async verificarQueEsAdministracion(
    estadoDestino: EstadoProyecto,
    actorId?: number,
  ): Promise<void> {
    if (actorId === undefined) return;

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { rol: { select: { name: true } } },
    });

    const nombre = actor?.rol.name;

    if (
      nombre !== undefined &&
      (ROLES_ADMINISTRACION as readonly string[]).includes(nombre)
    ) {
      return;
    }

    throw new ForbiddenException(
      `Solo administración puede pasar un proyecto a ${estadoDestino}: antes hay que cobrar el hito de aprobación de diseño`,
    );
  }

  // ---------------------------------------------------------------------------
  // Avisos internos (campanita del front)
  // ---------------------------------------------------------------------------

  /**
   * Avisa al diseñador cuando el proyecto entra a Diseño y al desarrollador
   * cuando entra a Desarrollo, y también al responsable nuevo si lo cambian
   * con el proyecto ya en esa etapa. Moverse entre las etapas de diseño
   * (Diseño → Avance de Diseño) no vuelve a avisar: es el mismo trabajo.
   *
   * `anterior` en `null` es un alta: cuenta como «recién entra».
   */
  private async notificarAsignaciones(
    anterior: {
      estadoProyecto: EstadoProyecto;
      disenadorId: number | null;
      desarrolladorId: number | null;
    } | null,
    proyecto: {
      id: number;
      name: string;
      estadoProyecto: EstadoProyecto;
      disenadorId: number | null;
      desarrolladorId: number | null;
    },
  ): Promise<void> {
    const ETAPAS_TRABAJO_DISENO: EstadoProyecto[] = [
      EstadoProyecto.Diseno,
      EstadoProyecto.AvanceDiseno,
    ];
    const ETAPAS_TRABAJO_DESARROLLO: EstadoProyecto[] = [
      EstadoProyecto.Desarrollo,
    ];

    const avisos: {
      etapas: EstadoProyecto[];
      responsableAhora: number | null;
      responsableAntes: number | null;
      rol: string;
      etiqueta: string;
    }[] = [
      {
        etapas: ETAPAS_TRABAJO_DISENO,
        responsableAhora: proyecto.disenadorId,
        responsableAntes: anterior?.disenadorId ?? null,
        rol: 'diseñador',
        etiqueta: 'Diseño',
      },
      {
        etapas: ETAPAS_TRABAJO_DESARROLLO,
        responsableAhora: proyecto.desarrolladorId,
        responsableAntes: anterior?.desarrolladorId ?? null,
        rol: 'desarrollador',
        etiqueta: 'Desarrollo',
      },
    ];

    for (const aviso of avisos) {
      if (aviso.responsableAhora === null) continue;
      if (!aviso.etapas.includes(proyecto.estadoProyecto)) continue;

      const recienEntra =
        anterior === null || !aviso.etapas.includes(anterior.estadoProyecto);
      const cambioResponsable =
        aviso.responsableAntes !== aviso.responsableAhora;

      if (!recienEntra && !cambioResponsable) continue;

      await this.notificaciones.notificar([aviso.responsableAhora], {
        tipo: TipoNotificacion.ProyectoAsignado,
        titulo: 'Se te asignó un nuevo proyecto',
        mensaje: `«${proyecto.name}» está en ${aviso.etiqueta} y eres el ${aviso.rol} asignado. Por favor verifica.`,
        proyectoId: proyecto.id,
      });
    }
  }

  /**
   * Cuando el diseño o el desarrollo se cierran hay que salir a cobrar: se le
   * avisa a administración con el hito que corresponde y cuánto falta del
   * monto. Con plan de cobros el pendiente sale de los hitos no cobrados; sin
   * plan (proyectos migrados) sale del `estadoPago` que se carga a mano.
   */
  private async notificarEtapaFinalizada(proyecto: {
    id: number;
    name: string;
    estadoProyecto: EstadoProyecto;
    estadoPago: string;
    cobros: { hito: HitoCobro; porcentaje: number; cobrado: boolean }[];
  }): Promise<void> {
    const cierres: Partial<
      Record<
        EstadoProyecto,
        { hito: HitoCobro; nombreHito: string; que: string }
      >
    > = {
      [EstadoProyecto.DisenoFinalizado]: {
        hito: HitoCobro.AprobacionDiseno,
        nombreHito: 'Aprobación de diseño',
        que: 'Este diseño finalizó',
      },
      [EstadoProyecto.DesarrolloFinalizado]: {
        hito: HitoCobro.Entrega,
        nombreHito: 'Entrega',
        que: 'Este desarrollo finalizó',
      },
    };

    const cierre = cierres[proyecto.estadoProyecto];
    if (!cierre) return;

    const cobroDelHito = proyecto.cobros.find((c) => c.hito === cierre.hito);

    let pendiente: number | null;
    if (proyecto.cobros.length > 0) {
      pendiente = proyecto.cobros
        .filter((c) => !c.cobrado)
        .reduce((total, c) => total + c.porcentaje, 0);
    } else {
      const pagado = this.parsearPorcentajePago(proyecto.estadoPago);
      pendiente = pagado === null ? null : Math.max(0, 100 - pagado);
    }

    const queCobrar =
      cobroDelHito && !cobroDelHito.cobrado
        ? ` el hito ${cierre.nombreHito} (${cobroDelHito.porcentaje}%)`
        : '';

    let cuantoFalta: string;
    if (pendiente === null) {
      cuantoFalta = 'Revisa el estado de pago del proyecto.';
    } else if (pendiente === 0) {
      cuantoFalta = 'Ya está cobrado el 100% del monto.';
    } else {
      cuantoFalta = `Aún falta el ${pendiente}% del monto.`;
    }

    await this.notificaciones.notificarAdministracion({
      tipo: TipoNotificacion.EtapaFinalizada,
      titulo: `${cierre.que}: ${proyecto.name}`,
      mensaje: `${cierre.que}. Por favor cobrar${queCobrar}. ${cuantoFalta}`,
      proyectoId: proyecto.id,
    });
  }

  private parsearPorcentajePago(
    valor: string | null | undefined,
  ): number | null {
    const match = valor?.match(/\d+/);
    if (!match) return null;
    return Number(match[0]);
  }

  private aplanar(proyecto: ProyectoConRelaciones): ProyectoCompleto {
    const { usuarios, ...resto } = proyecto;

    const masViejo = proyecto.recordatorios.at(0);

    return {
      ...resto,
      usuarios: usuarios.map((fila) => fila.usuario),
      responsable: responsableDe(proyecto.estadoProyecto, proyecto.grupo),
      diasEsperandoAlCliente: masViejo
        ? diasTranscurridos(masViejo.createdAt)
        : null,
    };
  }

  private async validarSeguimiento(seguimientoId: number): Promise<void> {
    const seguimiento = await this.prisma.seguimiento.findUnique({
      where: { id: seguimientoId },
      select: { id: true },
    });

    if (!seguimiento) {
      throw new BadRequestException(
        `El seguimiento con id ${seguimientoId} no existe`,
      );
    }
  }

  private async validarAsignados(
    disenadorId?: number | null,
    desarrolladorId?: number | null,
  ): Promise<void> {
    const ids = [disenadorId, desarrolladorId].filter(
      (id): id is number => typeof id === 'number',
    );

    if (ids.length === 0) {
      return;
    }

    await this.validarUsuarios([...new Set(ids)]);
  }

  private async validarUsuarios(usuariosIds?: number[]): Promise<void> {
    if (usuariosIds === undefined || usuariosIds.length === 0) {
      return;
    }

    const existentes = await this.prisma.user.findMany({
      where: { id: { in: usuariosIds } },
      select: { id: true },
    });

    const faltantes = usuariosIds.filter(
      (usuarioId) => !existentes.some((usuario) => usuario.id === usuarioId),
    );

    if (faltantes.length > 0) {
      throw new BadRequestException(
        `Los usuarios con id ${faltantes.join(', ')} no existen`,
      );
    }
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Proyecto con id ${id} no encontrado`);
  }
}
