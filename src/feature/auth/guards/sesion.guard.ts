import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AUTH, type Auth } from '../better-auth';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { UsuarioSesion } from '../sesion.reglas';

export interface RequestConUsuario extends Request {
  usuario?: UsuarioSesion;
}

/** Los encabezados de Express como `Headers` de la plataforma web. */
function aHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [clave, valor] of Object.entries(req.headers)) {
    if (valor === undefined) continue;
    if (Array.isArray(valor)) {
      for (const v of valor) headers.append(clave, v);
    } else {
      headers.set(clave, valor);
    }
  }
  return headers;
}

/**
 * **GUARD GLOBAL.** Cada pedido tiene que traer la cookie de una sesión
 * vigente de better-auth (salvo las rutas `@Public()`). La sesión se busca en
 * la base en cada pedido: cerrarla o desactivar al usuario corta el acceso en
 * el acto, cosa que el JWT de antes no podía.
 *
 * Deja en `request.usuario` lo mismo que dejaba el JWT (`sub`, `user`,
 * `roleId`), más el id de la sesión.
 */
@Injectable()
export class SesionGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublica = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublica) return true;

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    const sesion = await this.auth.api.getSession({
      headers: aHeaders(request),
    });

    if (!sesion) {
      throw new UnauthorizedException(
        'Tu sesión venció. Vuelve a iniciar sesión.',
      );
    }
    if (sesion.user.active === false) {
      throw new UnauthorizedException('El usuario está desactivado');
    }

    request.usuario = {
      sub: Number(sesion.user.id),
      user: sesion.user.username ?? '',
      roleId: Number(sesion.user.roleId),
      sesionId: Number(sesion.session.id),
    };
    return true;
  }
}
