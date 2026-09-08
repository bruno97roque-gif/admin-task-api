import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import {
  EstadoNota,
  Prisma,
  TipoNotificacion,
} from '../../lib/generated/prisma/client';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';
import { CreateNotaDto } from './dto/create-nota.dto';
import { CreateRespuestaDto } from './dto/create-respuesta.dto';
import { CambiarEstadoNotaDto } from './dto/cambiar-estado-nota.dto';

const autorResumen = {
  select: { id: true, name: true, user: true, roleId: true },
} satisfies Prisma.UserDefaultArgs;

const notaInclude = {
  proyecto: { select: { id: true, name: true } },
  autor: autorResumen,
  respuestas: {
    orderBy: { createdAt: 'asc' },
    include: { autor: autorResumen },
  },
} satisfies Prisma.NotaAdminInclude;

export type NotaCompleta = Prisma.NotaAdminGetPayload<{
  include: typeof notaInclude;
}>;

/** Cuántos caracteres del texto entran en el aviso interno. */
const LARGO_RESUMEN = 120;

/**
 * Tickets del equipo para administración, siempre sobre un proyecto.
 *
 * Cada ticket tiene categoría (de qué se trata), estado (en qué va) y un hilo
 * de respuestas: administración contesta y el autor ve la respuesta acá, sin
 * salir del sistema. Quien escribe tiene que estar asignado al proyecto; el
 * ticket no es un canal para opinar sobre proyectos ajenos.
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
        ...(dto.categoria !== undefined && { categoria: dto.categoria }),
      },
      include: notaInclude,
    });

    await this.notificaciones.notificarAdministracion({
      tipo: TipoNotificacion.NotaRecibida,
      titulo: `${nota.categoria} de ${nota.autor?.name ?? 'un usuario'} sobre ${proyecto.name}`,
      mensaje: this.resumir(nota.contenido),
      proyectoId: proyecto.id,
    });

    return nota;
  }

  /**
   * Todas. Primero lo que sigue abierto y, dentro de eso, lo que se movió más
   * recientemente: un ticket con respuestas nuevas sube.
   */
  findAll(): Promise<NotaCompleta[]> {
    return this.prisma.notaAdmin.findMany({
      include: notaInclude,
      orderBy: [
        { estado: 'asc' },
        { ultimaRespuestaAt: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
      ],
    });
  }

  /** Los que abrió el usuario logueado, más nuevos primero. */
  findMias(autorId: number): Promise<NotaCompleta[]> {
    return this.prisma.notaAdmin.findMany({
      where: { autorId },
      include: notaInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Un ticket con su hilo. Solo su autor o administración. */
  async findOne(id: number, usuarioId: number): Promise<NotaCompleta> {
    const nota = await this.buscar(id);
    await this.verificarAcceso(nota, usuarioId);
    return nota;
  }

  /**
   * Suma un mensaje al hilo. Si responde administración se avisa al autor; si
   * responde el autor, a administración.
   */
  async responder(
    id: number,
    dto: CreateRespuestaDto,
    usuarioId: number,
  ): Promise<NotaCompleta> {
    const nota = await this.buscar(id);
    const esAdmin = await this.verificarAcceso(nota, usuarioId);

    if (nota.estado === EstadoNota.Resuelta) {
      throw new ConflictException(
        'Este ticket está resuelto: para seguir la conversación hay que reabrirlo',
      );
    }

    const ahora = new Date();

    await this.prisma.$transaction([
      this.prisma.respuestaNota.create({
        data: {
          notaId: id,
          autorId: usuarioId,
          contenido: dto.contenido.trim(),
        },
      }),
      this.prisma.notaAdmin.update({
        where: { id },
        data: {
          ultimaRespuestaAt: ahora,
          // Que administración conteste ya cuenta como visto y en curso.
          ...(esAdmin && {
            leidaAt: nota.leidaAt ?? ahora,
            ...(nota.estado === EstadoNota.Pendiente && {
              estado: EstadoNota.EnCurso,
            }),
          }),
        },
      }),
    ]);

    const resumen = this.resumir(dto.contenido);

    if (esAdmin) {
      await this.notificaciones.notificar(
        nota.autorId === null ? [] : [nota.autorId],
        {
          tipo: TipoNotificacion.NotaRespondida,
          titulo: `Administración respondió sobre ${nota.proyecto.name}`,
          mensaje: resumen,
          proyectoId: nota.proyectoId,
        },
      );
    } else {
      await this.notificaciones.notificarAdministracion({
        tipo: TipoNotificacion.NotaRespondida,
        titulo: `${nota.autor?.name ?? 'Un usuario'} respondió sobre ${nota.proyecto.name}`,
        mensaje: resumen,
        proyectoId: nota.proyectoId,
      });
    }

    return this.buscar(id);
  }

  /** Cambia el estado. Solo administración; el autor se entera por la campana. */
  async cambiarEstado(
    id: number,
    dto: CambiarEstadoNotaDto,
  ): Promise<NotaCompleta> {
    const nota = await this.buscar(id);

    if (nota.estado === dto.estado) return nota;

    const ahora = new Date();

    await this.prisma.notaAdmin.update({
      where: { id },
      data: {
        estado: dto.estado,
        // Sacarlo de Pendiente es haberlo visto.
        ...(dto.estado !== EstadoNota.Pendiente && {
          leidaAt: nota.leidaAt ?? ahora,
        }),
      },
    });

    const etiquetas: Record<EstadoNota, string> = {
      [EstadoNota.Pendiente]: 'volvió a quedar pendiente',
      [EstadoNota.EnCurso]: 'está en curso',
      [EstadoNota.Resuelta]: 'se marcó como resuelto',
    };

    await this.notificaciones.notificar(
      nota.autorId === null ? [] : [nota.autorId],
      {
        tipo: TipoNotificacion.NotaRespondida,
        titulo: `Tu ticket sobre ${nota.proyecto.name} ${etiquetas[dto.estado]}`,
        mensaje: this.resumir(nota.contenido),
        proyectoId: nota.proyectoId,
      },
    );

    return this.buscar(id);
  }

  /** Compatibilidad: marcar leída es pasar el ticket a «en curso». */
  marcarLeida(id: number): Promise<NotaCompleta> {
    return this.cambiarEstado(id, { estado: EstadoNota.EnCurso });
  }

  async remove(id: number): Promise<NotaCompleta> {
    const nota = await this.buscar(id);
    await this.prisma.notaAdmin.delete({ where: { id } });
    return nota;
  }

  // ---------------------------------------------------------------------------

  private resumir(texto: string): string {
    const limpio = texto.trim();
    return limpio.length > LARGO_RESUMEN
      ? `${limpio.slice(0, LARGO_RESUMEN)}…`
      : limpio;
  }

  private async buscar(id: number): Promise<NotaCompleta> {
    const nota = await this.prisma.notaAdmin.findUnique({
      where: { id },
      include: notaInclude,
    });

    if (!nota) {
      throw this.notFound(id);
    }

    return nota;
  }

  /** Devuelve si el usuario es de administración; lanza 403 si no tiene acceso. */
  private async verificarAcceso(
    nota: NotaCompleta,
    usuarioId: number,
  ): Promise<boolean> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { rol: { select: { name: true } } },
    });

    const esAdmin = (ROLES_ADMINISTRACION as readonly string[]).includes(
      usuario?.rol.name ?? '',
    );

    if (esAdmin || nota.autorId === usuarioId) {
      return esAdmin;
    }

    throw new ForbiddenException('Este ticket no es tuyo');
  }

  private notFound(id: number): NotFoundException {
    return new NotFoundException(`Nota con id ${id} no encontrada`);
  }
}
