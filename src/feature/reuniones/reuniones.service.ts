import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Prisma, TipoNotificacion } from '../../lib/generated/prisma/client';
import { CreateReunionDto } from './dto/create-reunion.dto';
import { UpdateReunionDto } from './dto/update-reunion.dto';

const usuarioResumen = {
  select: { id: true, name: true, user: true, roleId: true },
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

    const reunion = await this.prisma.reunion.create({
      data: {
        titulo: dto.titulo,
        descripcion: dto.descripcion ?? null,
        fecha: new Date(dto.fecha),
        linkMeet: dto.linkMeet,
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

    const reunion = await this.prisma.reunion.update({
      where: { id },
      data: {
        ...data,
        ...(fecha !== undefined && { fecha: new Date(fecha) }),
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

  // ---------------------------------------------------------------------------

  private describir(reunion: ReunionConRelaciones): string {
    const cuando = FORMATO_FECHA.format(reunion.fecha);
    const proyecto = reunion.proyecto ? ` (${reunion.proyecto.name})` : '';
    return `${reunion.titulo}${proyecto}: ${cuando}. Link: ${reunion.linkMeet}`;
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
