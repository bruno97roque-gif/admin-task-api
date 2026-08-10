# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

NestJS 11 REST API for managing web projects ("admin-proyecto"): projects, their pipeline state, the users assigned to them, roles, and follow-up (`seguimiento`) buckets. Persistence is PostgreSQL via Prisma 7. Package manager is **pnpm**. Deployed to Railway from a Dockerfile.

The domain vocabulary is Spanish (`proyecto`, `seguimiento`, `usuario`, `grupo`) and all user-facing error messages are in Spanish. Keep both conventions when adding code.

`README.md` is the untouched NestJS starter boilerplate — it contains nothing about this project. There is no other prose documentation: `docs/auth-contract.md` (the client-side contract for the auth/refresh flow) was deleted in commit `f7e6726`, so the code below is the only source of truth for the auth surface.

### Domain model in one paragraph

A `Proyecto` moves through `EstadoProyecto` (Registro → Brief → Taxonomia → Diseño → Desarrollo → Proyecto Finalizado, plus the terminal `Archivado`) and belongs to exactly one `Grupo`, which is what the dashboard queries slice on: **A** is the live production pipeline, **B** is blocked on the client, **C** has not paid *or is not responding*. That is why `GET /projects/programador` and `/projects/diseno` filter `grupo: 'A'` while `/projects/admin` returns `grupo: { in: ['B', 'C'] }` — the admin queue is by definition everything *not* in production. Users are attached many-to-many through `UsuarioProyecto`.

The three dashboard queries are **not** symmetric; read `ProjectsService` before assuming:

| Ruta | Filtro | Nota |
|---|---|---|
| `GET /projects/programador` | `grupo: 'A'`, `estadoProyecto notIn [ProyectoFinalizado, Archivado]` | con `?id=` matchea `desarrolladorId` **OR** la tabla `usuarios` — un dev ve tanto lo que tiene asignado en el registro como lo que le colgaron por el join |
| `GET /projects/diseno` | `grupo: 'A'`, `estadoProyecto: 'Diseno'` | además del grupo, filtra la etapa; con `?id=` matchea solo `disenadorId` |
| `GET /projects/admin` | `grupo: { in: ['B','C'] }`, `estadoProyecto not Archivado` | sigue incluyendo `ProyectoFinalizado` a propósito; lo archivado sale de la cola porque ya no se persigue |
| `GET /projects/archivados` | `estadoProyecto: 'Archivado'` | aparte, para que no ensucie la métrica |
| `GET /projects/por-archivar` | los que pasaron los 90 días sin moverse | ver la sección del flujo |

`Seguimiento` is the **third axis** and the easiest one to misread: it is not a stage and not a status, it is "what do I do with this client *today*". In the original spreadsheet the column is literally called «Acción de hoy», and its values are imperatives (`Congelar Hoy` = *go freeze this one*, not *this is frozen*). Keep that in mind before treating a seguimiento as a state.

`tablero-proyectos-websy_5.xlsx` at the repo root is the spreadsheet this API replaces. It is not a stray file — it is the only written spec of the business rules (sheets `Instrucciones` and `Reglas`), including the 15-day freeze rule and "GRUPO se calcula solo". Read it before guessing at domain behaviour; unzip it and parse `xl/sharedStrings.xml` + `xl/worksheets/sheet2.xml`.

### Grupo is derived from Seguimiento

`ProjectsService.grupoTrasCambioDeSeguimiento()` moves a project between groups on its own when the seguimiento changes. It steps **one level at a time**, evaluated against the group the project had *before* the change:

| Grupo actual | Nuevo seguimiento | Queda en |
|---|---|---|
| A | `PEDIR_INFO`, `CONGELAR_HOY`, `CONGELADO_15D` | B |
| B | `CONGELAR_HOY`, `CONGELADO_15D` | C |
| B or C | `TODO_BIEN` | A |

`CONGELAR_HOY` appearing in both of the first two rules is intentional, not a bug: a healthy project degrades A → B → C over two separate edits, never in one jump. Three guards suppress the move entirely — an explicit `grupo` in the request body (the manual escape hatch), a seguimiento that did not actually change, and `estadoProyecto === 'ProyectoFinalizado'` (a delivered project must not fall to C because someone touched its follow-up).

The rules key off **`Seguimiento.codigo`**, never `Seguimiento.name` or its id. `name` is editable through `PATCH /seguimiento/:id` and the ids already have gaps from earlier deletions, so either would break the automation silently. The valid codes live in `feature/seguimiento/seguimiento.codigos.ts` and are applied with `satisfies CodigoSeguimiento[]` so a typo fails the build. A seguimiento with `codigo: null` is perfectly valid — it just has no effect on the group.

> **Estado real (2026-08-09):** esta sección sigue siendo **un plan, no código**. Lo único que existe es la columna: `Seguimiento.codigo` (`String? @unique`, migración `20260805160000_add_codigo_seguimiento`), y no la lee ni la escribe nadie — `CreateSeguimientoDto` solo expone `name`, así que hoy ni siquiera se puede setear por la API. No existen `seguimiento.codigos.ts` ni `grupoTrasCambioDeSeguimiento()`. El grupo hoy se deriva de otra cosa (ver abajo); si algún día se implementa la automatización por seguimiento, hay que decidir cuál de las dos manda, porque ambas escribirían `grupo`.

### El flujo de proyectos (diagrama «Flujo de trabajo (mejorado).drawio»)

Las reglas de negocio confirmadas con el equipo viven en **`feature/projects/reglas/flujo.reglas.ts`**, como funciones puras sin acceso a la base: el servicio decide con ellas y ahí están los números (3 meses, 30%, 2 rondas, 25/50%) en un solo lugar. Cambiar una regla es cambiar esa constante, no cazar `if`s por el servicio.

- **`EstadoProyecto` tiene dos valores nuevos**: `Registro` (arranca el flujo: se crea el registro y se asignan diseñador y desarrollador) y `Archivado` (terminal, deliberadamente **distinto de `ProyectoFinalizado`** para que no se mezclen en la misma métrica). El default de la columna sigue siendo `Brief`; es `ProjectsService.create` el que usa `Registro` cuando el body no manda `estadoProyecto`.
- **Plan de cobros**: tabla `cobros`, una fila por hito (`AbonoInicial`, `AprobacionDiseno`, `Entrega`) con `porcentaje`, `cobrado` y `fechaCobro`. Los porcentajes los carga administración a mano; el sistema **no maneja montos en dinero**. `validarPlanDeCobros` exige que sumen 100 y que el abono inicial no baje de 30 — `aprobadoPorJefatura: true` es la única forma de saltarse el piso. `estadoPago` (texto libre, default `"50%"`) quedó intacto por compatibilidad, pero ya no es la fuente de verdad.
- **Todas las compuertas viven en `compuertasFaltantes()`**, que devuelve la lista de motivos por los que un proyecto no puede *entrar* a una etapa: el hito de cobro que la habilita (`hitoQueHabilita`: `Brief`, `Desarrollo`, `ProyectoFinalizado`), el material de marca antes de `Diseno`, y —antes de dar por entregado— hosting, subida a producción y capacitación. **Solo rigen para proyectos con plan de cobros cargado** (`estaEnFlujoNuevo`): sin esa condición los proyectos migrados, que tienen todos los booleanos nuevos en `false` por el default de la columna, se trabarían todos de golpe. Es el mismo criterio que ya usaban las compuertas de cobro, extendido al resto.
- **`transicionInvalida()` es la máquina de estados.** Se avanza de a una etapa por `ORDEN_ETAPAS`; se puede retroceder (el diagrama tiene varios «volver a presentar»); no se puede saltear hacia adelante. `Archivado` no se entra ni se sale con un `PATCH` — para eso están `POST /:id/archivar` y `/:id/reactivar`. El único salto legítimo es `Brief → Diseno`, y solo si el proyecto **no** es e-commerce.
- **`TipoProyecto` decide dos bifurcaciones**: `Informativa` saltea `Taxonomia`; `Ecommerce` la exige y además es el único que tiene catálogo y carga de productos (`aplicaCargaDeProductos`). Un proyecto con `tipoProyecto: null` (los 13 que venían así) no se fuerza a ninguna rama. El enum mapea los valores que ya había en la columna de texto: `Ecommerce @map("E-commerce")`.
- **El grupo se deriva** (`derivarGrupo`), ya no se manda a mano: falta el pago **o el hosting** → **C** (el hosting está dentro del Grupo C según la leyenda del diagrama); falta el material de marca → **B**; si lo único que falta es el catálogo de productos → sigue en **A**, porque el desarrollo no se detiene. Mandar `grupo` explícito en el body sigue siendo la salida manual. El hosting solo pesa en el tramo final (`hostingEsExigible` → únicamente en `Desarrollo`); antes de eso que no esté contratado no ensucia el grupo.
- **Bloqueos separados**: `material_marca_recibido` frena el diseño; `catalogo_recibido` frena solo la carga de productos. Por eso son dos columnas y no una.
- **Los cinco recordatorios** viven en `recordatorios_proyecto` (tabla nueva, distinta de `recordatorios`, que quedó como notas sueltas sin relación). `sincronizarRecordatorios()` mantiene **uno solo abierto por proyecto**: `recordatorioQueCorresponde()` decide cuál según lo que esté trabando (prioridad: cobro → hosting → material → catálogo) y cierra los demás. Un recordatorio abierto es lo que define «está esperando al cliente», y de ahí sale `diasEsperandoAlCliente` en la respuesta.
- **Archivado a los 3 meses** desde `fecha_ultimo_cambio_estado`, que **se reinicia en cada cambio de estado**. La API no archiva sola: `GET /projects/por-archivar` deja la lista y `POST /projects/:id/archivar` ejecuta. Esa query lista los que tienen un **recordatorio abierto** hace ≥90 días; los proyectos migrados, que no tienen recordatorios, caen a una rama de compatibilidad que exige además estar en Grupo B o C (antes entraba cualquier proyecto parado, incluso uno en Grupo A con desarrollo activo). Al reactivar, `porcentajeDeReactivacion` devuelve 25% (antes del año) o 50% (al año o después, y ahí se rehacen inicio y diseño).
- **`reactivar()` lee el historial para saber a qué etapa volver**: busca la última fila con `estadoNuevo: 'Archivado'` y usa su `estadoAnterior` (cae a `Brief` si no encuentra ninguna). O sea que `historial_etapas` **no es solo auditoría, es estado**: borrar filas o crear un `Archivado` a mano por fuera de `archivar()` rompe la reactivación en silencio.
- **Rondas de diseño**: `rondas_cambios_usadas` contra `RONDAS_CAMBIOS_INCLUIDAS = 2`. Agotadas **no se bloquea nada** — el equipo decidió que el sistema deja el proyecto como está y el caso se maneja internamente; `POST /projects/:id/rondas-cambio` solo devuelve `requiereCotizacionAdicional: true`.
- **Trazabilidad**: cada cambio de etapa, de grupo, de plan de cobros o de hito cobrado escribe una fila en `historial_etapas` con quién lo movió (`UsuarioActual('sub')`, del payload del token) y cuándo. Es la base de los KPIs. Toda escritura que toque estado o grupo va dentro de un `$transaction` junto con su fila de historial.

Las acciones del flujo son rutas propias, no un `PATCH` genérico — cada una valida su regla y deja su fila de historial:

| Ruta | Qué hace |
|---|---|
| `PUT /projects/:id/plan-cobros` | define o redefine los tres hitos (`upsert`; lo ya cobrado se respeta, solo cambia el `porcentaje`) y recalcula el grupo |
| `PATCH /projects/:id/cobros/:hito` | marca un hito cobrado o lo revierte (`:hito` con `ParseEnumPipe(HitoCobro)`) y recalcula el grupo |
| `POST /projects/:id/rondas-cambio` | suma una ronda y devuelve `ResumenRondas` |
| `POST /projects/:id/archivar` | 409 si ya está archivado o si está finalizado |
| `POST /projects/:id/reactivar` | 409 si no está archivado; devuelve `ResumenReactivacion` |
| `GET /projects/:id/historial` | las filas de `historial_etapas`, ascendentes |

`recalcularGrupo()` es el helper compartido por las dos rutas de cobro: relee el proyecto, deriva el grupo y **se corta temprano si el estado es terminal** (`esEstadoTerminal`) o si el grupo no cambió, para no llenar el historial de filas iguales. `UpdateProjectDto` es `PartialType(OmitType(CreateProjectDto, ['planCobros']))` justamente porque el plan no se toca por `PATCH`.

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

Prisma has no package.json scripts — invoke the CLI directly. `prisma.config.ts` loads `.env` via `dotenv/config`, points at `prisma/schema.prisma` (migrations in `prisma/migrations`: `_init`, `_add_fecha_entrega_proyecto`, `_add_tipo_proyecto`, `_add_codigo_seguimiento`, `_flujo_proyectos_registro_cobros_historial`), and — Prisma 7 style — supplies `datasource.url` from `process.env.DATABASE_URL`. The `datasource db` block in the schema therefore has **no `url` field**; do not add `url = env("DATABASE_URL")` back to it.

```bash
pnpm exec prisma migrate dev --name <name>
pnpm exec prisma generate       # regenerates src/lib/generated/prisma
pnpm exec prisma studio
```

### Verification

`src/feature/projects/reglas/flujo.reglas.spec.ts` cubre las reglas de negocio puras (43 tests: cobros, grupos, transiciones, compuertas, recordatorios, archivado y reactivación). Es el único suite; `pnpm test:e2e` sigue apuntando a `./test/jest-e2e.json`, que no existe.

El `jest` de `package.json` necesita `moduleNameMapper: {"^(\\.{1,2}/.*)\\.js$": "$1"}` — el cliente generado por Prisma 7 importa con extensión `.js` al estilo nodenext y sin ese mapeo todo el suite falla con `Cannot find module './internal/class.js'`.

Además de los tests, la verificación disponible es `pnpm exec tsc --noEmit`, `pnpm lint`, and booting the app: Nest logs a `[RouterExplorer] Mapped {...} route` line per endpoint at startup, which confirms both registration and route ordering. Pass `PORT=<free port>` if a dev server already holds 3000.

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

Controllers are thin: they parse `:id` with `ParseIntPipe` and delegate. All business rules, existence checks, and error throwing live in services.

When scaffolding with `nest g resource`, the generator leaves an empty `CreateXDto {}` and stub service methods that return strings. The empty DTO is a trap: with the global `forbidNonWhitelisted` pipe (below) it makes every request body a 400 until the fields are filled in. The generated controller also emits lines over Prettier's print width, which are lint **errors** here — run `pnpm exec eslint src/feature/<name> --fix` after generating. New routes are protected by default (see Auth), so decide deliberately whether the resource needs `@Public()`.

### Routing (Express 5)

Nest 11 runs on Express 5 (`express@5.2.1`, `path-to-regexp@8`), which changes two things worth knowing before adding routes:

- **Optional route params (`@Get('x/:id?')`) are gone** — path-to-regexp v8 removed the `?` suffix and the app throws at boot. For an optional value use a query param instead, as `GET /projects/programador` does with `@Query('id', new ParseIntPipe({ optional: true }))`.
- **Static segments must be declared before `:id`.** `ProjectsController` puts `@Get('programador')`, `@Get('diseno')` and `@Get('admin')` above `@Get(':id')`; reversed, Express matches `programador` as an id and the request never reaches the intended handler (`ParseIntPipe` 400s instead). There is a comment on those routes saying so — keep it, and add any new static project route above `:id` too.

Do **not** add a global prefix (`app.setGlobalPrefix`) casually: the refresh cookie is scoped to `Path=/auth`, so moving auth under `/api/auth` silently stops the browser from sending it. `COOKIE_PATH` in `auth.cookie.ts` would have to change with it.

### Auth

Fully wired — access token in the `Authorization` header, refresh token in an httpOnly cookie.

- **Global guard.** `AppModule` registers `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, so **every route is protected by default**. `JwtAuthGuard` (`feature/auth/guards/`) reads `Bearer` from the `Authorization` header, verifies it with the access-token secret, and assigns the payload to **`request.usuario`** (Spanish, not `request.user`). Opt out with `@Public()` (`feature/auth/decorators/public.decorator.ts`), which sets the `isPublic` metadata the guard checks via `Reflector.getAllAndOverride` — it works on a handler or a whole controller.
- **Public routes are only** `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`. Everything else 401s without a token.
- **Segundo guard global: `RolesGuard`**, registrado en `AppModule` **después** de `JwtAuthGuard` (lee el `roleId` que aquel deja en `request.usuario`; invertidos no encuentra nada). Sin `@Roles()` la ruta queda como siempre: cualquier usuario autenticado. Con `@Roles('Admin','Owner')` responde `403`. El decorador toma **nombres** de `rols.name`, no ids — los ids ya tienen huecos por borrados y difieren entre entornos; el guard resuelve nombre por id contra la base y lo cachea en memoria. `ROLES_ADMINISTRACION` marca hoy `plan-cobros`, `cobros/:hito`, `archivar` y `reactivar`.
- **Two token types, two secrets.** `AuthService` signs the access token with the `LibModule` defaults (`JwtPayload = { sub, user, roleId }`) and the refresh token with `JWT_REFRESH_SECRET` and its own expiry (`RefreshPayload = { sub }`). `JwtService` in `src/lib/jwt` takes optional per-call `options` precisely so the refresh token can override secret and expiry.
- **Refresh re-reads the user from the database** on every call, so a role change or deactivation takes effect on the next refresh. It returns the same shape as login (`accessToken` + `user`), and the response body **never** contains the refresh token — `AuthService` returns `SesionCreada { respuesta, refreshToken }` and the controller peels the refresh token off into the cookie in `enviarSesion()`.
- **Cookie options** live in `auth.cookie.ts`: `httpOnly`, `path=/auth`, and `secure`/`sameSite` keyed off `NODE_ENV === 'production'`. `duracionAMs()` converts `"7d"`/`"12h"`/`"30m"` to the cookie `maxAge` so the cookie expires with the token.
- **CORS is not wide open.** `main.ts` sets `credentials: true`, which forbids `origin: '*'`; it therefore uses the `CORS_ORIGIN` list or reflects the request origin (`origin: true`). `cookie-parser` is installed globally in `main.ts` — without it `req.cookies` is undefined and every refresh 401s.
- **Reading the current user in a handler**: `@UsuarioActual()` (`feature/auth/decorators/usuario-actual.decorator.ts`) returns `request.usuario`, or one key of it — `@UsuarioActual('sub') actorId: number` is how every write in `ProjectsController` gets the id it stamps on the history row. It reads the guard's output, so on a `@Public()` route it is `undefined`; the service signatures take `actorId?` and fall back to `null` for that reason.
- **Known limit:** the refresh token is stateless. Logout clears the cookie but the JWT stays cryptographically valid until it expires; there is no server-side revocation. Don't build anything that assumes logout invalidates it.
- **Client-side contract**, since the doc that described it is gone: `POST /auth/login` and `POST /auth/refresh` both return `200` with `{ accessToken, user: { id, name, user, roleId, roleName } }`; `POST /auth/logout` returns **`204` with no body** and must not be `.json()`-parsed. All three are `@Public()` and all three need `credentials: 'include'` for the cookie. Failures are `401` (`Credenciales inválidas`, `Refresh token inválido o expirado`, `El usuario está desactivado`). A client should single-flight the refresh call and retry the original request once.

### Prisma

- Prisma 7 with the **`prisma-client` generator** (not `prisma-client-js`), output committed at `src/lib/generated/prisma` with `moduleFormat = "cjs"`. Import types and enums from `'../../lib/generated/prisma/client'`, never from `@prisma/client`. The `.gitignore` entry `/generated/prisma` is root-anchored and does not cover this path, so the generated client is checked in — regenerate and commit it after schema changes.
- `PrismaService` extends `PrismaClient` and constructs a `PrismaPg` **driver adapter** from `DATABASE_URL` (Prisma 7 requires an adapter). It does not implement `OnModuleInit`/`onModuleDestroy`.
- Schema uses `@map`/`@@map` throughout: Prisma camelCase fields map to snake_case columns and pluralized Spanish table names (`users`, `proyectos`, `usuarios_proyectos`). Enum values are also mapped (`Diseno` → `"Diseño"`, `ProyectoFinalizado` → `"Proyecto Finalizado"`, `Personalizado` → `"personalizado"`). Always use the **Prisma-side** identifier in code (`estadoProyecto: 'Diseno'`), never the mapped database string.
- Four enums exist — `EstadoProyecto`, `HitoCobro`, `Tecnologia`, `Grupo`. `estadoPago` (`String @default("50%")`) and `tipoProyecto` (`String?`) are deliberately free-text despite looking categorical; they are validated with `@IsString() @MaxLength(...)`, not `@IsEnum`.
- `Cobro` and `HistorialEtapa` cascade on project delete (`onDelete: Cascade`), but `Proyecto` is soft-deleted, so in practice that cascade never fires — a soft-deleted project keeps its cobros and its history. `HistorialEtapa.usuarioId` is `onDelete: SetNull` so the trail survives deleting a user.
- `Proyecto` is **soft-deleted** via `deletedAt`. Every read in `ProjectsService` filters `where: { deletedAt: null }` and `remove()` sets the timestamp. Any new project query must do the same. Note `findOne` uses `findFirst`, not `findUnique`, because the soft-delete filter is not part of a unique constraint.
- `UsuarioProyecto` is an explicit many-to-many join table with a composite `@@id([usuarioId, proyectoId])`. `ProjectsService` selects it through a shared `proyectoInclude` constant (typed with `satisfies Prisma.ProyectoInclude`), derives payload types with `Prisma.ProyectoGetPayload`, and flattens `usuarios[].usuario` into a plain `usuarios[]` array in a private `aplanar()` helper before returning.

### Recurring service patterns

Follow these when adding a resource — they are consistent across `rol`, `seguimiento`, `user`, `projects`, and `recordatorio`:

- Private `notFound(id)` returning a `NotFoundException` with a Spanish message.
- Private `rethrow(error, id): never` that converts `Prisma.PrismaClientKnownRequestError` code `P2025` into that `NotFoundException` and rethrows anything else. Used around `update`/`delete` in `rol`, `seguimiento`, `user` and `recordatorio`. **`ProjectsService` is the exception**: it has `notFound()` but no `rethrow()`, because every mutation starts with `await this.findOne(id)` (which already 404s on a missing *or* soft-deleted row) and then writes inside a `$transaction`. Follow the `findOne`-first shape there, not the `try/rethrow` one.
- Private `validarX()` helpers that pre-check foreign keys and throw `BadRequestException` ("El rol con id N no existe"), and `ConflictException` for uniqueness violations or refusing to delete a row that still has dependents (`RolService.remove` counts users first).
- Passwords are never returned: queries use Prisma's `omit: { password: true }` (`sinPassword` constant in `UserService`) and `UserService` re-hashes with Argon2id on update when `password` is present. `AuthService` is the only place that selects `password`.

### Validation

- `main.ts` installs a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`, so any unknown property in a request body is a 400. Every DTO field therefore needs a `class-validator` decorator or it will be stripped/rejected.
- Update DTOs are `PartialType(CreateXDto)` from `@nestjs/mapped-types` — except `UpdateProjectDto`, which wraps `OmitType(..., ['planCobros'])` so the plan can only be set through its own route.
- Nested DTOs (`ItemPlanCobrosDto` inside `planCobros`/`cobros`) need **both** `@ValidateNested({ each: true })` and `@Type(() => ...)` from `class-transformer`. That works even though the pipe has `transform: false`: the pipe still instantiates the class internally to validate, it just doesn't hand the transformed instance back to the handler.
- Enum fields validate against the generated Prisma enums (`@IsEnum(EstadoProyecto)`), and id arrays use `@IsArray() @ArrayUnique() @IsInt({ each: true })`.
- **The pipe has no `transform: true`**, so a DTO field arrives as whatever JSON type the client sent — conversion is the service's job. Two consequences, both already handled in `CreateProjectDto`: `fechaEntrega` is typed `string | null` with `@IsISO8601()` and `ProjectsService.aFecha()` turns it into a `Date`; `diasSinResponder` carries a `@Transform` that stringifies an incoming number, because the column is `String` and clients send `3` as often as `"3"`. Copy that pattern rather than turning the global pipe's `transform` on — that would change every existing endpoint at once.
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
