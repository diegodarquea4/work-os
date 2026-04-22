# Work OS — Sistema de Seguimiento de Iniciativas Territoriales

Plataforma interna del **Ministerio del Interior y Seguridad Pública de Chile**, desarrollada para la **División de Coordinación Interregional**. Centraliza el seguimiento, gestión y reporte de las iniciativas territoriales del gobierno 2026–2028 para las 16 regiones del país.

> Acceso exclusivo para funcionarios autorizados. No es un sistema público.

---

## ¿Qué problema resuelve?

La División de Coordinación Interregional debe hacer seguimiento simultáneo de cientos de iniciativas distribuidas en 16 regiones, involucrando múltiples ministerios, fuentes de financiamiento y plazos distintos. Antes de esta plataforma, ese seguimiento se hacía en planillas Excel descentralizadas.

Work OS reemplaza ese proceso con una plataforma web que permite:

- Ver el estado de cada iniciativa en tiempo real con semáforo RAG
- Registrar avances, reuniones, hitos y alertas con trazabilidad completa
- Comparar el estado entre regiones en una sola pantalla
- Enriquecer cada región con datos económicos, de inversión y seguridad actualizados automáticamente
- Generar minutas PDF listas para uso ministerial con inteligencia artificial

---

## Roles de usuario

El sistema tiene 4 niveles de acceso, controlados por la tabla `user_profiles` en Supabase:

| Rol | Qué puede hacer |
|---|---|
| **admin** | Acceso total: leer, crear, editar y eliminar cualquier iniciativa en cualquier región. Gestión de usuarios. |
| **editor** | Igual que admin, sin gestión de usuarios. |
| **regional** | Solo puede editar iniciativas de las regiones asignadas a su perfil (`region_cods`). No puede eliminar. |
| **viewer** | Solo lectura. Ve todo pero no puede modificar nada. |

La asignación de roles se hace desde la vista **Admin → Usuarios**, accesible solo para `admin`.

---

## Vistas principales

### Mapa interactivo

Muestra el mapa político de Chile. Al hacer clic en una región se abre el **panel lateral** con:

- Lista de iniciativas de esa región, filtrable por eje, estado semáforo, fuente de financiamiento y ordenable por nombre, eje o estado
- Etiqueta flotante con resumen de la región: número de iniciativas, distribución de semáforos, alertas activas
- Botones de acceso rápido a comparativa interregional e indicadores

### Dashboard nacional

Tabla completa de todas las iniciativas. Columnas: región, eje, nombre, ministerio, etapa, financiamiento, inversión, semáforo, responsable, última actividad.

Funcionalidades:
- **Filtros combinados**: por región(es), eje(s), semáforo, prioridad, responsable y búsqueda por texto
- **Barra de resumen reactiva**: muestra conteo de iniciativas filtradas y distribución de semáforos en tiempo real
- **Importar desde Excel** (solo admin/editor): carga masiva desde `.xlsx`. Valida columnas, muestra preview con errores antes de confirmar. Actualiza o inserta según si ya existe el número de iniciativa.
- **Exportar a Excel**: descarga el estado actual filtrado como `.xlsx`

### Bandeja de atención

Detecta automáticamente iniciativas que requieren acción urgente, agrupadas en tres categorías:

- **Semáforo rojo**: iniciativas bloqueadas
- **Sin actividad (+15 días)**: sin ningún registro de seguimiento en los últimos 15 días
- **Avance bajo**: iniciativas con menos del 30% de avance

### Kanban

Portfolio visual de todas las iniciativas en 4 columnas por estado RAG:
`Bloqueadas` | `En revisión` | `En verde` | `Sin evaluar`

Filtros por región y eje. Cada tarjeta muestra nombre, eje, ministerio y semáforo.

### PREGO

Módulo de seguimiento del proceso **PREGO** (Programa de Gobernanza Regional). Matriz de 16 regiones × 9 fases, donde cada celda puede estar en estado `pendiente`, `en_curso`, `completado` o `bloqueado`.

Fases: F0 Contacto → F1 Borrador → F2 Revisión → F3 (DIPRES / DESI / SUBDERE / GORE) → F4 Consolidación → F5 Firma.

---

## Modal de detalle de iniciativa

Al hacer clic en cualquier iniciativa se abre un modal con información completa y 4 tabs:

### Cabecera del modal

Muestra nombre, descripción, región, eje (con color), nivel de prioridad (Alta / Media / Baja), ministerio y semáforo RAG editable. Los campos editables incluyen:

| Campo | Tipo |
|---|---|
| Semáforo | Selector de puntos de color (verde / ámbar / rojo / gris) |
| Responsable | Dropdown con usuarios registrados en el sistema |
| Etapa actual | Preinversión / Diseño / Ejecución / Terminado |
| Fuente de financiamiento | FNDR / Sectorial / Mixto / Privado / FONDEMA / PEDZE |
| Próximo hito | Selector de tipo de hito + fecha |
| Al término de gobierno | Estado proyectado al fin de la administración |
| Inversión (MM$) | Campo numérico libre |
| Código BIP | Texto libre |
| RAT | Estado del Registro de Antecedentes Técnicos |

Todos los cambios persisten inmediatamente en Supabase.

### Tab: Seguimiento

CRUD de actualizaciones. Cada registro tiene:
- **Tipo**: Avance / Reunión / Hito / Alerta
- **Estado**: En curso / Completado / Bloqueado / Pendiente
- **Fecha**, **descripción** y **autor**

### Tab: Historial

Línea de tiempo con todos los cambios registrados: variaciones de semáforo, registros de seguimiento agrupados por mes.

### Tab: Calendario

Vista mensual de los hitos registrados con fechas.

### Tab: Documentos

Adjuntar y descargar archivos asociados a la iniciativa. Almacenados en Supabase Storage, bucket `project-docs`.

---

## Minuta regional PDF

Desde el panel lateral de cualquier región, se puede generar una minuta PDF lista para uso ministerial. Existen dos formatos:

| Formato | Descripción |
|---|---|
| **Minuta ejecutiva** | 1–2 páginas. Avances relevantes, alertas y síntesis del estado regional. |
| **Minuta completa** | Documento extendido. Resumen ejecutivo, cifras de contexto, análisis por eje, proyectos SEIA y MOP, seguridad, recomendaciones. |

Ambas minutas son **potenciadas por inteligencia artificial** (Claude Sonnet via Anthropic API). El modelo recibe como contexto:
- Iniciativas de la región con su estado
- Métricas socioeconómicas de la región
- Proyectos SEIA y MOP activos
- Datos de seguridad (LeyStop / Carabineros)
- Plan Regional PDF (si fue cargado por un administrador)

Si la API de Anthropic no está disponible, el PDF se genera igual con los datos estructurados, sin narrativa IA.

---

## Datos de contexto regional

Cada región dispone de tres fuentes de datos adicionales visibles en el panel lateral:

### Indicadores económicos (BCCh)

Series de tiempo sincronizadas semanalmente desde el **Banco Central de Chile**:
- Tasa de desocupación regional (mensual)
- PIB regional (trimestral)
- IMACEC y PIB nacional (como referencia)

Visualizados como gráficos de línea con opción de comparar las 16 regiones simultáneamente.

### Proyectos SEIA

Proyectos del **Sistema de Evaluación de Impacto Ambiental** para la región. Sincronizados semanalmente. Incluye nombre, tipo, estado, titular, inversión y fecha de presentación.

### Proyectos MOP

Proyectos del **Ministerio de Obras Públicas** para la región. Sincronizados semanalmente. Incluye nombre, servicio, etapa, inversión y comunas.

### Seguridad pública (LeyStop / Carabineros)

Datos semanales de tasa delictual, casos registrados, variación respecto a la semana anterior y top 3 tipos de delito por región. Sincronizados semanalmente desde el repositorio externo.

### Demografía Censo 2024

Datos del Censo 2024 sincronizados desde fuente externa: población total, porcentaje de inmigrantes, pueblos originarios, edad promedio, porcentaje +60 años, déficit habitacional, hacinamiento, acceso a agua, internet, jefatura femenina y educación superior.

---

## Planes Regionales

Desde la vista **Admin → Usuarios**, los administradores pueden subir el **Plan Regional PDF** de cada región. Este documento se almacena en Supabase Storage (bucket `plan-regional`) y es utilizado automáticamente como contexto adicional al generar minutas con IA.

---

## Sincronización automática (Cron Jobs)

Los siguientes procesos corren automáticamente en Vercel cada semana:

| Proceso | Horario (UTC) | Fuente | Destino |
|---|---|---|---|
| `ine-sync` | Lunes 07:00 | BCCh API | `regional_metrics` (desempleo + PIB) |
| `seia-sync` | Lunes 08:00 | API SEIA | `seia_projects` |
| `mop-sync` | Lunes 09:00 | API MOP | `mop_projects` |
| `pib-sync` | Lunes 11:00 | BCCh API | `regional_metrics` (PIB sectorial) |
| `external-sync` | Lunes 12:00 | GitHub externo | `region_metrics` (Censo 2024) + `security_weekly` (LeyStop) |
| `stop-sync` | Miércoles 10:00 | LeyStop / Carabineros | `stop_stats` |

Todos los cron jobs también se pueden disparar manualmente con:
```
POST /api/<nombre-sync>
Authorization: Bearer <CRON_SECRET>
```

---

## Base de datos

### `prioridades_territoriales`

Tabla central. Una fila por iniciativa territorial.

| Columna | Tipo | Descripción |
|---|---|---|
| `n` | integer PK | Número correlativo |
| `region` | text | Nombre de la región |
| `cod` | text | Código INE de la región (ej: `RM`, `X`, `XV`) |
| `zona` | text | Zona geográfica (Norte Grande / Norte Chico / Zona Central / Sur / Austral) |
| `eje` | text | Eje temático (ver Ejes de gobierno más abajo) |
| `eje_gobierno` | text | Agrupación transversal: `Economía` / `Seguridad` / `Social` |
| `nombre` | text | Nombre de la iniciativa |
| `descripcion` | text | Descripción libre |
| `ministerio` | text | Ministerio(s) responsable(s) |
| `prioridad` | text | `Alta` / `Media` / `Baja` |
| `etapa_actual` | text | Preinversión / Diseño / Ejecución / Terminado |
| `estado_termino_gobierno` | text | Estado proyectado al fin de la administración |
| `proximo_hito` | text | Tipo de hito siguiente |
| `fecha_proximo_hito` | date | Fecha del próximo hito |
| `fuente_financiamiento` | text | FNDR / Sectorial / Mixto / Privado / FONDEMA / PEDZE |
| `codigo_bip` | text | Código del Banco Integrado de Proyectos |
| `inversion_mm` | numeric | Inversión en millones de pesos |
| `comuna` | text | Comuna(s) de impacto |
| `rat` | text | Estado RAT: FI / IN / RS / RE / OT / En Tramitación / No Requiere |
| `estado_semaforo` | text | `verde` / `ambar` / `rojo` / `gris` |
| `pct_avance` | integer | Porcentaje de avance 0–100 |
| `responsable` | text | Email del funcionario responsable |
| `codigo_iniciativa` | text | Formato `XX-NNN-NNN` (nullable) |

### Ejes temáticos

| Eje | Agrupación gobierno |
|---|---|
| Eje 1: Infraestructura y Conectividad | Economía |
| Eje 2: Energía y Medio Ambiente | Economía |
| Eje 3: Salud y Servicios Básicos | Social |
| Eje 4: Seguridad y Soberanía | Seguridad |
| Eje 5: Desarrollo Productivo e Innovación | Economía |
| Eje 6: Familia, Educación y Equidad Territorial | Social |

### `region_metrics`

16 filas — una por región. ~90 columnas de contexto socioeconómico estático: geografía, demografía, pobreza, empleo, economía, salud, educación, vivienda, seguridad, conectividad, medio ambiente y vocación productiva. Actualizado parcialmente por el sync del Censo 2024.

### `regional_metrics`

Formato largo (long format). Series de tiempo sincronizadas desde BCCh y LeyStop.

| Columna | Descripción |
|---|---|
| `region_id` | 0 = nacional, 1–16 = regiones (ver `INE_CODE` en `lib/regions.ts`) |
| `metric_name` | Ej: `tasa_desocupacion`, `pib_regional`, `tasa_delictual` |
| `value` | Valor numérico |
| `period` | Fecha ISO (primer día del período) |

> **Importante:** usar `regionId === undefined` (no `!regionId`) al chequear — `region_id = 0` es válido y falsy.

### `security_weekly`

Snapshot semanal de seguridad por región, proveniente de LeyStop / Carabineros.

| Columna | Descripción |
|---|---|
| `region_id` | ID de región (1–16) |
| `fecha_desde` / `fecha_hasta` | Rango de la semana |
| `tasa_registro` | Tasa delictual por 100k hab |
| `casos_semana` | Casos registrados en la semana |
| `var_semana_pct` | Variación porcentual respecto a semana anterior |
| `delito_1/2/3` + `pct_1/2/3` | Top 3 tipos de delito con porcentaje |

### `seguimientos`

Actualizaciones manuales por iniciativa. Tipos: `avance`, `reunion`, `hito`, `alerta`. Estados: `en_curso`, `completado`, `bloqueado`, `pendiente`.

### `semaforo_log`

Audit trail automático de todos los cambios de semáforo y % avance. Se escribe automáticamente cada vez que se modifica el semáforo desde la UI.

### `user_profiles`

Un registro por usuario. Columnas: `id` (FK Supabase Auth), `email`, `full_name`, `role`, `region_cods` (array de códigos de región para rol `regional`).

### `prego_monitoreo`

16 filas — una por región. Columnas para cada fase del proceso PREGO con estado `pendiente | en_curso | completado | bloqueado`.

### `planes_regionales`

Metadata de los Planes Regionales subidos. Un registro por región con nombre de archivo, fecha de carga y usuario que lo subió.

### Otras tablas

- `documentos_prioridad` — metadata de archivos adjuntos por iniciativa. Archivos en bucket `project-docs`.
- `seia_projects` — proyectos SEIA sincronizados
- `mop_projects` — proyectos MOP sincronizados
- `stop_stats` — estadísticas LeyStop históricas

### Row Level Security

Lectura: pública (`SELECT USING (true)`). Escritura: requiere sesión autenticada. Las restricciones de rol se aplican a nivel de API route, no de RLS.

---

## Arquitectura técnica

### Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| UI | React 19 + TypeScript |
| Base de datos | Supabase (Postgres) |
| Autenticación | Supabase Auth (magic link / email) |
| Storage | Supabase Storage |
| Mapa | Leaflet + react-leaflet + GeoJSON |
| PDF | @react-pdf/renderer |
| IA | Anthropic API (claude-sonnet-4-6) |
| SQLite serverless | sql.js (WASM) para parsear BD externa |
| Estilos | Tailwind CSS v4 |
| Deploy | Vercel (push a `main` → deploy automático) |

### Flujo de datos en el cliente

```
Supabase Postgres
  └─ app/page.tsx (Server Component)
       └─ getAllIniciativas() — paginado de 1000 en 1000 (sin límite)
            └─ WorkOSApp (Client Component — estado global)
                 │   localProjects: Iniciativa[]
                 │   actividad: Record<number, string|null>
                 │
                 ├─ Vista Mapa
                 │    ├─ ChileMap (Leaflet, dynamic import)
                 │    └─ ProjectsPanel (panel lateral por región)
                 │         ├─ useRegionMetrics → regional_metrics
                 │         ├─ useSeiaProjects  → seia_projects
                 │         ├─ useMopProjects   → mop_projects
                 │         └─ ProjectTrackerModal
                 │              ├─ seguimientos    (Supabase cliente)
                 │              ├─ semaforo_log    (Supabase cliente)
                 │              └─ documentos      (Supabase Storage)
                 │
                 ├─ Vista Dashboard → NationalDashboard
                 ├─ Vista Bandeja   → AttentionTray
                 ├─ Vista Kanban    → KanbanView
                 └─ Vista PREGO     → PregoView
```

Las mutaciones de semáforo, etapa, responsable y otros campos llaman `onUpdateIniciativa(n, patch)` en `WorkOSApp`, que actualiza `localProjects` en memoria y propaga el cambio a todas las vistas sin recargar la página.

### Dos clientes Supabase — no mezclar

| Cliente | Archivo | Usar en |
|---|---|---|
| Browser | `lib/supabase.ts` → `getSupabase()` | Componentes React, hooks del cliente |
| Server (service role) | `lib/supabaseServer.ts` → `getSupabaseAdmin()` | Solo dentro de `app/api/**` |

### Autenticación y middleware

`proxy.ts` (Next.js middleware) protege todas las rutas. Los usuarios no autenticados son redirigidos a `/login`. La sesión se maneja con cookies via `@supabase/ssr`.

---

## Estructura de archivos

```
app/
  page.tsx                          # Server Component — carga todas las iniciativas
  login/page.tsx                    # Página de login (Supabase magic link)
  auth/callback/route.ts            # Callback OAuth/magic link
  api/
    metrics/[cod]/route.ts          # GET métricas de contexto regional
    minuta/route.ts                 # POST genera PDF minuta (react-pdf + IA)
    actividad/[cod]/route.ts        # GET última actividad por región
    actividad/all/route.ts          # GET última actividad de todas las iniciativas
    import/route.ts                 # POST carga masiva desde Excel (bulk insert 200/batch)
    iniciativa/[n]/route.ts         # DELETE elimina una iniciativa
    users/route.ts                  # GET lista de usuarios para selector de responsable
    me/route.ts                     # GET perfil del usuario autenticado
    admin/
      plan-regional/route.ts        # GET lista planes por región
      plan-regional/[cod]/route.ts  # POST/DELETE sube o elimina plan PDF
    ine-sync/route.ts               # Cron: sincroniza BCCh (desempleo + PIB)
    seia-sync/route.ts              # Cron: sincroniza proyectos SEIA
    mop-sync/route.ts               # Cron: sincroniza proyectos MOP
    pib-sync/route.ts               # Cron: sincroniza PIB sectorial BCCh
    stop-sync/route.ts              # Cron: sincroniza estadísticas LeyStop
    external-sync/route.ts          # Cron: sincroniza Censo 2024 + LeyStop SQLite (WASM)

components/
  WorkOSApp.tsx                     # Shell cliente: estado global + navegación entre vistas
  ChileMap.tsx                      # Mapa Leaflet con GeoJSON de 16 regiones
  ProjectsPanel.tsx                 # Panel lateral de región: iniciativas + etiqueta flotante
  NationalDashboard.tsx             # Tabla nacional con filtros, import y export
  AttentionTray.tsx                 # Bandeja de atención: alertas agrupadas
  KanbanView.tsx                    # Portfolio Kanban 4 columnas RAG
  PregoView.tsx                     # Módulo PREGO: matriz 16 regiones × 9 fases
  ProjectTrackerModal.tsx           # Modal de detalle: seguimiento, historial, calendario, docs
  AdminUsersView.tsx                # Gestión de usuarios + PlanesRegionalesPanel
  PlanesRegionalesPanel.tsx         # Subida de Planes Regionales PDF
  MinutaDocument.tsx                # Plantilla PDF completa (react-pdf)
  MinutaEjecutiva.tsx               # Plantilla PDF ejecutiva (react-pdf)
  MinutaLoadingModal.tsx            # Modal de carga mientras se genera el PDF
  RegionComparisonModal.tsx         # Comparativa interregional: 16 regiones en un gráfico
  IndicadoresModal.tsx              # Modal de indicadores: tendencia, seguridad, demografía
  RegionMetricsChart.tsx            # Gráfico de series BCCh (Recharts)
  SeiaProjectsList.tsx              # Lista de proyectos SEIA para el panel
  MopProjectsList.tsx               # Lista de proyectos MOP para el panel
  StopPanel.tsx                     # Panel de seguridad STOP
  PibSectorialChart.tsx             # Gráfico PIB sectorial
  modal/                            # Sub-componentes del ProjectTrackerModal
    SeguimientoTab.tsx
    HistorialTab.tsx
    CalendarioTab.tsx
    DocumentosTab.tsx

lib/
  supabase.ts                       # Cliente browser → getSupabase()
  supabaseServer.ts                 # Cliente server (service role) → getSupabaseAdmin()
  apiAuth.ts                        # requireAuth() + canWrite() + tipos de rol
  db.ts                             # Todas las funciones de acceso a BD
  types.ts                          # Tipos TypeScript: Prioridad, RegionMetrics, Seguimiento…
  projects.ts                       # Tipo Iniciativa + getIniciativas() (fallback CSV)
  regions.ts                        # Catálogo 16 regiones + INE_CODE + ISO_CODE
  config.ts                         # SEMAFORO_CONFIG, EJE_COLORS, EJE_GOBIERNO
  regionColors.ts                   # Colores por región para el mapa
  minutaAI.ts                       # Generación de narrativa IA para minutas
  context/
    UserContext.tsx                 # Context de rol: useCanEdit(), useCanEditAny()
  hooks/
    useRegionMetrics.ts             # Series BCCh por región
    useAllRegionsMetric.ts          # Todas las regiones para comparativa
    useSeiaProjects.ts              # Proyectos SEIA por región
    useMopProjects.ts               # Proyectos MOP por región
    usePibSectorial.ts              # PIB sectorial
    useStopStats.ts                 # Estadísticas STOP

public/
  chile-regiones.geojson            # Polígonos GeoJSON de las 16 regiones
  logo-pdf.png                      # Logo Ministerio para PDF (RGB PNG, no CMYK)

supabase/
  migrations/                       # Migraciones SQL históricas
```

---

## Variables de entorno

| Variable | Contexto | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON` | Cliente (browser) | Clave anon pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Clave de servicio (acceso total) |
| `CRON_SECRET` | Solo servidor | Secret para autenticar cron jobs manuales |
| `BCCH_USER` / `BCCH_PASS` | Solo servidor | Credenciales API del Banco Central |
| `ANTHROPIC_API_KEY` | Solo servidor | API key de Anthropic (minutas IA) |

---

## Comandos de desarrollo

```bash
npm run dev      # Dev server en localhost:3000
npm run build    # Type-check + build de producción — usar para validar antes de push
npm run lint     # ESLint (Next.js ruleset)
```

No hay suite de tests automatizados. Validar cambios con `npm run build` antes de cada push.

Deploy: cualquier push a `main` dispara un deploy automático en Vercel.

---

## Notas importantes para desarrolladores

- **Tailwind v4**: no usa `tailwind.config.js`. La configuración va en `postcss.config.mjs` con la directiva `@theme`.
- **Paginación Supabase**: el límite por defecto de Supabase es 1000 filas. `getAllIniciativas()` pagina automáticamente de 1000 en 1000.
- **sql.js / WASM**: para parsear el SQLite de LeyStop en `external-sync` se usa `sql.js`. Requiere `webpack: { asyncWebAssembly: true }` en `next.config.ts` y leer el `.wasm` desde `node_modules` con `readFileSync`.
- **Logo PDF**: usar `public/logo-pdf.png` (RGB PNG). react-pdf v4 no soporta JPEG CMYK de 4 canales — corrompe el layout.
- **`regionId === undefined`**: siempre chequear con `=== undefined`, nunca con `!regionId` — `region_id = 0` (nacional) es falsy y válido.
- **Dos clients Supabase**: no usar `getSupabaseAdmin()` en componentes del cliente ni `getSupabase()` en API routes que necesiten permisos elevados.
