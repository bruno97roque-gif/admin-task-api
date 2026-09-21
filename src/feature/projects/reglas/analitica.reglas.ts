import { EstadoProyecto, Grupo } from '../../../lib/generated/prisma/client';
import {
  ORDEN_ETAPAS,
  esEstadoTerminal,
  esEtapaDeDiseno,
} from './flujo.reglas';

/**
 * **ANALÍTICA AVANZADA.** Lo que se calcula sobre el historial además de los
 * totales del mes: proyectos estancados, carga por responsable, tendencia de
 * las duraciones, cumplimiento de fechas objetivo, retrocesos de etapa y el
 * tiempo total hasta la entrega. Son funciones puras: el servicio junta los
 * datos y esto decide, así los números se pueden probar sin base.
 */

const DIA_MS = 24 * 60 * 60 * 1000;
/** Lima no tiene horario de verano: UTC−5 todo el año. */
const OFFSET_LIMA_MS = 5 * 60 * 60 * 1000;

/**
 * Los rangos de antigüedad de un proyecto parado en su etapa. Un proyecto
 * cuenta como **estancado** desde el último rango (15 días o más).
 */
export const RANGOS_ANTIGUEDAD = [
  { rango: '0–7', desde: 0, hasta: 7 },
  { rango: '8–14', desde: 8, hasta: 14 },
  { rango: '15+', desde: 15, hasta: null },
] as const;

export const DIAS_ESTANCADO = 15;

export interface ProyectoParaAnalitica {
  id: number;
  name: string;
  createdAt: Date;
  estadoProyecto: EstadoProyecto;
  grupo: Grupo;
  fechaUltimoCambioEstado: Date | null;
  fechaEntrega: Date | null;
  fechaEntregaDiseno: Date | null;
  disenadorId: number | null;
  disenadorNombre: string | null;
  desarrolladorId: number | null;
  desarrolladorNombre: string | null;
}

export interface FilaHistorial {
  proyectoId: number;
  estadoAnterior: EstadoProyecto | null;
  estadoNuevo: EstadoProyecto;
  createdAt: Date;
}

export interface ProyectoDuracion {
  proyectoId: number;
  nombre: string;
  dias: number;
}

export interface ProyectoEstancado {
  proyectoId: number;
  nombre: string;
  etapa: EstadoProyecto;
  grupo: Grupo;
  dias: number;
  /** Quién tiene la etapa; `null` es administración (registro, brief…). */
  responsableId: number | null;
  responsableNombre: string | null;
}

export interface CargaResponsable {
  usuarioId: number;
  nombre: string;
  rol: 'disenador' | 'desarrollador';
  /** Etapas cerradas: diseños finalizados o desarrollos finalizados. */
  cerrados: number;
  /** Promedio de días de las cerradas que se pudieron medir; `null` sin datos. */
  promedioDias: number | null;
  /** Proyectos que hoy están en su etapa. */
  activos: number;
  /** De esos, cuántos llevan 15 días o más sin moverse. */
  estancados: number;
}

export interface TendenciaMes {
  mes: string;
  /** Promedio de lo que cerró ese mes; `null` si no cerró nada medible. */
  promedioDiseno: number | null;
  promedioDesarrollo: number | null;
  promedioTotal: number | null;
}

export type ResultadoCumplimiento = 'aTiempo' | 'tarde' | 'vencido';

export interface CumplimientoProyecto {
  proyectoId: number;
  nombre: string;
  tipo: 'diseno' | 'entrega';
  fechaObjetivo: string;
  /** El día en que cerró (hora de Lima); `null` si todavía no cerró. */
  fechaReal: string | null;
  /** Positivo = días de atraso; negativo = días de adelanto. */
  diasDiferencia: number;
  resultado: ResultadoCumplimiento;
}

export interface ResumenCumplimiento {
  aTiempo: number;
  tarde: number;
  /** Sin cerrar y con la fecha objetivo ya pasada. */
  vencidos: number;
  /** Cerraron sin tener fecha objetivo cargada. */
  sinFecha: number;
}

export interface Retroceso {
  proyectoId: number;
  nombre: string;
  desde: EstadoProyecto;
  hacia: EstadoProyecto;
  fecha: Date;
}

export interface AnaliticaAvanzada {
  estancados: {
    rangos: {
      rango: string;
      desde: number;
      hasta: number | null;
      cantidad: number;
    }[];
    proyectos: ProyectoEstancado[];
  };
  porResponsable: CargaResponsable[];
  tendencia: TendenciaMes[];
  cumplimiento: {
    diseno: ResumenCumplimiento;
    entrega: ResumenCumplimiento;
    proyectos: CumplimientoProyecto[];
  };
  retrocesos: {
    porMes: { mes: string; cantidad: number }[];
    proyectos: Retroceso[];
  };
  tiempoTotal: {
    promedioDias: number;
    cantidadProyectos: number;
    proyectos: ProyectoDuracion[];
  };
}

// ---------------------------------------------------------------------------
// Piezas sueltas
// ---------------------------------------------------------------------------

export const mesDe = (fecha: Date) => fecha.toISOString().slice(0, 7);

export const diasEntre = (desde: Date, hasta: Date) =>
  Math.round((hasta.getTime() - desde.getTime()) / DIA_MS);

/** El día calendario en Lima de un instante (`2026-09-21`). */
export const diaEnLima = (fecha: Date) =>
  new Date(fecha.getTime() - OFFSET_LIMA_MS).toISOString().slice(0, 10);

/**
 * Las fechas objetivo son de calendario (se guardan a medianoche UTC), así
 * que se toma su día tal cual, sin pasarlas a hora de Lima.
 */
export const diaObjetivo = (fecha: Date) => fecha.toISOString().slice(0, 10);

const diasEntreDias = (desde: string, hasta: string) =>
  Math.round((Date.parse(hasta) - Date.parse(desde)) / DIA_MS);

/** Promedio con un decimal; `0` si no hay nada que promediar. */
export function promedio(valores: number[]): number {
  if (valores.length === 0) return 0;
  const suma = valores.reduce((a, b) => a + b, 0);
  return Math.round((suma / valores.length) * 10) / 10;
}

/** En qué rango de antigüedad cae un proyecto parado hace `dias`. */
export function rangoDeAntiguedad(dias: number): string {
  const rango = RANGOS_ANTIGUEDAD.find(
    (r) => dias >= r.desde && (r.hasta === null || dias <= r.hasta),
  );
  return (rango ?? RANGOS_ANTIGUEDAD[0]).rango;
}

/**
 * Volver a una etapa anterior del recorrido (p. ej. de `Desarrollo` a
 * `Diseno`). Archivar y reactivar no cuentan: `Archivado` no está en el orden.
 */
export function esRetroceso(
  anterior: EstadoProyecto | null,
  nuevo: EstadoProyecto,
): boolean {
  if (anterior === null) return false;
  const desde = ORDEN_ETAPAS.indexOf(anterior);
  const hacia = ORDEN_ETAPAS.indexOf(nuevo);
  return desde !== -1 && hacia !== -1 && hacia < desde;
}

/** A quién le toca la etapa actual: diseñador, desarrollador o nadie. */
export function responsableDeEtapa(p: ProyectoParaAnalitica): {
  id: number | null;
  nombre: string | null;
  rol: CargaResponsable['rol'] | null;
} {
  if (esEtapaDeDiseno(p.estadoProyecto)) {
    return { id: p.disenadorId, nombre: p.disenadorNombre, rol: 'disenador' };
  }
  if (
    p.estadoProyecto === EstadoProyecto.Desarrollo ||
    p.estadoProyecto === EstadoProyecto.DesarrolloFinalizado
  ) {
    return {
      id: p.desarrolladorId,
      nombre: p.desarrolladorNombre,
      rol: 'desarrollador',
    };
  }
  return { id: null, nombre: null, rol: null };
}

/** Compara el cierre real contra la fecha objetivo, por día calendario. */
export function cumplimiento(
  objetivo: Date,
  real: Date | null,
  ahora: Date,
): { resultado: ResultadoCumplimiento; diasDiferencia: number } | null {
  const diaMeta = diaObjetivo(objetivo);
  if (real) {
    const diferencia = diasEntreDias(diaMeta, diaEnLima(real));
    return {
      resultado: diferencia <= 0 ? 'aTiempo' : 'tarde',
      diasDiferencia: diferencia,
    };
  }
  const atraso = diasEntreDias(diaMeta, diaEnLima(ahora));
  // Sin cerrar y con la fecha todavía por delante no se mide nada.
  return atraso > 0 ? { resultado: 'vencido', diasDiferencia: atraso } : null;
}

// ---------------------------------------------------------------------------
// El cálculo completo
// ---------------------------------------------------------------------------

export function calcularAnaliticaAvanzada(
  proyectos: ProyectoParaAnalitica[],
  historial: FilaHistorial[],
  ahora: Date,
): AnaliticaAvanzada {
  // Historial ordenado por fecha: la primera fila de (proyecto, estado) es la
  // primera vez que llegó ahí, como en el resto de la analítica.
  const filas = [...historial].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const primera = new Map<string, Date>();
  const ultimoCambio = new Map<number, Date>();
  for (const f of filas) {
    const clave = `${f.proyectoId}:${f.estadoNuevo}`;
    if (!primera.has(clave)) primera.set(clave, f.createdAt);
    if (f.estadoAnterior !== f.estadoNuevo) {
      ultimoCambio.set(f.proyectoId, f.createdAt);
    }
  }
  const llego = (id: number, estado: EstadoProyecto) =>
    primera.get(`${id}:${estado}`);

  const porId = new Map(proyectos.map((p) => [p.id, p]));

  // --- Estancados -----------------------------------------------------------
  const estancados: ProyectoEstancado[] = [];
  for (const p of proyectos) {
    if (esEstadoTerminal(p.estadoProyecto)) continue;
    const desde =
      p.fechaUltimoCambioEstado ?? ultimoCambio.get(p.id) ?? p.createdAt;
    const responsable = responsableDeEtapa(p);
    estancados.push({
      proyectoId: p.id,
      nombre: p.name,
      etapa: p.estadoProyecto,
      grupo: p.grupo,
      dias: Math.max(0, diasEntre(desde, ahora)),
      responsableId: responsable.id,
      responsableNombre: responsable.nombre,
    });
  }
  estancados.sort((a, b) => b.dias - a.dias);

  const rangos = RANGOS_ANTIGUEDAD.map((r) => ({
    rango: r.rango,
    desde: r.desde,
    hasta: r.hasta,
    cantidad: estancados.filter((e) => rangoDeAntiguedad(e.dias) === r.rango)
      .length,
  }));

  // --- Duraciones por proyecto (diseño, desarrollo y total) ----------------
  interface Cierre {
    proyecto: ProyectoParaAnalitica;
    fecha: Date;
    dias: number | null;
  }
  const cierresDiseno: Cierre[] = [];
  const cierresDesarrollo: Cierre[] = [];
  const entregas: Cierre[] = [];

  for (const p of proyectos) {
    const disenoFin = llego(p.id, EstadoProyecto.DisenoFinalizado);
    if (disenoFin) {
      const inicio = llego(p.id, EstadoProyecto.Diseno);
      cierresDiseno.push({
        proyecto: p,
        fecha: disenoFin,
        dias: inicio ? diasEntre(inicio, disenoFin) : null,
      });
    }
    const desarrolloFin = llego(p.id, EstadoProyecto.DesarrolloFinalizado);
    if (desarrolloFin) {
      const inicio = llego(p.id, EstadoProyecto.Desarrollo);
      cierresDesarrollo.push({
        proyecto: p,
        fecha: desarrolloFin,
        dias: inicio ? diasEntre(inicio, desarrolloFin) : null,
      });
    }
    const entrega = llego(p.id, EstadoProyecto.ProyectoFinalizado);
    if (entrega) {
      entregas.push({
        proyecto: p,
        fecha: entrega,
        dias: Math.max(0, diasEntre(p.createdAt, entrega)),
      });
    }
  }

  const medidos = (cierres: Cierre[]) =>
    cierres.filter((c) => c.dias !== null).map((c) => c.dias as number);

  // --- Carga por responsable -----------------------------------------------
  const carga = new Map<string, CargaResponsable>();
  const fichaDe = (
    id: number,
    nombre: string,
    rol: CargaResponsable['rol'],
  ) => {
    const clave = `${rol}:${id}`;
    const actual = carga.get(clave) ?? {
      usuarioId: id,
      nombre,
      rol,
      cerrados: 0,
      promedioDias: null,
      activos: 0,
      estancados: 0,
    };
    carga.set(clave, actual);
    return actual;
  };

  const diasPorPersona = new Map<string, number[]>();
  const sumarCierre = (
    id: number | null,
    nombre: string | null,
    rol: CargaResponsable['rol'],
    dias: number | null,
  ) => {
    if (id === null || !nombre) return;
    fichaDe(id, nombre, rol).cerrados += 1;
    if (dias !== null) {
      const clave = `${rol}:${id}`;
      diasPorPersona.set(clave, [...(diasPorPersona.get(clave) ?? []), dias]);
    }
  };
  for (const c of cierresDiseno) {
    sumarCierre(
      c.proyecto.disenadorId,
      c.proyecto.disenadorNombre,
      'disenador',
      c.dias,
    );
  }
  for (const c of cierresDesarrollo) {
    sumarCierre(
      c.proyecto.desarrolladorId,
      c.proyecto.desarrolladorNombre,
      'desarrollador',
      c.dias,
    );
  }
  for (const e of estancados) {
    const p = porId.get(e.proyectoId);
    if (!p) continue;
    const responsable = responsableDeEtapa(p);
    if (responsable.id === null || !responsable.nombre || !responsable.rol) {
      continue;
    }
    const ficha = fichaDe(responsable.id, responsable.nombre, responsable.rol);
    ficha.activos += 1;
    if (e.dias >= DIAS_ESTANCADO) ficha.estancados += 1;
  }
  for (const [clave, dias] of diasPorPersona) {
    const ficha = carga.get(clave);
    if (ficha) ficha.promedioDias = promedio(dias);
  }

  // --- Tendencia mensual de las duraciones ----------------------------------
  const tendencia = new Map<
    string,
    { diseno: number[]; desarrollo: number[]; total: number[] }
  >();
  const enMes = (fecha: Date) => {
    const mes = mesDe(fecha);
    const actual = tendencia.get(mes) ?? {
      diseno: [],
      desarrollo: [],
      total: [],
    };
    tendencia.set(mes, actual);
    return actual;
  };
  for (const c of cierresDiseno) {
    if (c.dias !== null) enMes(c.fecha).diseno.push(c.dias);
  }
  for (const c of cierresDesarrollo) {
    if (c.dias !== null) enMes(c.fecha).desarrollo.push(c.dias);
  }
  for (const c of entregas) {
    if (c.dias !== null) enMes(c.fecha).total.push(c.dias);
  }
  const promedioONada = (valores: number[]) =>
    valores.length === 0 ? null : promedio(valores);

  // --- Cumplimiento de fechas objetivo --------------------------------------
  const resumenVacio = (): ResumenCumplimiento => ({
    aTiempo: 0,
    tarde: 0,
    vencidos: 0,
    sinFecha: 0,
  });
  const resumenDiseno = resumenVacio();
  const resumenEntrega = resumenVacio();
  const detalleCumplimiento: CumplimientoProyecto[] = [];

  const medir = (
    p: ProyectoParaAnalitica,
    tipo: CumplimientoProyecto['tipo'],
    objetivo: Date | null,
    real: Date | undefined,
    resumen: ResumenCumplimiento,
  ) => {
    if (!objetivo) {
      if (real) resumen.sinFecha += 1;
      return;
    }
    // Un proyecto archivado sin cerrar la etapa ya no se persigue.
    if (!real && esEstadoTerminal(p.estadoProyecto)) return;
    const r = cumplimiento(objetivo, real ?? null, ahora);
    if (!r) return;
    if (r.resultado === 'aTiempo') resumen.aTiempo += 1;
    else if (r.resultado === 'tarde') resumen.tarde += 1;
    else resumen.vencidos += 1;
    detalleCumplimiento.push({
      proyectoId: p.id,
      nombre: p.name,
      tipo,
      fechaObjetivo: diaObjetivo(objetivo),
      fechaReal: real ? diaEnLima(real) : null,
      diasDiferencia: r.diasDiferencia,
      resultado: r.resultado,
    });
  };
  for (const p of proyectos) {
    medir(
      p,
      'diseno',
      p.fechaEntregaDiseno,
      llego(p.id, EstadoProyecto.DisenoFinalizado),
      resumenDiseno,
    );
    medir(
      p,
      'entrega',
      p.fechaEntrega,
      llego(p.id, EstadoProyecto.DesarrolloFinalizado),
      resumenEntrega,
    );
  }
  detalleCumplimiento.sort((a, b) => b.diasDiferencia - a.diasDiferencia);

  // --- Retrocesos -----------------------------------------------------------
  const retrocesos: Retroceso[] = [];
  const retrocesosPorMes = new Map<string, number>();
  for (const f of filas) {
    if (!esRetroceso(f.estadoAnterior, f.estadoNuevo)) continue;
    const p = porId.get(f.proyectoId);
    if (!p || f.estadoAnterior === null) continue;
    retrocesos.push({
      proyectoId: p.id,
      nombre: p.name,
      desde: f.estadoAnterior,
      hacia: f.estadoNuevo,
      fecha: f.createdAt,
    });
    const mes = mesDe(f.createdAt);
    retrocesosPorMes.set(mes, (retrocesosPorMes.get(mes) ?? 0) + 1);
  }
  retrocesos.reverse();

  return {
    estancados: { rangos, proyectos: estancados },
    porResponsable: [...carga.values()].sort(
      (a, b) =>
        a.rol.localeCompare(b.rol) ||
        b.cerrados - a.cerrados ||
        a.nombre.localeCompare(b.nombre),
    ),
    tendencia: [...tendencia.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes,
        promedioDiseno: promedioONada(v.diseno),
        promedioDesarrollo: promedioONada(v.desarrollo),
        promedioTotal: promedioONada(v.total),
      })),
    cumplimiento: {
      diseno: resumenDiseno,
      entrega: resumenEntrega,
      proyectos: detalleCumplimiento,
    },
    retrocesos: {
      porMes: [...retrocesosPorMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, cantidad]) => ({ mes, cantidad })),
      proyectos: retrocesos,
    },
    tiempoTotal: {
      promedioDias: promedio(medidos(entregas)),
      cantidadProyectos: entregas.length,
      proyectos: entregas.map((c) => ({
        proyectoId: c.proyecto.id,
        nombre: c.proyecto.name,
        dias: c.dias ?? 0,
      })),
    },
  };
}
