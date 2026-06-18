# Auditoría técnica — Indicadores v2 + Dashboard nacional (Work OS)

**Fecha:** 2026-06-17
**Alcance:** Módulo "Indicadores v2" (modal de KPIs con sparklines) + "Dashboard nacional" (tabla de iniciativas territoriales), su modelo de datos, el pipeline de syncs y la observabilidad.
**Método:** lectura de código (App Router, hooks, migraciones, workflows) + consultas a la BD de producción en vivo (`Seguimiento DCI Regional`, Supabase `hufgtspktblxxkwocsof`).
**Audiencia:** desarrollador. Las referencias `archivo:línea` están pensadas para abrir directo y convertir en issues.

> **Cómo leer esto:** la sección 0 es el TL;DR. Las secciones 1–5 son el diagnóstico con evidencia. La sección 6 es la hoja de ruta accionable (backlog-ready) ordenada por los tres dolores reportados. La sección 7 son decisiones que el equipo debe tomar antes de tocar lo estructural.

---

## 0. Resumen ejecutivo

El módulo funciona, pero arrastra **un costo de "migración a medias"**: existe un modelo `v2_*` bien diseñado que solo se adoptó para *indicadores*, mientras que *iniciativas* y *minutas* siguen 100% en v1. Nada hizo el cutover. Eso genera tablas duplicadas, código muerto y dos sistemas de observabilidad que no coinciden.

Los tres dolores reportados tienen causa raíz técnica clara:

1. **"No es cómodo ver el dashboard"** → la tabla renderiza **las 3.015 filas de golpe en el DOM, sin virtualización ni paginación**, recalcula ~13 pasadas completas sobre el arreglo en cada tecla de búsqueda (sin debounce) y **no persiste la configuración de columnas** (se resetea en cada recarga). [§4]
2. **"No es fácil actualizarlo"** → la única vía de actualización masiva es **bajar un Excel, llenarlo a mano, reimportarlo y recargar la app**. No hay edición inline en la grilla. [§4.4]
3. **"No tengo claro qué información hay ni cada cuánto se actualiza"** → la UI **ignora el catálogo** y muestra solo listas de códigos hardcodeadas; hay **16 indicadores vacíos** (varios marcados *esenciales*) y la frescura está repartida en **dos tableros de monitoreo que miran tablas distintas**. No existe una vista única "qué dato hay, de qué fuente, de qué fecha". [§1, §3, §5]

**Las 5 palancas de mayor impacto / menor riesgo** (detalle y estimación en §6):

| # | Acción | Ataca | Esfuerzo |
|---|--------|-------|----------|
| Q1 | Virtualizar la tabla (`@tanstack/react-virtual`) | Dolor 1 | M |
| Q2 | Persistir `visibleCols` + debounce de búsqueda | Dolor 1 | S |
| Q3 | Edición inline de semáforo/avance/responsable en la grilla (reusando `safeWrite`) | Dolor 2 | M |
| Q4 | Render del modal *data-driven desde el catálogo* + una vista "Catálogo de datos / Frescura" | Dolor 3 | M |
| Q5 | Unificar `/api/health` para leer **ambos** sistemas de observabilidad y fijar `CRON_SECRET` | Dolor 3 | S |

---

## 1. Inventario de indicadores y cobertura por fuente

**84 indicadores en `v2_indicadores_catalogo`; 68 tienen datos; 16 están vacíos.** (`v2_indicadores_valores` = 10.417 filas; matview `v2_indicadores_ultimo` = 1.051 filas.)

### 1.1 Tres niveles de frescura (esto es lo que hoy no es visible para el usuario)

**A. Vivos / automáticos** — se actualizan solos cuando corre su cron:

| Fuente | Indicadores | Frecuencia | Último dato (carga) |
|--------|-------------|-----------|---------------------|
| SINCA / MMA (calidad del aire) | `AMB_MP25` (esencial), `AMB_MP10` | Diario | 2026-06-17 |
| BCCh — empleo (INE/ENE) | `EMP_DESOC_TASA`, `EMP_OCUP_MILES`, `EMP_FT_MILES` | Mensual | periodo 2026-04, carga 2026-06-12 |
| BCCh — actividad | `ECO_VENTAS_REG`, `ECO_IMACEC` | Mensual | periodo 2026-04 |
| BCCh — cuentas nacionales | `ECO_PIB_REG`, `ECO_PIB_NAC` + 13 `ECO_PIB_*` sectoriales | Trimestral / anual | periodo 2025, carga 2026-06-15 |

**B. Fotos estáticas** — cargadas una sola vez (2026-05-13), **nunca se actualizan solas** (método `manual`, tolerancia 365–1825 días):

- **Censo 2024** → toda la Demografía (`DEM_*`), Educación (`EDU_ESCOLARIDAD/SUPERIOR/ALFABETISMO`), Vivienda con dato, Geografía (`GEO_*`), `CON_INTERNET`, parte de Empleo censal.
- **CASEN 2024** → Social (`SOC_*`: pobreza multidimensional, por ingresos, RSH).
- **ENUSC 2022** → Seguridad (`SEG_VICTIMAS`, `SEG_DEL_100K`, `SEG_INSEG`). *Ojo: el dato más reciente de seguridad es de 2022.*
- **FONASA** → `SAL_FONASA`.

Esto es correcto por naturaleza (un censo no cambia cada mes), **pero el usuario no tiene forma de distinguir un dato vivo de una foto de hace un año.** Ese es el corazón del dolor 3.

**C. Vacíos (16 indicadores en catálogo, 0 filas de datos):**

| Código | Categoría | Criticidad | Fuente esperada | Por qué está vacío |
|--------|-----------|-----------|-----------------|---------------------|
| `SAL_CAMAS_1K` | Salud | **esencial** | DEIS/MINSAL | sync `deis` aborta sin `fuente_endpoint` |
| `SAL_LISTA_ESP` | Salud | **esencial** | DEIS/MINSAL | idem |
| `VIV_DEFICIT` | Vivienda | **esencial** | Censo | sin carga manual |
| `SAL_HOSP_N` | Salud | complementario | DEIS/MINSAL | sync `deis` aborta |
| `EDU_MATRICULA`, `EDU_PARVULARIA` | Educación | complementario | MINEDUC | sync `mineduc` aborta sin endpoint |
| `ECO_INV_PUB`, `ECO_INV_FNDR` | Economía | complementario | DIPRES | sync `dipres` aborta sin endpoint |
| `ECO_COMPRAS_PUB` | Economía | complementario | ChileCompra | sync `mercadopublico` aborta |
| `CON_INT_FIJO`, `CON_INT_MOVIL` | Conectividad | complementario | SUBTEL | sync `subtel` (URLs hardcodeadas) |
| `CON_AISLADAS`, `AMB_RESIDUOS`, `VIV_ARRIENDO`, `VIV_IRRECUP`, `SEG_DEN_100K` | varios | complementario | manual | nunca cargados a mano |

**Conclusión §1:** la cobertura real es buena en economía/empleo/aire y en las fotos censales, pero **3 indicadores *esenciales* están vacíos** y todo el bloque de salud (DEIS), educación (MINEDUC), inversión pública (DIPRES), conectividad (SUBTEL) y compras públicas no tiene un solo dato porque sus syncs están bloqueados por configuración (ver §5.3).

---

## 2. Inconsistencias entre el modelo v1 y el v2

El v2 (`001_v2_schema.sql`) es un rediseño sólido (long-format, catálogo con metadata, pipeline, matview). El problema no es el diseño sino que **el cutover de la Fase 5 nunca se hizo** (`001_v2_schema.sql:7` lo anuncia; no existe ninguna migración de rename — la última es `024`). Resultado: v1 y v2 conviven y se duplican.

### 2.1 Mapeo tabla por tabla (datos en vivo)

| Dominio | v1 | v2 | Estado |
|---------|----|----|--------|
| Time-series económico | `regional_metrics` (9.328) | `v2_indicadores_valores` (10.417) | **Duplicado**: `ine-sync` y `pib-sync` escriben a ambas (dual-write). |
| Demografía/pobreza/salud (wide) | `region_metrics` (16 × ~90 cols) | *(sin tabla equivalente)* | **Sin migrar de verdad**: los `DEM_*`/`SOC_*`/`VIV_*` del v2 son cargas estáticas; `region_metrics` sigue siendo la fuente real (la usan las minutas, §4 cruzado). |
| Seguridad semanal | `stop_stats` (881) + `security_weekly` (64) | `v2_seguridad_semanal` (881) | **Duplicado**: `stop-sync` dual-escribe. |
| Proyectos de inversión | `seia_projects` (1.700) + `mop_projects` (847) | `v2_proyectos_inversion` (2.528) | **Duplicado por diseño** (v2 unifica SEIA+MOP). |
| Iniciativas | `prioridades_territoriales` (**3.015**) | `v2_iniciativas` (**1.929**) | **v2 huérfana y desfasada**: ~1.100 filas menos y **nadie la lee ni escribe**. |

### 2.2 Código muerto / huérfano (verificado por grep, 0 consumidores)

- **`v2_iniciativas` / `v2_iniciativas_seguimiento` / `v2_iniciativas_documentos`**: 0 referencias fuera de migraciones. Tabla muerta con 1.929 filas que pueden confundir a cualquiera que mire la BD.
- **Helpers `getV2Catalogo`, `getV2UltimosPorRegion`, `getV2Serie`, `getV2NacionalUltimo`, `getV2RankingIndicador`** (`lib/db.ts:300-364`): definidos, **0 consumidores** (los hooks usan `getSupabase()` directo).
- **Hooks `useRegionIndicadores`, `useColegaEmpleo*`, `useAllRegionsMetrics`**: 0 imports. Son la generación previa (el propio JSDoc de `useV2Indicadores.ts:22` dice *"Replaces useRegionIndicadores + useAllRegionsMetrics"*).

### 2.3 Otras inconsistencias

- **Nombres tipo vs tabla:** los tipos TS son singulares (`V2Indicador`, `V2Fuente`, `V2Region`) y las tablas plurales (`v2_indicadores_catalogo`, `v2_fuentes`, `v2_regiones`). Además `V2Indicador` mapea a `v2_indicadores_**catalogo**` (un "indicador" en código = una fila de catálogo). No rompe, pero confunde.
- **`V2IndicadorUltimo` es una materialized view**, no una tabla; el tipo no lo documenta y su refresco es manual/inline (§5.5).
- **RLS del v2 sin matriz por rol:** `002_v2_rls_policies.sql` solo crea políticas `SELECT USING (true)` (world-readable a cualquier autenticado) y **ninguna política de escritura**; la migración `023_rls_por_rol.sql` (la que dio RLS por rol admin/editor/regional/viewer a v1) **no toca ninguna tabla v2**. Si algún día se lee `v2_iniciativas` desde el browser, un usuario `regional`/`viewer` vería todas las regiones, sin el filtro por `region_cods` que sí existe en v1.

**Conclusión §2:** la app **vive en v1** para todo lo operativo (iniciativas, dashboard, kanban, minutas) y solo usa v2 para *leer indicadores*. El v2 está medio construido y desconectado. Hay que **decidir explícitamente** (§7): terminar el cutover o congelar v2 formalmente. Mantener ambos es la fuente de la duplicación y la confusión.

---

## 3. UI de Indicadores v2 (`IndicadoresModalV2.tsx` + hooks)

La arquitectura de carga es **buena** (un solo `Promise.all`, sin refetch al cambiar de tab, catálogo cargado una vez), pero tiene un problema de fondo y varias fugas.

### 3.1 Problema central: el render ignora el catálogo (listas hardcodeadas)

Cada tab define **a mano** los códigos que muestra. El catálogo aporta metadata (nombre, unidad, fuente), pero **qué se muestra y en qué tab está cableado en el `.tsx`**:

- `SERIES_CODIGOS` global de 6 series (`IndicadoresModalV2.tsx:30-32`).
- ~20 arrays más por tab: Económico (`:543-547`, `:602`), Social (`:667-685`), Demográfico (`:695-707`), Salud/Edu (`:718-727`), Seguridad (`:738-748`), Ambiente (`:757-759`).

**Consecuencia:** un indicador con datos cuyo código no esté en ningún array es **invisible** en la UI, silenciosamente. Y al revés: el catálogo ya trae `categoria`, `subcategoria`, `orden_presentacion`, `aparece_en_*` (`types.ts:570-582`) — campos diseñados *exactamente* para render data-driven — y **no se usan**. De hecho `porCategoria` ya se computa en `useV2Dashboard.ts:187-195` y **nunca se consume**. Migrar a render desde catálogo elimina ~20 listas y hace que agregar/quitar indicadores sea dato, no código.

### 3.2 Manejo de "sin dato" / "desactualizado": bien a nivel card, inconsistente a nivel tab

- `KpiCardV2` muestra correctamente "Sin dato" + "Fuente esperada", el `periodo · fuente` del dato y un ⏳ de obsoleto (`KpiCardV2.tsx:58-90`). **No rompe.** Bien.
- **Pero el trato del caso vacío es inconsistente:** casi todas las tabs muestran los faltantes como chips grises "sin dato", **excepto Ambiente que los filtra antes** (`:758`) y los oculta del todo. Mismo caso, dos comportamientos.
- **`stale` mide antigüedad de *carga* (`fecha_carga_sistema`), no del *periodo* del dato** (`useV2Dashboard.ts:133-139`). Un dato de periodo viejo recién recargado no se marca obsoleto. Para censo/CASEN (tolerancia hasta 1825 días) es casi imposible que se marque stale.

### 3.3 Fugas de rendimiento

- **`allRegionsUltimos` sin filtro** (`useV2Indicadores.ts:54`): trae `*` de 16 regiones × ~68 indicadores (~1.000+ filas) en cada apertura, aunque las tablas comparativas usan ~4-5 códigos. Falta `.in('codigo_indicador', …)`.
- **`SERIES_CODIGOS` fijo**: pide siempre 6 series aunque la tab activa (p.ej. Demografía) no use ninguna.
- **Sin caché real:** cambiar de región o cerrar/reabrir el modal refetchea todo. El comentario `"Cached per session"` (`useV2Catalogo.ts:15`) es **engañoso**: solo dura mientras el componente esté montado. No hay SWR/React Query.

### 3.4 Smells puntuales

- **Clases Tailwind dinámicas** `grid-cols-${…}` (`:83`): Tailwind v4 (JIT/purge) **no detecta clases construidas por interpolación**; en producción esas columnas pueden no aplicarse. Riesgo real.
- **`% del PIB nacional` reconocido como incorrecto** (`:576-588`, con comentario propio *"rough approach"*): usa el total nacional del último periodo como denominador constante para toda la serie histórica → el gráfico de share engaña.
- **`IndicadoresModalV2.tsx` es un monolito de ~867 líneas** con 7 tabs + 6 subcomponentes en un archivo. Cada tab debería ser su propio archivo.
- Acceso por índice con doble cast `(week as Record<string, unknown>)[…]` repetido 5+ veces en PulsoTab (`:294-363`).

---

## 4. Dashboard nacional: por qué "no es cómodo" ni "fácil de actualizar"

**Fuente de datos:** lee **v1 `prioridades_territoriales`** (3.015 filas), no `v2_iniciativas`. `app/page.tsx:14` → `getAllIniciativas()` (`lib/db.ts:57-77`) pagina de a 1.000 y trae **las 3.015 filas completas** al server component, que las pasa como prop a `WorkOSApp` → `NationalDashboard`.

### 4.1 Rendimiento (dolor "no es cómodo")

1. **Sin virtualización ni paginación.** `NationalDashboard.tsx:1017` hace `filtered.map(p => <DataRow …/>)`: con filtros vacíos son **3.015 `<tr>` en el DOM**, cada una con 6+ celdas. Grep de `react-window`/`react-virtual` = 0. El SSR además serializa 3.015 objetos en el HTML inicial.
2. **`DataRow` se define dentro del componente** (`:1302`) → función nueva en cada render, sin memo de filas.
3. **18 filtros client-side O(n).** `filtered` (`:183-228`) filtra+ordena todo el arreglo; `basePool(excluding)` (`:261-286`) lo re-filtra **una vez por cada popover**; ~12 `useMemo` (`:319-369`) llaman `basePool`. Cada cambio de filtro = ~13 pasadas sobre 3.015 filas.
4. **Búsqueda sin debounce** (`:753`): cada tecla dispara todo lo anterior (~40K iteraciones). A 3K ya se siente; a 10K será inutilizable.

### 4.2 Columnas sin persistencia (dolor "no es cómodo")

`ALL_COLS` define **24 columnas**, 7 visibles por default; `visibleCols` es `useState` efímero (`:147`). **No hay `localStorage` ni backend** para guardarlas. Cada recarga — **incluida la que dispara el import (`window.location.reload()`, `:481`)** — vuelve a las 7 default. El asesor pierde su configuración constantemente.

### 4.3 Edición y actualización (dolor "no es fácil actualizar")

- **No hay edición inline en la tabla.** Click en fila abre `ProjectTrackerModal` (`:1289-1307`). Para editar masivo, la única vía es el **import de Excel** (admin): bajar template → llenar a mano desde la fila 3 → `POST /api/import` → `window.location.reload()`.
- Lo bueno: las mutaciones del modal **sí** usan los helpers defensivos `safeWrite` con `.eq('id', …)` (11 sitios en `ProjectTrackerModal.tsx`), cumpliendo la invariante post-bug RLS. Esa base se puede reusar para edición inline.
- **Export ignora los filtros activos** (`:1224-1263`): el modal de export solo deja elegir *regiones*, así que lo que el asesor ve filtrado en pantalla **no** es lo que descarga.

### 4.4 Patrones repetidos entre `NationalDashboard` / `VistaRegional` / `FichaRegional`

(`FichaRegional` es un PDF `@react-pdf/renderer`; comparte *lógica*, no JSX.)

| Lógica duplicada | Dónde |
|------------------|-------|
| Config de semáforo (dots/labels/colores) | `NationalDashboard.tsx:23-28` vs reimplementado inline en `VistaRegional.tsx:452-473` |
| `diasSinActividad` | copia local en `NationalDashboard.tsx:79-82` y la "buena" en `lib/regionSummary` (usada por `VistaRegional.tsx:25`) |
| `formatDate` / `pct1` / `fmt` (formato es-CL) | `NationalDashboard.tsx:84-88`, `FichaRegional.tsx:52-65` |
| Barra de avance (track + fill por semáforo) | `NationalDashboard.tsx:1370-1385`, `VistaRegional.tsx:440-449`, `:788-793` |
| Reducción RAG + promedio (`avgPct`/`semaforoCount`) | `WorkOSApp.tsx:338-351`, `NationalDashboard.tsx:372-379`, `VistaRegional.tsx:239-248` |

Ya existen abstracciones buenas (`FilterPopover`, `ActiveFiltersBar`, `CapaBadge`, `TagChips`, `lib/regionSummary`). El trabajo es **extender ese enfoque** a `<SemaforoBreakdown>`, `<ProgressBar>` y un `lib/format.ts` único.

---

## 5. Pipeline de syncs y observabilidad

### 5.1 Sí hay crons (corrección importante)

`vercel.json` tiene `{"crons": []}` **a propósito**: Vercel Hobby limita a 2 crons. Los 13 syncs están agendados en **`.github/workflows/cron-syncs.yml`**, que hace `POST` a `https://work-os-theta.vercel.app/api/<endpoint>` con `Authorization: Bearer $CRON_SECRET`. El dominio se reapuntó recién (commit `b4224bb`, "ci(crons): apuntar workflow al dominio real (work-os-theta)").

Schedules (UTC): sinca+health diario 06:00; ine lun 07:00; seia lun 08:00; mop lun 09:00; stop mié 10:00; pib lun 11:00; external lun 12:00; cne lun 13:00; deis día 1 mensual; mineduc 15-mar; subtel 1-ene/jul; mercadopublico 5-ene/jul; dipres trimestral.

**Riesgos de este esquema** (a verificar, no asumibles como resueltos):
- Requiere el secret `CRON_SECRET` en el repo. **Si no está, cada corrida sale con `exit 1`** (el propio workflow lo dice).
- GitHub **deshabilita los workflows `schedule` tras 60 días sin actividad** en el repo. Hoy el repo está activo, pero es un punto de falla silencioso.
- Apunta a `work-os-theta.vercel.app` (proyecto Vercel `psg-regiones`). Existe **otro proyecto Vercel `work-os` (sandy) sin env vars** — pendiente de eliminar; es una trampa para futuras confusiones de dominio.

### 5.2 Por qué faltan datos / filas pese a tener crons

`sync_status` tiene solo 5 filas (stop=error hoy, sinca=ok hoy, external=ok 0 filas, mop=partial, ine=partial). No aparecen seia, pib, cne ni los mensuales/semestrales. Causas combinadas:

- **Telemetría fire-and-forget perdida** (§5.4): `pib-sync` corrió y escribió datos el 2026-06-15 (los `ECO_PIB_*` sectoriales tienen carga de ese día) **pero no dejó fila en `sync_status`** → la escritura de estado se perdió o no se esperó.
- **Schedules infrecuentes que aún no disparan:** deis (mensual), mineduc (15-mar), subtel/mercadopublico (semestrales), dipres (trimestral) — varios no han tenido oportunidad de correr desde que el workflow apunta al dominio correcto.
- **Syncs bloqueados por config** (§5.3): aunque disparen, no hacen nada.

### 5.3 Syncs implementados pero inertes

Ninguno es un stub vacío, pero hay tres grados de "no funcional":

- **Bloqueados por `fuente_endpoint` vacío** (abortan con `ok:false`): `deis-sync:55-61`, `mineduc-sync:49-55`, `dipres-sync:49-55`, `mercadopublico-sync:49-55`. La URL de descarga se lee de `v2_indicadores_pipeline.fuente_endpoint`, que está sin setear → 0 datos en salud, educación, inversión pública y compras públicas.
- **Bloqueados por credencial/URL:** `cne-sync:46-52` aborta sin `CNE_API_TOKEN` (no está en la matriz de env del repo); `subtel-sync:28-31` usa URLs hardcodeadas a archivos `..._DIC25.xlsx` (frágiles, semestrales).
- **Funcionales** (API pública directa): `ine`, `pib`, `seia`, `seia-sync-v2`, `mop`, `stop`, `external`, `sinca`.

### 5.4 Dos sistemas de observabilidad que no se hablan

| | Escribe | Lo lee |
|---|---------|--------|
| **`sync_status`** (v1, 1 fila/sync) | `withSyncStatus()` (`lib/syncRunner.ts:43-68`) envuelve los 13 handlers | **solo** `/api/health` (`route.ts:94-97`) |
| **`v2_indicadores_pipeline` + `_log`** (v2, 1 fila/indicador) | `upsertV2WithLog()` (`lib/syncHelper.ts:44-94`); `ine-sync` inline (`:370-387`) | **solo** `app/admin/pipeline/page.tsx:41-47` |

Problemas:
- **Disjuntos:** `/api/health` ve los 13 *syncs*; el admin ve los 84 *indicadores*. Quien mire solo el admin nunca verá que seia/mop/pib fallan; quien mire solo health no ve el detalle por indicador.
- **Escritura inconsistente del pipeline v2:** `pib`, `seia`, `mop`, `stop`, `external` escriben los *datos* a v2 pero **no actualizan `v2_indicadores_pipeline`** (`pib-sync:365-392` no tiene update de pipeline; el único que lo hace inline es `ine-sync:379`). Por eso los PIB sectoriales tienen datos y `ultima_ejecucion = NULL` para siempre → aparecen como "nunca corrió" en el admin aunque estén frescos.
- **Fire-and-forget en serverless:** `withSyncStatus` persiste con `void …catch` sin `await` (`syncRunner.ts:63`); los refresh de matview y logs v2 usan `.then(()=>{})` sin `await` (`syncHelper.ts:74,81,90`; `pib-sync:391`). En Vercel la función puede congelarse tras devolver la Response y perder esas escrituras.

### 5.5 Otros

- **`ine-sync` no declara `maxDuration`** → hereda el default (~60s) y hace ~50 llamadas BCCh secuenciales: mismo vector del timeout silencioso que tuvo SEIA (53 días de silencio, documentado en `CLAUDE.md`). Las pesadas sí lo tienen (`seia:31`, `mop:24`, `pib:24`, `stop:48` = 300).
- **`/api/v2/refresh-views` es código muerto operativamente:** existe pero no está en el workflow ni lo llama ningún sync por HTTP; el refresh real es inline y no-awaited (§5.4). La matview `v2_indicadores_ultimo` puede quedar stale.
- **`seia-sync-v2`** (reanudable, con cursor) está implementado y es superior, pero **no está agendado** en el workflow; `mop`/`ine` quedaron en estado `partial` sin nada que los reanude.

---

## 6. Hoja de ruta para arreglarlo (backlog priorizado)

Ordenado por dolor. Cada ítem: problema → fix propuesto → evidencia → impacto/esfuerzo/riesgo. Esfuerzo: **S** ≤1 día, **M** 2-4 días, **L** ≥1 semana.

### Dolor 1 — "No es cómodo ver el dashboard"

- **D1-01 (M, riesgo bajo) — Virtualizar la tabla.** Adoptar `@tanstack/react-virtual` en el `map` de filas (`NationalDashboard.tsx:1017`); sacar `DataRow` fuera del componente y memoizarla (`:1302`). *Impacto: el más alto en "comodidad".*
- **D1-02 (S, riesgo nulo) — Persistir `visibleCols`.** Guardar selección de columnas en `localStorage` (mismo patrón que ya persiste view/región en `WorkOSApp`). Deja de resetearse en cada recarga/import (`:147`, `:481`). *Quick win de alto valor.*
- **D1-03 (S) — Debounce de búsqueda** (~250 ms) en `:753` y memoizar `basePool` una sola vez por render en lugar de por popover (`:261-369`).
- **D1-04 (S) — Export respeta los filtros activos.** Reusar `filtered` en `exportExcelFiltered` (`:502-535`) en vez de re-pedir por región (`:1224-1263`).

### Dolor 2 — "No es fácil actualizarlo"

- **D2-01 (M) — Edición inline en la grilla** de semáforo, % avance y responsable, reusando los `safeWrite` ya existentes (`ProjectTrackerModal.tsx`, 11 call-sites con `.eq('id', …)`). Evita el ciclo Excel→import→reload para los cambios frecuentes.
- **D2-02 (S) — Quitar el `window.location.reload()` post-import** (`:481`): refrescar estado vía el `onUpdatePrioridad`/refetch que ya existe en `WorkOSApp`, preservando filtros y columnas.
- **D2-03 (M) — Bulk-edit** (seleccionar N filas → cambiar responsable/etapa/semáforo en lote) como evolución de D2-01.

### Dolor 3 — "No sé qué dato hay ni cada cuánto se actualiza"

- **D3-01 (M) — Render del modal data-driven desde el catálogo.** Reemplazar las ~20 listas hardcodeadas (`IndicadoresModalV2.tsx:30-759`) por iteración sobre `v2_indicadores_catalogo` usando `categoria`/`subcategoria`/`orden_presentacion`/`aparece_en_*`. Reusar `porCategoria` (`useV2Dashboard.ts:187-195`, hoy sin consumir). *Resultado: indicadores nuevos/vacíos se muestran consistentemente; agregar uno es dato, no código.*
- **D3-02 (M) — Vista "Catálogo de datos / Frescura".** Una página (admin o pública) que liste, por indicador: fuente, periodo del último dato, fecha de carga, frecuencia esperada, estado (vivo / foto estática / vacío) y próximo refresh. Es exactamente la respuesta a "qué hay y cada cuánto". Se alimenta de `v2_indicadores_catalogo` + `_ultimo` + `_pipeline`.
- **D3-03 (S) — `stale` por periodo del dato, no por fecha de carga** (`useV2Dashboard.ts:133-139`), y trato uniforme del caso "sin dato" (que Ambiente deje de ocultarlos, `:758`).

### Observabilidad / pipeline (habilita el Dolor 3 y la confianza)

- **O-01 (S, alta prioridad) — Verificar `CRON_SECRET` en el repo** y que el workflow corra (Actions → últimas ejecuciones). Sin esto, todo sale `exit 1` en silencio.
- **O-02 (S) — `/api/health` que lea ambos sistemas** (`sync_status` **y** `v2_indicadores_pipeline`) y, si está `ALERT_WEBHOOK_URL`, alerte. Hoy solo ve v1 (`health/route.ts:94-97`).
- **O-03 (S) — Que `pib/seia/mop/stop/external` actualicen `v2_indicadores_pipeline`** vía `upsertV2WithLog` (hoy solo `ine` lo hace inline). Elimina los falsos "nunca corrió".
- **O-04 (S) — `await` la telemetría** o usar `waitUntil()` (Vercel) en `syncRunner.ts:63`, `syncHelper.ts:74-90`, `pib-sync:391`. Evita perder escrituras en serverless.
- **O-05 (S) — `export const maxDuration = 300` en `ine-sync`.** Cierra el vector de timeout silencioso.
- **O-06 (M) — Setear `fuente_endpoint` (y `CNE_API_TOKEN`)** para destrabar deis/mineduc/dipres/mercadopublico/cne, o marcarlos `activo=false` para que el monitoreo no los cuente como atrasados.
- **O-07 (S) — Eliminar el proyecto Vercel `work-os` (sandy)** y dejar solo `psg-regiones` para evitar confusión de dominios.

### Limpieza / deuda (bajo riesgo, alto valor de claridad)

- **C-01 (S) — Borrar código muerto:** `useRegionIndicadores`, `useColegaEmpleo*`, `useAllRegionsMetrics`, los 5 `getV2*` de `lib/db.ts:300-364`.
- **C-02 (S) — Extraer compartidos:** `<SemaforoBreakdown>`, `<ProgressBar>`, `lib/format.ts` (de §4.4).
- **C-03 (S) — `IndicadoresModalV2.tsx`:** partir el monolito (un archivo por tab) y arreglar las clases Tailwind dinámicas (`:83`).
- **C-04 (S) — Actualizar `CLAUDE.md`:** documenta v1 como canónico y no menciona el modelo `v2_*`, los syncs nuevos (mineduc/subtel/deis/dipres/cne/mercadopublico/sinca/pib) ni el workflow de crons. La doc divergió del código.

---

## 7. Decisiones que el equipo debe tomar (antes de lo estructural)

1. **Cutover v2: ¿terminar o congelar?** Hoy v2 solo se usa para leer indicadores; iniciativas y minutas son v1. Opciones: (a) completar la Fase 5 (migrar iniciativas+minutas a v2, RLS por rol en v2, renombrar, DROP v1), o (b) declarar v2 "solo indicadores" oficialmente, borrar `v2_iniciativas` y los helpers huérfanos, y dejar de hablar de cutover. **Mantener el limbo es lo que más cuesta.**
2. **Fuente única de la verdad para indicadores económicos:** `regional_metrics` (v1) y `v2_indicadores_valores` (v2) se escriben en paralelo. ¿Cuál es canónica? Las minutas todavía leen v1 (`region_metrics`/`regional_metrics`) — si se elimina v1 sin migrar las minutas, **se rompen** (`MinutaDocumentV2.tsx`, `lib/minutaAI.ts`, `app/api/minuta/route.ts`).
3. **`region_metrics` (wide, demografía/pobreza/salud) no tiene reemplazo v2 vivo.** Si se va a v2, hay que poblar de verdad los `DEM_*`/`SOC_*`/`VIV_*` (hoy son fotos estáticas) antes de retirar la tabla wide.
4. **Observabilidad:** ¿un solo sistema? Recomendado: consolidar en `v2_indicadores_pipeline` por indicador + un rollup por sync, y que `/api/health` y el admin miren la misma fuente.

---

## Anexo A — Evidencia (archivos clave)

- **Modelo:** `supabase/migrations/001_v2_schema.sql`, `002_v2_rls_policies.sql`, `023_rls_por_rol.sql`, `lib/types.ts`, `lib/db.ts`, `lib/regions.ts`.
- **Indicadores UI:** `components/IndicadoresModalV2.tsx`, `components/KpiCardV2.tsx`, `lib/hooks/useV2Indicadores.ts`, `useV2Dashboard.ts`, `useV2Catalogo.ts`.
- **Dashboard:** `app/page.tsx`, `components/WorkOSApp.tsx`, `components/NationalDashboard.tsx`, `components/VistaRegional.tsx`, `components/FichaRegional.tsx`, `components/ProjectTrackerModal.tsx`, `app/api/import/route.ts`, `lib/importApplier.ts`.
- **Pipeline:** `.github/workflows/cron-syncs.yml`, `vercel.json`, `lib/syncRunner.ts`, `lib/syncStatus.ts`, `lib/syncHelper.ts`, `app/api/health/route.ts`, `app/admin/pipeline/page.tsx`, `app/api/ine-sync/route.ts`, `app/api/pib-sync/route.ts`, `app/api/{deis,mineduc,dipres,subtel,cne,mercadopublico,sinca,external,seia,mop}-sync/route.ts`, `app/api/v2/refresh-views/route.ts`.
- **Minutas (consumidor v1):** `components/MinutaDocumentV2.tsx`, `lib/minutaAI.ts`, `app/api/minuta/route.ts`.

## Anexo B — Cifras de la BD en vivo (2026-06-17)

`prioridades_territoriales` 3.015 · `v2_iniciativas` 1.929 (huérfana) · `v2_indicadores_catalogo` 84 (68 con datos, 16 vacíos) · `v2_indicadores_valores` 10.417 · `regional_metrics` 9.328 · `region_metrics` 16 · `v2_proyectos_inversion` 2.528 (= `seia_projects` 1.700 + `mop_projects` 847) · `stop_stats` 881 = `v2_seguridad_semanal` 881 · `sync_status` 5 filas.
