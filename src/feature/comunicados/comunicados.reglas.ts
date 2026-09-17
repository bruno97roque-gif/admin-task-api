/**
 * Reglas de los comunicados, sin base. Se prueban en
 * `comunicados.reglas.spec.ts`.
 */

export interface Vigencia {
  readonly desde: Date;
  readonly hasta: Date | null;
}

export type EstadoComunicado = 'programado' | 'vigente' | 'finalizado';

/** En qué momento de su vida está un comunicado. */
export function estadoDe(c: Vigencia, ahora: Date): EstadoComunicado {
  if (c.hasta !== null && c.hasta.getTime() <= ahora.getTime()) {
    return 'finalizado';
  }
  if (c.desde.getTime() > ahora.getTime()) return 'programado';
  return 'vigente';
}

/** El filtro de Prisma equivalente a «vigente ahora». */
export function filtroVigente(ahora: Date) {
  return {
    desde: { lte: ahora },
    OR: [{ hasta: null }, { hasta: { gt: ahora } }],
  };
}

/**
 * Qué está mal en un comunicado, o `null` si se puede guardar. Tiene que
 * mostrarse en algún lado y, si tiene fin, terminar después de empezar.
 */
export function problemaDe(c: {
  enLogin: boolean;
  enSistema: boolean;
  desde: Date;
  hasta: Date | null;
}): string | null {
  if (!c.enLogin && !c.enSistema) {
    return 'Elige dónde se muestra: en el login, dentro del sistema o en los dos';
  }
  if (c.hasta !== null && c.hasta.getTime() <= c.desde.getTime()) {
    return 'La fecha de fin tiene que ser posterior a la de inicio';
  }
  return null;
}

/** Los urgentes se muestran siempre: nadie los puede cerrar. */
export function sePuedeCerrar(nivel: string): boolean {
  return nivel !== 'Urgente';
}
