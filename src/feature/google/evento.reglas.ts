import { SCOPES, type EventoDeCalendar } from './google.cliente';

/**
 * Las decisiones de la integración con Google, sin base ni red: qué evento
 * sale de una reunión, cuándo un cambio obliga a actualizarlo y qué permisos
 * faltan. Se prueban solas en `evento.reglas.spec.ts`.
 */

/** Lo que dura el evento en el calendario. La reunión no guarda su fin. */
export const DURACION_MINUTOS = 60;

/** La hora de la agenda es la de Lima, como el resto del sistema. */
export const ZONA_HORARIA = 'America/Lima';

export interface ReunionParaCalendar {
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly fecha: Date;
  readonly proyecto: { readonly name: string } | null;
  readonly participantes: readonly { readonly email: string | null }[];
  /** Correos de clientes, fuera del sistema. */
  readonly invitadosExternos?: readonly string[];
}

/**
 * Los correos externos como se guardan: sin espacios, en minúsculas y sin
 * repetir. Así la comparación de `cambiaElEvento` no ve cambios donde no los hay.
 */
export function limpiarCorreos(correos: readonly string[]): string[] {
  return [
    ...new Set(correos.map((c) => c.trim().toLowerCase()).filter(Boolean)),
  ];
}

/**
 * Los invitados: los convocados con correo, sin repetir. Quien no tiene correo
 * cargado simplemente no recibe la invitación de Google; se entera igual por
 * la notificación interna.
 */
export function invitadosDe(
  participantes: ReunionParaCalendar['participantes'],
): { email: string }[] {
  const vistos = new Set<string>();
  const invitados: { email: string }[] = [];

  for (const { email } of participantes) {
    const limpio = email?.trim();
    if (!limpio) continue;
    const clave = limpio.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    invitados.push({ email: limpio });
  }

  return invitados;
}

export function eventoDesdeReunion(
  reunion: ReunionParaCalendar,
): EventoDeCalendar {
  const lineas = [
    reunion.descripcion?.trim(),
    reunion.proyecto ? `Proyecto: ${reunion.proyecto.name}` : null,
    'Agendada desde el sistema de Websy.',
  ].filter((l): l is string => Boolean(l));

  return {
    titulo: reunion.titulo,
    descripcion: lineas.join('\n\n'),
    inicio: reunion.fecha,
    fin: new Date(reunion.fecha.getTime() + DURACION_MINUTOS * 60_000),
    // Los de afuera van después del equipo; si un cliente coincide con alguien
    // del sistema, `invitadosDe` lo deja una sola vez.
    invitados: invitadosDe([
      ...reunion.participantes,
      ...(reunion.invitadosExternos ?? []).map((email) => ({ email })),
    ]),
    zonaHoraria: ZONA_HORARIA,
  };
}

/**
 * El código de la reunión (`abc-defg-hij`) a partir del link de Meet, que es
 * lo que sirve para ubicar el espacio y encenderle la grabación.
 */
export function codigoDeMeet(link: string | null | undefined): string | null {
  const coincidencia = link
    ?.trim()
    .match(
      /^https:\/\/meet\.google\.com\/([a-z]{3,4}-[a-z]{4}-[a-z]{3,4})\/?(?:\?.*)?$/i,
    );

  return coincidencia ? coincidencia[1].toLowerCase() : null;
}

interface EstadoSincronizable {
  readonly titulo: string;
  readonly descripcion: string | null;
  readonly fecha: Date;
  readonly proyecto: { readonly name: string } | null;
  readonly participantes: readonly { readonly email: string | null }[];
  readonly invitadosExternos?: readonly string[];
}

/**
 * ¿El cambio se nota en el evento de Google? Solo lo que el evento muestra:
 * título, descripción, horario e invitados. Cambiar solo la grabación no
 * obliga a tocar el evento (eso va por Meet).
 */
export function cambiaElEvento(
  antes: EstadoSincronizable,
  despues: EstadoSincronizable,
): boolean {
  const a = eventoDesdeReunion(antes);
  const d = eventoDesdeReunion(despues);

  const correos = (e: EventoDeCalendar) =>
    e.invitados
      .map((i) => i.email.toLowerCase())
      .sort()
      .join(',');

  return (
    a.titulo !== d.titulo ||
    a.descripcion !== d.descripcion ||
    a.inicio.getTime() !== d.inicio.getTime() ||
    correos(a) !== correos(d)
  );
}

/** Los permisos que pide la integración y la cuenta no concedió. */
export function permisosFaltantes(concedidos: string): string[] {
  const tiene = new Set(concedidos.split(/\s+/).filter(Boolean));
  return SCOPES.filter((s) => !tiene.has(s));
}

/**
 * A dónde vuelve el navegador después de conectar: el primer origen de
 * `CORS_ORIGIN`, que es el front. Sin él no hay a dónde volver y la API
 * responde con una página propia.
 */
export function frontDesde(corsOrigin: string | undefined): string | null {
  const primero = corsOrigin
    ?.split(',')
    .map((o) => o.trim())
    .find(Boolean);

  if (!primero) return null;

  try {
    const url = new URL(primero);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
}
