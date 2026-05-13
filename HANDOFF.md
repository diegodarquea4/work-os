# Handoff Document — Work OS (Mayo 2026)

## Qué es Work OS

Plataforma web de la **División de Coordinación Interregional del Ministerio del Interior de Chile**. Hace seguimiento a ~63 prioridades territoriales (iniciativas de gobierno) en 16 regiones. Desplegada en Vercel en **work-os-theta.vercel.app**.

**Stack:** Next.js 16.2.1 App Router · Supabase (Postgres + Auth) · Tailwind CSS v4 · @react-pdf/renderer para PDFs · Claude Sonnet 4.6 para contenido IA en minutas.

**No hay test suite.** Validar con `npm run build`.

---

## Arquitectura clave

### Dos clientes Supabase — nunca mezclar
- `lib/supabase.ts` → `getSupabase()` — browser, para componentes/hooks
- `lib/supabaseServer.ts` → `getSupabaseAdmin()` — service role, SOLO en `app/api/**`

### Dos tablas de métricas regionales
- **`region_metrics`** — formato ancho, 16 filas × ~90 columnas estáticas (censo, CASEN, ENUSC, etc.). Carga manual.
- **`regional_metrics`** — formato largo (region_id, metric_name, value, period). Series temporales sincronizadas desde BCCh API cada lunes 7am.

**Crítico:** `region_id = 0` es nacional y es válido (falsy). Siempre usar `=== undefined`, nunca `!regionId`.

### Mapeo de regiones
- `lib/regions.ts` → `INE_CODE` mapea código de región (ej: 'VIII') a region_id numérico
- BCCh usa 3 sistemas de códigos distintos según la serie (INE numérico, BCCh secuencial 01-16, BCCh 3 letras)

### Vistas principales
`app/page.tsx` (Server Component) → `WorkOSApp` (client) → 4 vistas: Mapa, Dashboard, Bandeja de Atención, Kanban.

### Panel regional (`components/VistaRegional.tsx`)
Al seleccionar una región se muestra: alertas, avance por eje, métricas clave (4 tarjetas), pipeline externo (SEIA/MOP). Desde aquí se abren:
- `IndicadoresModal.tsx` — dashboard completo con 3 tabs (Pulso, Economía, Perfil)
- Generación de 3 tipos de minuta PDF

---

## Las 3 minutas PDF

Todas se generan desde `app/api/minuta/route.ts` y se renderizan con `@react-pdf/renderer` (Flexbox, no CSS Grid).

### 1. Minuta Ejecutiva (`components/MinutaEjecutiva.tsx`)
- **2 páginas.** Resumen rápido para reuniones de coordinación.
- Audiencia: coordinadores, subsecretarios.
- Pág 1: bullets avance (IA) + gráfico ejes semáforo + stat boxes + donut + contexto socioeconómico
- Pág 2: alertas + tabla iniciativas rojas + GPS (SEIA/MOP) + hitos

### 2. Reporte Completo / Kit de Viaje (`components/MinutaDocumentV2.tsx`)
- **7-8 páginas.** Documento definitivo para autoridades que viajan a una región.
- Audiencia: Ministro, Presidente.
- Portada con color regional + stat boxes + contexto rápido IA
- Secciones: Síntesis indicadores (tabla 3 periodos gobierno) → Perfil región (IA) → Autoridades → Estado plan → Avances por eje → GPS → Alertas/Recomendaciones → Hitos → Anexo indicadores

### 3. Ficha Regional (`components/FichaRegional.tsx`)
- **3-5 páginas.** Puro dato duro, sin análisis. Radiografía estadística.
- Audiencia: asesores técnicos, analistas.
- 10 secciones: Geográficos → Demográficos → Vulnerabilidad → Economía → Educación → Salud → Vivienda → Conectividad → Medio Ambiente → Seguridad (incluyendo LeyStop)
- Cada dato con fuente y año entre paréntesis

### Contenido IA
- Claude Sonnet 4.6 genera JSON estructurado para Ejecutiva y Completo
- Ficha solo usa IA para un párrafo introductorio
- Prompt system incluye guardrails: "Usa ÚNICAMENTE los datos proporcionados. NO inventes cifras."
- Cache diario en tabla `minuta_cache` keyed por (region_cod, tipo, cache_date)

### Archivo v1 legacy
`components/MinutaDocument.tsx` es la v1 del Reporte Completo. Reemplazada por MinutaDocumentV2. Se puede eliminar cuando v2 esté validada.

---

## Datos disponibles — Inventario completo

### Series temporales (regional_metrics, sync automático BCCh lunes 7am)

| Métrica | metric_name | Frecuencia | Cobertura |
|---------|-------------|------------|-----------|
| Desempleo | `tasa_desocupacion` | Trimestre móvil | 16 regiones + nacional |
| Ocupados | `ocupados_miles` | Trimestre móvil | 16 regiones + nacional |
| Fuerza trabajo | `fuerza_trabajo_miles` | Trimestre móvil | 16 regiones |
| Ventas | `ventas_regionales` | Mensual | 16 regiones + nacional |
| PIB regional | `pib_regional` | Trimestral | 16 regiones |
| PIB nacional | `pib_nacional` | Trimestral | Solo nacional |
| IMACEC | `imacec` | Mensual | Solo nacional |

**Nota importante:** El dato de desempleo INE es un *trimestre móvil* (promedio 3 meses), NO un valor mensual. El código ya genera labels correctos (ej: "trimestre diciembre 2025-febrero 2026").

### Datos estáticos (region_metrics, ~90 campos, carga manual)
Geografía, demografía (Censo 2024), pobreza (CASEN 2024), empleo (INE-ENE), economía (BCCh), salud (FONASA/DEIS), educación (Censo 2024), vivienda (Censo 2024), conectividad (Censo 2024), seguridad (ENUSC 2022), medio ambiente.

### LeyStop / Carabineros (semanal, API Colega)
Tabla `registros_leystop`. Casos semanales, tasa c/100k, top 5 delitos, controles, fiscalizaciones, incautaciones. Hook: `useColegaSeguridadAll()`.

### Proyectos externos (sync semanal)
- `seia_projects` — SEIA evaluación ambiental (USD MM)
- `mop_projects` — MOP obras públicas (CLP miles)

### Autoridades (tabla pendiente de carga)
`autoridades_regionales` — tabla creada pero vacía. Campos: region_cod, cargo, nombre, partido, coalicion, territorio. Carga manual pendiente.

---

## Esquema de base de datos (reconstruido desde código, mayo 2026)

No hay archivos de migración SQL en el repo. Este esquema se infiere de tipos TypeScript y queries Supabase.

**2 instancias Supabase:** La principal (work-os) y una secundaria (colega) para datos de Carabineros/empleo.

### Instancia principal: work-os

#### `prioridades_territoriales` — Iniciativas del plan regional
```
n                          integer   PK
region                     text           -- nombre región
cod                        text           -- código región (ej: 'VIII')
capital                    text
zona                       text           -- zona geográfica
eje                        text           -- eje estratégico
eje_gobierno               text?
nombre                     text           -- nombre iniciativa
descripcion                text?
ministerio                 text
prioridad                  text           -- 'Alta' | 'Media' | 'Baja'
etapa_actual               text?
estado_termino_gobierno    text?
proximo_hito               text?
fecha_proximo_hito         date?
fuente_financiamiento      text?
codigo_bip                 text?
inversion_mm               numeric?       -- millones CLP
comuna                     text?
rat                        text?          -- Responsable Asistencia Técnica
codigo_iniciativa          text?
origen                     text?
estado_semaforo            text?          -- 'verde' | 'ambar' | 'rojo' | 'gris'
pct_avance                 numeric?       -- 0-100
```

#### `seguimientos` — Log de actividad por iniciativa
```
id              integer   PK
prioridad_id    integer   FK → prioridades_territoriales.n
fecha           date?
tipo            text      -- 'avance' | 'reunion' | 'hito' | 'alerta'
descripcion     text
autor           text?
estado          text?     -- 'en_curso' | 'completado' | 'bloqueado' | 'pendiente'
created_at      timestamp
```

#### `semaforo_log` — Auditoría de cambios de semáforo/avance
```
id              integer   PK
prioridad_id    integer   FK → prioridades_territoriales.n
campo           text      -- 'semaforo' | 'pct_avance'
valor_anterior  text?
valor_nuevo     text
cambiado_por    text?
created_at      timestamp
```

#### `documentos_prioridad` — Archivos adjuntos a iniciativas
```
id              integer   PK
prioridad_id    integer   FK → prioridades_territoriales.n
nombre          text
url             text
tipo_archivo    text?
tamano_bytes    integer?
subido_por      text?
created_at      timestamp
```

#### `region_metrics` — Snapshot estático (~90 columnas por región)
```
region_cod      text      PK
region_nombre   text
-- ~85 campos numéricos agrupados por categoría
-- (ver RegionMetrics en lib/types.ts para lista completa)
-- Geografía: superficie_km2, comunas_n, provincias_n, ...
-- Demografía: poblacion_total, pct_hombres, pct_urbana, ...
-- Pobreza: pct_pobreza_ingresos, pct_pobreza_extrema, ...
-- Empleo: tasa_desocupacion, tasa_ocupacion, ...
-- Economía: pib_regional, pct_pib_nacional, ...
-- Salud, Educación, Vivienda, Seguridad, Conectividad, Medio Ambiente
updated_at      timestamp
```

#### `regional_metrics` — Series temporales (BCCh sync)
```
id              text      PK
region_id       integer        -- 0 = nacional, 1-16 = regiones (INE_CODE)
metric_name     text           -- 'tasa_desocupacion' | 'pib_regional' | 'ventas_regionales' | ...
value           numeric
period          text           -- ISO date 'YYYY-MM-DD'
source_url      text?
updated_at      timestamp
UNIQUE(region_id, metric_name, period)
```

#### `seia_projects` — Proyectos SEIA (evaluación ambiental)
```
id                  text      PK
region_id           integer        -- INE 1-16
nombre              text
tipo                text?
estado              text?
titular             text?
inversion_mm        numeric?       -- USD millones
fecha_presentacion  date?
fecha_plazo         date?
actividad_actual    text?
url_ficha           text?
synced_at           timestamp
```

#### `mop_projects` — Proyectos MOP (obras públicas)
```
cod_p           text      PK
bip             text?
region_id       integer        -- INE 1-16
nombre          text
servicio        text?
programa        text?
etapa           text?
financiamiento  text?
inversion_miles integer?       -- CLP miles
provincias      text?
comunas         text?
planes          text?
descripcion     text?
synced_at       timestamp
```

#### `stop_stats` — Estadísticas policiales semanales
```
region_id               smallint  PK (composite)
semana_id               integer   PK (composite)
fecha_desde             date
fecha_hasta             date
controles_total         integer?
controles_identidad     integer?
controles_vehicular     integer?
fiscalizaciones         integer?
incautaciones           integer?
incaut_fuego            integer?
incaut_blancas          integer?
casos_total             integer?
casos_ultima_semana     integer?
casos_anno_fecha        integer?
mayor_registro_1..5     text?
pct_1..5                numeric?
decomisos_anno          numeric?
allanamientos_anno      integer?
vehiculos_rec_anno      integer?
synced_at               timestamp
```

#### `prego_monitoreo` — Fases del proceso PREGO
```
region_cod          text    PK
f0_contacto         text         -- 'pendiente' | 'en_curso' | 'completado' | 'bloqueado'
f1_borrador         text
f2_revision         text
e3_dipres           text
e3_desi             text
e3_subdere          text
e3_gore             text
f6_consolidacion    text
f7_firma            text
updated_at          timestamp
updated_by          text?
```

#### `user_profiles` — Usuarios y roles
```
id              text      PK    -- Supabase Auth UUID
email           text
full_name       text?
role            text             -- 'admin' | 'editor' | 'regional' | 'viewer'
region_cods     text[]?          -- regiones asignadas (para role 'regional')
```

#### `minuta_cache` — Cache diario de contenido IA
```
region_cod      text      PK (composite)
tipo            text      PK (composite)  -- 'ejecutiva' | 'completo' | 'ficha'
cache_date      date      PK (composite)
generated_at    timestamp
ai_content      jsonb?
```

#### `planes_regionales` — PDFs de planes regionales
```
region_cod      text      PK
archivo_url     text?
uploaded_at     timestamp?
uploaded_by     text?
```

#### `autoridades_regionales` — Autoridades de cada región (VACÍA, pendiente carga)
```
region_cod      text
cargo           text      -- 'gobernador' | 'delegado_regional' | 'senador' | ...
nombre          text
partido         text?
territorio      text?
```

### Instancia secundaria: supabase-colega (solo lectura)

#### `registros_leystop` — Datos LeyStop/Carabineros semanales
```
id, id_semana, id_region, nombre_region, semana
fecha_desde_iso, fecha_hasta_iso, anno
tasa_registro, casos_total, casos_ultima_semana, casos_28dias, casos_anno_fecha
var_ultima_semana, var_28dias, var_anno_fecha
mayor_registro_1..5, pct_1..5, n_1..5
controles, controles_identidad, controles_vehicular
fiscalizaciones, fiscal_alcohol, fiscal_bancaria
incautaciones, incaut_fuego, incaut_blancas
allanamientos_anno, vehiculos_recuperados_anno, decomisos_anno
```

#### `registros_bce_empleo` — Empleo regional (BCCh vía Colega)
```
periodo         text      -- 'YYYY-MM'
nombre_region   text
indicador       text      -- 'Tasa de desocupación', 'Ocupados', etc.
valor           numeric
```

### Storage buckets
- **plan-regional** — PDFs de planes regionales (por región)
- **project-docs** — Documentos adjuntos a iniciativas

---

## Cambios sin commitear (sesión actual)

### 1. Reformulación del dashboard de indicadores
**Problema:** Las métricas mostraban números crudos sin contexto ("$45.230 MM", "342 casos"). Un asesor no puede saber si eso es bueno o malo.

**Solución implementada:**

**Nuevo archivo:** `lib/indicatorUtils.ts` — 4 funciones puras:
- `rankOf(allRegions, cod, field, ascending)` → "5°/16"
- `nationalAvg(allRegions, field)` → promedio de las 16 regiones
- `deltaLabel(value, national, lowerIsBetter)` → "Nac: 7,2% · +1,3 pp" con isGood
- `perCapita(value, population)` → MM per millón de habitantes

**VistaRegional.tsx** — 4 tarjetas "Métricas Clave" reformuladas:
- Desocupación: ahora muestra `Nac: 7,2% · +1,3 pp · 12°/16` con color rojo si sobre nacional
- Seguridad: headline cambia de "342 casos" a "Tasa: 150" (c/100k) + promedio + ranking
- PIB: headline cambia de "$45.230 MM (3,2%)" a "3,2% del PIB nacional" + ranking
- Inversión: agrega per cápita en subtítulo

**IndicadoresModal.tsx** — 16 KpiCards con contexto:
- Pulso (4): promedio regional, ranking, delta vs nacional
- Economía (6): PIB como % nacional, PIB per cápita (reemplaza duplicado), inversión per cápita, rankings
- Perfil (6): promedio + ranking para cada indicador demográfico

### 2. Fixes de correctitud en minutas
- `MinutaEjecutiva.tsx:334` — `p.pct_avance` sin `?? 0` producía NaN → corregido
- `MinutaEjecutiva.tsx:490` — mismo fix en tabla de rojos
- `FichaRegional.tsx:133` — división por cero si `pct_mujeres = 0` → agregado guard
- `FichaRegional.tsx:161` — división por cero si `poblacion_total = 0` → agregado guard
- `route.ts:363` — `avgOlder ? ...` trataba 0 como falsy → cambiado a `!= null`
- `minutaAI.ts` — guardrails anti-alucinación agregados a los 3 prompts de IA

---

## Próximos pasos / trabajo pendiente

1. **Commit y push** de los cambios actuales (dashboard reformulado + fixes minutas)
2. **Mockups de minutas** — El usuario está trabajando con Claude Desktop para diseñar mockups de las 3 minutas. El prompt completo está en `prompt-mockups-minutas.md`. Una vez aprobados los mockups, volver acá a implementar la reestructuración.
3. **Carga de autoridades** — Tabla `autoridades_regionales` existe pero está vacía. ~50-80 filas por región.
4. **Eliminar MinutaDocument.tsx** (v1) cuando v2 esté validada
5. **MinutaEjecutiva y Ficha** deberían eventualmente adoptar mejoras del Kit de Viaje (color regional, stat boxes mejorados)

---

## Errores cometidos, trampas y lecciones aprendidas

### Next.js 16: middleware.ts vs proxy.ts
**Qué pasó:** Se creó un `middleware.ts` para agregar security headers. Build falló con "Both middleware file and proxy file detected".
**Causa:** Next.js 16 reemplazó middleware.ts por `proxy.ts`. El proyecto ya tenía proxy.ts para auth.
**Fix:** Eliminar middleware.ts, agregar security headers directamente en proxy.ts.
**Lección:** SIEMPRE leer los docs de Next.js 16 en `node_modules/next/dist/docs/` antes de tocar routing/middleware. Las APIs cambiaron respecto a lo que un modelo conoce de versiones anteriores.

### RLS SQL con nombre de tabla incorrecto
**Qué pasó:** Se generó SQL para RLS policies usando `prioridades` como nombre de tabla.
**Causa:** El nombre real es `prioridades_territoriales`. El modelo inventó un nombre más corto.
**Fix:** Corregir el SQL manualmente.
**Lección:** Verificar nombres de tablas reales antes de generar SQL. Consultar el esquema, no asumir.

### Contraseñas: el usuario quiere mantener DCI2026
**Qué pasó:** Se implementó generación de contraseñas aleatorias para nuevos usuarios como "mejora de seguridad".
**Causa:** El usuario necesita que todos los usuarios tengan la misma contraseña por defecto (DCI2026) porque el equipo es pequeño y lo gestiona manualmente.
**Fix:** Revertir todo el cambio de contraseñas aleatorias.
**Lección:** No asumir que "más seguro" = "mejor". Preguntar antes de cambiar flujos de auth. El contexto de uso (equipo pequeño, gobierno) importa.

### Formato de inversiones roto en PDFs
**Qué pasó:** fmtSeia mostraba "USD 4000.0B" en vez de "USD 4.000 MM".
**Causa:** Lógica de conversión de escala incorrecta. Los valores ya llegan en millones desde la API, no hay que convertirlos.
**Fix:** `return 'USD ${mm.toLocaleString('es-CL')} MM'` — sin conversión.
**Lección:** Verificar las unidades de la fuente antes de aplicar transformaciones matemáticas. SEIA = USD MM, MOP = CLP miles.

### BCCh serie F049.DES.PMT no existe
**Qué pasó:** Se agregaron 18 series de "desocupados_miles" (F049.DES.PMT.INE9.{CODE}.M). Todas dieron error -50 en BCCh.
**Causa:** Esa serie simplemente no existe en BCCh. Se asumió que si ocupados (F049.OCU.PMT) existe, desocupados (F049.DES.PMT) también.
**Fix:** Eliminar las 18 series, mantener solo `ocupados_miles` (F049.OCU.PMT que sí funciona).
**Lección:** No inventar series BCCh por analogía. Usar `/api/ine-discover` para verificar que una serie existe antes de agregarla al sync. BCCh devuelve error -50 para series inexistentes.

### IA inventando fechas en minutas
**Qué pasó:** La minuta decía "tasa de desocupación de 7,7% a mayo de 2026" cuando mayo 2026 no existía aún. El último dato real era del trimestre ene-mar 2026.
**Causa:** El contexto enviado a la IA decía `FECHA: Mayo 2026` (fecha de generación) sin especificar el periodo real del dato. La IA infirió que el dato era de mayo.
**Fix:** Propagar `latestPeriod` a través de `TrendSummaries`, computar el label del trimestre móvil ("trimestre enero-marzo 2026"), y agregar instrucción explícita: "NO atribuir datos a meses que no corresponden".
**Lección:** La IA fabricará contexto temporal si no se le da el periodo real del dato. Siempre pasar la fecha exacta del dato, no la fecha de generación del reporte.

### Datos de empleo: Censo 2024 vs INE mensual
**Qué pasó:** Un revisor externo señaló que `n_ocupado`/`n_desocupado` del Censo 2024 ya estaban desactualizados para las minutas.
**Causa:** La tabla `region_metrics` tiene datos estáticos del Censo. El INE publica datos mensuales de empleo vía BCCh que son más frescos.
**Fix:** Agregar series `ocupados_miles` y `fuerza_trabajo_miles` desde BCCh. En el buildContext de minutaAI.ts, priorizar datos INE-ENE cuando estén disponibles, y etiquetar explícitamente "(Censo 2024, dato estático)" cuando se use el fallback.
**Lección:** Siempre preferir la fuente con mayor frecuencia de actualización. Etiquetar explícitamente la fuente y fecha de cada dato.

### Vercel URL incorrecta
**Qué pasó:** Se intentaron múltiples dominios de Vercel que daban 404.
**Causa:** El deployment real está en `work-os-theta.vercel.app`, no en variaciones como `work-os.vercel.app` o `work-os-git-main.vercel.app`.
**Fix:** El usuario proporcionó la URL correcta.
**Lección:** No adivinar URLs de Vercel. Preguntar o verificar con `vercel ls`.

### SSH push sin clave configurada
**Qué pasó:** `git push` falló. No había clave SSH, ni `brew`, ni `gh` CLI instalados.
**Fix:** Generar clave ed25519, el usuario la agregó manualmente a GitHub.
**Lección:** Verificar que git remote y auth estén configurados antes de prometer un push.

### Props faltantes al agregar nuevos charts
**Qué pasó:** Se agregaron charts de Ventas Regionales y Fuerza de Trabajo dentro de `EconomiaSection`, pero `timeSeries` y `nationalSeries` no estaban disponibles como props en ese componente.
**Causa:** Los datos se pasaban al padre (`IndicadoresModal`) pero no se propagaban al componente hijo.
**Fix:** Agregar `timeSeries` y `nationalSeries` como props de `EconomiaSection`.
**Lección:** Al agregar visualizaciones en componentes internos, verificar que los datos lleguen por props desde el padre. No asumir que están en scope.

### Union types demasiado estrechos al agregar 'ficha'
**Qué pasó:** Al agregar el tercer tipo de minuta ('ficha'), múltiples componentes fallaron con errores de tipo: `downloadingTipo`, `handleMinuta`, `MinutaLoadingModal`.
**Causa:** Los tipos estaban hardcodeados como `'ejecutiva' | 'completo'` en vez de incluir `'ficha'`.
**Fix:** Actualizar todas las union types en VistaRegional, ProjectsPanel y MinutaLoadingModal.
**Lección:** Al agregar un nuevo valor a un tipo discriminado, buscar TODOS los archivos que usan ese tipo (`grep 'ejecutiva.*completo'`) y actualizarlos en una sola pasada.

### Decimales excesivos en PDFs
**Qué pasó:** "Hacinamiento: 7,6379%" aparecía en las minutas.
**Causa:** Los valores de `region_metrics` vienen con muchos decimales desde Supabase y no se redondeaban.
**Fix:** `pct()` function ahora redondea a 1 decimal: `Math.round(val * 10) / 10`.
**Lección:** Siempre redondear valores numéricos antes de mostrarlos en PDFs. Los datos crudos de la DB pueden tener precisión arbitraria.

### `avgOlder ? ...` trata 0 como falsy
**Qué pasó:** En route.ts, el promedio de crimen de 4 semanas anteriores se perdía cuando era exactamente 0.
**Causa:** `avgOlder ? Math.round(avgOlder) : null` — JavaScript trata 0 como falsy.
**Fix:** Cambiar a `avgOlder != null ? Math.round(avgOlder) : null`.
**Lección:** NUNCA usar truthiness para checks numéricos donde 0 es un valor válido. Siempre `!= null` o `=== undefined`. Esto aplica también a `region_id = 0` (nacional).

### `p.pct_avance` sin fallback produce NaN en PDF
**Qué pasó:** `projects.reduce((acc, p) => acc + p.pct_avance, 0)` producía NaN si algún proyecto tenía `pct_avance: null`.
**Causa:** `null + number = NaN` en JavaScript.
**Fix:** Siempre usar `(p.pct_avance ?? 0)` en reduces y renders.
**Lección:** En @react-pdf/renderer, un NaN se renderiza literalmente como "NaN" en el PDF. No hay error visible en build. Hay que auditar manualmente.

### División por cero en FichaRegional
**Qué pasó:** La razón de masculinidad (`pct_hombres / pct_mujeres`) podía producir Infinity si `pct_mujeres = 0`. Similar con `n_discapacidad / poblacion_total`.
**Causa:** Faltaban guards para denominador = 0.
**Fix:** Agregar `&& pct_mujeres > 0` y `&& poblacion_total > 0` a las condiciones.
**Lección:** Toda división en componentes PDF necesita guard explícito para denominador 0, incluso si "no debería pasar" con datos reales.

### IA sin guardrails genera alucinaciones
**Qué pasó:** Los prompts de las 3 minutas no tenían instrucción explícita de "no inventar datos". La IA ocasionalmente fabricaba cifras o atribuía datos a periodos incorrectos.
**Fix:** Agregar a los 3 system prompts: "IMPORTANTE: Usa ÚNICAMENTE los datos proporcionados. NO inventes cifras, fechas, porcentajes ni nombres que no aparezcan explícitamente en los datos."
**Lección:** Claude Sonnet es muy bueno generando texto plausible, lo cual es peligroso en contexto gubernamental. Los guardrails anti-alucinación deben ser explícitos y repetidos en cada prompt.

---

## Convenciones importantes

- **Next.js 16** usa `proxy.ts` (no middleware.ts). Leer docs en `node_modules/next/dist/docs/` antes de tocar
- **Tailwind v4** — config en `postcss.config.mjs`, no `tailwind.config.js`
- **@react-pdf/renderer** — Flexbox only, no CSS Grid, no gradientes, fonts limitadas a Helvetica/Courier/Times
- **Formato fechas BCCh** — llegan como DD-MM-YYYY, se parsean con `parseBcchDate()`
- **0 es falsy en JS** — region_id=0 (nacional), pct_avance=0, avgOlder=0 son válidos. Siempre `!= null`, nunca `!value`
- **Unidades de inversión** — SEIA = USD MM, MOP = CLP miles. No convertir sin verificar
- **Desempleo INE** — es trimestre móvil, no mensual. Label debe decir "trimestre X-Y" no "mes Z"
- El usuario es Diego, asesor de la División de Coordinación Interregional. Prefiere respuestas directas, sin relleno. Aprueba commits explícitamente. No cambiar flujos de auth sin preguntar.
