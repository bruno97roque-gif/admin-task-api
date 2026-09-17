import type { PrismaService } from '../../lib/prisma/prisma.service';

/**
 * La contraseña vive en dos lados: `cuentas_acceso.password`, que es la que
 * usa better-auth para el login, y `users.password`, que se mantiene al día
 * como respaldo (la columna es obligatoria y la regla del equipo no deja
 * quitarla). Cualquier cambio de contraseña pasa por acá para que no se
 * desincronicen.
 */
export async function guardarContrasena(
  prisma: PrismaService,
  usuarioId: number,
  hash: string,
  /** `true` si la puso administración: la persona tendrá que cambiarla. */
  temporal: boolean,
): Promise<void> {
  const cuenta = { providerId: 'credential', accountId: String(usuarioId) };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: usuarioId },
      data: { password: hash, debeCambiarContrasena: temporal },
    }),
    prisma.account.upsert({
      where: { providerId_accountId: cuenta },
      create: { ...cuenta, userId: usuarioId, password: hash },
      update: { password: hash },
    }),
  ]);
}

/**
 * Cierra las sesiones abiertas de un usuario, menos `excepto` (la del pedido
 * actual, para no sacar a quien cambia su propia contraseña). Borrar la fila
 * alcanza: el guard ya no la encuentra en el siguiente pedido.
 */
export async function cerrarSesiones(
  prisma: PrismaService,
  usuarioId: number,
  excepto?: number,
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: {
      userId: usuarioId,
      ...(excepto !== undefined && { id: { not: excepto } }),
    },
  });
  return count;
}
