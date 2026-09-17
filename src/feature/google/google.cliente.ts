import { randomUUID } from 'node:crypto';

/**
 * Llamadas HTTP a Google, sin dependencias.
 *
 * A propósito no se usa `googleapis`: son cuatro endpoints REST y Node 22 ya
 * trae `fetch`. Agregar un paquete con script de instalación es justamente lo
 * que rompe el deploy de Railway (ver «Deployment» en CLAUDE.md).
 *
 * Este archivo no sabe nada de la base ni de reuniones: recibe un access token
 * y datos planos. Toda la lógica de cuándo llamar vive en el servicio.
 */

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo';
const CALENDAR =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const MEET_SPACES = 'https://meet.googleapis.com/v2/spaces';

/**
 * Lo mínimo que hace falta pedirle a la persona que conecta:
 *
 * - `calendar.events` para crear, mover y borrar los eventos.
 * - `meetings.space.settings` para dejar la grabación y la transcripción
 *   activadas de entrada.
 * - `userinfo.email` solo para poder mostrar en pantalla qué cuenta quedó
 *   conectada.
 */
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/userinfo.email',
];

export interface ConfigGoogle {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface Invitado {
  email: string;
}

export interface EventoDeCalendar {
  titulo: string;
  descripcion: string | null;
  inicio: Date;
  fin: Date;
  invitados: Invitado[];
  zonaHoraria: string;
}

export interface EventoCreado {
  eventId: string;
  /** Link del Meet que generó Google, o `null` si no lo devolvió. */
  linkMeet: string | null;
  /** Código de la reunión (`abc-defg-hij`), que identifica el espacio de Meet. */
  codigoMeet: string | null;
}

/** Error con el detalle que devolvió Google, para poder mostrarlo. */
export class ErrorDeGoogle extends Error {
  constructor(
    readonly estado: number,
    readonly detalle: string,
  ) {
    super(`Google respondió ${estado}: ${detalle}`);
    this.name = 'ErrorDeGoogle';
  }
}

async function pedir<T>(url: string, init: RequestInit): Promise<T> {
  const respuesta = await fetch(url, init);

  if (!respuesta.ok) {
    throw new ErrorDeGoogle(
      respuesta.status,
      (await respuesta.text()).slice(0, 500),
    );
  }

  // El DELETE de Calendar responde 204 sin cuerpo.
  if (respuesta.status === 204) return undefined as T;
  return (await respuesta.json()) as T;
}

function autorizado(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// OAuth
// ---------------------------------------------------------------------------

/**
 * URL a la que se manda a la persona para que autorice.
 *
 * `access_type=offline` + `prompt=consent` es lo que hace que Google devuelva
 * un **refresh token**. Sin `prompt=consent`, en la segunda autorización Google
 * omite el refresh token y la integración queda a medias.
 */
export function urlDeAutorizacion(config: ConfigGoogle, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return `${OAUTH_AUTH}?${params.toString()}`;
}

interface RespuestaToken {
  access_token: string;
  refresh_token?: string;
  scope: string;
  expires_in: number;
}

export async function intercambiarCodigo(
  config: ConfigGoogle,
  code: string,
): Promise<{ accessToken: string; refreshToken: string; scopes: string }> {
  const datos = await pedir<RespuestaToken>(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!datos.refresh_token) {
    throw new Error(
      'Google no devolvió un refresh token. Suele pasar cuando la cuenta ya había autorizado antes: hay que quitar el acceso en myaccount.google.com/permissions y volver a conectar.',
    );
  }

  return {
    accessToken: datos.access_token,
    refreshToken: datos.refresh_token,
    scopes: datos.scope,
  };
}

/** El access token dura una hora; se pide uno nuevo en cada operación. */
export async function renovarAccessToken(
  config: ConfigGoogle,
  refreshToken: string,
): Promise<string> {
  const datos = await pedir<RespuestaToken>(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    }),
  });

  return datos.access_token;
}

/**
 * Le avisa a Google que el acceso ya no se usa. Revocar el refresh token
 * invalida también los access tokens que salieron de él. Es buena higiene al
 * desconectar, no una condición: si falla, el token se borra igual de la base.
 */
export async function revocarToken(token: string): Promise<void> {
  await pedir('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
}

export async function correoDeLaCuenta(accessToken: string): Promise<string> {
  const datos = await pedir<{ email?: string }>(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return datos.email ?? 'desconocido';
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

interface RespuestaEvento {
  id: string;
  hangoutLink?: string;
  conferenceData?: {
    conferenceId?: string;
    entryPoints?: { entryPointType?: string; uri?: string }[];
  };
}

function cuerpoDelEvento(evento: EventoDeCalendar) {
  return {
    summary: evento.titulo,
    description: evento.descripcion ?? undefined,
    start: {
      dateTime: evento.inicio.toISOString(),
      timeZone: evento.zonaHoraria,
    },
    end: { dateTime: evento.fin.toISOString(), timeZone: evento.zonaHoraria },
    attendees: evento.invitados.map((i) => ({ email: i.email })),
  };
}

function leerMeet(datos: RespuestaEvento): {
  linkMeet: string | null;
  codigoMeet: string | null;
} {
  const link =
    datos.hangoutLink ??
    datos.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')
      ?.uri ??
    null;

  return {
    linkMeet: link,
    codigoMeet: datos.conferenceData?.conferenceId ?? null,
  };
}

/**
 * Crea el evento y le pide a Google que genere el Meet.
 *
 * `conferenceDataVersion=1` es obligatorio para que respete `createRequest`;
 * sin ese parámetro el evento se crea igual pero **sin videollamada**.
 * `sendUpdates=all` es lo que dispara las invitaciones por correo.
 */
export async function crearEvento(
  accessToken: string,
  evento: EventoDeCalendar,
): Promise<EventoCreado> {
  const datos = await pedir<RespuestaEvento>(
    `${CALENDAR}?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: 'POST',
      headers: autorizado(accessToken),
      body: JSON.stringify({
        ...cuerpoDelEvento(evento),
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      }),
    },
  );

  return { eventId: datos.id, ...leerMeet(datos) };
}

/** Actualiza el evento que ya existe, sin tocar su videollamada. */
export async function actualizarEvento(
  accessToken: string,
  eventId: string,
  evento: EventoDeCalendar,
): Promise<void> {
  await pedir(`${CALENDAR}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'PATCH',
    headers: autorizado(accessToken),
    body: JSON.stringify(cuerpoDelEvento(evento)),
  });
}

export async function borrarEvento(
  accessToken: string,
  eventId: string,
): Promise<void> {
  await pedir(`${CALENDAR}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE',
    headers: autorizado(accessToken),
  });
}

// ---------------------------------------------------------------------------
// Meet
// ---------------------------------------------------------------------------

/**
 * Deja el Meet grabando y transcribiendo desde que arranca.
 *
 * **El código de la reunión (`abc-defg-hij`) solo sirve para leer.**
 * `spaces.get` lo acepta como alias, pero `spaces.patch` exige el nombre
 * interno (`spaces/jQCFfuBOdN5z`): con el código, el cambio no se aplica. Por
 * eso primero se lee el espacio y se usa el `name` que devuelve.
 *
 * Grabación y transcripción van juntas y su error sube al llamador. Las notas
 * de Gemini van aparte y sin tumbar nada: dependen de que la licencia tenga
 * Gemini, y sin ella Google rechaza el campo.
 *
 * Requiere una edición de Workspace que habilite grabación y transcripción; si
 * no la tiene, Google responde 403 y el llamador decide qué hacer.
 */
export async function configurarGrabacion(
  accessToken: string,
  codigoMeet: string,
  activar: boolean,
): Promise<{ notasDeGemini: boolean }> {
  const modo = activar ? 'ON' : 'OFF';

  const espacio = await pedir<{ name: string }>(
    `${MEET_SPACES}/${encodeURIComponent(codigoMeet)}`,
    { headers: autorizado(accessToken) },
  );

  // `name` ya viene como `spaces/<id>`.
  const url = `https://meet.googleapis.com/v2/${espacio.name}`;

  await pedir(
    `${url}?updateMask=config.artifactConfig.recordingConfig,config.artifactConfig.transcriptionConfig`,
    {
      method: 'PATCH',
      headers: autorizado(accessToken),
      body: JSON.stringify({
        config: {
          artifactConfig: {
            recordingConfig: { autoRecordingGeneration: modo },
            transcriptionConfig: { autoTranscriptionGeneration: modo },
          },
        },
      }),
    },
  );

  try {
    await pedir(`${url}?updateMask=config.artifactConfig.smartNotesConfig`, {
      method: 'PATCH',
      headers: autorizado(accessToken),
      body: JSON.stringify({
        config: {
          artifactConfig: {
            smartNotesConfig: { autoSmartNotesGeneration: modo },
          },
        },
      }),
    });
    return { notasDeGemini: true };
  } catch {
    return { notasDeGemini: false };
  }
}
