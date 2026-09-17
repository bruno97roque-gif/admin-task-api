import { SetMetadata } from '@nestjs/common';

export const PERMITIDO_CON_CAMBIO_PENDIENTE = 'permitidoConCambioPendiente';

/**
 * Rutas que se pueden usar aunque la persona todavía tenga que cambiar la
 * contraseña que le puso administración: ver su perfil y cambiarla. El resto
 * responde 403 hasta que la cambie.
 */
export const PermitidoConCambioPendiente = () =>
  SetMetadata(PERMITIDO_CON_CAMBIO_PENDIENTE, true);
