import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { REFRESH_COOKIE } from './feature/auth/auth.cookie';

/** Dónde queda la UI. El JSON crudo sale en `/docs-json`. */
export const RUTA_DOCS = 'docs';

/**
 * Nombre del esquema de seguridad del access token. Es la cadena que hay que
 * pasarle a `@ApiBearerAuth()` en los controllers: si no coincide con la que
 * se registra acá, el candado sale abierto en la UI y el botón «Authorize»
 * no manda el header.
 */
export const AUTH_BEARER = 'access-token';

/** Ídem para la cookie httpOnly del refresh, que solo usa POST /auth/refresh. */
export const AUTH_COOKIE_REFRESH = 'refresh-cookie';

/** Nombres de las secciones de la UI, en un solo lugar para no tipearlos mal. */
export const TAGS = {
  auth: 'Autenticación',
  proyectos: 'Proyectos',
  flujo: 'Proyectos · Flujo de trabajo',
  cobros: 'Proyectos · Cobros',
  analitica: 'Proyectos · Analítica',
  usuarios: 'Usuarios',
  roles: 'Roles',
  seguimientos: 'Seguimientos',
  notificaciones: 'Notificaciones',
  reuniones: 'Reuniones',
  notas: 'Notas a administración',
} as const;

const DESCRIPCION = `
API de administración de proyectos web de Websy: da de alta el proyecto, lo mueve
por las etapas del flujo, registra los cobros y persigue lo que falta del cliente.

### Autenticación

Todas las rutas están protegidas salvo las tres de \`/auth\`. El flujo es:

1. \`POST /auth/login\` devuelve \`accessToken\` en el cuerpo y deja el refresh token
   en una cookie \`httpOnly\` acotada a \`Path=/auth\`.
2. El \`accessToken\` viaja en \`Authorization: Bearer <token>\`. Para probar desde
   acá, pegalo en **Authorize** (arriba a la derecha).
3. Cuando vence, \`POST /auth/refresh\` emite uno nuevo leyendo la cookie. El
   cliente debería hacer *single-flight* del refresh y reintentar una sola vez.
4. \`POST /auth/logout\` borra la cookie y responde **204 sin cuerpo**: no hay que
   parsearlo como JSON.

Las tres rutas necesitan \`credentials: 'include'\` desde el navegador.

### Los tres ejes del proyecto

Un proyecto se lee cruzando tres cosas distintas, que es lo que más se confunde:

- **Etapa** (\`estadoProyecto\`): dónde está en el pipeline (Registro → Brief →
  Taxonomía → las tres de Diseño → Desarrollo → Proyecto Finalizado, más el
  terminal Archivado).
- **Grupo**: **A** es producción en curso, **B** está trabado esperando material
  del cliente y **C** no pagó, no contrató el hosting o no responde. **No se
  manda a mano**: lo deriva el sistema de los bloqueos y los cobros.
- **Seguimiento**: la «acción de hoy» sobre ese cliente. Sus valores son
  imperativos (*Congelar Hoy* = andá a congelarlo), no un estado.

### Códigos de error

- **400** — el cuerpo está mal (falta un campo, sobra uno, tipo equivocado). El
  \`ValidationPipe\` global rechaza cualquier propiedad no declarada.
- **401** — falta el token, venció o el usuario está desactivado.
- **403** — el rol no alcanza para esa ruta (cobros, archivar y reactivar son
  solo de administración).
- **404** — no existe o está borrado (los proyectos son *soft-delete*).
- **409** — el cuerpo está bien pero el proyecto no está en condiciones: falta un
  cobro, falta el material de marca, la transición de etapa no es válida.
`.trim();

/**
 * Monta la documentación. Se llama desde `main.ts` antes de `listen`.
 *
 * Ojo: `SwaggerModule.setup` registra las rutas directamente en el adaptador de
 * Express, así que **no pasan por los guards globales** — `/docs` queda público
 * aunque el resto de la API no lo esté. Por eso se puede apagar con
 * `SWAGGER_ENABLED=false` en los entornos donde no se quiera publicar.
 */
export function configurarSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('API Admin Proyectos · Websy')
    .setDescription(DESCRIPCION)
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Access token devuelto por POST /auth/login. Pegá solo el token, sin la palabra «Bearer».',
      },
      AUTH_BEARER,
    )
    .addCookieAuth(
      REFRESH_COOKIE,
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Cookie httpOnly con el refresh token. La setea el login y la manda el navegador solo; no se puede cargar a mano.',
      },
      AUTH_COOKIE_REFRESH,
    )
    .addTag(TAGS.auth, 'Login, refresh y logout. Lo único público de la API.')
    .addTag(TAGS.proyectos, 'Alta, consulta y tableros por rol.')
    .addTag(
      TAGS.flujo,
      'Las acciones del diagrama: bloqueos del cliente, hitos del recorrido, archivado y reactivación.',
    )
    .addTag(
      TAGS.cobros,
      'Plan de cobros y marcado de hitos. Solo administración.',
    )
    .addTag(TAGS.usuarios, 'ABM de usuarios de la herramienta.')
    .addTag(
      TAGS.roles,
      'ABM de roles. Los nombres son los que leen los permisos.',
    )
    .addTag(
      TAGS.seguimientos,
      'Catálogo de acciones de hoy («Llamar», «Congelar Hoy», …).',
    )
    .addTag(
      TAGS.notificaciones,
      'Bandeja de avisos internos del usuario logueado: asignaciones, etapas finalizadas, reuniones y notas.',
    )
    .addTag(
      TAGS.reuniones,
      'Reuniones con link de Meet. Administración agenda; el equipo consulta las suyas.',
    )
    .addTag(
      TAGS.notas,
      'Notas del equipo sobre un proyecto, para administración. Solo administración las lee.',
    )
    .build();

  const documento = SwaggerModule.createDocument(app, config, {
    // Sin esto, un controller sin @ApiTags de clase hereda un tag con el nombre
    // de la clase («Projects»), y las rutas de proyectos aparecían duplicadas:
    // una vez ahí y otra en su sección en español.
    autoTagControllers: false,
  });

  SwaggerModule.setup(RUTA_DOCS, app, documento, {
    jsonDocumentUrl: `${RUTA_DOCS}-json`,
    customSiteTitle: 'API Admin Proyectos · Websy',
    swaggerOptions: {
      // Mantiene el token cargado al recargar la página.
      persistAuthorization: true,
      // Sin esto el navegador no manda la cookie del refresh desde la UI.
      withCredentials: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      filter: true,
    },
  });
}
