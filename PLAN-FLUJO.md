# Plan de trabajo — API vs. «Flujo de trabajo (mejorado).drawio»

> ## ✅ Estado de ejecución (2026-08-09) — rama `feat/flujo-completo`
>
> **Etapas 1 a 6 implementadas.** `pnpm exec tsc --noEmit` limpio, `pnpm lint` limpio,
> **43 tests pasando**, la app levanta y mapea las 23 rutas de `/projects` en el orden
> correcto.
>
> **La migración NO se aplicó.** El SQL está en
> `prisma/migrations/20260809120000_flujo_fase1_fase2_completo/migration.sql`, escrito a
> mano y sin ejecutar contra la base de producción. Aplicalo vos con
> `pnpm exec prisma migrate deploy` cuando quieras. Ver §7.
>
> Quedan pendientes solo los puntos marcados como **decisión del equipo** en §5.

Comparación nodo por nodo entre el diagrama y lo implementado en `admin-proyecto-api`.
Fecha del análisis: **2026-08-09** · Diagrama: `id="flujo-websy-v4"` (7 ago 2026).

> Nota de alcance: se comparó contra el árbol de trabajo **sin commitear** (la rama tiene
> todo el trabajo de cobros/historial/archivado todavía en `git status` como modificado).
> `pnpm exec tsc --noEmit` pasa limpio.

---

## 1. Resumen en una línea

**La columna vertebral de la Fase 1 funciona, pero sus ramas y compuertas no; la Fase 2
está a medias y todo el tramo final no existe.** Lo que está hecho está bien hecho: las reglas de negocio duras
(cobros, grupos, archivado, reactivación, historial) ya están aisladas en
`reglas/flujo.reglas.ts` y son correctas. Lo que falta es, sobre todo, **recorrido**:
desde «Presentación de la web al cliente» hasta «Capacitación» no hay nada, y **el
hosting no existe en ninguna parte del código**.

| | Nodos del diagrama | Estado |
|---|---|---|
| ✅ Completo | 13 | Registro, brief, diseño, cobros, grupos, archivado, reactivación, rondas, historial |
| ⚠️ Parcial | 6 | Tipo de proyecto, taxonomía, catálogo, cotizaciones, reactivación (no cobra) |
| ❌ Falta | 11 | Hosting, producción, capacitación, observaciones, factibilidad, aprobación de diseño, los 5 recordatorios |

---

## 2. Lo que YA está implementado

Esto no hay que tocarlo, sirve como base:

| Nodo | Dónde |
|---|---|
| `A0` Registro del proyecto | `EstadoProyecto.Registro`, default en `ProjectsService.create` |
| `A0` Diseñador y desarrollador asignados | `disenadorId` / `desarrolladorId` + `validarAsignados()` |
| `A0` Plan de cobros (3 hitos, suman 100, piso 30%) | `PUT /projects/:id/plan-cobros` + `validarPlanDeCobros()` |
| `A2` Brief | `EstadoProyecto.Brief` + compuerta `AbonoInicial` |
| `A6` ¿Material de marca? (solo el cambio de grupo) | `materialMarcaRecibido` → `derivarGrupo()` → **B** |
| `A8` Diseño | `EstadoProyecto.Diseno` |
| `A9b` ¿Quedan rondas? | `POST /:id/rondas-cambio`, `RONDAS_CAMBIOS_INCLUIDAS = 2`, no bloquea |
| `B1` ¿Cobrado aprobación de diseño? | `hitoQueHabilita(Desarrollo)` |
| `B3` Desarrollo | `EstadoProyecto.Desarrollo` |
| `B9` ¿Cobrado entrega? | `hitoQueHabilita(ProyectoFinalizado)` |
| `B15` Fin · Entregado | `EstadoProyecto.ProyectoFinalizado` |
| `AR` → Archivado (3 meses) | `DIAS_PARA_ARCHIVAR = 90`, `GET /por-archivar`, `POST /:id/archivar` |
| Reactivación 25% / 50% | `porcentajeDeReactivacion()`, `estadoAlReactivar()` |
| Grupo automático | `derivarGrupo()`: pago → C, material → B, catálogo → sigue en A |
| Trazabilidad | `historial_etapas` + `@UsuarioActual('sub')`, todo en `$transaction` |

---

## 3. Lo que FALTA — por prioridad

### 🔴 P1 · Bloqueantes: el diagrama no se puede recorrer entero

**1. El hosting no existe.** Es el gap más grande. El diagrama tiene
`B11 ¿Contrató el hosting?` → `B12 Recordatorio · pasa a Grupo C` → puede archivar, y la
leyenda dice explícitamente que el Grupo C *«incluye la contratación del hosting»*.
En el código no hay columna, ni compuerta, ni entra en `derivarGrupo()`.
Verificado: `grep -i hosting src/` no devuelve nada.

**2. Todo el tramo final del diagrama no existe** (`B4` → `B15`):
- `B4` Presentación de la web al cliente
- `B5` ¿El cliente tiene observaciones?
- `B6` ¿Están dentro del alcance? → `B7` corregir / `B8` cotización adicional
- `B13` Subir a producción
- `B14` Capacitación al cliente

Hoy un proyecto salta de `Desarrollo` directo a `ProyectoFinalizado` con un `PATCH`.
Las observaciones de la web (`B5`–`B8`) **no son lo mismo** que las rondas de diseño
(`A9b`): `registrarRondaDeCambios` cubre solo el ciclo de diseño.

**3. Los 5 recordatorios no existen como tales.** El diagrama define cinco (material de
marca, catálogo, cobro de aprobación de diseño, cobro de entrega, hosting) y los hace
desembocar todos en Archivado por el conector `AR`. La tabla `recordatorios` que hay hoy
es un CRUD suelto (`descripcion` + `estado` booleano) **sin `proyectoId` y sin tipo**: no
está conectada al flujo.

**3-bis. Ninguna compuerta que no sea de cobro bloquea de verdad.** La única validación
que frena un cambio de etapa es `verificarCompuertaDeCobro()`, y solo mira `cobros`. O
sea: **falta el material de marca y el proyecto igual puede pasar a `Diseno`** — cae a
Grupo B, pero avanza. Lo mismo con el catálogo y el hosting. Los ciclos de reintento ⟳
del diagrama (`A6→A7→A6`, `C1→C2→C1`, `B11→B12→B11`), que son los que impiden avanzar
hasta que se cumpla la condición, hoy no existen: el grupo cambia de color pero nadie
frena nada.

**4. `GET /projects/por-archivar` da falsos positivos.** El diagrama dice archivar a los
3 meses **sin respuesta del cliente, previo recordatorio**. La query actual lista
*cualquier* proyecto no terminal con 90 días sin cambiar de estado — incluye proyectos en
Grupo A, en desarrollo activo, donde la pelota está en Websy. Depende del punto 3 para
arreglarse bien (filtrar por recordatorio abierto / Grupo B-C).

### 🟠 P2 · Reglas que el diagrama define y el código no aplica

**5. `¿Tipo de proyecto?` (`A3`) no bifurca nada.** `tipoProyecto` es `String?` de texto
libre. El diagrama lo usa para dos decisiones reales:
- Informativa → salta taxonomía (`A4a → A6`); E-commerce → pasa por taxonomía (`A4b → A5 → A6`)
- La carga de productos (`C1`–`C3`) es **solo e-commerce** (`eB3C1L`: «en paralelo · solo e-commerce»)

Sin un valor confiable no se puede decidir ninguna de las dos.

**6. `Taxonomia` está en el enum pero ninguna regla la usa.** No hay compuerta ni
bifurcación; es un estado al que se llega solo si alguien lo escribe a mano.

**7. `catalogoRecibido` es un campo muerto.** `derivarGrupo()` lo recibe en
`EntradaDerivarGrupo` pero **el cuerpo de la función nunca lo lee**. Que el catálogo no
cambie el grupo es correcto (el diagrama dice que sigue en A), pero hoy tampoco dispara
el recordatorio `C2` ni bloquea `C3 Carga de productos` — que no existe.

**8. No se registra la aprobación del diseño (`A9`) ni la factibilidad (`F1`).** Se
cuentan las rondas de cambios, pero no queda registro de que el cliente aprobó. La
revisión de factibilidad no bloquea (así lo dice el diagrama), pero es un paso con
responsable que hoy no se puede auditar.

**9. Las cotizaciones adicionales (`A10c`, `B8`) no se registran.**
`registrarRondaDeCambios` devuelve `requiereCotizacionAdicional: true` y nada más.

**10. La reactivación no genera cobro.** `reactivar()` calcula y devuelve el 25%/50%
correctamente, pero no crea ninguna fila en `cobros` ni ajusta el plan. El diagrama dice
«el cliente paga de nuevo y reingresa al flujo».

### 🟡 P3 · Robustez

**11. No hay máquina de estados.** `PATCH /projects/:id` acepta cualquier
`estadoProyecto`. Un proyecto sin plan de cobros puede saltar de `Registro` a
`ProyectoFinalizado` en una sola llamada: las compuertas solo se aplican si hay filas en
`cobros` (eso es intencional, por los proyectos viejos), pero el **orden** de las etapas
no se valida nunca.

**12. No hay permisos por rol.** El diagrama asigna responsable a cada etapa
(«administración», «diseñador asignado», «desarrollador asignado») y dice que los
porcentajes «los carga administración a mano». Hoy `JwtAuthGuard` solo verifica que haya
token: **cualquier usuario autenticado puede definir el plan de cobros, marcar hitos
cobrados y archivar proyectos**. No existe `@Roles()` ni `RolesGuard`.

**13. El «responsable» no se deriva.** La leyenda dice que no se elige a mano, se
desprende de la etapa (y que Grupo B o C → vuelve a administración). No hay tal cálculo.

**14. `diasSinResponder` es texto libre y manual.** Debería salir del recordatorio
abierto / `fechaUltimoCambioEstado`, no cargarse a dedo.

**15. Detalles menores:**
- El default de la columna `estado_proyecto` sigue siendo `Brief`; solo `create()` usa
  `Registro`. Una inserción por fuera del servicio queda inconsistente.
- `archivar()` y `reactivar()` cambian de estado sin pasar por `verificarCompuertaDeCobro()`.
- `conservaLoAbonado()` solo se usa para redactar el texto del historial; no marca nada.

---

## 3-bis. Detalle: qué falta en la **FASE 1** (Registro, Brief, Información y Diseño)

Los 16 nodos del contenedor `faseA`, uno por uno:

| Nodo | Estado | Qué falta |
|---|---|---|
| `A1` Inicio | ✅ | — |
| `A0` Registro del proyecto | ⚠️ | Ver los dos huecos de abajo |
| `A2` Brief | ✅ | Compuerta `AbonoInicial` aplicada en `update()` |
| `A3` ¿Tipo de proyecto? | ❌ | `tipoProyecto` es `String?` libre: la decisión no existe |
| `A4a` Web informativa | ❌ | No bifurca (debería saltar taxonomía) |
| `A4b` E-commerce | ❌ | No bifurca (debería exigir taxonomía) |
| `A5` Definir taxonomía | ⚠️ | El estado existe en el enum, pero **ninguna regla lo usa**: no se exige ni se saltea |
| `A6` ¿Material de marca? | ⚠️ | Cambia el grupo a B, pero **no bloquea el paso a `Diseno`** |
| `A7` Recordatorio material | ❌ | No existe el recordatorio ni el ciclo ⟳ de reintento |
| `A8` Diseño | ✅ | — |
| `F1` Revisión de factibilidad | ❌ | No existe (no bloquea, pero es un paso auditable) |
| `A9` ¿Aprobó el diseño? | ❌ | La aprobación del cliente no se registra en ninguna parte |
| `A9b` ¿Quedan rondas? | ✅ | `RONDAS_CAMBIOS_INCLUIDAS = 2` |
| `A10` Aplicar cambios | ✅ | Implícito: el proyecto se queda en `Diseno`, que es el ciclo correcto |
| `A10c` Cotización adicional | ⚠️ | Solo devuelve `requiereCotizacionAdicional: true`; no se registra la cotización |
| `XA1`/`A11` AR y conector | ✅ | `POST /:id/archivar` (manual, a propósito) |

**Cuenta: 6 completos · 5 parciales · 5 faltantes.**

Los dos huecos de `A0 Registro del proyecto`, que no se ven desde afuera:

1. **`create()` no verifica compuertas de cobro.** `verificarCompuertaDeCobro()` solo se
   llama desde `update()`. Un `POST /projects` con `estadoProyecto: 'Desarrollo'` crea el
   proyecto ahí directamente, con el plan cargado y ningún hito cobrado. La compuerta
   `A0 → A2` se saltea creando el proyecto ya pasado.
2. **No se puede registrar un abono inicial menor al 30% al crear.** `create()` llama
   `this.validarPlan(planCobros, false)` con el flag **hardcodeado en `false`**, y
   `CreateProjectDto` no expone `aprobadoPorJefatura`. El caso que el diagrama contempla
   (proyectos que arrancan con 30% con visto bueno de jefatura) obliga hoy a crear el
   proyecto y después corregirlo con `PUT /:id/plan-cobros`.

Aparte, «se registra el abono inicial» del nodo `A0` son hoy **dos llamadas**: el `POST`
crea los cobros siempre con `cobrado: false` (`ItemPlanCobrosDto` no tiene ese campo), así
que hay que marcarlo después con `PATCH /:id/cobros/AbonoInicial`.

---

## 4. Plan de trabajo

Orden pensado para que cada etapa deje algo usable y no se pise con la anterior.

### Etapa 1 — Cerrar el recorrido de la Fase 2 🔴
*Objetivo: que un proyecto pueda ir de Desarrollo a Entregado pasando por donde dice el diagrama.*

- [ ] **Decisión previa (ver §5):** ¿los pasos `B4`–`B14` son estados nuevos o flags dentro de `Desarrollo`?
- [x] Migración: `hosting_contratado Boolean @default(false)` en `proyectos`.
- [x] `derivarGrupo()`: agregar hosting pendiente → **Grupo C** (junto con el pago).
- [x] Compuerta de hosting: no se puede pasar a producción / `ProyectoFinalizado` sin hosting contratado.
- [x] Migración con el checklist del tramo final: `presentado_at`, `subido_produccion_at`, `capacitacion_at`.
- [x] `POST /projects/:id/observaciones` — registra observaciones y si están dentro del alcance (`B5`/`B6`); fuera del alcance marca cotización adicional y **el proyecto igual continúa** hacia el cobro de entrega (`eB89L`).
- [x] Cada paso escribe su fila en `historial_etapas`, dentro de `$transaction`, como el resto.

### Etapa 2 — Recordatorios de verdad 🔴
*Objetivo: que los 5 recordatorios del diagrama existan y que el archivado sea confiable.*

- [x] Modelo nuevo `RecordatorioProyecto`: `proyectoId`, `tipo` (enum de los 5), `fechaEnvio`, `resueltoAt`.
- [ ] Decidir qué se hace con la tabla `recordatorios` actual (¿se migra, se deja como notas sueltas?).
- [x] Abrir/cerrar recordatorio automáticamente al cambiar `materialMarcaRecibido`, `catalogoRecibido`, los hitos de cobro y el hosting.
- [x] Reescribir `findPorArchivar()`: solo proyectos **con recordatorio abierto hace ≥ 90 días**, no cualquiera parado.
- [x] `diasSinResponder` pasa a calcularse desde el recordatorio abierto.

### Etapa 3 — Cerrar la Fase 1: bifurcaciones y compuertas 🟠
- [x] Enum `TipoProyecto { Informativa, Ecommerce }` (hoy es `String?` libre) + migración de los datos que ya existen.
- [x] Informativa salta `Taxonomia`; e-commerce la exige antes de `Diseno`.
- [x] `C1`–`C3` (catálogo y carga de productos) solo aplican a e-commerce: flag `productos_cargados` y bloqueo de ese paso —y solo de ese paso— cuando falta el catálogo.
- [x] **Compuerta de material de marca**: bloquear el paso a `Diseno` si `materialMarcaRecibido === false` (hoy solo cambia el grupo). Generalizar `verificarCompuertaDeCobro()` a una `verificarCompuertas()` que cubra cobro + material + hosting.
- [x] `create()` pasa por las mismas compuertas que `update()` cuando el body manda un `estadoProyecto` adelantado.
- [x] Exponer `aprobadoPorJefatura` en `CreateProjectDto` y dejar de hardcodear `false` en `create()`.
- [x] Permitir marcar el abono inicial como cobrado en el mismo `POST /projects` (nodo `A0`), en vez de exigir una segunda llamada.
- [x] Registrar la aprobación del diseño (`A9`) y la revisión de factibilidad (`F1`, no bloqueante).

### Etapa 4 — Máquina de estados y permisos 🟡
- [x] `transicionValida(desde, hacia)` en `flujo.reglas.ts`, con las aristas del diagrama; `update()` la consulta.
- [x] `RolesGuard` + `@Roles()`: cobros y archivado solo para administración.
- [x] `responsableDe(estado, grupo)` derivado (Grupo B/C → administración).
- [x] Que `archivar()` / `reactivar()` pasen por las mismas validaciones que `update()`.

### Etapa 5 — Cierre de detalles 🟡
- [x] Modelo de cotizaciones adicionales (`A10c`, `B8`).
- [ ] La reactivación genera su cobro.
- [ ] Cambiar el default de la columna `estado_proyecto` a `Registro`.

### Etapa 6 — Verificación
No hay tests en el repo (`pnpm test:e2e` apunta a un `test/jest-e2e.json` que no existe).
Las reglas de `flujo.reglas.ts` son funciones puras sin base de datos: son el lugar
barato para empezar.

- [x] `flujo.reglas.spec.ts` — cobros, grupos, archivado, reactivación, transiciones.
- [x] Mientras tanto, la verificación disponible sigue siendo `pnpm exec tsc --noEmit`, `pnpm lint` y levantar la app mirando las líneas `[RouterExplorer] Mapped {...}`.

---

## 5. Decisiones que hay que confirmar con el equipo

No las puedo resolver leyendo el diagrama; cambian bastante el diseño:

1. **¿`B4`–`B14` son estados o checklist?** El diagrama **no** les asigna `estadoProyecto`
   (solo `B15` lo tiene) → sugiere que son sub-pasos dentro de `Desarrollo`, o sea flags.
   *Recomendación:* flags/timestamps, no estados nuevos: agregar valores al enum
   `EstadoProyecto` ensucia las métricas por etapa y obliga a migrar los proyectos vivos.
2. **¿Quién marca el hosting como contratado?** ¿Administración, o sale de un dato externo?
3. **¿La cotización adicional se cobra por el mismo plan de cobros o va aparte?** Hoy el
   plan es exactamente 3 hitos fijos (`ArrayMinSize(3)`/`ArrayMaxSize(3)`); una cotización
   extra no entra sin romper `validarPlanDeCobros`.
4. **Al archivar, ¿el sistema tiene que revertir los cobros** cuando «lo abonado se
   pierde», o es solo una regla contable que se maneja afuera? Hoy no toca nada.
5. **Automatización por seguimiento:** en `CLAUDE.md` sigue documentada una regla vieja
   (grupo derivado del `Seguimiento.codigo`) que **no está implementada**, y ahora el grupo
   se deriva del pago/material. Ambas escribirían `grupo`. Hay que decidir si esa idea se
   descarta formalmente o cuál manda.
6. **¿La aprobación del cliente en `A9` necesita quedar registrada** para auditoría, o
   alcanza con que avance de etapa?

---

## 6. Referencia rápida del flujo (extraído del diagrama)

```
Inicio → Registro → Brief → ¿Tipo?
                              ├─ Informativa ─────────────┐
                              └─ E-commerce → Taxonomía ──┤
                                                          ↓
                              ¿Material de marca? ──No──→ Recordatorio (Grupo B) ⟳ / AR
                                       │Sí
                                       ↓
                              Diseño → Factibilidad → ¿Aprobó?
                                 ↑                       │No → ¿Rondas? ──No──→ Cotización
                                 └── Aplicar cambios ←────┘Sí                        │
                                                          │Sí                        ↓
                                                          ↓                    Aplicar cambios
                              ¿Cobrado aprob. diseño? ──No──→ Recordatorio (Grupo C) ⟳ / AR
                                       │Sí
                                       ↓
                              Desarrollo ──en paralelo (solo e-commerce)──→ ¿Catálogo?
                                       │                                        │No → Recordatorio (sigue en A) ⟳ / AR
                                       │                                        │Sí → Carga de productos ─┐
                                       ↓                                                                  ↓
                              Presentación de la web ←──────────────────────────────────────────────────┘
                                       ↓
                              ¿Observaciones? ──Sí──→ ¿Dentro del alcance? ──Sí──→ Corregir → (volver a presentar)
                                       │No                                    └──No──→ Cotización adicional
                                       ↓                                                        │
                              ¿Cobrado entrega? ──No──→ Recordatorio (Grupo C) ⟳ / AR ←─────────┘
                                       │Sí
                                       ↓
                              ¿Contrató hosting? ──No──→ Recordatorio (Grupo C) ⟳ / AR
                                       │Sí
                                       ↓
                              Subir a producción → Capacitación → Fin · Entregado

AR (cualquier recordatorio, 3 meses sin respuesta) → Archivado → Reactivación (25% / 50%)
```

**Leyenda:** ⟳ = ciclo de reintento (el proyecto no avanza hasta que se cumpla la
condición) · AR = salida a archivado.

---

## 7. Cómo aplicar la migración (pendiente, la base es de producción)

La migración **no se ejecutó**. El SQL está escrito a mano en
`prisma/migrations/20260809120000_flujo_fase1_fase2_completo/migration.sql`.

**Por qué a mano:** `prisma migrate diff` resolvía el cambio de `tipo_proyecto` de TEXT a
enum con un `DROP COLUMN` + `ADD COLUMN`, que habría borrado los 39 valores cargados
(23 `E-commerce` + 16 `Informativa`). El SQL escrito hace un cast in situ que los conserva.

**Es todo aditivo.** No borra columnas ni filas. Las 7 columnas nuevas llevan `DEFAULT` o
son NULL-ables, así que las 52 filas existentes quedan válidas sin tocarlas.

```bash
# 1. Revisar el SQL
cat prisma/migrations/20260809120000_flujo_fase1_fase2_completo/migration.sql

# 2. Backup de la base antes de aplicar (Railway → Database → Backups)

# 3. Aplicar. NO uses `migrate dev`: puede pedir un reset.
pnpm exec prisma migrate deploy
```

La migración arranca con un bloque `DO $$` que corta con un mensaje claro si algún
proyecto tuviera un `tipo_proyecto` fuera de («Informativa», «E-commerce»), en vez de
fallar con un error de cast ilegible. Si eso pasa, no se aplica nada: la transacción
vuelve atrás sola.

### Efecto sobre los 52 proyectos que ya están cargados

Ninguno se traba. Las compuertas nuevas (material de marca, hosting, producción,
capacitación) **solo rigen para proyectos con plan de cobros cargado**
(`estaEnFlujoNuevo`), y hoy la tabla `cobros` está vacía. Es el mismo criterio que ya
usaban las compuertas de cobro: sin él, los 52 proyectos —que tienen
`material_marca_recibido = false` por el default de la columna— habrían quedado
bloqueados todos de golpe al no poder pasar a `Diseno`.

`GET /projects/por-archivar` sí cambia de resultado para ellos: como no tienen
recordatorios, caen a la rama de compatibilidad, que ahora exige además estar en Grupo B
o C. Los proyectos de Grupo A parados hace 90 días dejan de aparecer, que era el falso
positivo.
