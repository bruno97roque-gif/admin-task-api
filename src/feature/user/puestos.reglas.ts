import { Puesto } from '../../lib/generated/prisma/client';

/**
 * **PUESTOS.** El rol decide permisos; el puesto decide en qué tablero y en
 * qué selector aparece una persona. Son cosas distintas a propósito: un
 * programador que también diseña mantiene sus permisos de programador y suma
 * el puesto de diseño.
 */

/** Los roles que trabajan en un puesto, cuando nadie se lo cargó a mano. */
const PUESTO_DEL_ROL: Record<string, Puesto[]> = {
  Diseñador: [Puesto.Diseno],
  Programador: [Puesto.Desarrollo],
  // El Supervisor tiene permisos de administración pero sigue desarrollando.
  Supervisor: [Puesto.Desarrollo],
};

/** Los puestos que implica un rol. Administración, por sí sola, no trabaja en ninguno. */
export function puestosDelRol(rol: string | null | undefined): Puesto[] {
  return PUESTO_DEL_ROL[rol ?? ''] ?? [];
}

/**
 * Los puestos de una persona: los que administración le cargó, y si no tiene
 * ninguno, los que implica su rol. Así, todo el equipo que ya existía sigue
 * apareciendo donde aparecía sin tocar una sola fila.
 */
export function puestosDe(
  rol: string | null | undefined,
  cargados: Puesto[] | null | undefined,
): Puesto[] {
  const propios = cargados ?? [];
  return propios.length > 0 ? ordenar(propios) : puestosDelRol(rol);
}

export function trabajaEn(
  puesto: Puesto,
  rol: string | null | undefined,
  cargados: Puesto[] | null | undefined,
): boolean {
  return puestosDe(rol, cargados).includes(puesto);
}

/** Sin repetidos y en el orden del recorrido: primero diseño, después desarrollo. */
export function ordenar(puestos: Puesto[]): Puesto[] {
  const unicos = new Set(puestos);
  return [Puesto.Diseno, Puesto.Desarrollo].filter((p) => unicos.has(p));
}
