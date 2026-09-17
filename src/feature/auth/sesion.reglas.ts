import { createHash } from 'node:crypto';

/**
 * Decisiones del login con better-auth que no necesitan base ni red. Se
 * prueban en `sesion.reglas.spec.ts`.
 */

/** Dónde atiende better-auth. No pasa por el router de Nest. */
export const RUTA_AUTH = '/api/auth';

/** Cuánto dura una sesión sin uso y cada cuánto se renueva al usarla. */
export const DURACION_SESION_S = 7 * 24 * 60 * 60;
export const RENOVAR_SESION_CADA_S = 24 * 60 * 60;

/**
 * Lo que queda en `request.usuario` para el resto del API. Tiene la misma
 * forma que el payload del JWT de antes (`sub`, `user`, `roleId`), así que
 * `@UsuarioActual('sub')` y `RolesGuard` siguen igual.
 */
export interface UsuarioSesion {
  sub: number;
  user: string;
  roleId: number;
  /** La sesión con la que llegó el pedido: se respeta al cerrar las demás. */
  sesionId: number;
}

/**
 * La URL pública del API, que better-auth necesita para firmar cookies y
 * validar orígenes. Si no está `BETTER_AUTH_URL`, sale del callback de Google
 * (mismo host) y, en local, del puerto.
 */
export function urlDelApi(env: {
  BETTER_AUTH_URL?: string;
  GOOGLE_REDIRECT_URI?: string;
  PORT?: string;
}): string {
  const explicita = env.BETTER_AUTH_URL?.trim();
  if (explicita) return explicita.replace(/\/+$/, '');

  const google = env.GOOGLE_REDIRECT_URI?.trim();
  if (google) {
    try {
      return new URL(google).origin;
    } catch {
      // Mal cargada: se sigue con el valor local.
    }
  }

  return `http://localhost:${env.PORT?.trim() || '3000'}`;
}

/**
 * El secreto de las sesiones. Si no hay uno propio, se deriva del de los JWT
 * (que el API ya exige) para no sumar otra variable obligatoria. Derivado y
 * no igual: así una fuga de uno no sirve para el otro.
 */
export function secretoDeSesiones(env: {
  BETTER_AUTH_SECRET?: string;
  JWT_SECRET?: string;
}): string {
  const propio = env.BETTER_AUTH_SECRET?.trim();
  if (propio) return propio;

  const jwt = env.JWT_SECRET?.trim();
  if (!jwt) {
    throw new Error(
      'Falta BETTER_AUTH_SECRET (o JWT_SECRET) para las sesiones',
    );
  }
  // Hash para que tenga el largo que pide better-auth (32+ caracteres).
  return createHash('sha256')
    .update(`${jwt}:sesiones-better-auth`)
    .digest('hex');
}

/** Los orígenes del front, para CORS y para el control de origen de las cookies. */
export function origenesDelFront(corsOrigin: string | undefined): string[] {
  return (corsOrigin ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/**
 * La IP de quien pide, para el límite de intentos. Railway agrega la IP real
 * al **final** de `x-forwarded-for`; lo de adelante lo puede escribir
 * cualquiera, así que no se usa.
 */
export function ipDelPedido(headers: Headers | undefined): string {
  const reenviada = headers?.get('x-forwarded-for');
  const ultima = reenviada
    ?.split(',')
    .map((ip) => ip.trim())
    .filter(Boolean)
    .pop();
  return ultima || headers?.get('x-real-ip')?.trim() || 'desconocida';
}

/** Mensajes en español para los errores de better-auth que ve la gente. */
export const MENSAJES_DE_ERROR: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: 'Credenciales inválidas',
  INVALID_USERNAME: 'Credenciales inválidas',
  USERNAME_TOO_SHORT: 'Credenciales inválidas',
  USERNAME_TOO_LONG: 'Credenciales inválidas',
};
