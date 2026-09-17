/**
 * Quién entra y quién sale del equipo (`usuarios_proyectos`) cuando cambian
 * el diseñador o el desarrollador de un proyecto. La usan los dos caminos que
 * pueden cambiarlos (`PATCH /projects/:id` y `PATCH /:id/responsables`) para
 * que el equipo quede igual sin importar por dónde se guardó.
 */

export interface Responsables {
  readonly disenadorId: number | null;
  readonly desarrolladorId: number | null;
}

export interface CambioDeEquipo {
  /** Los responsables nuevos: se enganchan al equipo si no estaban. */
  readonly quedan: number[];
  /** Los responsables que dejan de serlo: se desenganchan del equipo. */
  readonly salen: number[];
  /** ¿Cambió alguno de los dos puestos? */
  readonly cambia: boolean;
}

const ids = (...valores: (number | null)[]): number[] => [
  ...new Set(valores.filter((v): v is number => typeof v === 'number')),
];

export function cambioDeEquipo(
  antes: Responsables,
  despues: Responsables,
): CambioDeEquipo {
  const quedan = ids(despues.disenadorId, despues.desarrolladorId);
  // Quien sigue en uno de los dos puestos no se saca, aunque haya dejado el
  // otro (la misma persona puede ocupar los dos).
  const salen = ids(antes.disenadorId, antes.desarrolladorId).filter(
    (id) => !quedan.includes(id),
  );

  return {
    quedan,
    salen,
    cambia:
      antes.disenadorId !== despues.disenadorId ||
      antes.desarrolladorId !== despues.desarrolladorId,
  };
}

/** El texto que queda en el historial. */
export function motivoDeResponsables(
  antes: Responsables,
  despues: Responsables,
): string {
  const v = (id: number | null) => (id === null ? '—' : String(id));
  return `Responsables: diseñador ${v(antes.disenadorId)} → ${v(despues.disenadorId)}, desarrollador ${v(antes.desarrolladorId)} → ${v(despues.desarrolladorId)}`;
}
