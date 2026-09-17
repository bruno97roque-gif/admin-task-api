import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import type { UsuarioSesion } from '../sesion.reglas';

interface RequestConUsuario extends Request {
  usuario?: UsuarioSesion;
}

/**
 * Devuelve el payload del token del usuario autenticado, o una de sus claves.
 * `SesionGuard` lo deja en `request.usuario` (en español, no `request.user`).
 *
 * Se usa para registrar quién movió cada proyecto en el historial de etapas.
 */
export const UsuarioActual = createParamDecorator(
  (clave: keyof UsuarioSesion | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<RequestConUsuario>();

    return clave ? request.usuario?.[clave] : request.usuario;
  },
);
