# Work OS · Panel de Seguimiento Gubernamental (PSG)

Plataforma interna del **Ministerio del Interior de Chile**, desarrollada para la **División de Coordinación Interministerial (DCI)**. Concentra el seguimiento, gestión y reporte de las iniciativas territoriales del gobierno 2026–2028 sobre las 16 regiones del país.

Internamente se la conoce como **PSG** — Panel de Seguimiento Gubernamental.

> Acceso restringido a funcionarios autorizados. No es una herramienta pública.

---

## Tabla de contenidos

- [Qué problema resuelve](#qué-problema-resuelve)
- [Roles y permisos](#roles-y-permisos)
- [Vistas principales](#vistas-principales)
- [Modal de detalle de iniciativa](#modal-de-detalle-de-iniciativa)
- [Carga masiva: importación y propuestas](#carga-masiva-importación-y-propuestas)
- [Minutas y Cartera PDF (con IA)](#minutas-y-cartera-pdf-con-ia)
- [Datos de contexto regional](#datos-de-contexto-regional)
- [Sincronización automática](#sincronización-automática)
- [Base de datos](#base-de-datos)
- [Seguridad y Row Level Security](#seguridad-y-row-level-security)
- [Arquitectura técnica](#arquitectura-técnica)
- [Estructura de archivos](#estructura-de-archivos)
- [Variables de entorno](#variables-de-entorno)
- [Comandos](#comandos)
- [Notas para desarrolladores](#notas-para-desarrolladores)

---

## Qué problema resuelve

La DCI debe coordinar simultáneamente miles de iniciativas distribuidas en 16 regiones, con múltiples ministerios, fuentes de financiamiento y plazos. Antes de PSG el seguimiento vivía repartido en planillas Excel descentralizadas, una por SEREMI o región, sin trazabilidad ni visión nacional.

Work OS reemplaza ese flujo con una plataforma que permite:

- Ver el estado de cada iniciativa en tiempo real con **semáforo RAG** (verde / ámbar / rojo / gris).
- Registrar avances, reuniones, hitos y alertas con historial completo y auditoría.
- Comparar el estado entre regiones en una sola pantalla.
- Enriquecer cada región con datos económicos, de inversión, seguridad y servicios sociales **sincronizados automáticamente** desde fuentes oficiales (BCCh, SEIA, MOP, CNE, DEIS, MINEDUC, SINCA, SUBTEL, DIPRES, ChileCompra y Carabineros).
- **Generar minutas PDF y carteras por ministerio** listas para uso ejecutivo, con apoyo de IA (Claude Sonnet).
- Canalizar el flujo de propuestas entre regiones y el nivel central (regional propone → admin/editor aprueba).

---

## Roles y permisos

El sistema tiene 4 niveles de acceso, definidos en `user_profiles.role` y enforced en 3 capas: políticas RLS de Postgres, validación en las API routes (`lib/apiAuth.ts`) y gates de UI (`lib/context/UserContext.tsx`).

| Rol | Qué puede hacer |
|---|---|
| **admin** | Acceso total a las 16 regiones. Crea, edita y elimina iniciativas. Define el catálogo de ejes regionales. Gestiona usuarios, roles y planes regionales. Aprueba o rechaza propuestas. |
| **editor** | Igual que admin **excepto** gestión de usuarios. |
| **regional** | Edición operativa (semáforo, % avance, responsable, etapa, hito, foco) restringida a sus regiones asignadas (`region_cods[]`). Cualquier otro cambio se canaliza vía propuesta. Al ingresar es redirigido directo a su vista **Mi Región**. |
| **viewer** | Solo lectura del catálogo, **excepto** que puede crear y editar sus propios Seguimientos y Documentos en cualquier iniciativa. |

Cualquier cambio en producción a la matriz de permisos queda documentado en [`CLAUDE.md`](CLAUDE.md) y en las migraciones SQL correspondientes (la última: mig 026, junio 2026).

> El filtro de visibilidad por región también se aplica al panel del mapa, los selectores de Kanban y Atención, y la descarga de carteras PDF.

---

## Vistas principales

El header tiene **5 destinos visibles**. Mapa y PREGO son botones planos; Dashboard / Atención / Kanban / Mi Región viven dentro de un dropdown agrupado, y Usuarios aparece solo para admin.

Al abrir la aplicación, la región activa y la última vista se preservan en `localStorage`: si refrescás estando en Atención filtrada en Aysén, volvés ahí, no al Mapa.

### Mapa

Mapa político de Chile (Leaflet + GeoJSON). Al hacer clic en una región se abre el **panel lateral** (`ProjectsPanel`) con:

- Lista de iniciativas de la región (filtrable por eje, semáforo, financiamiento y prioridad; ordenable por nombre, eje o estado).
- Resumen flotante: número de iniciativas, distribución RAG, alertas activas.
- Botones de acceso rápido a Comparativa Interregional, Indicadores y generación de Minuta PDF.
- Panel de indicadores económicos, SEIA, MOP, seguridad y demografía de la región.

Cuando se transita a la vista Mapa desde otra vista, el panel se abre automáticamente en la región activa global.

### Mi Región

Dashboard regional pensado para una delegación presidencial o un perfil `regional`. Reemplaza el flujo "mapa → panel → modal" cuando solo interesa una región. Muestra:

- Tarjetas de métricas clave (semáforo agregado, % avance, iniciativas en foco).
- Lista de iniciativas filtrable.
- Acceso al modal de detalle por iniciativa.
- Tabs de Pulso (delitos), Seguridad y Ambiente alimentados por los syncs externos.
- Métricas por eje regional con compromiso reportable: admin define el objetivo, regional reporta el `valor_actual` dentro de sus regiones.

### Dashboard nacional

Tabla completa de todas las iniciativas. Columnas: región, eje, nombre, ministerio, etapa, financiamiento, inversión, semáforo, responsable, capa, última actividad.

- **Filtros combinados** por región, eje, semáforo, prioridad, responsable, capa y búsqueda libre.
- **Barra de resumen reactiva** con conteo de iniciativas filtradas y distribución RAG.
- **Importar desde Excel** (admin/editor directo, regional vía propuesta): carga masiva desde `.xlsx`, validación de columnas, preview de errores antes de confirmar.
- **Exportar a Excel** respetando los filtros activos.

### Atención

Bandeja que prioriza lo que requiere acción ahora.

- **En foco**: iniciativas marcadas manualmente con la bandera `en_foco` (estilo flag de email). Sección principal de la bandeja, independiente del semáforo.
- **Sugerencias automáticas** (sección secundaria, colapsable): iniciativas en semáforo rojo, sin actividad ≥15 días, con hito vencido o avance bajo.

La bandera "en foco" es global (no per-usuario) y se enciende/apaga desde la tarjeta o el modal. No tiene fechas — se administra como un flag de cliente de correo.

### Kanban

Portfolio visual de iniciativas. Tres modos:

- **Por ministerio** (default): secciones colapsables tipo Monday, una por SEREMI. Pensado para reuniones de cartera ministerial. Permite descargar la Cartera PDF completa o filtrada a "Solo en foco".
- **Por eje**: 6 columnas planas (Ejes 1–6) con tarjetas RAG.
- **Mosaico**: vista densa de toda la región para escaneo rápido.

El selector de región muestra las 16 regiones (restringidas a las permitidas para `regional`/`viewer`), aunque alguna esté vacía.

### PREGO

Seguimiento del proceso **PREGO** (Programa de Gobernanza Regional). Matriz 16 regiones × 9 fases, cada celda en estado `pendiente | en_curso | completado | bloqueado`.

Fases: F0 Contacto → F1 Borrador → F2 Revisión → F3 (DIPRES / DESI / SUBDERE / GORE) → F4 Consolidación → F5 Firma.

Visible solo para admin y editor.

### Usuarios y Planes Regionales

Solo admin. Permite:

- Crear / desactivar usuarios.
- Asignar rol y regiones (`region_cods[]`).
- Subir el **Plan Regional PDF** de cada región (bucket `plan-regional`). Estos planes se usan como contexto adicional al generar minutas con IA.

---

## Modal de detalle de iniciativa

Al hacer clic en cualquier iniciativa se abre un modal con cabecera editable y 4 tabs.

### Cabecera

Nombre, descripción, región, eje, prioridad, ministerio y semáforo. Campos editables (sujetos al rol y la región asignada del usuario):

| Campo | Tipo | Comentarios |
|---|---|---|
| Semáforo | Selector RAG | `verde · ámbar · rojo · gris` |
| % avance | 0–100 | |
| Responsable | Dropdown de usuarios | Se popula desde `user_profiles` con rol staff |
| Etapa actual | enum | `Preinversión · Diseño · Ejecución · Terminado` |
| Fuente de financiamiento | enum | `FNDR · Sectorial · Mixto · Privado · FONDEMA · PEDZE` |
| Próximo hito + fecha | texto + fecha | |
| Estado al término de gobierno | enum | Proyección al fin de la administración |
| Inversión (MM CLP) | numérico | |
| Código BIP | texto | |
| RAT | enum | Estado del Registro de Antecedentes Técnicos |
| Capa | enum | `lll` (menos crítica, default) / `ll` / `l` (top prioridades). Solo admin/editor define. |
| Bandera "en foco" | boolean | |

Cada cambio persiste vía `safeWrite()` ([`lib/dbWrite.ts`](lib/dbWrite.ts)) que detecta el caso "HTTP 200 + data:[]" — síntoma de que RLS bloqueó el UPDATE en silencio — y expone el error al frontend con `window.alert`.

### Tabs

- **Seguimiento**: CRUD de actualizaciones (tipo `avance | reunion | hito | alerta`; estado `en_curso | completado | bloqueado | pendiente`; fecha; descripción; autor). Cualquier usuario autenticado puede crear; solo el autor o staff puede editar/eliminar.
- **Historial**: línea de tiempo de cambios de semáforo y seguimientos agrupados por mes.
- **Calendario**: vista mensual de hitos.
- **Documentos**: adjuntar / descargar archivos en Supabase Storage (bucket `project-docs`). Mismas reglas de autoría que Seguimiento.

---

## Carga masiva: importación y propuestas

### Importación desde Excel

Endpoint `POST /api/import`. Cliente: botón **Importar** del Dashboard nacional.

El parser ([`lib/importParser.ts`](lib/importParser.ts)) espera headers **exactos** en el archivo:

| Header obligatorio | Mapea a | Notas |
|---|---|---|
| `Región` | `region` | Con tilde. Se normaliza para matching tolerante a acentos. |
| `Nombre Iniciativa` | `nombre` | Con espacio, ambas con mayúscula. |
| `Eje` | `eje` | Se resuelve contra el catálogo de ejes de su región. |
| `Ministerio` | `ministerio` | Texto libre. |

Headers opcionales: `#` (para UPDATE), `Código BIP`, `Origen`, `Descripción`, `Comuna`, además de los campos editables del modal.

- Si la columna `#` está vacía → la fila se **inserta** como nueva iniciativa, con un `n` correlativo nuevo.
- Si la columna `#` tiene un número → la fila **actualiza** la iniciativa con ese `n`. Solo campos no vacíos se aplican (skip-si-vacío).

Para nuevos usuarios la forma más segura de armar el archivo es descargar el **template canónico** desde el panel; arma headers correctos y deja columnas con descripción de cada campo.

### Sistema de propuestas (two-stage push)

Cuando un usuario `regional` quiere modificar un campo que no está en su whitelist (todo lo que no sea semáforo, % avance, responsable, etapa, hito, foco), el cambio se canaliza como una **propuesta** en `import_proposals`:

1. Regional sube el Excel (o edita en UI).
2. El sistema valida y guarda la solicitud como `pending`.
3. Admin/editor revisa desde el panel **Propuestas**, ve el diff y aprueba o rechaza.
4. Al aprobar, el cambio se aplica con permisos elevados (`getSupabaseAdmin()`) y queda registrado en `import_proposal_logs` con el aprobador.

Esto mantiene `regional` con autonomía operativa sobre el día a día y trazabilidad sobre cambios estructurales.

---

## Minutas y Cartera PDF (con IA)

### Minuta regional

Desde el panel del mapa de cualquier región se pueden generar dos formatos:

| Formato | Páginas | Contenido |
|---|---|---|
| **Minuta ejecutiva** | 1–2 | Avances relevantes, alertas, síntesis. |
| **Minuta completa** | extensa | Resumen ejecutivo, contexto, análisis por eje, SEIA + MOP, seguridad, recomendaciones. |

Ambas se generan con `@react-pdf/renderer` (fuente Carlito) y la narrativa la produce **Claude Sonnet** vía Anthropic API. El modelo recibe como contexto: iniciativas de la región, métricas socioeconómicas, SEIA/MOP, seguridad y el Plan Regional PDF si está cargado.

Si la API de Anthropic falla o `ANTHROPIC_API_KEY` no está definida, el PDF se genera igual con los datos estructurados sin narrativa IA — degrada elegantemente, no se rompe.

### Cartera por ministerio

Desde **Kanban → Por ministerio**, dos botones globales:

- **Descargar cartera completa**: PDF con todas las iniciativas de la región agrupadas por ministerio, con page break por SEREMI, ~3 fichas por página, últimos 3 seguimientos por iniciativa y un recuadro "Acuerdos / Actualizaciones" en blanco para anotar a mano durante la reunión.
- **Solo en foco**: mismo formato filtrado a iniciativas con `en_foco = TRUE`.

Endpoint: `POST /api/cartera-pdf` con `{ region, soloEnFoco, fecha }`.

---

## Datos de contexto regional

Cada región tiene varias fuentes externas que se sincronizan automáticamente y se exponen en el panel lateral del Mapa, en Mi Región y como input de las minutas con IA.

### Indicadores económicos — BCCh

Series sincronizadas desde el **Banco Central de Chile** (API REST autenticada):

- Tasa de desocupación regional (mensual).
- PIB regional (trimestral) y PIB sectorial.
- IMACEC y PIB nacional como referencia.

Visualizadas como gráficos de línea con opción de comparar las 16 regiones simultáneamente.

### Proyectos externos — SEIA, MOP

- **SEIA**: Sistema de Evaluación de Impacto Ambiental. Una sincronización completa demora ~340s y trae nombre, tipo, estado, titular, inversión y fecha de presentación. Existe una versión troceada reanudable (`/api/seia-sync-v2`) que corta limpio a 240s con cursor en `sync_status.notes`.
- **MOP**: Ministerio de Obras Públicas. Scraping HTML de `proyectos.mop.gob.cl`, ~150s, trae nombre, servicio, etapa, inversión y comunas.

Ambos hacen **dual-write**: escriben a las tablas v1 (`seia_projects`, `mop_projects`) y a la tabla v2 unificada (`v2_proyectos_inversion`). Requieren `export const maxDuration = 300` en el handler.

### Seguridad pública — LeyStop / Carabineros

Snapshot semanal de tasa delictual, casos registrados, variación semana anterior y top 3 tipos de delito por región. Sincronización vía repositorio externo en GitHub.

### Demografía — Censo 2024

Población total, % inmigrantes, pueblos originarios, edad promedio, % +60, déficit habitacional, hacinamiento, acceso a agua/internet, jefatura femenina, educación superior.

### Catálogo v2 de indicadores oficiales

Pipeline unificado (`v2_indicadores_*`) que centraliza decenas de indicadores oficiales por región en formato long. Cada indicador tiene una fuente registrada y su frescura se controla con `tolerancia_atraso_dias`. Cada sync llama `updateV2Pipeline()` para registrar su última corrida.

| Fuente | Indicadores |
|---|---|
| CNE (Comisión Nacional de Energía) | Capacidad instalada, % ERNC |
| SINCA (calidad del aire MMA) | PM2.5, PM10 |
| DIPRES | Inversión pública, FNDR |
| MINEDUC | Matrícula, educación parvularia |
| DEIS (MINSAL) | Hospitales, camas/1000 hab, lista de espera |
| SUBTEL | Internet fijo y móvil |
| ChileCompra | Compras públicas |

> **Estado de v2 (junio 2026):** v2 está **congelado como "solo indicadores"**. El cutover completo de iniciativas/minutas a v2 nunca se hizo y no se va a hacer — v1 (`prioridades_territoriales`, `region_metrics`, `regional_metrics`) sigue siendo el canon. Las tablas huérfanas `v2_iniciativas*` se eliminaron en mig 025.

---

## Sincronización automática

Los crons están programados en [`.github/workflows/cron-syncs.yml`](.github/workflows/cron-syncs.yml) **no en `vercel.json`** — el plan Hobby de Vercel limita a 2 crons y necesitamos 13. Todos aceptan trigger manual con `POST /api/<sync>` + `Authorization: Bearer <CRON_SECRET>`.

| Sync | Schedule UTC | Fuente | Destino |
|---|---|---|---|
| `ine-sync` | Lunes 07:00 | BCCh API | `regional_metrics` (desempleo + PIB) + `v2_indicadores_valores` |
| `seia-sync` | Lunes 08:00 | SEIA API interna | `seia_projects` + `v2_proyectos_inversion` |
| `mop-sync` | Lunes 09:00 | proyectos.mop.gob.cl (scrape) | `mop_projects` + `v2_proyectos_inversion` |
| `stop-sync` | Miércoles 10:00 | LeyStop / Carabineros | `stop_stats` |
| `pib-sync` | Lunes 11:00 | BCCh API | `regional_metrics` + `v2_indicadores_valores` |
| `external-sync` | Lunes 12:00 | GitHub externo | `region_metrics` (Censo) + `security_weekly` |
| `cne-sync` | Lunes 13:00 | api.cne.cl | `v2_indicadores_valores` |
| `sinca-sync` | Diario 06:00 | sinca.mma.gob.cl | `v2_indicadores_valores` |
| `deis-sync` | 1° de mes 14:00 | DEIS / MINSAL | `v2_indicadores_valores` |
| `subtel-sync` | 1 ene + 1 jul 15:00 | subtel.gob.cl | `v2_indicadores_valores` |
| `dipres-sync` | Trimestral, día 5 | DIPRES | `v2_indicadores_valores` |
| `mercadopublico-sync` | 5 ene + 5 jul | ChileCompra | `v2_indicadores_valores` |
| `mineduc-sync` | 15 marzo | datosabiertos.mineduc.cl | `v2_indicadores_valores` |

### Observabilidad unificada

`GET /api/health` (auth con `CRON_SECRET`) consolida la salud de los 13 crons + el pipeline v2:

- Lee `sync_status` para los syncs v1 → devuelve listas `atrasados[]` y `con_errores[]`.
- Lee `v2_indicadores_pipeline` por indicador → calcula frescura usando `tolerancia_atraso_dias` y devuelve `{ activos, con_data, error, parcial, never, stale }` más `indicadores_v2_problemas[]`.
- Si la variable `ALERT_WEBHOOK_URL` está definida y `ok=false`, postea el resumen a Slack/Discord.

Una query rápida revela todo:

```sql
SELECT name, last_run_at, last_status, last_rows, last_error_count
FROM sync_status
ORDER BY last_run_at DESC;
```

---

## Base de datos

### `prioridades_territoriales` — tabla central

Una fila por iniciativa. PK = `id` (UUID); `n` es número correlativo de negocio (UNIQUE BTREE).

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | Llave estable de mutación — **usar siempre `.eq('id', prioridad.id)`** en UPDATE |
| `n` | integer | Número de orden de negocio |
| `region`, `cod`, `capital`, `zona` | text | Datos geográficos |
| `eje`, `eje_id`, `eje_gobierno` | text + int | Eje temático (1–6) + FK al catálogo + agrupación transversal |
| `nombre`, `descripcion` | text | |
| `ministerio` | text | Separados por ` · ` cuando son varios |
| `prioridad` | text | `Alta · Media · Baja` |
| `etapa_actual` | text | `Preinversión · Diseño · Ejecución · Terminado` |
| `estado_termino_gobierno` | text | Estado proyectado al fin de la administración |
| `proximo_hito`, `fecha_proximo_hito` | text + date | |
| `fuente_financiamiento` | text | `FNDR · Sectorial · Mixto · Privado · FONDEMA · PEDZE` |
| `codigo_bip`, `codigo_iniciativa` | text | Códigos externos |
| `inversion_mm` | numeric | Inversión en MM CLP |
| `comuna`, `rat` | text | |
| `estado_semaforo` | text | `verde · ambar · rojo · gris` |
| `pct_avance` | int | 0–100 |
| `responsable` | text | Email del funcionario |
| `origen` | text | `PREGO · manual · import` |
| `en_foco` | boolean | Bandera para Atención |
| `capa` | text | `lll` (default, menos crítica) / `ll` / `l` (top) |
| `es_desalojo` | boolean | Marca casos especiales del módulo Bandeja |

### Ejes temáticos

| Eje | Agrupación gobierno |
|---|---|
| 1: Infraestructura y Conectividad | Economía |
| 2: Energía y Medio Ambiente | Economía |
| 3: Salud y Servicios Básicos | Social |
| 4: Seguridad y Soberanía | Seguridad |
| 5: Desarrollo Productivo e Innovación | Economía |
| 6: Familia, Educación y Equidad Territorial | Social |

### Catálogo v2 (solo indicadores)

- `v2_regiones` (17 filas: 16 regiones + nacional con `id=0`)
- `v2_ejes_estrategicos`, `v2_ministerios`, `v2_fuentes`
- `v2_indicadores_catalogo` — definición de cada indicador (código, unidad, fuente, periodicidad, `tolerancia_atraso_dias`)
- `v2_indicadores_valores` — long format: `(codigo_indicador, region_id, periodo) → value`
- `v2_indicadores_pipeline` + `v2_indicadores_pipeline_log` — config de cada sync + historial
- `v2_proyectos_inversion` — SEIA + MOP unificados

### `region_metrics`

16 filas — una por región. ~90 columnas estáticas de contexto: demografía, pobreza, empleo, salud, educación, vivienda, seguridad, conectividad, ambiente, vocación productiva. Actualizadas parcialmente por `external-sync` (Censo 2024).

### `regional_metrics`

Long format. Series temporales de BCCh y LeyStop.

| Columna | Descripción |
|---|---|
| `region_id` | 0 = nacional, 1–16 = regiones (ver `INE_CODE` en [`lib/regions.ts`](lib/regions.ts)) |
| `metric_name` | `tasa_desocupacion`, `pib_regional`, `tasa_delictual`, … |
| `value` | Numérico |
| `period` | Fecha ISO (primer día del período) |

> **Crítico:** chequear con `regionId === undefined`, nunca con `!regionId` — `region_id = 0` (nacional) es válido y falsy.

### Operacionales

- `seguimientos` — actualizaciones manuales por iniciativa.
- `documentos_prioridad` — metadata de adjuntos (archivos en bucket `project-docs`).
- `semaforo_log` — audit automático de cambios de semáforo y % avance.
- `sync_status` — PK = `name`. Una fila por cron, se sobreescribe en cada corrida.
- `user_profiles` — `id` (FK Supabase Auth) + `email`, `full_name`, `role`, `region_cods[]`.
- `prego_monitoreo` — 16 filas. Columnas por fase PREGO con estado.
- `planes_regionales` — metadata de los planes regionales subidos.
- `region_ejes` — catálogo formal de ejes por región (FK `eje_id`).
- `metricas_eje` — métricas reportables por eje regional.
- `import_proposals`, `import_proposal_logs` — sistema de propuestas (two-stage push).
- `desalojo_*` — 6 tablas del módulo Bandeja de Atención de desalojos.
- `seia_projects`, `mop_projects` — proyectos externos v1 (compat).
- `stop_stats`, `security_weekly` — estadísticas de seguridad pública.

---

## Seguridad y Row Level Security

La RLS por rol vive en [`supabase/migrations/023_rls_por_rol.sql`](supabase/migrations/023_rls_por_rol.sql), actualizada por [`026_open_seguimientos_documentos.sql`](supabase/migrations/026_open_seguimientos_documentos.sql).

### Función `current_user_role()`

Lee `user_profiles.role` del `auth.uid()` actual. Devuelve `NULL` si el usuario no tiene fila — caso edge que las policies del trio operativo de `prioridades_territoriales` y de Seguimientos/Documentos manejan vía `auth.uid() IS NOT NULL` (mig 026).

### Matriz vigente

| Tabla | INSERT | UPDATE | DELETE |
|---|---|---|---|
| `prioridades_territoriales` | admin/editor | admin/editor (cualquier columna). Regional solo trio operativo (semáforo, pct_avance, responsable, en_foco, etapa, hito) en sus `region_cods` | admin/editor |
| `seguimientos` | **Cualquier autenticado** (mig 026) | autor O admin/editor | autor O admin/editor |
| `documentos_prioridad` | **Cualquier autenticado** (mig 026) | autor O admin/editor | autor O admin/editor |
| `metricas_eje` | admin/editor (definición). Regional reporta `valor_actual` en sus `region_cods` (trigger) | igual | admin/editor |
| `region_ejes`, `prego_monitoreo` | admin/editor | admin/editor | admin/editor |
| `mop_projects`, `seia_projects`, `regional_metrics`, `v2_indicadores_*` | service role (los crons) | — | — |

### Storage policies

| Bucket | Público | SELECT | INSERT | UPDATE / DELETE |
|---|---|---|---|---|
| `project-docs` (documentos de iniciativas) | sí | cualquiera | cualquier autenticado | UPDATE admin/editor. DELETE owner O admin/editor |
| `desalojos-docs` | no | admin | admin | admin |
| `plan-regional`, `import-proposals` | sí / no | sin policy → bloqueado para browser. Servir vía service role en API routes server-side. |

### Mutaciones desde el cliente — patrón defensivo

Toda mutación que sale del browser debe usar los helpers de [`lib/dbWrite.ts`](lib/dbWrite.ts):

- `safeWrite(builder, ctx)` — UPDATE/INSERT estricto. Throw si `data.length === 0` (detecta RLS silencioso).
- `safeDelete(builder, ctx)` — DELETE idempotente. Throw solo si hay error explícito.
- `safeAuditWrite(builder, ctx)` — audit logs. No throw, solo warning.

Patrón canónico: optimistic update local → `try { await safeWrite(...) } catch { revert + window.alert(err.message) }`.

---

## Arquitectura técnica

### Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js **16.2.1** (App Router) |
| UI | React 19 + TypeScript estricto |
| Base de datos | Supabase (Postgres 17) |
| Autenticación | Supabase Auth (magic link) — gates server-side vía `proxy.ts` |
| Storage | Supabase Storage (`project-docs`, `desalojos-docs`, `plan-regional`, `import-proposals`) |
| Validación | Zod ([`lib/schemas/index.ts`](lib/schemas/index.ts)) en API routes que reciben body JSON |
| Mapa | Leaflet + react-leaflet + GeoJSON |
| PDF | `@react-pdf/renderer` v4 + fuente Carlito |
| IA | Anthropic API (`claude-sonnet-4-6`) |
| Excel | `xlsx` para import/export |
| SQLite serverless | `sql.js` (WASM) para parsear la BD externa de LeyStop |
| Estilos | Tailwind CSS v4 (config en `postcss.config.mjs`) |
| Charts | Recharts |
| Crons | GitHub Actions ([`.github/workflows/cron-syncs.yml`](.github/workflows/cron-syncs.yml)) |
| Deploy | Vercel — push a `main` dispara deploy automático |

### Tres clientes Supabase — no mezclar

| Cliente | Archivo | Usar en |
|---|---|---|
| Browser | [`lib/supabase.ts`](lib/supabase.ts) → `getSupabase()` | Componentes React, hooks |
| Server (service role) | [`lib/supabaseServer.ts`](lib/supabaseServer.ts) → `getSupabaseAdmin()` | **Solo** en `app/api/**` |
| Browser secundario | [`lib/supabaseColega.ts`](lib/supabaseColega.ts) → `getSupabaseColega()` | Lectura de BD "Colega" para empleo/seguridad complementaria |

### Autenticación: `proxy.ts`

[`proxy.ts`](proxy.ts) (middleware de Next.js 16 — antes se llamaba `middleware.ts`) protege todas las rutas excepto `/login`, `/auth/callback`, los crons (autenticados con bearer) y los assets estáticos. Usuarios no autenticados son redirigidos a `/login`. Sesión vía cookies con `@supabase/ssr`.

Headers de seguridad inyectados globalmente: `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

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
                 │    └─ ProjectsPanel
                 │         ├─ useRegionMetrics    → regional_metrics
                 │         ├─ useSeiaProjects     → seia_projects
                 │         ├─ useMopProjects      → mop_projects
                 │         ├─ useV2Indicadores    → v2_indicadores_valores
                 │         └─ ProjectTrackerModal (4 tabs)
                 │
                 ├─ Mi Región        → VistaRegional
                 ├─ Dashboard        → NationalDashboard
                 ├─ Atención         → AttentionTray
                 ├─ Kanban           → KanbanView
                 ├─ PREGO            → PregoView
                 └─ Usuarios         → AdminUsersView + PlanesRegionalesPanel
```

Las mutaciones (semáforo, etapa, responsable, en_foco, …) llaman `onUpdatePrioridad(n, patch)` en `WorkOSApp`, que actualiza `localIniciativas` en memoria y propaga el cambio a todas las vistas sin recargar la página.

---

## Estructura de archivos

```
app/
  page.tsx                          # Server Component — carga todas las iniciativas
  layout.tsx                        # Root layout
  login/page.tsx                    # Magic link
  auth/callback/route.ts            # Callback OAuth/email
  error.tsx · not-found.tsx
  admin/
    pipeline/page.tsx               # Estado del pipeline v2 (admin)
  api/
    me/route.ts                     # GET perfil del usuario autenticado
    users/route.ts                  # GET usuarios para selector de responsable
    health/route.ts                 # GET observabilidad unificada (CRON_SECRET)
    admin/users/                    # CRUD de usuarios (admin)
    admin/plan-regional/            # Subida de Planes Regionales
    metrics/[cod]/                  # Métricas estáticas de contexto regional
    actividad/[cod]/ + all/         # Última actividad por región / global
    minuta/route.ts                 # POST genera PDF minuta (ejecutiva o completa)
    cartera-pdf/route.ts            # POST genera Cartera por ministerio PDF
    import/route.ts                 # POST carga masiva desde Excel
    iniciativa/[n]/route.ts         # DELETE iniciativa
    proposals/                      # Sistema two-stage push
    desalojos/                      # Endpoints del módulo Bandeja
    v2/refresh-views/route.ts       # Refresh materialized views v2
    # ── Crons de sincronización ──
    ine-sync/    pib-sync/    external-sync/
    seia-sync/   seia-sync-v2/   mop-sync/   stop-sync/
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
  VistaRegional.tsx                 # Mi Región
  PregoView.tsx                     # Matriz PREGO 16 × 9
  AdminUsersView.tsx                # Gestión de usuarios
  ImportProposalsPanel.tsx          # Bandeja de propuestas (admin/editor)
  PlanesRegionalesPanel.tsx         # Subida de planes PDF
  ProjectTrackerModal.tsx           # Modal de iniciativa (4 tabs)
  CarteraPdf.tsx                    # PDF cartera por ministerio
  MinutaDocumentV2.tsx              # PDF minuta completa
  MinutaEjecutiva.tsx               # PDF minuta ejecutiva
  IndicadoresModalV2.tsx            # Modal de indicadores v2
  modal/                            # Sub-tabs de ProjectTrackerModal
    SeguimientoTab.tsx · HistorialTab.tsx
    CalendarioTab.tsx · DocumentosTab.tsx

lib/
  supabase.ts                       # Cliente browser
  supabaseServer.ts                 # Cliente server (service role)
  supabaseColega.ts                 # Cliente browser secundario
  apiAuth.ts                        # requireAuth() + canWrite() + UserProfile
  dbWrite.ts                        # safeWrite / safeDelete / safeAuditWrite
  db.ts                             # Funciones de acceso a BD
  schemas/index.ts                  # Schemas zod para body JSON de las API routes
  importParser.ts                   # Parser Excel para /api/import
  importApplier.ts                  # Aplicador con filtro por región para regional
  templateExcel.ts                  # Generador del template oficial
  syncStatus.ts                     # recordSyncStatus() → tabla sync_status
  syncRunner.ts                     # withSyncStatus() wrapper para handlers
  syncHelper.ts                     # updateV2Pipeline() + upsertV2WithLog()
  minutaAI.ts                       # Generación de narrativa IA para minutas
  pdfFonts.ts                       # Registro de fuente Carlito
  context/UserContext.tsx           # canEditOperational / canEditRegion / canEditAny
  hooks/
    useRegionMetrics.ts · useAllRegionsMetric.ts
    useSeiaProjects.ts · useMopProjects.ts
    useV2Catalogo.ts · useV2Dashboard.ts · useV2Indicadores.ts
    useColegaSeguridad.ts
    useInactivityLogout.ts

public/
  chile-regiones.geojson            # Polígonos GeoJSON de las 16 regiones
  logo-pdf.png                      # Logo Ministerio para PDF (RGB PNG, no CMYK)
  fonts/carlito/                    # TTF de Carlito (Regular, Bold, Italic, BoldItalic)

supabase/
  migrations/                       # SQL histórico (001 → 026)

__tests__/
  dbWrite.test.ts                   # Cobertura de safeWrite / safeDelete
  mapRow.test.ts                    # Defaults defensivos de mapRow
  regionSummary.test.ts             # Agregados de iniciativas
  schemas.test.ts                   # Schemas zod
```

---

## Variables de entorno

| Variable | Contexto | Descripción |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + servidor | URL del proyecto Supabase principal |
| `NEXT_PUBLIC_SUPABASE_ANON` | Cliente | Clave anon pública |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor | Clave de servicio (acceso total) |
| `NEXT_PUBLIC_SUPABASE_COLEGA_URL` | Cliente | URL del proyecto Supabase "Colega" |
| `NEXT_PUBLIC_SUPABASE_COLEGA_ANON` | Cliente | Anon del proyecto Colega |
| `CRON_SECRET` | Servidor | Bearer para triggers manuales de crons y `/api/health` |
| `BCCH_USER` / `BCCH_PASS` | Servidor | Credenciales API Banco Central |
| `ANTHROPIC_API_KEY` | Servidor | API key para minutas IA. Opcional: si falta, PDF se genera sin narrativa. |
| `CNE_API_TOKEN` | Servidor | Token api.cne.cl (registro gratuito) |
| `ALERT_WEBHOOK_URL` | Servidor | Opcional. Si está definida, `/api/health` postea alertas (Slack/Discord) |

---

## Comandos

```bash
npm run dev         # Dev server en localhost:3000
npm run build       # Type-check + build de producción — validar antes de cada push
npm run lint        # ESLint (Next.js ruleset)
npm test            # vitest — suite mínima en __tests__/
npm run test:watch  # vitest en modo watch
```

Validar cambios con `npm run build && npm test` antes de hacer push. Cualquier push a `main` dispara un deploy automático en Vercel.

La suite cubre los puntos frágiles: defaults de `mapRow`, helpers defensivos de `safeWrite`/`safeDelete`, schemas zod. **No buscar cobertura — buscar dolor.**

---

## Notas para desarrolladores

- **Next.js 16 es distinto al que conocés**: hay breaking changes respecto a 15.x. El middleware vive en `proxy.ts`, no `middleware.ts`. Antes de escribir código, revisar `node_modules/next/dist/docs/` o consultar [AGENTS.md](AGENTS.md).
- **Tailwind v4**: sin `tailwind.config.js`. Config en `postcss.config.mjs` con la directiva `@theme`. Clases dinámicas tipo `grid-cols-${n}` no son detectadas por el purge — usar mapa estático o arbitrary properties.
- **Paginación Supabase**: límite default de 1000 filas. `getAllIniciativas()` pagina automáticamente.
- **Llave de mutación**: `prioridades_territoriales.id` (PK UUID) es la llave estable. `n` es número de orden, **no usar como llave de write** — puede afectar múltiples filas si llegara a duplicarse. Todas las mutaciones nuevas deben usar `.eq('id', prioridad.id)`.
- **`regionId === undefined`**: siempre chequear con `=== undefined`, nunca `!regionId` — `region_id = 0` (nacional) es válido y falsy.
- **Tres clientes Supabase**: no usar `getSupabaseAdmin()` en componentes del cliente; no usar `getSupabase()` en API routes que necesitan permisos elevados; `getSupabaseColega()` es solo para lectura.
- **`maxDuration` en handlers lentos**: SEIA (300), MOP (300), `pib-sync` (300), `minuta` (300), `cartera-pdf` (300). Sin esto Vercel mata el handler a los ~60s y el endpoint queda colgado **sin error visible**. Mismo vector que sufrió SEIA por 53 días en mayo 2026.
- **RLS UPDATE silencioso**: si un `.update()` no afecta filas por RLS, Supabase **no lanza error** (HTTP 200 + data:[]). Usar `safeWrite()` de [`lib/dbWrite.ts`](lib/dbWrite.ts) que detecta el caso y throw.
- **Telemetría con `await`, no fire-and-forget**: las escrituras a `sync_status`, `v2_indicadores_pipeline*`, `refresh_v2_indicadores_ultimo` van con `await`. En serverless, fire-and-forget se pierde tras `Response`.
- **Dual-write SEIA/MOP**: las syncs escriben a v1 (`{seia,mop}_projects`) y v2 (`v2_proyectos_inversion`) en la misma corrida. Si rompés una, romper la otra explícito y documentarlo.
- **PDF / logo**: usar `public/logo-pdf.png` (RGB PNG). `@react-pdf/renderer` v4 no soporta JPEG CMYK de 4 canales — corrompe el layout.
- **`sql.js` / WASM**: para parsear el SQLite externo de LeyStop. Requiere `webpack: { asyncWebAssembly: true }` en `next.config.ts` y leer el `.wasm` desde `node_modules` con `readFileSync`.
- **Migraciones SQL**: los cambios de schema se hacen vía Supabase MCP (`apply_migration`) y se archivan en `supabase/migrations/`. Las migraciones del directorio son histórico, **no** se ejecutan automáticamente en deploy.
- **Validación de body JSON**: usar zod ([`lib/schemas/index.ts`](lib/schemas/index.ts)). Patrón canónico: `schema.safeParse(await request.json())` → si `!success` devolver 400 con `error.issues`.
- **Naming oficial** (revisado por DCI): la división es **División de Coordinación Interministerial** (nunca "Interregional") y el ministerio es **Ministerio del Interior** (nunca "y Seguridad Pública"). Texto en castellano neutro chileno, sin voseo rioplatense.

---

## Referencias rápidas

- [CLAUDE.md](CLAUDE.md) — Guía técnica orientada a contribuir código.
- [AGENTS.md](AGENTS.md) — Notas sobre Next.js 16 (breaking changes).
- [`supabase/migrations/`](supabase/migrations/) — Historial de schema.
- [`.github/workflows/cron-syncs.yml`](.github/workflows/cron-syncs.yml) — Cron jobs en GitHub Actions.
