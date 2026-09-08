/**
 * Cuándo corresponde avisar que una reunión está por empezar.
 *
 * Va aparte del servicio y sin tocar la base a propósito: es la única parte
 * con decisiones (¿entró en la ventana?, ¿ya se avisó?, ¿cuántos minutos
 * faltan?) y así se puede probar sin levantar nada.
 */

/** Cuánto antes se avisa. Cinco minutos: alcanza para abrir el Meet. */
export const MINUTOS_DE_AVISO = 5;

const UN_MINUTO_EN_MS = 60_000;

/**
 * Fin de la ventana de aviso: el instante hasta el que hay que mirar.
 * Todo lo que empiece entre `ahora` y este límite entra.
 */
export function limiteDeAviso(ahora: Date): Date {
  return new Date(ahora.getTime() + MINUTOS_DE_AVISO * UN_MINUTO_EN_MS);
}

/**
 * ¿Toca avisar por esta reunión?
 *
 * Se avisa una sola vez, y solo si todavía no empezó: una reunión que ya
 * arrancó no necesita un «está por empezar», y una que ya tiene el aviso
 * marcado no se repite en la pasada siguiente.
 */
export function correspondeAvisar(
  reunion: { fecha: Date; avisoPrevioAt: Date | null },
  ahora: Date,
): boolean {
  if (reunion.avisoPrevioAt !== null) return false;
  if (reunion.fecha.getTime() < ahora.getTime()) return false;
  return reunion.fecha.getTime() <= limiteDeAviso(ahora).getTime();
}

/**
 * Minutos que faltan, redondeados hacia arriba, para el texto del aviso.
 * Nunca menos de 1: a falta de 20 segundos se dice «en 1 minuto» y no
 * «en 0 minutos».
 */
export function minutosQueFaltan(fecha: Date, ahora: Date): number {
  const restante = fecha.getTime() - ahora.getTime();
  return Math.max(1, Math.ceil(restante / UN_MINUTO_EN_MS));
}

/**
 * ¿La reunión nace ya dentro de la ventana de aviso?
 *
 * Si alguien agenda algo para dentro de tres minutos, el aviso de «nueva
 * reunión agendada» ya cumple la función y no hace falta el recordatorio
 * pisándolo un minuto después.
 */
export function naceDentroDeLaVentana(fecha: Date, ahora: Date): boolean {
  return fecha.getTime() <= limiteDeAviso(ahora).getTime();
}
