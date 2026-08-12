import {
  EstadoProyecto,
  Grupo,
  HitoCobro,
  TipoProyecto,
  TipoRecordatorio,
} from '../../../lib/generated/prisma/client';

/**
 * Reglas de negocio del flujo de proyectos, como funciones puras y sin acceso
 * a la base. El servicio las usa para decidir; acá no se consulta ni se guarda
 * nada, de modo que las reglas se puedan leer (y cambiar) en un solo lugar.
 *
 * Fuente: «Flujo de trabajo (mejorado).drawio», confirmado con el equipo.
 */

/** Los tres momentos de cobro, en el orden en que se cobran. */
export const HITOS_COBRO = [
  HitoCobro.AbonoInicial,
  HitoCobro.AprobacionDiseno,
  HitoCobro.Entrega,
] as const;

/** Los porcentajes de los tres hitos deben sumar exactamente esto. */
export const TOTAL_PORCENTAJE = 100;

/**
 * El abono inicial es el piso del plan de cobros. Por debajo del 30% hace
 * falta aprobación de la jefatura del área: no es un campo libre.
 */
export const MINIMO_ABONO_INICIAL = 30;

/** Incluidas en el precio: 1 avance + 2 rondas de cambios + entrega final. */
export const RONDAS_CAMBIOS_INCLUIDAS = 2;

/** Un proyecto sin respuesta del cliente se archiva a los 3 meses. */
export const DIAS_PARA_ARCHIVAR = 90;

/** Reactivación: 25% si vuelve antes del año. */
export const REACTIVACION_DENTRO_DEL_ANIO = 25;

/** Si llega al año o lo pasa, 50% sí o sí: se rehacen inicio y diseño. */
export const REACTIVACION_PASADO_EL_ANIO = 50;

const DIAS_DEL_ANIO = 365;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Etapas en las que el proyecto ya está cerrado, para bien o para mal. */
const ESTADOS_TERMINALES: EstadoProyecto[] = [
  EstadoProyecto.ProyectoFinalizado,
  EstadoProyecto.Archivado,
];

export function esEstadoTerminal(estado: EstadoProyecto): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

// ---------------------------------------------------------------------------
// Plan de cobros
// ---------------------------------------------------------------------------

export interface ItemPlanCobros {
  hito: HitoCobro;
  porcentaje: number;
}

/**
 * Valida el plan de cobros de un proyecto. Devuelve el motivo del rechazo, o
 * `null` si el plan es válido.
 *
 * `aprobadoPorJefatura` es la única forma de bajar el abono inicial del 30%.
 */
export function validarPlanDeCobros(
  plan: ItemPlanCobros[],
  aprobadoPorJefatura = false,
): string | null {
  const hitos = plan.map((item) => item.hito);
  const faltantes = HITOS_COBRO.filter((hito) => !hitos.includes(hito));

  if (faltantes.length > 0) {
    return `Faltan los hitos ${faltantes.join(', ')}: el plan de cobros debe incluir los tres`;
  }

  if (new Set(hitos).size !== hitos.length) {
    return 'El plan de cobros no puede repetir un hito';
  }

  const total = plan.reduce((suma, item) => suma + item.porcentaje, 0);

  if (total !== TOTAL_PORCENTAJE) {
    return `Los porcentajes suman ${total} y deben sumar exactamente ${TOTAL_PORCENTAJE}`;
  }

  const abonoInicial = plan.find(
    (item) => item.hito === HitoCobro.AbonoInicial,
  )!;

  if (abonoInicial.porcentaje < MINIMO_ABONO_INICIAL && !aprobadoPorJefatura) {
    return `El abono inicial no puede ser menor al ${MINIMO_ABONO_INICIAL}%: por debajo requiere aprobación de la jefatura del área`;
  }

  return null;
}

/**
 * Hito que tiene que estar cobrado para *entrar* a cada etapa. Las tres
 * compuertas de cobro del diagrama, y nada más: el resto de las etapas no
 * dependen de un pago.
 */
export function hitoQueHabilita(estado: EstadoProyecto): HitoCobro | null {
  switch (estado) {
    // El proyecto entra al flujo con su abono inicial cobrado.
    case EstadoProyecto.Brief:
      return HitoCobro.AbonoInicial;
    // Se cobra al aprobar el diseño, antes de pasar a desarrollo. La compuerta
    // queda en `Desarrollo` y no en las etapas de diseño a propósito: el
    // recorrido de diseño (avance, rondas de cambios, cierre) va incluido en el
    // abono inicial y no se corta a mitad de camino por el cobro siguiente.
    case EstadoProyecto.Desarrollo:
      return HitoCobro.AprobacionDiseno;
    // Se cobra al terminar el desarrollo, antes de subir a producción.
    case EstadoProyecto.ProyectoFinalizado:
      return HitoCobro.Entrega;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Tipo de proyecto: las dos bifurcaciones del diagrama
// ---------------------------------------------------------------------------

/**
 * La taxonomía (categorías, productos, variantes) es solo de e-commerce: la
 * web informativa va del brief directo a pedir el material de marca.
 *
 * Un proyecto sin tipo cargado (los que venían de antes) no se fuerza a
 * ninguna de las dos ramas: se le permiten las dos.
 */
export function requiereTaxonomia(tipo: TipoProyecto | null): boolean {
  return tipo === TipoProyecto.Ecommerce;
}

/** El catálogo y la carga de productos también son solo de e-commerce. */
export function aplicaCargaDeProductos(tipo: TipoProyecto | null): boolean {
  return tipo === TipoProyecto.Ecommerce;
}

// ---------------------------------------------------------------------------
// Grupo de seguimiento
// ---------------------------------------------------------------------------

export interface EntradaDerivarGrupo {
  estadoProyecto: EstadoProyecto;
  materialMarcaRecibido: boolean;
  catalogoRecibido: boolean;
  /** Hay un hito de cobro vencido para la etapa en la que está el proyecto. */
  cobroPendiente: boolean;
  /** Falta contratar el hosting y el proyecto ya llegó a esa altura del flujo. */
  hostingPendiente: boolean;
}

/**
 * El grupo no se elige a mano: se desprende de la etapa y del bloqueo.
 *
 * - Falta el pago (con o sin información pendiente) → **C**, el pago manda.
 * - Falta contratar el hosting → **C**: la leyenda del diagrama mete la
 *   contratación del hosting dentro del Grupo C junto con los pagos.
 * - Falta el material de marca → **B**.
 * - Lo único que falta es el catálogo de productos → sigue en **A**, porque el
 *   desarrollo no se detiene y el catálogo se persigue aparte.
 */
export function derivarGrupo(entrada: EntradaDerivarGrupo): Grupo {
  if (entrada.cobroPendiente || entrada.hostingPendiente) {
    return Grupo.C;
  }

  if (!entrada.materialMarcaRecibido) {
    return Grupo.B;
  }

  return Grupo.A;
}

// ---------------------------------------------------------------------------
// Máquina de estados
// ---------------------------------------------------------------------------

/** Las etapas en el orden del diagrama. `Archivado` queda fuera: es lateral. */
export const ORDEN_ETAPAS: EstadoProyecto[] = [
  EstadoProyecto.Registro,
  EstadoProyecto.Brief,
  EstadoProyecto.Taxonomia,
  EstadoProyecto.Diseno,
  EstadoProyecto.AvanceDiseno,
  EstadoProyecto.DisenoFinalizado,
  EstadoProyecto.Desarrollo,
  EstadoProyecto.ProyectoFinalizado,
];

/**
 * El tramo de diseño, que el diagrama recorre en tres pasos: `Diseno` es el
 * trabajo en curso, `AvanceDiseno` el avance que se le presenta al cliente
 * (el que está incluido en el precio, antes de las 2 rondas de cambios) y
 * `DisenoFinalizado` el diseño cerrado.
 *
 * Las tres comparten responsable (el diseñador) y la misma compuerta de
 * entrada (el material de marca), así que conviene tratarlas como un bloque en
 * vez de repetir los tres valores en cada `switch`.
 */
export const ETAPAS_DISENO: EstadoProyecto[] = [
  EstadoProyecto.Diseno,
  EstadoProyecto.AvanceDiseno,
  EstadoProyecto.DisenoFinalizado,
];

export function esEtapaDeDiseno(estado: EstadoProyecto): boolean {
  return ETAPAS_DISENO.includes(estado);
}

/**
 * Valida el movimiento entre etapas. Devuelve el motivo del rechazo o `null`.
 *
 * Se permite: quedarse en la misma etapa, avanzar a la siguiente, **retroceder**
 * (el diagrama tiene varios «volver a presentar») y archivar desde cualquier
 * etapa no terminal. No se permite saltear etapas hacia adelante, que es como
 * hoy se puede ir de `Registro` a `ProyectoFinalizado` de una sola llamada.
 *
 * `Archivado` solo se sale por `reactivar()`, nunca por un `PATCH`.
 */
export function transicionInvalida(
  desde: EstadoProyecto,
  hacia: EstadoProyecto,
  tipo: TipoProyecto | null,
): string | null {
  if (desde === hacia) {
    return null;
  }

  if (desde === EstadoProyecto.Archivado) {
    return 'El proyecto está archivado: se reactiva con POST /projects/:id/reactivar, no cambiando la etapa a mano';
  }

  if (hacia === EstadoProyecto.Archivado) {
    return 'Para archivar usá POST /projects/:id/archivar, que además deja el motivo en el historial';
  }

  // Una web informativa no pasa por taxonomía; una e-commerce no la saltea.
  if (hacia === EstadoProyecto.Taxonomia && tipo === TipoProyecto.Informativa) {
    return 'Una web informativa no pasa por taxonomía: va del brief al material de marca';
  }

  if (
    hacia === EstadoProyecto.Diseno &&
    desde === EstadoProyecto.Brief &&
    requiereTaxonomia(tipo)
  ) {
    return 'Un e-commerce tiene que definir la taxonomía antes del diseño';
  }

  const iDesde = ORDEN_ETAPAS.indexOf(desde);
  const iHacia = ORDEN_ETAPAS.indexOf(hacia);

  if (iDesde === -1 || iHacia === -1) {
    return `Transición no contemplada: ${desde} → ${hacia}`;
  }

  // Retroceder está permitido (los ciclos de «volver a presentar»).
  if (iHacia < iDesde) {
    return null;
  }

  // Hacia adelante, de a una etapa. La taxonomía es el único salto legítimo,
  // y solo cuando el proyecto no es e-commerce.
  const salto = iHacia - iDesde;

  if (salto === 1) {
    return null;
  }

  if (
    salto === 2 &&
    desde === EstadoProyecto.Brief &&
    hacia === EstadoProyecto.Diseno &&
    !requiereTaxonomia(tipo)
  ) {
    return null;
  }

  return `No se puede saltar de ${desde} a ${hacia}: hay que pasar por ${ORDEN_ETAPAS[iDesde + 1]}`;
}

// ---------------------------------------------------------------------------
// Compuertas (los ciclos de reintento ⟳ del diagrama)
// ---------------------------------------------------------------------------

export interface EntradaCompuertas {
  estadoDestino: EstadoProyecto;
  tipoProyecto: TipoProyecto | null;
  materialMarcaRecibido: boolean;
  hostingContratado: boolean;
  subidoProduccionAt: Date | null;
  capacitacionAt: Date | null;
  cobros: { hito: HitoCobro; cobrado: boolean }[];
}

/**
 * Todo lo que impide *entrar* a una etapa, en un solo lugar: el cobro del hito
 * que la habilita, el material de marca antes del diseño y —antes de dar el
 * proyecto por entregado— el hosting, la subida a producción y la capacitación.
 *
 * Devuelve la lista de motivos; vacía significa que puede avanzar.
 *
 * **Solo se aplica a proyectos con plan de cobros cargado** (ver
 * `estaEnFlujoNuevo`). Los proyectos que venían de antes tienen todos estos
 * campos en `false` porque las columnas se crearon con ese default: si las
 * compuertas los alcanzaran, se trabarían todos de golpe.
 */
export function compuertasFaltantes(entrada: EntradaCompuertas): string[] {
  const motivos: string[] = [];

  if (!estaEnFlujoNuevo(entrada.cobros)) {
    return motivos;
  }

  const hito = hitoQueHabilita(entrada.estadoDestino);

  if (hito !== null) {
    const cobro = entrada.cobros.find((item) => item.hito === hito);

    if (cobro && !cobro.cobrado) {
      motivos.push(`el hito ${hito} todavía no está cobrado`);
    }
  }

  // Rige para las tres etapas de diseño, no solo la primera: sin el material
  // no se entra al tramo, ni siquiera retrocediendo desde `Desarrollo`.
  if (
    esEtapaDeDiseno(entrada.estadoDestino) &&
    !entrada.materialMarcaRecibido
  ) {
    motivos.push(
      'falta el material de marca (logo, fotos de banners y secciones)',
    );
  }

  if (entrada.estadoDestino === EstadoProyecto.ProyectoFinalizado) {
    if (!entrada.hostingContratado) {
      motivos.push('el cliente todavía no contrató el hosting');
    }

    if (entrada.subidoProduccionAt === null) {
      motivos.push('la web todavía no se subió a producción');
    }

    if (entrada.capacitacionAt === null) {
      motivos.push('falta la capacitación al cliente');
    }
  }

  return motivos;
}

/**
 * Un proyecto «entró al flujo nuevo» cuando tiene plan de cobros cargado. Es
 * el mismo criterio que ya usaban las compuertas de cobro, extendido al resto:
 * es lo único que distingue a los proyectos migrados de los que se dieron de
 * alta siguiendo el diagrama.
 */
export function estaEnFlujoNuevo(cobros: { hito: HitoCobro }[]): boolean {
  return cobros.length > 0;
}

/**
 * El hosting recién se persigue en el tramo final: antes de eso que no esté
 * contratado no ensucia el grupo.
 */
export function hostingEsExigible(estado: EstadoProyecto): boolean {
  return estado === EstadoProyecto.Desarrollo;
}

// ---------------------------------------------------------------------------
// Recordatorios
// ---------------------------------------------------------------------------

/**
 * Qué recordatorio corresponde abrir según lo que esté trabando al proyecto,
 * o `null` si no hay nada pendiente del cliente. El orden respeta la prioridad
 * del diagrama: primero el pago, después el material, después el catálogo.
 *
 * El recordatorio de cobro sale de la etapa **siguiente**, así que con el
 * tramo de diseño partido en tres el de `AprobacionDiseno` se abre recién en
 * `DisenoFinalizado`, que es cuando el cobro pasa a ser lo único que falta.
 * Durante `Diseno` y `AvanceDiseno` todavía hay trabajo del diseñador en curso:
 * perseguir ese pago ahí sería adelantado.
 */
export function recordatorioQueCorresponde(entrada: {
  estadoProyecto: EstadoProyecto;
  tipoProyecto: TipoProyecto | null;
  materialMarcaRecibido: boolean;
  catalogoRecibido: boolean;
  hostingContratado: boolean;
  cobros: { hito: HitoCobro; cobrado: boolean }[];
}): TipoRecordatorio | null {
  const hito = hitoQueHabilita(
    siguienteEtapa(entrada.estadoProyecto) ?? entrada.estadoProyecto,
  );

  if (hito !== null && entrada.cobros.length > 0) {
    const cobro = entrada.cobros.find((item) => item.hito === hito);

    if (cobro && !cobro.cobrado) {
      return hito === HitoCobro.AprobacionDiseno
        ? TipoRecordatorio.CobroAprobacionDiseno
        : hito === HitoCobro.Entrega
          ? TipoRecordatorio.CobroEntrega
          : null;
    }
  }

  if (hostingEsExigible(entrada.estadoProyecto) && !entrada.hostingContratado) {
    return TipoRecordatorio.Hosting;
  }

  if (!entrada.materialMarcaRecibido) {
    return TipoRecordatorio.MaterialMarca;
  }

  if (
    aplicaCargaDeProductos(entrada.tipoProyecto) &&
    !entrada.catalogoRecibido
  ) {
    return TipoRecordatorio.Catalogo;
  }

  return null;
}

/** La etapa que sigue en el diagrama, o `null` si ya está al final. */
export function siguienteEtapa(estado: EstadoProyecto): EstadoProyecto | null {
  const i = ORDEN_ETAPAS.indexOf(estado);

  if (i === -1 || i === ORDEN_ETAPAS.length - 1) {
    return null;
  }

  return ORDEN_ETAPAS[i + 1];
}

// ---------------------------------------------------------------------------
// Responsable
// ---------------------------------------------------------------------------

export type Responsable = 'administracion' | 'disenador' | 'desarrollador';

/**
 * El responsable no se elige a mano, se desprende de la etapa (leyenda del
 * diagrama). Un proyecto en Grupo B o C vuelve a administración sin importar
 * en qué etapa esté, porque lo que falta es del cliente.
 */
export function responsableDe(
  estado: EstadoProyecto,
  grupo: Grupo,
): Responsable {
  if (grupo === Grupo.B || grupo === Grupo.C) {
    return 'administracion';
  }

  if (esEtapaDeDiseno(estado)) {
    return 'disenador';
  }

  return estado === EstadoProyecto.Desarrollo
    ? 'desarrollador'
    : 'administracion';
}

// ---------------------------------------------------------------------------
// Archivado y reactivación
// ---------------------------------------------------------------------------

export function diasTranscurridos(desde: Date, ahora = new Date()): number {
  return Math.floor((ahora.getTime() - desde.getTime()) / MS_POR_DIA);
}

/**
 * Un proyecto trabado se archiva a los 3 meses. El contador arranca en el
 * último cambio de estado: cualquier movimiento lo reinicia a cero.
 */
export function debeArchivarse(
  fechaUltimoCambioEstado: Date | null,
  estadoProyecto: EstadoProyecto,
  ahora = new Date(),
): boolean {
  if (fechaUltimoCambioEstado === null || esEstadoTerminal(estadoProyecto)) {
    return false;
  }

  return (
    diasTranscurridos(fechaUltimoCambioEstado, ahora) >= DIAS_PARA_ARCHIVAR
  );
}

/**
 * Lo abonado se pierde al archivar, salvo que el proyecto ya esté en
 * desarrollo: ahí ya están cobrados el abono inicial y la aprobación de
 * diseño, y se conserva. No existe crédito a favor.
 */
export function conservaLoAbonado(estadoAlArchivar: EstadoProyecto): boolean {
  return (
    estadoAlArchivar === EstadoProyecto.Desarrollo ||
    estadoAlArchivar === EstadoProyecto.ProyectoFinalizado
  );
}

/**
 * Para retomar, el cliente vuelve a pagar: 25% si vuelve antes del año; si
 * llega al año o lo pasa, 50% sí o sí (se rehacen inicio y diseño).
 */
export function porcentajeDeReactivacion(
  archivadoAt: Date,
  ahora = new Date(),
): number {
  return diasTranscurridos(archivadoAt, ahora) >= DIAS_DEL_ANIO
    ? REACTIVACION_PASADO_EL_ANIO
    : REACTIVACION_DENTRO_DEL_ANIO;
}

/** Al reactivar pasado el año se rehacen inicio y diseño. */
export function estadoAlReactivar(
  estadoAlArchivar: EstadoProyecto,
  porcentaje: number,
): EstadoProyecto {
  return porcentaje === REACTIVACION_PASADO_EL_ANIO
    ? EstadoProyecto.Brief
    : estadoAlArchivar;
}
