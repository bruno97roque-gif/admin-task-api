import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Roles que pueden entrar a la ruta, por **nombre** (`rols.name`), no por id:
 * los ids ya tienen huecos por borrados y difieren entre entornos.
 *
 * Sin este decorador la ruta queda abierta a cualquier usuario autenticado,
 * que es como venía funcionando toda la API.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Quién es «administración» en el diagrama: carga los proyectos y los
 * porcentajes de cada hito, persigue los recordatorios y archiva.
 */
export const ROLES_ADMINISTRACION = ['Admin', 'Owner'] as const;
