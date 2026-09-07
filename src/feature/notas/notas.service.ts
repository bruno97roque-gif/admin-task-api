import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { Prisma, TipoNotificacion } from '../../lib/generated/prisma/client';
import { CreateNotaDto } from './dto/create-nota.dto';

const notaInclude = {
  proyecto: { select: { id: true, name: true } },
  autor: { select: { id: true, name: true, user: true, roleId: true } },
} satisfies Prisma.NotaAdminInclude;

export type NotaCompleta = Prisma.NotaAdminGetPayload<{
  include: typeof notaInclude;
}>;

/** Cuántos caracteres de la nota entran en el aviso interno. */
const LARGO_RESUMEN = 120;

/**
 * Notas del equipo para administración, siempre sobre un proyecto. El autor
 * tiene que estar asignado a ese proyecto (diseñador, desarrollador o parte
 * del equipo): la nota no es un canal para opinar sobre proyectos ajenos.
 */
@Injectable()
export class NotasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificaciones: NotificacionesService,
  ) {}

  async create(dto: CreateNotaDto, autorId: number): Promise<NotaCompleta> {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id: dto.proyectoId, deletedAt: null },
      select: {
        id: true,
        name: true,
        disenadorId: true,
        desarrolladorId: true,
        usuarios: { select: { usuarioId: true } },
      },
    });

    if (!proyecto) {
      throw new BadRequestException(
        `El proyecto con id ${dto.proyectoId} no existe`,
      );
    }

    const asignado =
      proyecto.disenadorId === autorId ||
      proyecto.desarrolladorId === autorId ||
      proyecto.usuarios.some((fila) => fila.usuarioId === autorId);

    if (!asignado) {
      throw new ConflictException(
        `No estás asignado al proyecto «${proyecto.name}»`,
      );
    }

    const nota = await this.prisma.notaAdmin.create({
      data: {
        proyectoId: dto.proyectoId,
        autorId,
        contenido: dto.contenido.trim(),
      },
      include: notaInclude,
    });

    const resumen =
      nota.contenido.length > LARGO_RESUMEN
        ? `${nota.contenido.slice(0, LARGO_RESUMEN)}…`
        : nota.contenido;

    await this.notificaciones.notificarAdministracion({
      tipo: TipoNotificacion.NotaRecibida,
      titulo: `Nota de ${nota.autor?.name ?? 'un usuario'} sobre ${proyecto.name}`,
      mensaje: resumen,
      proyectoId: proyecto.id,
    });

    return nota;
  }

  /** Todas, no leídas primero y dentro de eso más nuevas primero. */
  findAll(): Promise<NotaCompleta[]> {
    return this.prisma.notaAdmin.findMany({
      include: notaInclude,
      orderBy: [
        { leidaAt: { sort: 'asc', nulls: 'first' } },
        { createdAt: 'desc' },
      ],
    });
  }

  /** Las que mandó el usuario logueado, más nuevas primero. */
  findMias(autorId: number): Promise<NotaCompleta[]> {
    return this.prisma.notaAdmin.findMany({
      where: { autorId },
      include: notaInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async marcarLeida(id: number): Promise<NotaCompleta> {
    const nota = await this.prisma.notaAdmin.findUnique({
      where: { id },
      include: notaInclude,
    });

    if (!nota) {
      throw this.notFound(id);
    }

    if (nota.leidaAt) return nota;

    return this.prisma.notaAdmin.update({
      where: { id },
      data: { leidaAt: new Date() },
      include: notaInclude,
    });
  }

  async remove(id: number): Promise<NotaCompleta> {
    try {
      return await this.prisma.notaAdmin.delete({
        where: { id },
        include: notaInclude,
      });
    } catch (error) {
      this.rethrow(error, id);
    }
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Nota con id ${id} no encontrada`);
  }

  private rethrow(error: unknown, id: number): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw this.notFound(id);
    }

    throw error;
  }
}
