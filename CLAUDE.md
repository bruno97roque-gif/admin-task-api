# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NestJS 11 REST API for managing web projects ("admin-proyecto"): projects, their pipeline state, the users assigned to them, roles, and follow-up (`seguimiento`) buckets. Persistence is PostgreSQL via Prisma 7. Package manager is **pnpm**. Deployed to Railway from a Dockerfile.

The domain vocabulary is Spanish (`proyecto`, `seguimiento`, `usuario`, `grupo`) and all user-facing error messages are in Spanish. Keep both conventions when adding code.

`README.md` is the untouched NestJS starter boilerplate — it contains nothing about this project. The written sources of truth are, in this order:

- **`Flujo de trabajo (mejorado).drawio`** (raíz) — el diagrama de flujo acordado con el equipo. Los comentarios del código citan sus nodos (`A6`, `B13`, `C3`…).
- **`PLAN-FLUJO.md`** (raíz) — comparación nodo por nodo entre el diagrama y lo implementado, con el estado de ejecución y las decisiones que quedaron pendientes del equipo (§5). Es lo primero que hay que leer antes de tocar el flujo. **Su banner de «Estado de ejecución» está congelado al 2026-08-09**: los números que cita (43 tests, 23 rutas, migración sin aplicar) ya no valen — el conteo vigente está en «Verification» y en el aviso de abajo. El valor de `PLAN-FLUJO.md` es la comparación nodo por nodo y §5, no su encabezado.
- **`tablero-proyectos-websy_5.xlsx`** (raíz) — la planilla que esta API reemplaza; sus hojas `Instrucciones` y `Reglas` tienen la regla de los 15 días y «GRUPO se calcula solo». Para leerla hay que descomprimirla y parsear `xl/sharedStrings.xml` + `xl/worksheets/sheet2.xml`.
- `docs/auth-contract.md` (el contrato cliente del login/refresh) fue borrado en el commit `f7e6726`, así que para auth el código es lo único que queda — resumido más abajo.

> **La base es de producción.** `DATABASE_URL` apunta a Railway. Las 7 migraciones están aplicadas (`pnpm exec prisma migrate status` al 2026-08-12). El aviso de `PLAN-FLUJO.md` §7 sobre `_flujo_fase1_fase2_completo` quedó viejo: ya se ejecutó. Verificá el estado antes de tocar nada y escribí las migraciones para que no reescriban filas — la de `_add_etapas_avance_y_diseno_finalizado` es el ejemplo a seguir (solo `ALTER TYPE … ADD VALUE`).

### Domain model in one paragraph

A `Proyecto` moves through `EstadoProyecto` (Registro → Brief → Taxonomia → Diseño → Avance de Diseño → Diseño Finalizado → Desarrollo → Proyecto Finalizado, plus the terminal `Archivado`) and belongs to exactly one `Grupo`, which is what the dashboard queries slice on: **A** is the live production pipeline, **B** is blocked on the client, **C** has not paid *or is not responding*. That is why `GET /projects/programador` and `/projects/diseno` filter `grupo: 'A'` while `/projects/admin` returns `grupo: { in: ['B', 'C'] }` — the admin queue is by definition everything *not* in production. Users are attached many-to-many through `UsuarioProyecto`.

The dashboard queries are **not** symmetric; read `ProjectsService` before assuming:

| Ruta | Filtro | Nota |
|---|---|---|
| `GET /projects/programador` | `grupo: 'A'`, `estadoProyecto notIn [ProyectoFinalizado, Archivado]` | con `?id=` matchea `desarrolladorId` **OR** la tabla `usuarios` — un dev ve tanto lo que tiene asignado en el registro como lo que le colgaron por el join |
| `GET /projects/diseno` | `grupo: 'A'`, `estadoProyecto: { in: ETAPAS_DISENO }` | además del grupo, filtra el tramo de diseño **entero** (`Diseno`, `AvanceDiseno`, `DisenoFinalizado`), no solo la primera etapa; con `?id=` matchea solo `disenadorId` |
| `GET /projects/admin` | `grupo: { in: ['B','C'] }`, `estadoProyecto not Archivado` | sigue incluyendo `ProyectoFinalizado` a propósito; lo archivado sale de la cola porque ya no se persigue |
| `GET /projects/archivados` | `estadoProyecto: 'Archivado'` | aparte, para que no ensucie la métrica |
| `GET /projects/por-archivar` | los que pasaron los 90 días sin moverse | ver la sección del flujo |

`Seguimiento` is the **third axis** and the easiest one to misread: it is not a stage and not a status, it is "what do I do with this client *today*". In the original spreadsheet the column is literally called «Acción de hoy», and its values are imperatives (`Congelar Hoy` = *go freeze this one*, not *this is frozen*). Keep that in mind before treating a seguimiento as a state.

**El seguimiento no mueve el grupo.** Existe la columna `Seguimiento.codigo` (`String? @unique`, migración `20260805160000_add_codigo_seguimiento`) pensada para automatizar el grupo desde el seguimiento, pero **no la lee ni la escribe nadie**: `CreateSeguimientoDto` solo expone `name`, así que hoy ni siquiera se puede setear por la API, y no existen `seguimiento.codigos.ts` ni `grupoTrasCambioDeSeguimiento()`. El grupo se deriva de los bloqueos y los cobros (`derivarGrupo`, abajo). Si alguna vez se implementa la automatización por seguimiento hay que decidir cuál de las dos manda, porque ambas escribirían `grupo`.

### El flujo de proyectos (diagrama «Flujo de trabajo (mejorado).drawio»)

Las reglas de negocio confirmadas con el equipo viven en **`feature/projects/reglas/flujo.reglas.ts`**, como funciones puras sin acceso a la base: el servicio decide con ellas y ahí están los números (90 días, 30%, 2 rondas, 25/50%) en un solo lugar. Cambiar una regla es cambiar esa constante, no cazar `if`s por el servicio. Es también lo único cubierto por tests.

- **`EstadoProyecto` tiene dos valores fuera del pipeline clásico**: `Registro` (arranca el flujo: se crea el registro y se asignan diseñador y desarrollador) y `Archivado` (terminal, deliberadamente **distinto de `ProyectoFinalizado`** para que no se mezclen en la misma métrica). El default de la columna sigue siendo `Brief`; es `ProjectsService.create` el que usa `Registro` cuando el body no manda `estadoProyecto`.
- **El diseño son tres etapas, no una** (`ETAPAS_DISENO`, migración `20260812120000_add_etapas_avance_y_diseno_finalizado`): `Diseno` (trabajo en curso) → `AvanceDiseno` (el avance que se le presenta al cliente) → `DisenoFinalizado` (diseño cerrado). Las tres comparten responsable (`disenador`) y la misma compuerta de entrada (el material de marca), así que en el código se tratan como un bloque con `esEtapaDeDiseno()` en vez de repetir los tres valores en cada `switch`. Se agregaron **sin quitar `Diseno`**: los proyectos que ya estaban ahí no se tocaron. Dos consecuencias que no se ven a simple vista: `POST /:id/aprobar-diseno` acepta las tres, y el recordatorio de `CobroAprobacionDiseno` —que sale de la etapa *siguiente*— ahora se abre recién en `DisenoFinalizado`, no durante todo el diseño.
- **Plan de cobros**: tabla `cobros`, una fila por hito (`AbonoInicial`, `AprobacionDiseno`, `Entrega`) con `porcentaje`, `cobrado` y `fechaCobro`. Los porcentajes los carga administración a mano; el sistema **no maneja montos en dinero**. `validarPlanDeCobros` exige los tres hitos, que sumen 100 y que el abono inicial no baje de 30 — `aprobadoPorJefatura: true` es la única forma de saltarse el piso. `estadoPago` (texto libre, default `"50%"`) quedó intacto por compatibilidad, pero ya no es la fuente de verdad. `POST /projects` acepta `planCobros` + `abonoInicialCobrado` para dar de alta el proyecto y registrar el abono en una sola llamada, como hace el nodo «Registro» del diagrama.
- **Todas las compuertas viven en `compuertasFaltantes()`**, que devuelve la lista de motivos por los que un proyecto no puede *entrar* a una etapa: el hito de cobro que la habilita (`hitoQueHabilita`: `Brief`, `Desarrollo`, `ProyectoFinalizado`), el material de marca antes de **cualquiera** de las tres etapas de diseño (no solo la primera: tampoco se entra retrocediendo desde `Desarrollo`), y —antes de dar por entregado— hosting, subida a producción y capacitación. **Solo rigen para proyectos con plan de cobros cargado** (`estaEnFlujoNuevo`): sin esa condición los proyectos migrados, que tienen todos los booleanos nuevos en `false` por el default de la columna, se trabarían todos de golpe. `create()` también las verifica si el alta pide una etapa distinta de `Registro`, para que no se puedan saltear creando el proyecto ya adelantado.
- **`transicionInvalida()` es la máquina de estados.** Se avanza de a una etapa por `ORDEN_ETAPAS`; se puede retroceder (el diagrama tiene varios «volver a presentar»); no se puede saltear hacia adelante. `Archivado` no se entra ni se sale con un `PATCH` — para eso están `POST /:id/archivar` y `/:id/reactivar`. El único salto legítimo es `Brief → Diseno`, y solo si el proyecto **no** es e-commerce.
- **`TipoProyecto` decide dos bifurcaciones**: `Informativa` saltea `Taxonomia` (y no puede entrar a ella); `Ecommerce` la exige y además es el único que tiene catálogo y carga de productos (`aplicaCargaDeProductos` — `PATCH /:id/catalogo` y `POST /:id/cargar-productos` responden 409 en los demás). Un proyecto con `tipoProyecto: null` (los que venían de antes) no se fuerza a ninguna rama. El enum mapea los valores que ya había en la columna de texto: `Ecommerce @map("E-commerce")`.
- **El grupo se deriva** (`derivarGrupo`), ya no se manda a mano: falta el pago **o el hosting** → **C** (el hosting está dentro del Grupo C según la leyenda del diagrama); falta el material de marca → **B**; si lo único que falta es el catálogo de productos → sigue en **A**, porque el desarrollo no se detiene. Mandar `grupo` explícito en el body sigue siendo la salida manual. El hosting solo pesa en el tramo final (`hostingEsExigible` → únicamente en `Desarrollo`); antes de eso que no esté contratado no ensucia el grupo.
- **Bloqueos separados**: `materialMarcaRecibido` frena el diseño; `catalogoRecibido` frena solo la carga de productos; `hostingContratado` frena la subida a producción. Por eso son tres columnas y no una, y cada una tiene su ruta (`BloqueoClienteDto`) en vez de tocarse por el `PATCH` genérico: cada cambio recalcula grupo y recordatorios.
- **`responsable` no se guarda, se calcula** (`responsableDe`, expuesto en la respuesta): Grupo B o C → siempre `administracion` (lo que falta es del cliente); en Grupo A sale de la etapa (las tres de diseño → `disenador`, `Desarrollo` → `desarrollador`, el resto `administracion`).
- **Los cinco recordatorios** viven en `recordatorios_proyecto` (tabla nueva, distinta de `recordatorios`, que quedó como notas sueltas sin relación). `sincronizarRecordatorios()` mantiene **uno solo abierto por proyecto**: `recordatorioQueCorresponde()` decide cuál según lo que esté trabando (prioridad: cobro → hosting → material → catálogo) y cierra los demás. Un recordatorio abierto es lo que define «está esperando al cliente», y de ahí sale `diasEsperandoAlCliente` en la respuesta. `proyectoInclude` trae **solo los abiertos**; los resueltos salen por `GET /projects/:id/recordatorios`.
- **Cotizaciones adicionales** (`cotizaciones_adicionales`): las genera el sistema solo en dos casos, y ninguno frena el proyecto — una ronda de cambios por encima de las 2 incluidas, y observaciones del cliente marcadas `dentroDelAlcance: false`. `aprobada`/`cobrada` quedan en `false` para que administración las persiga.
- **Archivado a los 3 meses** desde `fecha_ultimo_cambio_estado`, que **se reinicia en cada cambio de estado**. La API no archiva sola: `GET /projects/por-archivar` deja la lista y `POST /projects/:id/archivar` ejecuta. Esa query lista los que tienen un **recordatorio abierto** hace ≥90 días; los proyectos migrados, que no tienen recordatorios, caen a una rama de compatibilidad que exige además estar en Grupo B o C (antes entraba cualquier proyecto parado, incluso uno en Grupo A con desarrollo activo). Archivar cierra los recordatorios abiertos.
- **`reactivar()` lee el historial para saber a qué etapa volver**: busca la última fila con `estadoNuevo: 'Archivado'` y usa su `estadoAnterior` (cae a `Brief` si no encuentra ninguna). O sea que `historial_etapas` **no es solo auditoría, es estado**: borrar filas o crear un `Archivado` a mano por fuera de `archivar()` rompe la reactivación en silencio. `porcentajeDeReactivacion` devuelve 25% (antes del año) o 50% (al año o después, y ahí `estadoAlReactivar` fuerza la vuelta a `Brief` porque se rehacen inicio y diseño).
- **Rondas de diseño**: `rondas_cambios_usadas` contra `RONDAS_CAMBIOS_INCLUIDAS = 2`. Agotadas **no se bloquea nada** — el equipo decidió que el sistema deja el proyecto como está y el caso se maneja internamente; `POST /projects/:id/rondas-cambio` devuelve `requiereCotizacionAdicional: true` y deja la fila en `cotizaciones_adicionales`.
- **Trazabilidad**: cada cambio de etapa, de grupo, de bloqueo, de hito del recorrido, de plan de cobros o de hito cobrado escribe una fila en `historial_etapas` con quién lo movió (`UsuarioActual('sub')`, del payload del token) y cuándo. Es la base de los KPIs. Toda escritura que toque estado, grupo o un hito va dentro de un `$transaction` junto con su fila de historial.

Las acciones del flujo son rutas propias, no un `PATCH` genérico — cada una valida su regla y deja su fila de historial. `UpdateProjectDto` es `PartialType(OmitType(CreateProjectDto, ['planCobros', 'aprobadoPorJefatura', 'abonoInicialCobrado']))` justamente por eso.

| Ruta | Body | Qué hace |
|---|---|---|
| `PUT /projects/:id/plan-cobros` | `DefinirPlanCobrosDto` | define o redefine los tres hitos (`upsert`; lo ya cobrado se respeta, solo cambia el `porcentaje`) y recalcula el grupo |
| `PATCH /projects/:id/cobros/:hito` | `MarcarCobroDto` | marca un hito cobrado o lo revierte (`:hito` con `ParseEnumPipe(HitoCobro)`) y recalcula el grupo |
| `PATCH /projects/:id/material-marca` | `BloqueoClienteDto` | logo y fotos recibidos; destraba el paso a diseño |
| `PATCH /projects/:id/catalogo` | `BloqueoClienteDto` | solo e-commerce; destraba la carga de productos |
| `PATCH /projects/:id/hosting` | `BloqueoClienteDto` | hosting contratado; destraba producción y saca del Grupo C |
| `POST /projects/:id/factibilidad` | `MotivoDto` | revisión del desarrollador; **no** bloquea, se registra para auditar |
| `POST /projects/:id/aprobar-diseno` | `MotivoDto` | 409 si el proyecto no está en alguna de las tres etapas de diseño |
| `POST /projects/:id/cargar-productos` | `MotivoDto` | 409 si no es e-commerce o si falta el catálogo |
| `POST /projects/:id/presentar` | `MotivoDto` | marca `presentadoAt` |
| `POST /projects/:id/observaciones` | `ObservacionesDto` | 409 si no se presentó; dentro del alcance limpia `presentadoAt` (se vuelve a presentar), fuera del alcance abre una cotización |
| `POST /projects/:id/produccion` | `MotivoDto` | 409 sin hosting contratado |
| `POST /projects/:id/capacitacion` | `MotivoDto` | 409 si no se subió a producción |
| `POST /projects/:id/rondas-cambio` | `MotivoDto` | suma una ronda y devuelve `ResumenRondas` |
| `POST /projects/:id/archivar` | `MotivoDto` | 409 si ya está archivado o si está finalizado |
| `POST /projects/:id/reactivar` | `MotivoDto` | 409 si no está archivado; devuelve `ResumenReactivacion` |
| `GET /projects/:id/historial` | — | las filas de `historial_etapas`, ascendentes, con el usuario |
| `GET /projects/:id/recordatorios` | — | los cinco recordatorios, abiertos y resueltos |

Las otras siete rutas de `ProjectsController` son el CRUD y la membresía, y **no** pasan por las reglas del flujo salvo donde se indica: `POST /projects` (alta; valida compuertas si la etapa pedida no es `Registro`), `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id` (`UpdateProjectDto`; es el único camino que valida `transicionInvalida()`), `DELETE /projects/:id` (soft-delete), `POST /projects/:id/usuarios` (aditivo) y `DELETE /projects/:id/usuarios/:usuarioId` (saca un usuario del join, sin tocar `disenadorId`/`desarrolladorId`).

Tres helpers privados concentran la mecánica; cualquier acción nueva del flujo debería usar uno de ellos en vez de escribir su propia transacción:

- `marcarHito(id, campo, motivo, actorId)` — sella un `DateTime?` del recorrido (`factibilidadRevisadaAt`, `disenoAprobadoAt`, `presentadoAt`, `subidoProduccionAt`, `capacitacionAt`), deja la fila de historial y llama a `recalcularGrupo`.
- `actualizarBloqueo(id, data, motivo, actorId)` — lo mismo para los booleanos del cliente.
- `recalcularGrupo(id, actorId)` — relee el proyecto, deriva el grupo, sincroniza recordatorios y **se corta temprano si el estado es terminal** (`esEstadoTerminal`) o si el grupo no cambió, para no llenar el historial de filas iguales.

## Commands

```bash
pnpm install
pnpm start:dev          # watch mode, listens on PORT or 3000
pnpm build              # nest build -> dist/
pnpm start:prod         # node dist/main
pnpm lint               # eslint --fix over {src,apps,libs,test}
pnpm format             # prettier

pnpm test                       # jest (rootDir: src, testRegex .*\.spec\.ts$)
pnpm test -- path/to/file.spec.ts   # single file
pnpm test -- -t "name of test"      # single test by name
```

Prisma has no package.json scripts — invoke the CLI directly. `prisma.config.ts` loads `.env` via `dotenv/config`, points at `prisma/schema.prisma` (migrations in `prisma/migrations`: `_init`, `_add_fecha_entrega_proyecto`, `_add_tipo_proyecto`, `_add_codigo_seguimiento`, `_flujo_proyectos_registro_cobros_historial`, `_flujo_fase1_fase2_completo`, `_add_etapas_avance_y_diseno_finalizado`) and — Prisma 7 style — supplies `datasource.url` from `process.env.DATABASE_URL`. The `datasource db` block in the schema therefore has **no `url` field**; do not add `url = env("DATABASE_URL")` back to it.

```bash
pnpm exec prisma migrate status  # ¿está aplicada la última? (ver Overview)
pnpm exec prisma migrate dev --name <name>
pnpm exec prisma generate       # regenerates src/lib/generated/prisma
pnpm exec prisma studio
```

### Verification

`src/feature/projects/reglas/flujo.reglas.spec.ts` cubre las reglas de negocio puras (**51 tests**: cobros, grupos, transiciones, compuertas, recordatorios, archivado y reactivación). Es el único suite — el servicio, los controllers y los guards no tienen tests. `pnpm test:e2e` sigue apuntando a `./test/jest-e2e.json`, y el directorio `test/` no existe.

El `jest` de `package.json` necesita `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` — el cliente generado por Prisma 7 importa con extensión `.js` al estilo nodenext y sin ese mapeo todo el suite falla con `Cannot find module './internal/class.js'`.

Además de los tests, la verificación disponible es `pnpm exec tsc --noEmit`, `pnpm lint`, y levantar la app: Nest loguea una línea `[RouterExplorer] Mapped {...} route` por endpoint al arrancar, lo que confirma registración y orden de rutas (hoy son **29** en `/projects` y 52 en toda la app; verificado al 2026-08-17). Pasá `PORT=<puerto libre>` si ya hay un dev server en el 3000.

Booting also exercises the config wiring: `JWT_SECRET` and `JWT_REFRESH_SECRET` are read with `getOrThrow`, so a missing one fails at startup (secret) or on first refresh (refresh secret).

## Environment

`.env` is gitignored. Read through `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) except in `PrismaService` and `auth.cookie.ts`, which read `process.env` directly.

| Var | Required | Default |
|---|---|---|
| `DATABASE_URL` | yes | — |
| `JWT_SECRET` | yes (`getOrThrow`) | — |
| `JWT_REFRESH_SECRET` | yes (`getOrThrow`, on refresh) | — |
| `JWT_EXPIRES_IN` | no | `1h` (`lib.module.ts`) |
| `JWT_REFRESH_EXPIRES_IN` | no | `5d` — set in **two** places (`auth.service.ts` for the token, `auth.controller.ts` for the cookie `maxAge`); change both or the cookie outlives the token |
| `CORS_ORIGIN` | no | comma-separated list; unset reflects the request origin |
| `PORT` | no | `3000` |
| `NODE_ENV` | no | `production` switches the refresh cookie to `SameSite=None; Secure` |

## Architecture

### Two top-level layers under `src/`

- `src/lib/` — `LibModule` is `@Global()` and provides/exports `PrismaService`, `Argon2Service`, `JwtService`. It also registers `JwtModule.registerAsync` with the access-token secret/expiry. Because it is global, feature modules do **not** need to import it (most don't; `RolModule` imports it redundantly). Inject these services directly.
- `src/feature/<name>/` — one Nest module per resource, each with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, and an `entities/` stub. Existing features: `auth`, `user`, `rol`, `projects`, `seguimiento`, `recordatorio`. The `entities/*.ts` classes are empty scaffolding left by the Nest CLI generator; response shapes are expressed as exported TypeScript types on the service instead (e.g. `UserPublico`, `ProyectoCompleto`).

**Los prefijos de ruta son singulares salvo `projects`**: `/auth`, `/user`, `/rol`, `/seguimiento`, `/recordatorio`, `/projects`. No los "corrijas" a plural: el front ya los consume así.

Controllers are thin: they parse `:id` with `ParseIntPipe` and delegate. All business rules, existence checks, and error throwing live in services.

When scaffolding with `nest g resource`, the generator leaves an empty `CreateXDto {}` and stub service methods that return strings. The empty DTO is a trap: with the global `forbidNonWhitelisted` pipe (below) it makes every request body a 400 until the fields are filled in. The generated controller also emits lines over Prettier's print width, which are lint **errors** here — run `pnpm exec eslint src/feature/<name> --fix` after generating. New routes are protected by default (see Auth), so decide deliberately whether the resource needs `@Public()`.

### Routing (Express 5)

Nest 11 runs on Express 5 (`express@5.2.1`, `path-to-regexp@8`), which changes two things worth knowing before adding routes:

- **Optional route params (`@Get('x/:id?')`) are gone** — path-to-regexp v8 removed the `?` suffix and the app throws at boot. For an optional value use a query param instead, as `GET /projects/programador` does with `@Query('id', new ParseIntPipe({ optional: true }))`.
- **Static segments must be declared before `:id`.** `ProjectsController` puts `@Get('programador')`, `@Get('diseno')`, `@Get('admin')`, `@Get('archivados')` y `@Get('por-archivar')` above `@Get(':id')`; reversed, Express matches `programador` as an id and the request never reaches the intended handler (`ParseIntPipe` 400s instead). There is a comment on those routes saying so — keep it, and add any new static project route above `:id` too.

Do **not** add a global prefix (`app.setGlobalPrefix`) casually: the refresh cookie is scoped to `Path=/auth`, so moving auth under `/api/auth` silently stops the browser from sending it. `COOKIE_PATH` in `auth.cookie.ts` would have to change with it.

### Auth

Fully wired — access token in the `Authorization` header, refresh token in an httpOnly cookie.

- **Global guard.** `AppModule` registers `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, so **every route is protected by default**. `JwtAuthGuard` (`feature/auth/guards/`) reads `Bearer` from the `Authorization` header, verifies it with the access-token secret, and assigns the payload to **`request.usuario`** (Spanish, not `request.user`). Opt out with `@Public()` (`feature/auth/decorators/public.decorator.ts`), which sets the `isPublic` metadata the guard checks via `Reflector.getAllAndOverride` — it works on a handler or a whole controller.
- **Public routes are only** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`. Everything else 401s without a token.
- **Segundo guard global: `RolesGuard`**, registrado en `AppModule` **después** de `JwtAuthGuard` (lee el `roleId` que aquel deja en `request.usuario`; invertidos no encuentra nada). Sin `@Roles()` la ruta queda como siempre: cualquier usuario autenticado. Con `@Roles('Admin','Owner')` responde `403`. El decorador toma **nombres** de `rols.name`, no ids — los ids ya tienen huecos por borrados y difieren entre entornos; el guard resuelve nombre por id contra la base y lo cachea en memoria. `ROLES_ADMINISTRACION` marca hoy `plan-cobros`, `cobros/:hito`, `archivar` y `reactivar`, y nada más: el resto de las rutas del flujo las puede llamar cualquier usuario logueado.
- **Two token types, two secrets.** `AuthService` signs the access token with the `LibModule` defaults (`JwtPayload = { sub, user, roleId }`) and the refresh token with `JWT_REFRESH_SECRET` and its own expiry (`RefreshPayload = { sub }`). `JwtService` in `src/lib/jwt` takes optional per-call `options` precisely so the refresh token can override secret and expiry.
- **Refresh re-reads the user from the database** on every call, so a role change or deactivation takes effect on the next refresh. It returns the same shape as login (`accessToken` + `user`), and the response body **never** contains the refresh token — `AuthService` returns `SesionCreada { respuesta, refreshToken }` and the controller peels the refresh token off into the cookie in `enviarSesion()`.
- **Cookie options** live in `auth.cookie.ts`: `httpOnly`, `path=/auth`, and `secure`/`sameSite` keyed off `NODE_ENV === 'production'`. `duracionAMs()` converts `"7d"`/`"12h"`/`"30m"` to the cookie `maxAge` so the cookie expires with the token.
- **CORS is not wide open.** `main.ts` sets `credentials: true`, which forbids `origin: '*'`; it therefore uses the `CORS_ORIGIN` list or reflects the request origin (`origin: true`). `cookie-parser` is installed globally in `main.ts` — without it `req.cookies` is undefined and every refresh 401s.
- **Reading the current user in a handler**: `@UsuarioActual()` (`feature/auth/decorators/usuario-actual.decorator.ts`) returns `request.usuario`, or one key of it — `@UsuarioActual('sub') actorId: number` is how every write in `ProjectsController` gets the id it stamps on the history row. It reads the guard's output, so on a `@Public()` route it is `undefined`; the service signatures take `actorId?` and fall back to `null` for that reason.
- **Known limits, both intencionales hasta hoy pero fáciles de pisar:**
  - El refresh token es stateless. El logout borra la cookie pero el JWT sigue siendo criptográficamente válido hasta que expira; no hay revocación del lado del servidor. No construyas nada que asuma que el logout lo invalida.
  - `UserController` no tiene `@Roles()` y `UpdateUserDto` es `PartialType(CreateUserDto)`: **cualquier usuario autenticado puede hacer `PATCH /user/:id` sobre cualquier id** y cambiar `password`, `roleId` o `active` — incluidos los de otro. Tampoco existe un "cambiar mi contraseña" que pida la actual. Si tocás ese módulo, tenelo presente.
- **Client-side contract**, since the doc that described it is gone: `POST /auth/login` and `POST /auth/refresh` both return `200` with `{ accessToken, user: { id, name, user, roleId, roleName } }`; `POST /auth/logout` returns **`204` with no body** and must not be `.json()`-parsed. All three are `@Public()` and all three need `credentials: 'include'` for the cookie. Failures are `401` (`Credenciales inválidas`, `Refresh token inválido o expirado`, `El usuario está desactivado`). A client should single-flight the refresh call and retry the original request once.

### Prisma

- Prisma 7 with the **`prisma-client` generator** (not `prisma-client-js`), output committed at `src/lib/generated/prisma` with `moduleFormat = "cjs"`. Import types and enums from `'../../lib/generated/prisma/client'`, never from `@prisma/client`. The `.gitignore` entry `/generated/prisma` is root-anchored and does not cover this path, so the generated client is checked in — regenerate and commit it after schema changes.
- `PrismaService` extends `PrismaClient` and constructs a `PrismaPg` **driver adapter** from `DATABASE_URL` (Prisma 7 requires an adapter). It does not implement `OnModuleInit`/`onModuleDestroy`.
- Schema uses `@map`/`@@map` throughout: Prisma camelCase fields map to snake_case columns and pluralized Spanish table names (`users`, `proyectos`, `usuarios_proyectos`). Enum values are also mapped (`Diseno` → `"Diseño"`, `AvanceDiseno` → `"Avance de Diseño"`, `DisenoFinalizado` → `"Diseño Finalizado"`, `ProyectoFinalizado` → `"Proyecto Finalizado"`, `Ecommerce` → `"E-commerce"`, `Personalizado` → `"personalizado"`). Always use the **Prisma-side** identifier in code (`estadoProyecto: 'Diseno'`), never the mapped database string.
- Six enums: `EstadoProyecto`, `HitoCobro`, `TipoProyecto`, `TipoRecordatorio`, `Tecnologia`, `Grupo`. `estadoPago` (`String @default("50%")`) sigue siendo texto libre a propósito pese a parecer categórico — se valida con `@IsString() @MaxLength(20)`, no con `@IsEnum`.
- Modelos alrededor de `Proyecto`: `Cobro` (un hito), `HistorialEtapa` (auditoría **y** estado, ver reactivación), `RecordatorioProyecto` (los cinco del flujo), `CotizacionAdicional`, y el join `UsuarioProyecto`. El modelo `Recordatorio` suelto es otra cosa: notas sin relación con proyectos, de antes del flujo.
- Los cuatro cascadean con el proyecto (`onDelete: Cascade`), pero `Proyecto` es **soft-deleted**, así que ese cascade en la práctica nunca dispara: un proyecto soft-deleted conserva cobros, historial, recordatorios y cotizaciones. `usuarioId` es `onDelete: SetNull` en historial, recordatorios y cotizaciones para que la traza sobreviva al borrado de un usuario.
- El soft-delete es por `deletedAt`. Every read in `ProjectsService` filters `where: { deletedAt: null }` and `remove()` sets the timestamp. Any new project query must do the same. Note `findOne` uses `findFirst`, not `findUnique`, because the soft-delete filter is not part of a unique constraint.
- `UsuarioProyecto` is an explicit many-to-many join table with a composite `@@id([usuarioId, proyectoId])`. `ProjectsService` selects it through a shared `proyectoInclude` constant (typed with `satisfies Prisma.ProyectoInclude`), derives payload types with `Prisma.ProyectoGetPayload`, and en `aplanar()` aplana `usuarios[].usuario` a un array plano **y agrega los dos campos calculados** (`responsable`, `diasEsperandoAlCliente`) que completan `ProyectoCompleto`. Toda ruta que devuelva un proyecto tiene que pasar por `aplanar()`, o la respuesta sale con otra forma.

### Recurring service patterns

Follow these when adding a resource — they are consistent across `rol`, `seguimiento`, `user`, `projects`, and `recordatorio`:

- Private `notFound(id)` returning a `NotFoundException` with a Spanish message.
- Private `rethrow(error, id): never` that converts `Prisma.PrismaClientKnownRequestError` code `P2025` into that `NotFoundException` and rethrows anything else. Used around `update`/`delete` in `rol`, `seguimiento`, `user` and `recordatorio`. **`ProjectsService` is the exception**: it has `notFound()` but no `rethrow()`, because every mutation starts with `await this.findOne(id)` (which already 404s on a missing *or* soft-deleted row) and then writes inside a `$transaction`. Follow the `findOne`-first shape there, not the `try/rethrow` one.
- Private `validarX()` helpers that pre-check foreign keys and throw `BadRequestException` ("El rol con id N no existe"), and `ConflictException` for uniqueness violations, para negarse a borrar una fila con dependientes (`RolService.remove` cuenta usuarios primero) y para **toda regla del flujo que no se cumple** (compuertas, transiciones, orden de los hitos). Regla práctica: `BadRequest` = el body está mal; `Conflict` = el body está bien pero el proyecto no está en condiciones.
- Passwords are never returned: queries use Prisma's `omit: { password: true }` (`sinPassword` constant in `UserService`) and `UserService` re-hashes with Argon2id on update when `password` is present. `AuthService` is the only place that selects `password`.

### Validation

- `main.ts` installs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, so any unknown property in a request body is a 400. Every DTO field therefore needs a `class-validator` decorator or it will be stripped/rejected.
- Update DTOs are `PartialType(CreateXDto)` from `@nestjs/mapped-types` — except `UpdateProjectDto`, which wraps `OmitType(...)` para sacar `planCobros`, `aprobadoPorJefatura` y `abonoInicialCobrado`: el plan solo se toca por su propia ruta.
- Nested DTOs (`ItemPlanCobrosDto` inside `planCobros`/`cobros`) need **both** `@ValidateNested({ each: true })` and `@Type(() => ...)` from `class-transformer`. That works even though the pipe has `transform: false`: the pipe still instantiates the class internally to validate, it just doesn't hand the transformed instance back to the handler.
- Enum fields validate against the generated Prisma enums (`@IsEnum(EstadoProyecto)`), and id arrays use `@IsArray() @ArrayUnique() @IsInt({ each: true })`.
- **The pipe has no `transform: true`**, so a DTO field arrives as whatever JSON type the client sent — conversion is the service's job. Two consequences, both already handled in `CreateProjectDto`: las fechas (`fechaEntrega`, `fechaCobro`) se tipan `string | null` con `@IsISO8601()` y `ProjectsService.aFecha()` las convierte a `Date`; `diasSinResponder` carries a `@Transform` that stringifies an incoming number, because the column is `String` and clients send `3` as often as `"3"`. Copy that pattern rather than turning the global pipe's `transform` on — that would change every existing endpoint at once.
- Distinguish "absent" from "null" in updates. `ProjectsService.update` spreads `fechaEntrega` and `usuariosIds` only when `!== undefined`, so omitting a key leaves it alone while sending `null`/`[]` clears it. Passing `usuariosIds` does a full replace (`deleteMany` then `create`); `POST /projects/:id/usuarios` is the additive path (`createMany` with `skipDuplicates`).

## Deployment (Railway / Docker)

`railway.json` forces `builder: DOCKERFILE` — Nixpacks is deliberately not used. The `Dockerfile` encodes four fixes that will break the deploy if undone; each has a comment above it:

- `FROM node:22` (not `-slim`): `argon2` is a native module and needs gcc/make/python3 when no prebuilt binary matches.
- pnpm is installed with `npm install -g pnpm@11.16.0`, **not corepack** — Railway's build-image corepack predates pnpm 10/11 and fails with `ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING`.
- `pnpm-workspace.yaml` is copied before install because its `allowBuilds` entries are what authorize `argon2` and `prisma` to run their build scripts.
- `pnpm install --frozen-lockfile --prod=false` — the build needs devDependencies (`@nestjs/cli`, `typescript`) even when the environment sets `NODE_ENV=production`.
- `EXPOSE 3000` is required: with a Dockerfile build, Railway infers the routed port from it and returns 502 without it.

`.nvmrc` pins Node 22 and `package.json` sets `engines.node >= 22.13`.

## TypeScript / lint notes

- `tsconfig.json` uses `module: nodenext`, `strictNullChecks: true` but `noImplicitAny: false` and no full `strict`.
- ESLint runs `recommendedTypeChecked` plus Prettier-as-a-rule, so formatting violations are lint **errors**. Prettier config: single quotes, trailing commas everywhere.
- `baseUrl: "./"` allows `src/...`-prefixed imports (used once in `rol.module.ts`), but the prevailing style is relative paths.

## Vendored skills

`.claude/skills/`, `.agents/skills/`, and `.windsurf/skills/` hold byte-identical copies of the same nine Prisma skill packs (tracked by `skills-lock.json`). If you edit or update one, mirror it to the other two.
