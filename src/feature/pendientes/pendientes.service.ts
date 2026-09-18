import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../lib/prisma/prisma.service';
import { Pendiente } from '../../lib/generated/prisma/client';
import { ROLES_ADMINISTRACION } from '../auth/decorators/roles.decorator';
import { ActualizarPendienteDto } from './dto/actualizar-pendiente.dto';
import { CrearPendienteDto } from './dto/crear-pendiente.dto';
import { estaAsignado, ordenSiguiente, puedeLeer } from './pendientes.reglas';

/** Cuántos pendientes tiene y cuántos cerró una persona en un proyecto. */
export interface ResumenPendientes {
  proyectoId: number;
  usuarioId: number;
  total: number;
  hechos: number;
}

/**
 * **PENDIENTES.** Una lista por persona y proyecto. El dueño la edita;
 * administración solo la ve. Nadie ve la de un compañero.
 */
@Injectable()
export class PendientesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * La lista de `usuarioId` en el proyecto (la propia si no se indica).
   * Primero lo que falta, en su orden; lo hecho al final.
   */
  async listar(
    proyectoId: number,
    actorId: number,
    usuarioId = actorId,
  ): Promise<Pendiente[]> {
    await this.verificarProyecto(proyectoId);
    if (!puedeLeer(usuarioId, actorId, await this.esAdministracion(actorId))) {
      throw new ForbiddenException(
        'Esa lista de pendientes es de otra persona',
      );
    }

    return this.prisma.pendiente.findMany({
      where: { proyectoId, usuarioId },
      orderBy: [{ hecho: 'asc' }, { orden: 'asc' }, { id: 'asc' }],
    });
  }

  async crear(
    proyectoId: number,
    actorId: number,
    dto: CrearPendienteDto,
  ): Promise<Pendiente> {
    const proyecto = await this.verificarProyecto(proyectoId);
    if (!estaAsignado(proyecto, actorId)) {
      throw new ForbiddenException(
        'Solo puedes anotar pendientes en proyectos donde estás asignado',
      );
    }

    const existentes = await this.prisma.pendiente.findMany({
      where: { proyectoId, usuarioId: actorId },
      select: { orden: true },
    });

    return this.prisma.pendiente.create({
      data: {
        proyectoId,
        usuarioId: actorId,
        texto: dto.texto.trim(),
        orden: ordenSiguiente(existentes.map((p) => p.orden)),
      },
    });
  }

  async actualizar(
    id: number,
    actorId: number,
    dto: ActualizarPendienteDto,
  ): Promise<Pendiente> {
    await this.propio(id, actorId);

    return this.prisma.pendiente.update({
      where: { id },
      data: {
        ...(dto.texto !== undefined && { texto: dto.texto.trim() }),
        ...(dto.hecho !== undefined && {
          hecho: dto.hecho,
          hechoAt: dto.hecho ? new Date() : null,
        }),
      },
    });
  }

  async borrar(id: number, actorId: number): Promise<void> {
    await this.propio(id, actorId);
    await this.prisma.pendiente.delete({ where: { id } });
  }

  /**
   * Los contadores para las tarjetas de los tableros: los propios, o los de
   * todos si quien pide es administración.
   */
  async resumen(actorId: number): Promise<ResumenPendientes[]> {
    const admin = await this.esAdministracion(actorId);
    const grupos = await this.prisma.pendiente.groupBy({
      by: ['proyectoId', 'usuarioId', 'hecho'],
      where: admin ? {} : { usuarioId: actorId },
      _count: { _all: true },
    });

    const porClave = new Map<string, ResumenPendientes>();
    for (const g of grupos) {
      const clave = `${g.proyectoId}:${g.usuarioId}`;
      const actual = porClave.get(clave) ?? {
        proyectoId: g.proyectoId,
        usuarioId: g.usuarioId,
        total: 0,
        hechos: 0,
      };
      actual.total += g._count._all;
      if (g.hecho) actual.hechos += g._count._all;
      porClave.set(clave, actual);
    }
    return [...porClave.values()];
  }

  // ---------------------------------------------------------------------------

  private async propio(id: number, actorId: number): Promise<void> {
    const pendiente = await this.prisma.pendiente.findUnique({
      where: { id },
      select: { usuarioId: true },
    });
    if (!pendiente) {
      throw new NotFoundException(`Pendiente con id ${id} no encontrado`);
    }
    if (pendiente.usuarioId !== actorId) {
      throw new ForbiddenException('Solo el dueño de la lista puede cambiarla');
    }
  }

  private async verificarProyecto(proyectoId: number) {
    const proyecto = await this.prisma.proyecto.findFirst({
      where: { id: proyectoId, deletedAt: null },
      select: {
        disenadorId: true,
        desarrolladorId: true,
        usuarios: { select: { usuarioId: true } },
      },
    });
    if (!proyecto) {
      throw new NotFoundException(
        `Proyecto con id ${proyectoId} no encontrado`,
      );
    }
    return {
      disenadorId: proyecto.disenadorId,
      desarrolladorId: proyecto.desarrolladorId,
      equipoIds: proyecto.usuarios.map((u) => u.usuarioId),
    };
  }

  private async esAdministracion(usuarioId: number): Promise<boolean> {
    const usuario = await this.prisma.user.findUnique({
      where: { id: usuarioId },
      select: { rol: { select: { name: true } } },
    });
    return (ROLES_ADMINISTRACION as readonly string[]).includes(
      usuario?.rol.name ?? '',
    );
  }
}
