# Spec — Módulo Gabinete Regional en el PSG

> **Estado:** propuesta validada (documento "Modelo de funcionamiento de los Gabinetes Regionales en torno al PSG", julio 2026)
> **Dueño de producto:** Diego (DCI) · Este doc es el insumo para planificar los PRs.
> **Contexto previo obligatorio:** `docs/spec-modulo-sesiones-comite-policial.md` + migración `044_sesiones_eje.sql`. Este spec **extiende** ese módulo, no lo reemplaza.

---

## 1. Contexto de negocio (léelo, explica todos los porqués)

El **Gabinete Regional** es la instancia semanal que preside el/la Delegado/a Presidencial Regional (DPR) con **todos los seremis** de la región. Con los PREGO desplegados, pasa a ser la instancia de seguimiento político-estratégico del plan. La DCI definió para él un **ciclo semanal completo dentro del PSG**:

1. **Antes** — los sectores actualizan avances en el panel (corte **24 h** antes de la sesión); la secretaría técnica prioriza en una bandeja qué iniciativas se conversarán (las marca **"En foco"**, referencialmente 5–12) y genera la **tabla de gabinete** (la cartera PDF en foco) que se envía junto a la citación.
2. **Durante** — sesión en 5 bloques: (1) verificación de compromisos anteriores, (2) panorama agregado del PREGO (semáforo por eje), (3) iniciativas en foco una a una, (4) compromisos nuevos, (5) temas emergentes. Se registra en el panel **durante** la sesión.
3. **Después** — al cerrar se genera el **acta PDF**, los compromisos quedan vivos para la sesión siguiente, y el estado consolidado queda disponible para la DCI.

Además, el gabinete se relaciona con los comités especializados (Policial —ya operando en el panel—, Infraestructura, Inversión/SEIA) mediante una regla de **subsidiariedad** con tres movimientos:

- **Radicación**: lo que tiene comité se conversa en el comité; no entra al foco del gabinete por defecto (solo se reporta).
- **Escalamiento**: una traba que excede al comité se marca como **escalada** en la sesión del comité y aparece automáticamente en la bandeja de preparación del gabinete.
- **Mandato**: el gabinete puede dirigir un compromiso a un comité; ese mandato aparece en la zona de compromisos de la siguiente sesión del comité y se verifica en ambas instancias.

**Principio rector (no negociable):** cero digitación paralela. La tabla, la sesión y el acta salen de datos que ya viven en el panel.

## 2. Qué se construye (resumen)

Cuatro bloques de trabajo:

- **A. Fusión de secciones Atención + Gabinete** — UI pura. La bandeja de curaduría (hoy `AttentionTray`, tab "Atención") pasa a ser la vista **Preparación** dentro de la sección **Gabinete** (hoy `KanbanView`, tab "Gabinete"). Desaparece el tab "Atención".
- **B. Sesiones de Gabinete** — se generaliza el módulo de sesiones de la mig 044 para soportar una instancia que **no está anclada a un eje**: la sesión de gabinete. Reutiliza nómina, asistencia, compromisos, apuntes, acta e historial. **Sin zona de indicadores** (el bloque 2 de la sesión lee el avance por eje ya existente; no digita métricas).
- **C. Escalamiento y mandatos** — dos flags/relaciones sobre `sesion_compromisos` que conectan comités y gabinete en ambas direcciones.
- **D. Compromisos visibles en la iniciativa** — un compromiso de sesión vinculado a una iniciativa se muestra en el detalle de esa iniciativa (tab Seguimiento del `ProjectTrackerModal`).

## 3. Decisiones ya tomadas (no re-discutir)

| Tema | Decisión |
|---|---|
| Frecuencia del gabinete | Semanal (día lo fija cada DPR; referencial: jueves) |
| Corte de actualización | 24 h antes de la sesión (convención operativa, no se valida en código en el MVP) |
| Foco por sesión | 5–12 iniciativas (recomendación en UI, no límite duro) |
| Indicadores en sesión de gabinete | **No hay.** El gabinete no digita métricas; revisa iniciativas |
| Permisos | Solo DPR (rol `regional` de su región) y DCI (`admin`/`editor`) crean/cierran sesiones y modifican métricas de comités/gabinetes. `viewer` sin acceso al módulo (igual que mig 044) |
| Acta | Se genera desde el panel al cerrar la sesión (patrón `ActaComitePdf`) |
| Tabla de gabinete | Es la cartera PDF en foco que ya genera `KanbanView` (`handleDescargarCartera(soloEnFoco=true)`), sin producto nuevo |
| Llave de iniciativas | `prioridades_territoriales.id` — **NUNCA `n`** (ver CLAUDE.md "Llave estable" y la nota-dev de los 3 ajustes de nacimiento del módulo Sesiones) |

## 4. Ventana de nacimiento — por qué esto se hace AHORA

El módulo Sesiones nació el 27–28 de julio y solo tiene sesiones `borrador` de prueba. La generalización de schema de la sección 5 son `ALTER TABLE` baratos hoy; después de las primeras sesiones reales de Comité Policial serán migraciones con datos vivos. **PR-1 (schema) va primero y sin esperar al resto.** Es la misma película de `semaforo_log`/`tareas.prioridad_id`: esta vez llegamos antes.

## 5. Cambios de schema (migración `046_gabinete.sql`)

Todo `IF NOT EXISTS` / idempotente, patrón del repo.

### 5.1 `eje_sesiones` — instancia sin eje

```sql
ALTER TABLE eje_sesiones
  ADD COLUMN instancia TEXT NOT NULL DEFAULT 'eje' CHECK (instancia IN ('eje','gabinete')),
  ALTER COLUMN eje_id DROP NOT NULL,
  ADD CONSTRAINT eje_sesiones_instancia_eje_chk CHECK (
    (instancia = 'eje'      AND eje_id IS NOT NULL) OR
    (instancia = 'gabinete' AND eje_id IS NULL)
  );
```

- Rehacer el **UNIQUE parcial "1 borrador por instancia"**: hoy es por `(region_cod, eje_id, provincia_cod)`; debe pasar a `(region_cod, instancia, eje_id, provincia_cod)` con `COALESCE(eje_id, -1)` (o dos índices parciales, uno por instancia) para que el borrador único de gabinete no choque con los de comités.
- Índice: `(region_cod, instancia, fecha DESC)`.

### 5.2 `sesion_nomina` — mismo tratamiento

`instancia` + `eje_id` nullable con el mismo CHECK. La nómina del gabinete son los seremis + equipo DPR; la carga la DPR/DCI en la pantalla de nómina existente (`NominaModal`), que recibe la instancia como prop.

### 5.3 `sesion_compromisos` — instancia, vínculo a iniciativa, escalamiento y mandato

```sql
ALTER TABLE sesion_compromisos
  ADD COLUMN instancia TEXT NOT NULL DEFAULT 'eje' CHECK (instancia IN ('eje','gabinete')),
  ALTER COLUMN eje_id DROP NOT NULL,
  ADD CONSTRAINT sesion_compromisos_instancia_eje_chk CHECK (
    (instancia = 'eje'      AND eje_id IS NOT NULL) OR
    (instancia = 'gabinete' AND eje_id IS NULL)
  ),
  -- vínculo a iniciativa por LLAVE ESTABLE (complementa codigo_iniciativa de la nota-dev)
  ADD COLUMN prioridad_id BIGINT REFERENCES prioridades_territoriales(id),
  -- escalamiento comité → gabinete
  ADD COLUMN escalado_a_gabinete BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN escalado_at TIMESTAMPTZ,
  ADD COLUMN escalado_en_sesion_id BIGINT REFERENCES eje_sesiones(id);
```

**Semántica (importante, léela dos veces):**

- `instancia` dice **dónde se gestiona** el compromiso (en qué zona 1 aparece cada semana).
- **Escalamiento**: un compromiso de comité (`instancia='eje'`) con `escalado_a_gabinete=true` y `estado != 'cumplido'` aparece **además** en la bandeja de preparación del gabinete y en la zona 1 de la sesión de gabinete. No cambia de instancia: el comité lo sigue viendo. Se marca desde el `SesionModal` del comité (acción "Escalar a gabinete" sobre el compromiso), y solo ahí — el flag registra `escalado_en_sesion_id`.
- **Mandato**: un compromiso creado **en una sesión de gabinete** pero dirigido a un comité se inserta con `instancia='eje'` + `eje_id` del comité destino + `sesion_origen_id` = la sesión de gabinete. Con eso aparece gratis en la zona 1 de la próxima sesión de ese comité (la query existente por `(region_cod, eje_id, estado)` lo trae), y el gabinete lo verifica consultando por `sesion_origen_id` ∈ sesiones de gabinete. **No hay tabla nueva ni estado nuevo.**
- Índices: `(region_cod, escalado_a_gabinete) WHERE escalado_a_gabinete AND estado != 'cumplido'`; `(prioridad_id) WHERE prioridad_id IS NOT NULL`.

### 5.4 `sesion_iniciativas` — tabla nueva (la única)

Snapshot de qué iniciativas se trataron en una sesión de gabinete, con el acuerdo de cada una. Es lo que reemplaza a la zona de indicadores del comité.

```sql
CREATE TABLE sesion_iniciativas (
  id BIGSERIAL PRIMARY KEY,
  sesion_id BIGINT NOT NULL REFERENCES eje_sesiones(id) ON DELETE CASCADE,
  prioridad_id BIGINT NOT NULL REFERENCES prioridades_territoriales(id),  -- id, NO n
  semaforo_al_momento TEXT,      -- snapshot al cerrar (para el acta y el historial)
  pct_avance_al_momento NUMERIC, -- snapshot al cerrar
  acuerdo TEXT,                  -- qué resolvió el gabinete sobre esta iniciativa
  UNIQUE (sesion_id, prioridad_id)
);
```

### 5.5 Habilitación por región — `region_config` (tabla nueva mínima)

El flag de comités vive en `region_ejes.sesiones_habilitadas` (por región+eje). El gabinete no tiene eje, así que:

```sql
CREATE TABLE region_config (
  region_cod TEXT PRIMARY KEY,
  gabinete_habilitado BOOLEAN NOT NULL DEFAULT false,
  gabinete_nombre TEXT NOT NULL DEFAULT 'Gabinete Regional'
);
```

Habilitar el piloto = un `INSERT`/`UPDATE` de datos, no un deploy (mismo criterio que el piloto del Comité Policial).

> **Descartado a propósito:** crear una fila sintética "Gabinete" en `region_ejes`. Contamina "Avance por eje", las métricas y todos los consumidores de esa tabla. No lo hagas.

### 5.6 RLS

Las tablas nuevas y las filas `instancia='gabinete'` heredan **exactamente** la matriz de la mig 044 (este módulo NO es world-readable):

| Operación | admin / editor | regional | viewer |
|---|---|---|---|
| SELECT | todas las regiones | solo sus `region_cods` | **sin acceso** |
| INSERT/UPDATE | todas | solo sus `region_cods` | sin acceso |
| DELETE | admin/editor | no | no |

- Reusar `current_user_role()` y el patrón de `region_cods`. `sesion_iniciativas` y `region_config` (write) siguen la misma matriz; `region_config` SELECT puede ser de cualquier autenticado (es configuración, no datos de coordinación).
- Sesión `cerrada` inmutable para no-admin (trigger existente de la 044 — verificar que cubre las filas `instancia='gabinete'`; no debería requerir cambios porque cuelga de `eje_sesiones`).
- Actas de gabinete al **mismo bucket privado `comite-docs`**, con prefijo de path `gabinete/{region}/...`. Las policies del bucket ya existen (mig 044); no crear bucket nuevo.

## 6. API

### `POST /api/sesiones` · `PATCH /api/sesiones/[id]`
Aceptan `instancia` (zod: enum `['eje','gabinete']`, default `'eje'`; si `gabinete` → `eje_id` debe venir null — reflejar el CHECK en el schema para fallar en 400 y no en SQL). Guardado de borrador igual que hoy (`safeWrite`/`lib/dbWrite.ts` con optimistic + revert + `window.alert`).

### `POST /api/sesiones/[id]/cerrar`
Mismo route handler, con bifurcación por instancia. Para `gabinete`, en orden:

1. Validar `estado='borrador'` + pertenencia región del usuario (igual que hoy).
2. **NO hay paso de métricas** — el claim atómico y el flag `metricas_aplicadas` no aplican; el claim `UPDATE ... WHERE estado='borrador'` se mantiene como guard de idempotencia del cierre.
3. Upsert de `sesion_iniciativas` con snapshot de `estado_semaforo` y `pct_avance` leídos de `prioridades_territoriales` al momento del cierre.
4. Marcar compromisos verificados (idéntico a comité). Los compromisos nuevos respetan la semántica de 5.3 (mandatos → `instancia='eje'`).
5. Generar acta PDF (ver §7 UI) → subir a `comite-docs/gabinete/...`, guardar `acta_path`.
6. `estado='cerrada'`, `closed_at=NOW()`.

## 7. UI

### 7.1 Fusión Atención + Gabinete (`WorkOSApp.tsx`)

- `View`: eliminar `'atencion'` del type y del array de tabs (líneas ~28, ~115, ~185). **Deep links**: `view=atencion` en la URL redirige a `kanban` (no romper links guardados en WhatsApp/Slack de las DPR).
- `KanbanView` (tab **"Gabinete"**) gana un switch de vista interno: **Preparación | Tablero**.
  - **Preparación** = montar el contenido actual de `AttentionTray` como pane (mover el componente, no reescribirlo: ya maneja en-foco, sugerencias por criterio —hito vencido, bloqueadas, sin actividad, hito próximo, avance bajo— y filtros).
  - **Tablero** = el kanban actual con la cartera PDF (`handleDescargarCartera`).
- En **Preparación**, agregar el bloque **"Trabas escaladas desde comités"**: query a `sesion_compromisos` con `escalado_a_gabinete=true AND estado != 'cumplido'` de la región activa, cada fila con su iniciativa vinculada (si tiene `prioridad_id`), comité de origen (`eje_id`) y responsable. Acción por fila: "Poner en foco" la iniciativa vinculada.
- El componente `AttentionTray.tsx` deja de ser una vista top-level; borrar el tab, no el archivo.

### 7.2 Estado del gabinete en la sección (strip)

Si `region_config.gabinete_habilitado`: strip arriba del switch con `N compromisos abiertos · M trabas escaladas · última sesión dd-mmm` + botones **"Nueva sesión"** y **"Ver historial"** (mismo patrón del drawer de métricas del comité). Visibilidad: `canEditOperational` para crear; viewer no ve nada del módulo.

### 7.3 `SesionModal` en modo gabinete

Reutilizar `SesionModal.tsx` con prop `instancia`. Zonas (el orden es producto, no estética):

1. **Compromisos anteriores** — los de `instancia='gabinete'` + los escalados abiertos + los mandatos originados en gabinete (para verificar). Botones de estado idénticos al comité.
2. **Asistencia** — nómina de gabinete + invitados. Sin cambios de comportamiento.
3. **Iniciativas en foco** *(reemplaza la zona de indicadores)* — precarga las iniciativas `en_foco=true` de la región: título, semáforo, % avance, próximo hito (read-only) + textarea `acuerdo` por iniciativa. Botón "+ agregar iniciativa" (typeahead sobre la cartera, guarda por `id`).
4. **Apuntes por cartera** — tabs por seremi/institución (mismo mecanismo de apuntes del comité).
5. **Compromisos nuevos** — descripción / responsable / plazo + dos campos nuevos: **vincular a iniciativa** (typeahead opcional → `prioridad_id`) y **dirigir a comité** (select opcional de ejes con sesiones habilitadas → semántica mandato de 5.3).

En el `SesionModal` del **comité**, agregar en compromisos (zona 1 y 5) la acción **"Escalar a gabinete"** (toggle con confirmación; visible solo si `region_config.gabinete_habilitado`).

### 7.4 Acta

`ActaGabinetePdf.tsx` clonando la estructura de `ActaComitePdf.tsx`: antecedentes / asistencia / panorama por eje (semáforos agregados leídos al cierre) / iniciativas tratadas con acuerdo (de `sesion_iniciativas`) / compromisos nuevos + estado de anteriores (marcando cuáles son mandatos y a qué comité van). `registerPdfFonts`, bucket privado, URL firmada — todo igual al comité.

### 7.5 Detalle de iniciativa (`ProjectTrackerModal` → `SeguimientoTab`)

Nueva sub-sección read-only **"Compromisos de sesión"**: compromisos con `prioridad_id = iniciativa.id`, mostrando origen (Gabinete / Comité X), responsable, plazo y estado. Es la petición explícita del documento final: si un compromiso está relacionado a una iniciativa, se ve en el detalle de la iniciativa.

### 7.6 Historial

`HistorialSesionesModal` ya lista sesiones por instancia si se le pasa el filtro; el detalle expandido para gabinete muestra iniciativas tratadas + acuerdos en lugar de valores de indicadores.

## 8. Reglas de negocio (resumen para tests)

1. Sesión de gabinete se crea con `instancia='gabinete'` y `eje_id IS NULL`; el CHECK rechaza cualquier otra combinación.
2. Cerrar sesión de gabinete NO toca `metricas_eje` (ni suma ni pulso). Cerrar dos veces no duplica nada (claim atómico).
3. Compromiso de comité escalado y no cumplido aparece en: zona 1 del comité, bandeja de preparación del gabinete y zona 1 del gabinete. Al marcarse cumplido (en cualquiera de las dos instancias) desaparece de ambas.
4. Mandato creado en sesión de gabinete con destino eje Seguridad aparece en la zona 1 de la siguiente sesión del Comité Policial de esa región.
5. Compromiso con `prioridad_id` aparece en el tab Seguimiento de esa iniciativa. El vínculo usa `id`; un compromiso jamás referencia `n`.
6. Región sin `region_config.gabinete_habilitado`: la sección Gabinete se ve como hoy (fusión aparte: la fusión Atención+Gabinete es para todos, el módulo de sesiones solo para habilitadas). Cero regresión en comités.
7. `viewer` no ve sesiones, compromisos ni actas de gabinete. Regional de otra región tampoco.
8. `view=atencion` en URL redirige a la sección Gabinete sin error.

Tests (vitest, criterio del repo: dolor, no cobertura): query de compromisos del gabinete (propios + escalados + mandatos), CHECK de instancia en schemas zod, guard de idempotencia del cierre sin métricas.

## 9. Plan de PRs

| PR | Contenido | Depende de |
|---|---|---|
| **PR-1** | Migración 046 completa (alters + `sesion_iniciativas` + `region_config` + RLS + índices) + types + schemas zod. **Ejecutar cuanto antes — ventana de nacimiento (§4)** | — |
| **PR-2** | Fusión Atención+Gabinete: tabs, redirect, switch Preparación/Tablero, bloque de trabas escaladas | PR-1 (solo el bloque de escaladas; el resto de la fusión puede ir antes) |
| **PR-3** | `SesionModal` modo gabinete + nómina + strip + `POST /cerrar` con bifurcación + `ActaGabinetePdf` | PR-1 |
| **PR-4** | Escalar desde comité + mandatos + `SeguimientoTab` de iniciativa + historial gabinete | PR-1, PR-3 |

Piloto: habilitar `region_config` en las mismas 2–3 regiones del piloto de Comité Policial (dato, no deploy).

## 10. Criterios de aceptación E2E

- [ ] Regional de una región piloto: marca 6 iniciativas en foco desde Preparación, descarga la cartera en foco, crea sesión de gabinete, registra asistencia + acuerdos + 2 compromisos (uno vinculado a iniciativa, uno como mandato al Comité Policial), cierra → acta PDF descargable; `metricas_eje` intacta.
- [ ] El mandato aparece en la zona 1 de la siguiente sesión del Comité Policial de esa región.
- [ ] Un compromiso escalado desde el Comité Policial aparece en la bandeja de Preparación del gabinete y en la zona 1 de su siguiente sesión.
- [ ] El compromiso vinculado aparece en el tab Seguimiento de la iniciativa.
- [ ] Viewer y regional de otra región: no ven nada del módulo. Región sin flag: sin regresión.
- [ ] `view=atencion` redirige; no queda tab "Atención".
- [ ] `npm run build` + `npm test` verdes.

## 11. Decisiones abiertas (no bloquean PR-1)

- Resumen de comités para el bloque 2 de la sesión (extracto automático de las últimas actas de comités de la semana): ¿F2 con `lib/minutaAI` o manual en apuntes?
- Sección "Trabas escaladas" dentro de la cartera PDF (tabla de gabinete): propuesta F2.
- Reporte de avance regional hacia DCI (formato/periodicidad): pendiente de definición con cada región — el documento final lo dejó explícitamente abierto; no construir nada aún.
- ¿La acción "Escalar a gabinete" exige nota/motivo? Propuesta: opcional en MVP.
