import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../lib/prisma/prisma.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestConUsuario } from './jwt-auth.guard';

/**
 * Restringe una ruta a ciertos roles. Corre **después** de `JwtAuthGuard`, que
 * es quien deja el payload en `request.usuario`.
 *
 * El token solo trae `roleId`, así que el nombre del rol se resuelve contra la
 * base. Los roles cambian muy de vez en cuando, por eso se cachean en memoria:
 * sin eso cada request protegida sumaría una consulta.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly nombrePorId = new Map<number, string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permitidos = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin @Roles la ruta queda como estaba: cualquier usuario autenticado.
    if (!permitidos || permitidos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const roleId = request.usuario?.roleId;

    if (roleId === undefined) {
      throw new ForbiddenException('No se pudo determinar el rol del usuario');
    }

    const nombre = await this.nombreDelRol(roleId);

    if (nombre === null || !permitidos.includes(nombre)) {
      throw new ForbiddenException(
        `Esta acción es solo para: ${permitidos.join(', ')}`,
      );
    }

    return true;
  }

  private async nombreDelRol(roleId: number): Promise<string | null> {
    const cacheado = this.nombrePorId.get(roleId);

    if (cacheado !== undefined) {
      return cacheado;
    }

    const rol = await this.prisma.rol.findUnique({
      where: { id: roleId },
      select: { name: true },
    });

    if (!rol) {
      return null;
    }

    this.nombrePorId.set(roleId, rol.name);

    return rol.name;
  }
}
