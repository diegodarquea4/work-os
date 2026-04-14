# Work OS — Iniciativas Territoriales

Sistema de seguimiento de iniciativas territoriales del Ministerio del Interior y Seguridad Pública de Chile. Permite visualizar, gestionar, hacer seguimiento activo y exportar las iniciativas territoriales 2026–2028 para las 16 regiones del país.

Usado exclusivamente por profesionales de la **División de Coordinación Interregional** del Ministerio del Interior. No es público.

---

## Terminología importante

| Concepto | En el código | En Supabase |
|---|---|---|
| Iniciativa territorial | tipo `Iniciativa` (`lib/projects.ts`) | tabla `prioridades_territoriales` |
| Función principal | `getAllIniciativas()` (`lib/db.ts`) | — |
| Nivel de urgencia | campo `prioridad: 'Alta' \| 'Media'` | columna `prioridad` |
| Código de iniciativa | `codigo_iniciativa` formato `XX-NNN-NNN` | columna `codigo_iniciativa` (nullable) |

> La tabla Supabase se llama `prioridades_territoriales` — el nombre de BD no cambia. El tipo en código se llama `Iniciativa`. Los alias deprecated `Project` / `getAllPrioridades` existen solo para compatibilidad transitoria.

---

## Vistas principales

| Vista | Descripción |
|---|---|
| **Mapa** | Mapa interactivo de Chile. Click en región abre panel lateral con iniciativas, gráficos BCCh, proyectos SEIA y MOP. |
| **Dashboard nacional** | Tabla de las 63 iniciativas con filtros por región, eje, semáforo y nivel de prioridad. Columna de última actividad con indicadores de inactividad. |
| **Bandeja de atención** | Detecta automáticamente iniciativas que requieren acción: semáforo rojo, sin actividad en +15 días, o avance bajo (<30%). |
| **Kanban** | Portfolio de las 63 iniciativas en 4 columnas por estado RAG (Bloqueadas / En revisión / En verde / Sin evaluar). Filtros por región y eje. |

## Modal de seguimiento por iniciativa

Cada iniciativa abre un modal con 4 tabs:

| Tab | Contenido |
|---|---|
| **Seguimiento** | CRUD de actualizaciones: avance, reunión, hito, alerta. Con fecha, autor, estado y descripción. |
| **Historial** | Sparkline RAG · Barra dual avance % vs tiempo · Log de cambios de semáforo y % avance · Timeline mensual. |
| **Calendario** | Fecha límite editable inline con persistencia. |
| **Documentos** | Adjuntar y descargar archivos (Supabase Storage, bucket `project-docs`). |

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| UI | React 19 + TypeScript |
| Base de datos | Supabase (Postgres) |
| Autenticación | Supabase Auth |
| Storage | Supabase Storage |
| Mapa | Leaflet + react-leaflet |
| PDF | @react-pdf/renderer |
| Estilos | Tailwind CSS v4 |
| Deploy | Vercel (push a `main` → deploy automático) |

---

## Estructura del proyecto

```
app/
  page.tsx                        # Server Component — carga todas las iniciativas desde Supabase
  layout.tsx
  login/page.tsx
  auth/callback/route.ts
  api/
    metrics/[cod]/route.ts        # GET métricas estáticas de contexto regional (region_metrics)
    minuta/route.ts               # POST genera PDF de minuta regional (react-pdf)
    actividad/[cod]/route.ts      # GET fecha última actividad por iniciativas de una región
    actividad/all/route.ts        # GET fecha última actividad de todas las iniciativas
    ine-sync/route.ts             # POST sync BCCh series (cron: lunes 7am UTC)
    ine-discover/route.ts         # POST descubre series disponibles en BCCh
    seia-sync/route.ts            # POST sync proyectos SEIA por región (cron semanal)
    mop-sync/route.ts             # POST sync proyectos MOP por región (cron semanal)
    pib-discover/route.ts         # POST (nueva, pendiente de integrar en UI)
    pib-sync/route.ts             # POST (nueva, pendiente de integrar en UI)
    stop-sync/route.ts            # POST (nueva, pendiente de integrar en UI)

components/
  WorkOSApp.tsx                   # Shell cliente — estado global, navegación entre 4 vistas
  ChileMap.tsx                    # Mapa interactivo (Leaflet, dynamic import)
  ProjectsPanel.tsx               # Panel lateral por región: iniciativas + indicadores BCCh + SEIA + MOP
  NationalDashboard.tsx           # Tabla nacional con filtros y columna de actividad
  AttentionTray.tsx               # Bandeja de atención: alertas agrupadas por tipo
  KanbanView.tsx                  # Portfolio Kanban 4 columnas RAG, filtros por región y eje
  ProjectTrackerModal.tsx         # Modal por iniciativa: seguimiento, historial, calendario, documentos
  MinutaDocument.tsx              # Documento PDF (react-pdf)
  RegionComparisonModal.tsx       # Modal comparativa interregional (16 regiones en un gráfico)
  PibSectorialChart.tsx           # Gráfico PIB sectorial (nuevo, pendiente de integrar)
  StopPanel.tsx                   # Sección seguridad STOP (nuevo, pendiente de integrar)

lib/
  supabase.ts                     # Cliente Supabase browser (createBrowserClient) → getSupabase()
  supabaseServer.ts               # Cliente Supabase server (service role) → getSupabaseAdmin()
  db.ts                           # Todas las funciones de acceso a datos
  types.ts                        # Tipos: Prioridad, Iniciativa, RegionMetrics, Seguimiento, MopProject, SeiaProject…
  projects.ts                     # Tipo Iniciativa + getIniciativas() (CSV fallback)
  regions.ts                      # Catálogo 16 regiones + INE_CODE + ISO_CODE (prefijos XX para codigo_iniciativa)
  regionColors.ts                 # Colores por región para el mapa

  hooks/
    useRegionMetrics.ts           # Series BCCh por región (regional_metrics)
    useAllRegionsMetric.ts        # Todas las regiones, para RegionComparisonModal
    useSeiaProjects.ts            # Proyectos SEIA por región
    useMopProjects.ts             # Proyectos MOP por región
    usePibSectorial.ts            # PIB sectorial (nuevo, pendiente de integrar)
    useStopStats.ts               # Estadísticas STOP (nuevo, pendiente de integrar)

proxy.ts                          # Middleware de autenticación (protege todas las rutas)
vercel.json                       # Cron jobs (ine-sync, seia-sync, mop-sync)
public/
  chile-regiones.geojson          # Polígonos GeoJSON de las 16 regiones
```

---

## Base de datos (Supabase Postgres)

### `prioridades_territoriales`

Tabla central. 63 filas — una por iniciativa territorial 2026–2028.

| Columna | Tipo | Descripción |
|---|---|---|
| `n` | integer PK | Número correlativo |
| `region` | text | Nombre de la región |
| `cod` | text | Código región (ej: "X", "RM", "XV") |
| `capital` | text | Capital regional |
| `zona` | text | Norte / Centro / Sur / Austral |
| `eje` | text | Eje temático (Seguridad, Infraestructura, Economía, Vivienda…) |
| `meta` | text | Descripción de la iniciativa |
| `ministerios` | text | Ministerios responsables (separados por `\n`) |
| `prioridad` | text | `"Alta"` o `"Media"` (nivel de urgencia) |
| `plazo` | text | Plazo (ej: "2026", "2026-2027") |
| `estado_semaforo` | text | `"verde"` / `"ambar"` / `"rojo"` / `"gris"` |
| `pct_avance` | integer | Porcentaje de avance 0–100 |
| `responsable` | text | Funcionario responsable (nullable) |
| `fecha_limite` | date | Fecha límite (nullable) |
| `codigo_iniciativa` | text | Formato `XX-NNN-NNN` — ISO región + grupo + secuencia (nullable) |

> **Pendiente SQL:** `ALTER TABLE prioridades_territoriales ADD COLUMN IF NOT EXISTS codigo_iniciativa TEXT;`

### `region_metrics`

16 filas, una por región. ~90 columnas estáticas de contexto socioeconómico (geografía, demografía, pobreza, empleo, economía, salud, educación, vivienda, seguridad, conectividad, medioambiente). Usado por `/api/metrics/[cod]` y la minuta PDF.

### `regional_metrics`

Long format, time-series sincronizada desde BCCh API via `ine-sync`.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | uuid PK | |
| `region_id` | integer | 0 = nacional, 1–16 = regiones (ver `INE_CODE` en `lib/regions.ts`) |
| `metric_name` | text | Ej: `desempleo`, `pib_regional`, `imacec` |
| `value` | numeric | Valor de la serie |
| `period` | date | Primer día del período (ISO) |
| `source_url` | text | URL BCCh de origen (nullable) |

Series BCCh disponibles:
- Desempleo regional: `F049.DES.TAS.INE9.{CODE}.M` (mensual)
- PIB regional: `F035.PIB.FLU.R.CLP.2018.Z.Z.Z.{01-16}.0.T` (trimestral)
- IMACEC nacional: `F032.IMC.IND.Z.Z.EP18.Z.Z.0.M`
- PIB nacional: `F032.PIB.FLU.R.CLP.EP18.Z.Z.0.T`

**Crítico:** usar `regionId === undefined` (no `!regionId`) — `region_id = 0` es válido y falsy.

### `seia_projects`

Proyectos del SEIA sincronizados semanalmente.

| Columna | Tipo |
|---|---|
| `id` | text PK |
| `region_id` | integer |
| `nombre`, `tipo`, `estado`, `titular` | text |
| `inversion_mm` | numeric |
| `fecha_presentacion`, `fecha_plazo` | date |
| `actividad_actual`, `url_ficha` | text |
| `synced_at` | timestamptz |

### `mop_projects`

Proyectos del MOP sincronizados semanalmente.

| Columna | Tipo |
|---|---|
| `cod_p` | text PK |
| `bip` | text |
| `region_id` | integer |
| `nombre`, `servicio`, `programa`, `etapa`, `financiamiento` | text |
| `inversion_miles` | numeric |
| `provincias`, `comunas`, `planes`, `descripcion` | text |
| `synced_at` | timestamptz |

### `seguimientos`

Actualizaciones manuales sobre una iniciativa.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | integer PK | |
| `prioridad_id` | integer | FK → `prioridades_territoriales.n` |
| `tipo` | text | `"avance"` / `"reunion"` / `"hito"` / `"alerta"` |
| `descripcion` | text | Texto libre |
| `autor` | text | Nombre del funcionario |
| `estado` | text | `"en_curso"` / `"completado"` / `"bloqueado"` / `"pendiente"` |
| `fecha` | date | Fecha del evento |
| `created_at` | timestamptz | |

### `semaforo_log`

Audit trail automático de cambios de semáforo RAG y % avance.

| Columna | Tipo |
|---|---|
| `prioridad_id` | integer FK |
| `campo` | `"semaforo"` o `"pct_avance"` |
| `valor_anterior` | text nullable |
| `valor_nuevo` | text |
| `cambiado_por` | text nullable |
| `created_at` | timestamptz |

### `documentos_prioridad`

Metadata de adjuntos. Archivos en Supabase Storage bucket `project-docs`.

### Row Level Security

Todas las tablas: lectura pública (`SELECT USING (true)`). Escrituras requieren sesión autenticada (controlada por `proxy.ts`).

---

## Supabase clients

Dos clientes — **nunca mezclar**:
- `lib/supabase.ts` → `getSupabase()` — browser client, usar en componentes y hooks
- `lib/supabaseServer.ts` → `getSupabaseAdmin()` — service role, usar **solo** en `app/api/**`

---

## Flujo de datos

```
Supabase Postgres
  └─ app/page.tsx (Server Component)
       └─ getAllIniciativas() [lib/db.ts]
            └─ WorkOSApp (cliente)
                 │   estado: localProjects + actividad
                 │   /api/actividad/all → cargado una vez al montar
                 │
                 ├─ Vista: Mapa
                 │    ├─ ChileMap
                 │    └─ ProjectsPanel (por región seleccionada)
                 │         ├─ useRegionMetrics → regional_metrics (series BCCh)
                 │         ├─ useSeiaProjects → seia_projects
                 │         ├─ useMopProjects → mop_projects
                 │         └─ ProjectTrackerModal
                 │              ├─ seguimientos    (Supabase cliente)
                 │              ├─ semaforo_log    (Supabase cliente)
                 │              └─ documentos      (Supabase Storage)
                 │
                 ├─ Vista: Dashboard nacional → NationalDashboard
                 ├─ Vista: Bandeja de atención → AttentionTray
                 └─ Vista: Kanban → KanbanView
```

Mutaciones de semáforo / avance / responsable llaman `onUpdateIniciativa(n, patch)` → propaga a `WorkOSApp.localProjects` → todas las vistas se actualizan sin reload.

---

## Estado actual del proyecto (2026-04-13)

### Completado recientemente (sin commitear aún)

- **Rename `Project`/`Prioridad` → `Iniciativa`** en toda la app (tipos, funciones, labels UI)
  - `lib/projects.ts`: tipo `Iniciativa`, función `getIniciativas()`
  - `lib/db.ts`: `getAllIniciativas()`, `getIniciativasByCod()`
  - Alias deprecated: `Project = Iniciativa`, `getAllPrioridades = getAllIniciativas`
- **`codigo_iniciativa`** agregado al tipo `Iniciativa` y al DB row type `Prioridad`
- **`ISO_CODE`** map en `lib/regions.ts` (prefijos AP, TA, AN, AT, CO, VS, RM, LI, ML, NB, BI, AR, LR, LL, AI, MA)
- **Panel lateral limpiado**: eliminadas secciones "Contexto Regional" y "Seguridad Ley S.T.O.P"
- **Integración SEIA**: sync semanal + lista en panel regional + sección en minuta PDF
- **Integración MOP**: sync semanal + lista en panel regional + sección en minuta PDF
- **Comparativa interregional** (`RegionComparisonModal`): 16 regiones en un gráfico

### Pendiente de ejecutar en Supabase

```sql
ALTER TABLE prioridades_territoriales
  ADD COLUMN IF NOT EXISTS codigo_iniciativa TEXT;
```

### Nuevos archivos sin integrar en UI todavía

- `app/api/pib-discover/`, `app/api/pib-sync/`, `app/api/stop-sync/`
- `components/PibSectorialChart.tsx`, `components/StopPanel.tsx`
- `lib/hooks/usePibSectorial.ts`, `lib/hooks/useStopStats.ts`

### Próximos pasos

1. Ejecutar SQL de `codigo_iniciativa` en Supabase
2. Verificar localmente con `npm run dev`
3. Commit y push a `main` (deploy automático en Vercel)
4. Poblar `codigo_iniciativa` cuando llegue estructura real de grupos/compromisos
5. Futura tabla `hitos` para 4° segmento del código (`XX-NNN-NNN-NNN`)

---

## Variables de entorno

| Variable | Contexto |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor |
| `NEXT_PUBLIC_SUPABASE_ANON` | Solo cliente (browser) |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor (`app/api/**`) |
| `CRON_SECRET` | Autenticación de cron jobs (`Authorization: Bearer <secret>`) |
| `BCCH_USER` / `BCCH_PASS` | BCCh API (ine-sync) |

---

## Comandos

```bash
npm run dev      # Dev server en localhost:3000
npm run build    # Type-check + build de producción (usar para validar cambios)
npm run lint     # ESLint
```

No hay suite de tests. Validar cambios con `npm run build`.
