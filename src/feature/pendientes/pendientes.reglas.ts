/**
 * Reglas de los pendientes, sin base. Se prueban en `pendientes.reglas.spec.ts`.
 */

export const MAXIMO_TEXTO_PENDIENTE = 500;

/** ¿La persona trabaja en el proyecto? Solo así puede tener pendientes en él. */
export function estaAsignado(
  proyecto: {
    disenadorId: number | null;
    desarrolladorId: number | null;
    equipoIds: readonly number[];
  },
  usuarioId: number,
): boolean {
  return (
    proyecto.disenadorId === usuarioId ||
    proyecto.desarrolladorId === usuarioId ||
    proyecto.equipoIds.includes(usuarioId)
  );
}

/**
 * Quién puede **leer** la lista de alguien: el dueño y administración.
 * Editarla, solo el dueño (administración mira, no toca).
 */
export function puedeLeer(
  duenioId: number,
  actorId: number,
  actorEsAdministracion: boolean,
): boolean {
  return duenioId === actorId || actorEsAdministracion;
}

/** El orden de un pendiente nuevo: al final de la lista. */
export function ordenSiguiente(ordenes: readonly number[]): number {
  return ordenes.length === 0 ? 0 : Math.max(...ordenes) + 1;
}
