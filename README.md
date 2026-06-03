# Work OS — Panel de Seguimiento Gubernamental

Plataforma interna del **Ministerio del Interior de Chile**, desarrollada para la **División de Coordinación Interministerial (DCI)**. Concentra el seguimiento, gestión y reporte de las iniciativas territoriales del gobierno 2026–2028 sobre las 16 regiones del país.

Internamente se la conoce como **PSG** — Panel Seguimiento Gubernamental.

> Acceso restringido a funcionarios autorizados. No es una herramienta pública.

---

## ¿Qué problema resuelve?

La DCI debe coordinar simultáneamente cientos de iniciativas distribuidas en 16 regiones, con múltiples ministerios, fuentes de financiamiento y plazos distintos. Antes de PSG el seguimiento vivía repartido en planillas Excel descentralizadas, una por SEREMI o región, sin trazabilidad ni vista nacional.

Work OS reemplaza ese flujo con una plataforma que permite:

- Ver el estado de cada iniciativa en tiempo real con semáforo RAG (verde / ámbar / rojo / gris).
- Registrar avances, reuniones, hitos y alertas con historial completo.
- Comparar el estado entre regiones en una sola pantalla.
- Enriquecer cada región con datos económicos, de inversión, seguridad y servicios actualizados automáticamente desde fuentes oficiales.
- Generar minutas PDF y carteras por ministerio listas para uso ministerial, con apoyo de IA.

---

## Roles de usuario

El sistema tiene 4 niveles de acceso, controlados por `user_profiles` en Supabase. La asignación se hace desde **Usuarios** (visible solo para `admin`).

| Rol | Qué puede hacer |
|---|---|
| **admin** | Acceso total a las 16 regiones. Crea, edita, elimina iniciativas y gestiona usuarios + planes regionales. |
| **editor** | Igual que admin, sin gestión de usuarios. |
| **regional** | Solo puede editar iniciativas de las regiones de su perfil (`region_cods`). Al ingresar es redirigido directo a su **Mi Región**. |
| **viewer** | Solo lectura. Si `region_cods` está vacío ve todo; si tiene regiones asignadas se restringe a esas. |

> El filtro de visibilidad por región también se aplica al panel del mapa, los selectores de Kanban y Atención, y la descarga de carteras PDF.

---

## Vistas principales

El header tiene 5 destinos. **Mapa** y **PREGO** son botones planos; **Dashboard / Atención / Kanban / Mi Región** viven dentro de un dropdown agrupado, y **Usuarios** aparece solo para `admin`.

Al abrir la aplicación, la región activa y la última vista se preservan en `localStorage`: si refrescás estando en Atención filtrada en Aysén, volvés ahí, no al Mapa.

### Mapa

Mapa político de Chile (Leaflet + GeoJSON). Al hacer clic en una región se abre el **panel lateral** (`ProjectsPanel`) con:

- Lista de iniciativas de la región (filtrable por eje, semáforo, financiamiento y prioridad; ordenable por nombre, eje o estado).
- Resumen flotante: número de iniciativas, distribución RAG, alertas activas.
- Botones de acceso rápido a Comparativa Interregional, Indicadores y Minuta PDF.
- Panel de indicadores económicos, SEIA, MOP, seguridad y demografía de la región.

Cuando se transita a la vista Mapa desde otra vista, el panel se abre automáticamente en la **región activa global**.

### Mi Región

Dashboard regional pensado para uso de una delegación presidencial o un perfil `regional`. Reemplaza el flujo de "mapa → panel → modal" cuando solo te interesa una región. Muestra:

- Tarjetas de métricas clave (semáforo agregado, % avance, iniciativas en foco).
- Lista de iniciativas filtrable.
- Acceso al modal de detalle por iniciativa.
- Tabs de Pulso (delitos), Seguridad, Ambiente — alimentados por los syncs externos.

### Dashboard nacional

Tabla completa de todas las iniciativas. Columnas: región, eje, nombre, ministerio, etapa, financiamiento, inversión, semáforo, responsable, última actividad.

- **Filtros combinados** por región, eje, semáforo, prioridad, responsable, búsqueda libre.
- **Barra de resumen reactiva** con conteo de iniciativas filtradas y distribución RAG.
- **Importar desde Excel** (admin/editor): carga masiva desde `.xlsx`, valida columnas y muestra preview de errores antes de confirmar.
- **Exportar a Excel** filtrado.

### Atención

Bandeja que prioriza lo que requiere acción ahora.

- **En foco**: iniciativas marcadas manualmente con la bandera `en_foco` (estilo flag de email). Sección principal de la bandeja, independiente del semáforo.
- **Sugerencias automáticas** (sección secundaria, colapsable): iniciativas en semáforo rojo, sin actividad ≥15 días, hito vencido, o con avance bajo.

La bandera "en foco" es global (no per-usuario) y se enciende/apaga desde la propia tarjeta o el modal de detalle. No tiene fechas — se administra como el flag de un cliente de correo.

### Kanban

Portfolio visual de iniciativas. Modos:

- **Por ministerio** (default): secciones colapsables tipo Monday, una por SEREMI. Pensado para reuniones de cartera ministerial. Permite descargar la **Cartera PDF** completa o filtrada a "Solo en foco".
- **Por eje**: 6 columnas planas (Ejes 1–6) con tarjetas RAG.
- **Mosaico**: vista densa de toda la región para escaneo rápido.

El selector de región muestra **las 16 regiones** (restringidas a las permitidas para usuarios `regional`/`viewer`), aunque alguna esté vacía.

### PREGO

Seguimiento del proceso **PREGO** (Programa de Gobernanza Regional). Matriz 16 regiones × 9 fases, cada celda en estado `pendiente | en_curso | completado | bloqueado`.

Fases: F0 Contacto → F1 Borrador → F2 Revisión → F3 (DIPRES / DESI / SUBDERE / GORE) → F4 Consolidación → F5 Firma.

Visible solo para `admin` y `editor`.

### Usuarios + Planes Regionales

Solo `admin`. Permite:

- Crear / desactivar usuarios.
- Asignar rol y regiones.
- Subir el **Plan Regional PDF** de cada región (bucket `plan-regional`). Estos planes se usan como contexto adicional al generar minutas IA.

---

## Modal de detalle de iniciativa

Al hacer clic en cualquier iniciativa se abre un modal con 4 tabs.

### Cabecera

Nombre, descripción, región, eje, prioridad (Alta / Media / Baja), ministerio y semáforo editable. Campos editables:

| Campo | Tipo |
|---|---|
| Semáforo | Selector de puntos (verde / ámbar / rojo / gris) |
| % avance | Numérico 0–100 |
| Responsable | Dropdown con usuarios del sistema |
| Etapa actual | Preinversión / Diseño / Ejecución / Terminado |
| Fuente de financiamiento | FNDR / Sectorial / Mixto / Privado / FONDEMA / PEDZE |
| Próximo hito | Selector de tipo + fecha |
| Estado al término de gobierno | Estado proyectado al fin de la administración |
| Inversión (MM$) | Numérico libre |
| Código BIP | Texto libre |
| RAT | Estado del Registro de Antecedentes Técnicos |
| Bandera "en foco" | Boolean |

Cada cambio persiste en Supabase con `.update().select()` para detectar 0-rows silenciosos (si RLS bloquea el UPDATE, el frontend lo expone con alerta).

### Tabs

- **Seguimiento**: CRUD de actualizaciones (tipo `avance | reunion | hito | alerta`, estado `en_curso | completado | bloqueado | pendiente`, fecha, descripción, autor).
- **Historial**: línea de tiempo de cambios de semáforo y seguimientos agrupados por mes.
- **Calendario**: vista mensual de hitos.
- **Documentos**: adjuntar / descargar archivos en Supabase Storage (`project-docs`).

---

## Minutas PDF (IA)

Desde el panel del mapa de cualquier región se pueden generar dos formatos:

| Formato | Descripción |
|---|---|
| **Minuta ejecutiva** | 1–2 páginas. Avances relevantes, alertas y síntesis. |
| **Minuta completa** | Documento extendido: resumen ejecutivo, contexto, análisis por eje, SEIA + MOP, seguridad, recomendaciones. |

Ambas se generan con `@react-pdf/renderer` y narrativa de **Claude Sonnet** (Anthropic API). El modelo recibe como contexto: iniciativas de la región, métricas socioeconómicas, SEIA/MOP, seguridad y el Plan Regional PDF si está cargado. Si la API de Anthropic falla, el PDF se genera igual con los datos estructurados sin narrativa IA.

## Cartera por ministerio PDF

Desde **Kanban → Por ministerio**, dos botones globales:

- **Descargar cartera completa**: un PDF con todas las iniciativas de la región agrupadas por ministerio, con page break por SEREMI, ~3 fichas por página, últimos 3 seguimientos por iniciativa y un recuadro vacío "Acuerdos / Actualizaciones" para anotar a mano durante la reunión.
- **Solo en foco**: mismo formato filtrado a iniciativas con `en_foco = TRUE`.

Endpoint: `POST /api/cartera-pdf` con `{ region, soloEnFoco, fecha }`.

---

## Datos de contexto regional

Cada región tiene varias fuentes externas que se sincronizan automáticamente y se exponen en el panel lateral del mapa, en Mi Región y como input de las minutas IA.

### Indicadores económicos — BCCh

Series sincronizadas desde el **Banco Central de Chile**:

- Tasa de desocupación regional (mensual).
- PIB regional (trimestral).
- IMACEC y PIB nacional como referencia.
- PIB sectorial.

Visualizadas como gráficos de línea con opción de comparar las 16 regiones simultáneamente.

### Proyectos externos — SEIA, MOP

- **SEIA**: Sistema de Evaluación de Impacto Ambiental. Una sincronización completa demora ~340s y trae nombre, tipo, estado, titular, inversión y fecha de presentación.
- **MOP**: Ministerio de Obras Públicas. Scraping HTML (`proyectos.mop.gob.cl`), ~150s, trae nombre, servicio, etapa, inversión y comunas.

Ambos hacen **dual-write**: escriben a las tablas v1 (`seia_projects`, `mop_projects`) y a la tabla v2 unificada (`v2_proyectos_inversion`). Requieren `export const maxDuration = 300` en el handler — sin esto Vercel mata el cron a los ~60s y la sincronización queda congelada.

### Seguridad pública — LeyStop / Carabineros

Snapshot semanal de tasa delictual, casos registrados, variación semana anterior y top 3 tipos de delito por región. Sincronización vía repositorio externo (GitHub).

### Demografía — Censo 2024

Población total, % inmigrantes, pueblos originarios, edad promedio, % +60, déficit habitacional, hacinamiento, acceso a agua/internet, jefatura femenina, educación superior.

### Catálogo v2 de indicadores oficiales

Pipeline más reciente (`v2_indicadores_*`) que centraliza decenas de indicadores oficiales por región en formato long. Cada indicador tiene una **fuente** registrada en `v2_fuentes` y un cron dedicado que lo refresca:

| Fuente | Indicadores que rellena |
|---|---|
| CNE (Comisión Nacional de Energía) | Capacidad instalada, % ERNC |
| SINCA (calidad del aire MMA) | PM2.5, PM10 |
| DIPRES | Inversión pública, FNDR |
| MINEDUC | Matrícula, educación parvularia |
| DEIS (MINSAL) | Hospitales, camas/1000 hab, lista de espera |
| SUBTEL | Internet fijo y móvil |
| Mercado Público / ChileCompra | Compras públicas |

Los syncs leen su URL de origen desde `v2_indicadores_pipeline.fuente_endpoint`, por lo que las URLs se pueden actualizar sin redeploy cuando la fuente cambia el archivo.

---

## Sincronización automática (Cron Jobs)

Programados en `vercel.json`. Todos aceptan trigger manual con `POST /api/<sync>` + `Authorization: Bearer <CRON_SECRET>`.

| Cron | Schedule UTC | Fuente | Destino |
|---|---|---|---|
| `ine-sync` | Lunes 07:00 | BCCh API | `regional_metrics` (desempleo + PIB) |
| `seia-sync` | Lunes 08:00 | SEIA API interna | `seia_projects` + `v2_proyectos_inversion` |
| `mop-sync` | Lunes 09:00 | proyectos.mop.gob.cl (scrape) | `mop_projects` + `v2_proyectos_inversion` |
| `stop-sync` | Miércoles 10:00 | LeyStop / Carabineros | `stop_stats` |
| `pib-sync` | Lunes 11:00 | BCCh API | `regional_metrics` (PIB sectorial) |
| `external-sync` | Lunes 12:00 | GitHub externo | `region_metrics` (Censo) + `security_weekly` |
| `cne-sync` | Lunes 13:00 | api.cne.cl | `v2_indicadores_valores` (energía) |
| `sinca-sync` | Diario 06:00 | sinca.mma.gob.cl | `v2_indicadores_valores` (aire) |
| `deis-sync` | 1° de mes 14:00 | DEIS / MINSAL | `v2_indicadores_valores` (salud) |
| `subtel-sync` | 1 ene + 1 jul 15:00 | subtel.gob.cl | `v2_indicadores_valores` (conectividad) |
| `dipres-sync` | Trimestral, día 5 | DIPRES | `v2_indicadores_valores` (inversión pública) |
| `mercadopublico-sync` | 5 ene + 5 jul | ChileCompra | `v2_indicadores_valores` (compras) |
| `mineduc-sync` | 15 marzo | datosabiertos.mineduc.cl | `v2_indicadores_valores` (educación) |

### Observabilidad

Todos los handlers escriben a `sync_status` al terminar (`lib/syncStatus.ts → recordSyncStatus`). Una query revela el estado de todos los syncs:

```sql
SELECT name, last_run_at, last_status, last_rows, last_error_count, last_error
FROM sync_status
ORDER BY last_run_at DESC;
```

---

## Base de datos

### `prioridades_territoriales`

Tabla central. Una fila por iniciativa.

| Columna | Tipo | Descripción |
|---|---|---|
| `n` | integer PK | Número correlativo |
| `region` | text | Nombre de la región |
| `cod` | text | Código región (`RM`, `X`, `XV`…) |
| `zona` | text | Zona geográfica |
| `eje` | text | Eje temático (1–6) |
| `eje_gobierno` | text | Agrupación transversal: `Economía` / `Seguridad` / `Social` |
| `nombre` / `descripcion` | text | Nombre + descripción libre |
| `ministerio` | text | Ministerio(s) responsable(s) — separados por ` · ` cuando son varios |
| `prioridad` | text | `Alta` / `Media` / `Baja` |
| `etapa_actual` | text | Preinversión / Diseño / Ejecución / Terminado |
| `estado_termino_gobierno` | text | Estado proyectado al fin de la administración |
| `proximo_hito` / `fecha_proximo_hito` | text + date | Próximo hito y fecha |
| `fuente_financiamiento` | text | FNDR / Sectorial / Mixto / Privado / FONDEMA / PEDZE |
| `codigo_bip` | text | Código del Banco Integrado de Proyectos |
| `inversion_mm` | numeric | Inversión en MM CLP |
| `comuna` | text | Comuna(s) de impacto |
| `rat` | text | Estado RAT |
| `estado_semaforo` | text | `verde` / `ambar` / `rojo` / `gris` |
| `pct_avance` | integer | 0–100 |
| `responsable` | text | Email del funcionario |
| `codigo_iniciativa` | text | Formato `XX-NNN-NNN` (nullable) |
| `origen` | text | Origen del registro (PREGO / manual / import) |
| `en_foco` | boolean | Bandera para Atención (default FALSE) |

### Ejes temáticos

| Eje | Agrupación gobierno |
|---|---|
| Eje 1: Infraestructura y Conectividad | Economía |
| Eje 2: Energía y Medio Ambiente | Economía |
| Eje 3: Salud y Servicios Básicos | Social |
| Eje 4: Seguridad y Soberanía | Seguridad |
| Eje 5: Desarrollo Productivo e Innovación | Economía |
| Eje 6: Familia, Educación y Equidad Territorial | Social |

### Catálogo v2 (`v2_*`)

Esquema unificado que convive con v1. Tablas:

- `v2_regiones` (17 filas: 16 regiones + nacional con `id=0`)
- `v2_ejes_estrategicos`, `v2_ministerios`, `v2_fuentes`
- `v2_indicadores_catalogo` — definición de cada indicador (código, unidad, fuente, periodicidad)
- `v2_indicadores_valores` — espina dorsal long format: `(codigo_indicador, region_id, periodo) → value`
- `v2_indicadores_pipeline` + `v2_indicadores_pipeline_log` — config del sync por indicador + historial
- `v2_iniciativas` — iniciativas con FKs a región/eje/ministerio (en migración desde `prioridades_territoriales`)
- `v2_proyectos_inversion` — SEIA + MOP unificados

### `region_metrics`

16 filas — una por región. ~90 columnas estáticas de contexto socioeconómico: demografía, pobreza, empleo, economía, salud, educación, vivienda, seguridad, conectividad, ambiente, vocación productiva. Actualizado parcialmente por `external-sync` (Censo 2024).

### `regional_metrics`

Long format. Series temporales de BCCh y LeyStop.

| Columna | Descripción |
|---|---|
| `region_id` | 0 = nacional, 1–16 = regiones (ver `INE_CODE` en `lib/regions.ts`) |
| `metric_name` | `tasa_desocupacion`, `pib_regional`, `tasa_delictual`, … |
| `value` | Numérico |
| `period` | Fecha ISO (primer día del período) |

> **Importante:** chequear con `regionId === undefined`, nunca con `!regionId` — `region_id = 0` (nacional) es válido y falsy.

### `security_weekly`

Snapshot semanal por región: `tasa_registro`, `casos_semana`, `var_semana_pct`, `delito_1/2/3` + `pct_1/2/3`.

### `seguimientos`

Actualizaciones manuales por iniciativa (tipo + estado + fecha + descripción + autor).

### `semaforo_log`

Audit trail automático de cambios de semáforo y % avance.

### `sync_status`

PK = `name`. Una fila por cron. Se sobreescribe en cada corrida con `last_run_at`, `last_status`, `last_rows`, `last_error_count`, `last_error`.

### `user_profiles`

`id` (FK Supabase Auth) + `email`, `full_name`, `role`, `region_cods[]`.

### `prego_monitoreo`

16 filas. Columnas por fase PREGO con estado `pendiente | en_curso | completado | bloqueado`.

### `planes_regionales`

Metadata de los planes regionales subidos (archivo, fecha, usuario).

### Otras tablas

- `documentos_prioridad` — metadata de adjuntos. Archivos en `project-docs`.
- `seia_projects`, `mop_projects` — proyectos externos v1.
- `stop_stats` — estadísticas LeyStop históricas.

### Row Level Security

- Lectura: `SELECT USING (true)`.
- Escritura en `prioridades_territoriales`: policy `authenticated_write` (`auth.uid() IS NOT NULL`) — sin esto los UPDATE devolvían 0 rows silenciosamente.
- Las restricciones por rol y región se aplican en las API routes y en el cliente (no a nivel RLS).

---

## Arquitectura técnica

### Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| UI | React 19 + TypeScript estricto |
| Base de datos | Supabase (Postgres) |
| Autenticación | Supabase Auth (magic link / email) |
| Storage | Supabase Storage (`project-docs`, `plan-regional`) |
| Mapa | Leaflet + react-leaflet + GeoJSON |
| PDF | `@react-pdf/renderer` v4 + fuente Carlito |
| IA | Anthropic API (`claude-sonnet-4-6`) |
| SQLite serverless | `sql.js` (WASM) para parsear la BD externa de LeyStop |
| Excel | `xlsx` para import/export y parseo de fuentes |
| Estilos | Tailwind CSS v4 (config en `postcss.config.mjs`) |
| Charts | Recharts |
| Deploy | Vercel — push a `main` dispara deploy automático |

### Flujo de datos en el cliente

```
Supabase Postgres
  └─ app/page.tsx (Server Component)
       └─ getAllIniciativas() — paginado de 1000 en 1000
            └─ WorkOSApp (Client Component — estado global)
                 │   localIniciativas: Iniciativa[]
                 │   activeRegionName: string  (persistido en localStorage)
                 │   view: View                (persistido en localStorage)
                 │   actividad: Record<n, lastActivityISO>
                 │
                 ├─ Mapa
                 │    ├─ ChileMap (Leaflet, dynamic import)
                 │    └─ ProjectsPanel (panel lateral por región)
                 │         ├─ useRegionMetrics    → regional_metrics
                 │         ├─ useSeiaProjects     → seia_projects
                 │         ├─ useMopProjects      → mop_projects
                 │         ├─ useV2Indicadores    → v2_indicadores_valores
                 │         └─ ProjectTrackerModal (4 tabs)
                 │
                 ├─ Mi Región        → VistaRegional
                 ├─ Dashboard        → NationalDashboard
                 ├─ Atención         → AttentionTray (sección En foco + Sugerencias)
                 ├─ Kanban           → KanbanView (Por ministerio / Por eje / Mosaico)
                 ├─ PREGO            → PregoView
                 └─ Usuarios         → AdminUsersView + PlanesRegionalesPanel
```

Las mutaciones (semáforo, etapa, responsable, en_foco, …) llaman `onUpdatePrioridad(n, patch)` en `WorkOSApp`, que actualiza `localIniciativas` en memoria y propaga el cambio a todas las vistas sin recargar.

### Dos clientes Supabase — no mezclar

| Cliente | Archivo | Usar en |
|---|---|---|
| Browser | `lib/supabase.ts` → `getSupabase()` | Componentes React, hooks del cliente |
| Server (service role) | `lib/supabaseServer.ts` → `getSupabaseAdmin()` | Solo dentro de `app/api/**` |
| Browser secundario (Colega) | `lib/supabaseColega.ts` → `getSupabaseColega()` | Lectura de la BD externa "Colega" para empleo/seguridad complementaria |

### Autenticación y middleware

`proxy.ts` (Next.js middleware) protege todas las rutas. Usuarios no autenticados son redirigidos a `/login`. Sesión vía cookies con `@supabase/ssr`.

---

## Estructura de archivos

```
app/
  page.tsx                          # Server Component — carga todas las iniciativas
  layout.tsx                        # Root layout
  login/page.tsx                    # Magic link
  auth/callback/route.ts            # Callback OAuth
  error.tsx · not-found.tsx
  admin/pipeline/page.tsx           # Admin: estado del pipeline v2 de indicadores
  api/
    me/route.ts                     # GET perfil del usuario autenticado
    users/route.ts                  # GET usuarios para selector de responsable
    admin/users/                    # CRUD de usuarios (admin)
    admin/plan-regional/            # Subida de Planes Regionales
    metrics/[cod]/route.ts          # GET métricas de contexto regional
    actividad/[cod]/ + all/         # Última actividad por región / global
    minuta/route.ts                 # POST genera PDF minuta (ejecutiva o completa)
    cartera-pdf/route.ts            # POST genera Cartera por ministerio PDF
    import/route.ts                 # POST carga masiva desde Excel
    iniciativa/[n]/route.ts         # DELETE iniciativa
    seed-fase3/route.ts             # Carga inicial PREGO fase 3
    v2/refresh-views/route.ts       # Refresh materialized views v2
    # ── Crons de sincronización ──
    ine-sync/    pib-sync/    external-sync/
    seia-sync/   mop-sync/    stop-sync/
    cne-sync/    sinca-sync/  deis-sync/
    subtel-sync/ dipres-sync/ mineduc-sync/
    mercadopublico-sync/
    # ── Discovery (admin/debug) ──
    ine-discover/  pib-discover/

components/
  WorkOSApp.tsx                     # Shell cliente: estado global + navegación
  ChileMap.tsx                      # Mapa Leaflet con GeoJSON
  ProjectsPanel.tsx                 # Panel lateral por región
  NationalDashboard.tsx             # Tabla nacional con filtros, import, export
  AttentionTray.tsx                 # Bandeja: En foco + Sugerencias
  KanbanView.tsx                    # Portfolio: Por ministerio / Por eje / Mosaico
  VistaRegional.tsx                 # Mi Región (dashboard regional)
  PregoView.tsx                     # Matriz PREGO 16 × 9
  AdminUsersView.tsx                # Gestión de usuarios
  PlanesRegionalesPanel.tsx         # Subida de planes PDF
  ProjectTrackerModal.tsx           # Modal de iniciativa (4 tabs)
  CarteraPdf.tsx                    # PDF cartera por ministerio (react-pdf)
  MinutaDocumentV2.tsx              # PDF minuta completa v2
  MinutaEjecutiva.tsx               # PDF minuta ejecutiva
  MinutaLoadingModal.tsx            # Modal de carga durante generación
  IndicadoresModalV2.tsx            # Modal de indicadores v2
  KpiCardV2.tsx · FichaRegional.tsx · CollapsibleSection.tsx
  SeiaProjectsList.tsx · MopProjectsList.tsx
  modal/                            # Sub-tabs de ProjectTrackerModal
    SeguimientoTab.tsx · HistorialTab.tsx
    CalendarioTab.tsx · DocumentosTab.tsx
  icons/                            # SVGs (FlagIcon, …)

lib/
  supabase.ts                       # Cliente browser
  supabaseServer.ts                 # Cliente server (service role)
  supabaseColega.ts                 # Cliente browser secundario (BD Colega)
  apiAuth.ts                        # requireAuth() + canWrite() + tipos de rol
  db.ts                             # Funciones de acceso a BD
  types.ts                          # Tipos compartidos
  projects.ts                       # Tipo Iniciativa + fallback CSV
  regions.ts                        # Catálogo 16 regiones + INE_CODE
  regionColors.ts                   # Colores por región para el mapa
  regionNameMatcher.ts              # Match flexible de nombres (acentos, alias)
  config.ts                         # SEMAFORO_CONFIG, EJE_COLORS, splitMinisterios
  indicatorUtils.ts                 # Helpers para indicadores v2
  parseExcel.ts                     # Helpers de parsing Excel (xlsx)
  pdfFonts.ts                       # Registro de fuentes Carlito para react-pdf
  syncStatus.ts                     # recordSyncStatus() → tabla sync_status
  syncHelper.ts                     # isAuthorizedSync() + upsertV2WithLog()
  minutaAI.ts                       # Generación de narrativa IA para minutas
  context/UserContext.tsx           # useCanEdit() / useCanEditAny()
  hooks/
    useRegionMetrics.ts · useAllRegionsMetric(s).ts
    useSeiaProjects.ts · useMopProjects.ts
    useV2Catalogo.ts · useV2Dashboard.ts · useV2Indicadores.ts
    useRegionIndicadores.ts
    useColegaEmpleo.ts · useColegaSeguridad.ts
    useInactivityLogout.ts

public/
  chile-regiones.geojson            # Polígonos GeoJSON de las 16 regiones
  logo-pdf.png                      # Logo Ministerio para PDF (RGB PNG, no CMYK)
  logo-ministerio.jpg               # Logo header

supabase/
  migrations/                       # SQL historiado (001 → 010)
```

---

## Variables de entorno

| Variable | Contexto | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON` | Cliente | Clave anon pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Clave de servicio (acceso total) |
| `NEXT_PUBLIC_SUPABASE_COLEGA_URL` | Cliente | URL del proyecto Supabase "Colega" |
| `NEXT_PUBLIC_SUPABASE_COLEGA_ANON` | Cliente | Anon del proyecto Colega |
| `CRON_SECRET` | Servidor | Bearer para triggers manuales de crons |
| `BCCH_USER` / `BCCH_PASS` | Servidor | Credenciales API Banco Central |
| `ANTHROPIC_API_KEY` | Servidor | API key para minutas IA |
| `CNE_API_TOKEN` | Servidor | Token api.cne.cl (registro gratuito) |

---

## Comandos

```bash
npm run dev      # Dev server en localhost:3000
npm run build    # Type-check + build de producción — validar antes de cada push
npm run lint     # ESLint (Next.js ruleset)
```

No hay test suite automatizado. Validar cambios con `npm run build` antes de hacer push. Cualquier push a `main` dispara un deploy automático en Vercel.

---

## Notas importantes para devs

- **Next.js 16 es distinto al que conocés**: hay breaking changes respecto a 15.x. El middleware vive en `proxy.ts`, no `middleware.ts`. Antes de escribir código, revisar `node_modules/next/dist/docs/`.
- **Tailwind v4**: sin `tailwind.config.js`. Config en `postcss.config.mjs` con la directiva `@theme`.
- **Paginación Supabase**: el límite default es 1000 filas. `getAllIniciativas()` pagina automáticamente de 1000 en 1000.
- **`regionId === undefined`**: siempre chequear con `=== undefined`, nunca `!regionId` — `region_id = 0` (nacional) es válido y falsy.
- **Dos (tres) clientes Supabase**: no usar `getSupabaseAdmin()` en componentes del cliente; no usar `getSupabase()` en API routes que necesiten permisos elevados; `getSupabaseColega()` es solo para lectura de la BD secundaria.
- **`maxDuration` en crons largos**: SEIA, MOP y syncs Excel necesitan `export const maxDuration = 300` (o 120 para los más cortos). Sin esto Vercel mata el handler a los ~60s y la sync queda congelada **sin error visible**.
- **RLS UPDATE silencioso**: si un `.update()` no afecta filas por RLS, Supabase no lanza error. Usar `.update().eq().select('campos')` y chequear `data.length` para detectar 0-rows.
- **Dual-write SEIA/MOP**: las syncs escriben a v1 (`{seia,mop}_projects`) y v2 (`v2_proyectos_inversion`) en la misma corrida. Si rompés una, romper la otra explícito.
- **Observabilidad de syncs**: cada handler debe llamar `recordSyncStatus(name, …)` al terminar. Sin esto el cron corre pero no se ve en `sync_status`.
- **PDF / logo**: usar `public/logo-pdf.png` (RGB PNG). react-pdf v4 no soporta JPEG CMYK de 4 canales — corrompe el layout.
- **`sql.js` / WASM**: para parsear el SQLite externo de LeyStop. Requiere `webpack: { asyncWebAssembly: true }` en `next.config.ts` y leer el `.wasm` desde `node_modules` con `readFileSync`.
- **SQL en Supabase**: los cambios de schema se hacen siempre **manualmente** desde el SQL Editor de Supabase, nunca desde el código de la app. Las migraciones de `supabase/migrations/` son histórico, no se ejecutan automáticamente.
- **Naming**: la división es **División de Coordinación Interministerial** (nunca "Interregional") y el ministerio es **Ministerio del Interior** (nunca "y Seguridad Pública").