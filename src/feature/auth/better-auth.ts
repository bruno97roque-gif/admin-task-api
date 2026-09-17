import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware, isAPIError } from 'better-auth/api';
import { username } from 'better-auth/plugins';
import type { Argon2Service } from '../../lib/argon2/argon2.service';
import type { PrismaService } from '../../lib/prisma/prisma.service';
import { LimitadorDeIntentos, mensajeDeEspera } from './limitador-de-intentos';
import {
  DURACION_SESION_S,
  ipDelPedido,
  MENSAJES_DE_ERROR,
  origenesDelFront,
  RENOVAR_SESION_CADA_S,
  RUTA_AUTH,
  secretoDeSesiones,
  urlDelApi,
} from './sesion.reglas';

/** Token de inyección de la instancia de better-auth. */
export const AUTH = Symbol('AUTH');

const QUINCE_MINUTOS = 15 * 60_000;
const RUTA_LOGIN = '/sign-in/username';

/**
 * Rutas de better-auth que no se usan. Se apagan para que nadie pueda, por
 * ejemplo, registrarse solo o cambiar su correo por fuera del sistema. Lo que
 * queda: entrar con usuario, salir y leer la sesión.
 */
const RUTAS_APAGADAS = [
  '/sign-up/email',
  '/sign-in/email',
  '/sign-in/social',
  '/update-user',
  '/change-email',
  '/change-password',
  '/set-password',
  '/delete-user',
  '/request-password-reset',
  '/reset-password',
  '/forget-password',
  '/verify-email',
  '/send-verification-email',
  '/is-username-available',
  '/link-social',
  '/unlink-account',
  '/list-accounts',
  '/account-info',
  '/refresh-token',
  '/get-access-token',
];

/**
 * **EL LOGIN.** better-auth con usuario y contraseña, sobre la base de
 * siempre:
 *
 * - ids numéricos (`generateId: 'serial'`), para que las sesiones cuelguen de
 *   `users.id` como todo lo demás;
 * - el nombre de usuario es la columna `user` de siempre, **sin pasarlo a
 *   minúsculas ni restringir caracteres**: «Julio Admin» y «JCConquistador»
 *   entran igual que antes;
 * - las contraseñas se verifican con el mismo argon2 del sistema, así que el
 *   hash copiado por la migración sirve tal cual;
 * - nadie se registra solo: los usuarios los crea administración.
 */
export function crearAuth(deps: {
  prisma: PrismaService;
  argon2: Argon2Service;
  env: NodeJS.ProcessEnv;
}): Auth {
  const { prisma, argon2, env } = deps;
  const enProduccion = env.NODE_ENV === 'production';

  // Mismo freno que tenía el login con JWT: 10 fallos por usuario o 30 por IP
  // en 15 minutos. Un acierto limpia el del usuario.
  const fallosPorUsuario = new LimitadorDeIntentos(10, QUINCE_MINUTOS);
  const fallosPorIp = new LimitadorDeIntentos(30, QUINCE_MINUTOS);
  const clavesDe = (nombre: unknown, headers: Headers | undefined) => ({
    usuario: `u:${(typeof nombre === 'string' ? nombre : '').trim().toLowerCase()}`,
    ip: `ip:${ipDelPedido(headers)}`,
  });

  const auth = betterAuth({
    appName: 'Websy',
    baseURL: urlDelApi(env),
    basePath: RUTA_AUTH,
    secret: secretoDeSesiones(env),
    trustedOrigins: origenesDelFront(env.CORS_ORIGIN),
    database: prismaAdapter(prisma, { provider: 'postgresql' }),

    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      password: {
        hash: (password) => argon2.hash(password),
        verify: ({ hash, password }) => argon2.verify(hash, password),
      },
    },

    session: {
      expiresIn: DURACION_SESION_S,
      updateAge: RENOVAR_SESION_CADA_S,
    },

    user: {
      // Los necesita el guard; nadie los puede escribir desde afuera.
      additionalFields: {
        roleId: { type: 'number', required: false, input: false },
        active: { type: 'boolean', required: false, input: false },
        debeCambiarContrasena: {
          type: 'boolean',
          required: false,
          input: false,
        },
      },
    },

    plugins: [
      username({
        schema: { user: { fields: { username: 'user' } } },
        usernameNormalization: false,
        usernameValidator: (nombre) => nombre.trim().length > 0,
        minUsernameLength: 1,
        maxUsernameLength: 50,
        displayUsername: false,
      }),
    ],

    databaseHooks: {
      session: {
        create: {
          // Un usuario desactivado no abre sesión, aunque la contraseña sea
          // correcta. Se chequea recién acá, después de validar la
          // contraseña, para no contarle a nadie qué usuarios existen.
          before: async (sesion) => {
            const usuario = await prisma.user.findUnique({
              where: { id: Number(sesion.userId) },
              select: { active: true },
            });
            if (!usuario?.active) {
              throw new APIError('FORBIDDEN', {
                message: 'El usuario está desactivado',
                code: 'USUARIO_DESACTIVADO',
              });
            }
          },
        },
      },
    },

    hooks: {
      // Sin await adentro, pero createAuthMiddleware exige una función async.
      // eslint-disable-next-line @typescript-eslint/require-await
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== RUTA_LOGIN) return;
        const body = ctx.body as { username?: unknown } | undefined;
        const claves = clavesDe(body?.username, ctx.headers);
        const espera = Math.max(
          fallosPorUsuario.esperaPara(claves.usuario),
          fallosPorIp.esperaPara(claves.ip),
        );
        if (espera > 0) {
          throw new APIError('TOO_MANY_REQUESTS', {
            message: mensajeDeEspera(espera),
            code: 'DEMASIADOS_INTENTOS',
          });
        }
      }),
      // eslint-disable-next-line @typescript-eslint/require-await
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== RUTA_LOGIN) return;
        const body = ctx.body as { username?: unknown } | undefined;
        const claves = clavesDe(body?.username, ctx.headers);
        const resultado = ctx.context.returned;

        if (!isAPIError(resultado)) {
          fallosPorUsuario.olvidar(claves.usuario);
          return;
        }
        if (resultado.statusCode === 401) {
          fallosPorUsuario.registrarFallo(claves.usuario);
          fallosPorIp.registrarFallo(claves.ip);
        }
        // Los mensajes de better-auth vienen en inglés.
        const traducido = MENSAJES_DE_ERROR[resultado.body?.code ?? ''];
        if (traducido) {
          throw new APIError(resultado.status, {
            message: traducido,
            code: resultado.body?.code,
          });
        }
      }),
    },

    rateLimit: {
      enabled: true,
      window: 60,
      max: 200,
      // El login lo frena el limitador de arriba (por usuario y por IP). El
      // de better-auth se apaga ahí: si no logra leer la IP detrás del proxy,
      // junta a todos en un mismo contador y bloquearía al equipo entero.
      customRules: { [RUTA_LOGIN]: false },
    },

    disabledPaths: RUTAS_APAGADAS,

    advanced: {
      cookiePrefix: 'websy',
      useSecureCookies: enProduccion,
      database: { generateId: 'serial' },
      ipAddress: { ipAddressHeaders: ['x-forwarded-for', 'x-real-ip'] },
    },

    telemetry: { enabled: false },
  });

  // El tipo completo de better-auth arrastra genéricos de zod que TypeScript
  // no puede escribir en los .d.ts; el resto del API solo usa esto.
  return auth;
}

/** Lo que el API usa de better-auth. */
export interface Auth {
  /** Atiende las rutas de `RUTA_AUTH` (se monta en `main.ts`). */
  handler: (request: Request) => Promise<Response>;
  api: {
    getSession: (contexto: {
      headers: Headers;
    }) => Promise<SesionDeAuth | null>;
  };
}

export interface SesionDeAuth {
  session: { id: number | string; userId: number | string; expiresAt: Date };
  user: {
    id: number | string;
    name: string;
    username?: string | null;
    roleId?: number | null;
    active?: boolean | null;
    debeCambiarContrasena?: boolean | null;
  };
}
