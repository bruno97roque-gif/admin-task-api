import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marca un handler (o un controller completo) como accesible sin token.
 * El resto de las rutas quedan protegidas por el SesionGuard global.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
