# Work OS — Prioridades Territoriales

Sistema de seguimiento de prioridades territoriales del Ministerio del Interior y Seguridad Pública de Chile. Permite visualizar, gestionar, hacer seguimiento activo y exportar las prioridades territoriales 2026–2028 para las 16 regiones del país.

El sistema es usado exclusivamente por profesionales de la **División de Coordinación Interregional** del Ministerio del Interior. No es público.

---

## Vistas principales

| Vista | Descripción |
|---|---|
| **Mapa** | Mapa interactivo de Chile. Click en región abre panel lateral con sus prioridades, indicadores RAG y botón de minuta PDF. |
| **Dashboard nacional** | Tabla de las 63 prioridades con filtros por región, eje, semáforo y nivel de prioridad. Columna de última actividad con indicadores de inactividad. |
| **Bandeja de atención** | Detecta automáticamente prioridades que requieren acción: semáforo rojo, sin actividad en +15 días, o avance bajo (<30%). |
| **Kanban** | Portfolio de las 63 prioridades en 4 columnas por estado RAG (Bloqueadas / En revisión / En verde / Sin evaluar). Filtros por región y eje. |

## Seguimiento por prioridad (modal)

Cada prioridad abre un modal con 4 tabs:

| Tab | Contenido |
|---|---|
| **Seguimiento** | CRUD de actualizaciones: avance, reunión, hito, alerta. Con fecha, autor, estado y descripción. |
| **Historial** | Sparkline de trayectoria RAG · Barra dual avance % vs tiempo transcurrido · Log de cambios de semáforo y % avance · Timeline mensual de seguimientos. |
| **Calendario** | Fecha límite de la prioridad, editable inline con persistencia. |
| **Documentos** | Adjuntar y descargar archivos por prioridad (Supabase Storage). |

## Otras funcionalidades

- **Semáforo RAG** (verde / ámbar / rojo / gris) por prioridad, editable con persistencia y audit trail automático.
- **% de avance** y **responsable** por prioridad, editables con persistencia.
- **Minuta PDF** descargable por región: contexto regional con ~90 métricas + lista de prioridades.
- **Contexto regional**: al abrir una región en el mapa se cargan métricas socioeconómicas (demografía, pobreza, empleo, salud, vivienda, seguridad) desde la BD.
- **Autenticación**: acceso restringido por email y contraseña vía Supabase Auth. Usuarios creados manualmente.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16.2.1 (App Router) |
| UI | React 19 + TypeScript |
| Base de datos | Supabase (Postgres) |
| Autenticación | Supabase Auth |
| Storage (archivos) | Supabase Storage |
| Mapa | Leaflet + react-leaflet |
| PDF | @react-pdf/renderer |
| Estilos | Tailwind CSS v4 |
| Deploy | Vercel |

---

## Estructura del proyecto

```
app/
  page.tsx                   # Server Component — carga todas las prioridades desde Supabase al inicio
  layout.tsx
  login/page.tsx
  auth/callback/route.ts
  api/
    metrics/[cod]/route.ts   # GET métricas de contexto de una región
    minuta/route.ts          # POST genera PDF de minuta regional
    actividad/[cod]/route.ts # GET fecha última actividad por prioridad de una región
    actividad/all/route.ts   # GET fecha última actividad de todas las prioridades

components/
  WorkOSApp.tsx              # Shell cliente — estado global de proyectos y actividad, navegación entre 4 vistas
  ChileMap.tsx               # Mapa interactivo (Leaflet, dynamic import)
  ProjectsPanel.tsx          # Panel lateral por región: prioridades + contexto regional + filtros
  NationalDashboard.tsx      # Tabla nacional con filtros, estadísticas agregadas y columna de actividad
  AttentionTray.tsx          # Bandeja de atención: alertas automáticas agrupadas por tipo
  KanbanView.tsx             # Portfolio Kanban: 4 columnas por estado RAG, filtros por región y eje
  ProjectTrackerModal.tsx    # Modal por prioridad: seguimiento, historial RAG, calendario, documentos
  MinutaDocument.tsx         # Documento PDF (react-pdf)

lib/
  supabase.ts                # Cliente Supabase browser (createBrowserClient)
  db.ts                      # Todas las funciones de acceso a datos
  types.ts                   # Tipos: Prioridad, RegionMetrics, Seguimiento, Documento, SemaforoLog
  regions.ts                 # Catálogo de 16 regiones con código, capital, zona y coordenadas
  projects.ts                # Tipo Project (shape de prioridad usado por componentes)
  regionColors.ts            # Colores por región para el mapa

proxy.ts                     # Middleware de autenticación (protege todas las rutas)

public/
  chile-regiones.geojson     # Polígonos GeoJSON de las 16 regiones
```

---

## Base de datos (Supabase Postgres)

### Tabla: `prioridades_territoriales`

La tabla central. 63 filas — una por prioridad territorial definida para el período 2026–2028.

| Columna | Tipo | Descripción |
|---|---|---|
| `n` | integer PK | Número correlativo de la prioridad |
| `region` | text | Nombre de la región (ej: "Región de Los Lagos") |
| `cod` | text | Código de región (ej: "X", "RM", "XV") |
| `capital` | text | Capital regional |
| `zona` | text | Zona geográfica (Norte, Centro, Sur, Austral) |
| `eje` | text | Eje temático (Seguridad, Infraestructura, Economía, Vivienda, etc.) |
| `meta` | text | Descripción de la prioridad (texto libre, puede ser largo) |
| `ministerios` | text | Ministerios responsables, separados por salto de línea |
| `prioridad` | text | "Alta" o "Media" |
| `plazo` | text | Plazo definido (ej: "2026", "2026-2027", "2028") |
| `estado_semaforo` | text | "verde", "ambar", "rojo" o "gris" — estado RAG |
| `pct_avance` | integer | Porcentaje de avance (0–100), editable manualmente |
| `responsable` | text | Nombre del funcionario responsable de la prioridad (nullable) |
| `fecha_limite` | date | Fecha límite asignada a la prioridad (nullable) |

### Tabla: `region_metrics`

16 filas — una por región. ~90 columnas con indicadores de contexto regional.

Categorías: geografía, demografía, pobreza, empleo, economía (PIB, inversión), salud, educación, vivienda, seguridad, conectividad, medio ambiente, sectores productivos.

### Tabla: `seguimientos`

Actualizaciones manuales sobre una prioridad. Registradas por usuarios del sistema.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | integer PK | |
| `prioridad_id` | integer | FK → `prioridades_territoriales.n` |
| `tipo` | text | "avance", "reunión", "hito" o "alerta" |
| `descripcion` | text | Texto libre del seguimiento |
| `autor` | text | Nombre del funcionario que registra |
| `estado` | text | "en_curso", "completado", "bloqueado" o "pendiente" |
| `fecha` | date | Fecha asignada al evento (elegida por el usuario) |
| `created_at` | timestamptz | Timestamp de creación del registro |

### Tabla: `semaforo_log`

Audit trail automático de cambios de semáforo RAG y % avance. Se escribe en cada actualización.

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | integer PK | |
| `prioridad_id` | integer | FK → `prioridades_territoriales.n` |
| `campo` | text | "semaforo" o "pct_avance" |
| `valor_anterior` | text | Valor antes del cambio (nullable) |
| `valor_nuevo` | text | Valor después del cambio |
| `cambiado_por` | text | Nombre del usuario que realizó el cambio (nullable) |
| `created_at` | timestamptz | Timestamp del cambio |

### Tabla: `documentos_prioridad`

Metadata de archivos adjuntos. Los archivos se guardan en Supabase Storage (bucket `project-docs`).

| Columna | Descripción |
|---|---|
| `prioridad_id` | FK → prioridad |
| `nombre` | Nombre del archivo |
| `url` | URL pública del archivo en Storage |
| `tipo_archivo` | MIME type |
| `tamano_bytes` | Tamaño |
| `subido_por` | Nombre del usuario que subió |

### Row Level Security

Todas las tablas tienen política de lectura pública (`SELECT USING (true)`). Las escrituras requieren sesión autenticada (controlada por `proxy.ts`).

---

## Flujo de datos

```
Supabase Postgres
  └─ app/page.tsx (Server Component)
       └─ getAllPrioridades() [lib/db.ts]
            └─ WorkOSApp (cliente)
                 │   estado: localProjects + actividad (todas las prioridades)
                 │   /api/actividad/all → cargado una vez al montar
                 │
                 ├─ Vista: Mapa
                 │    ├─ ChileMap
                 │    └─ ProjectsPanel (por región seleccionada)
                 │         ├─ /api/metrics/[cod]   (métricas contexto regional)
                 │         ├─ /api/actividad/[cod] (última actividad por región)
                 │         └─ ProjectTrackerModal
                 │              ├─ seguimientos    (Supabase cliente)
                 │              ├─ semaforo_log    (Supabase cliente)
                 │              └─ documentos      (Supabase Storage)
                 │
                 ├─ Vista: Dashboard nacional
                 │    └─ NationalDashboard (recibe actividad desde WorkOSApp)
                 │
                 ├─ Vista: Bandeja de atención
                 │    └─ AttentionTray (recibe actividad desde WorkOSApp)
                 │         └─ ProjectTrackerModal
                 │
                 └─ Vista: Kanban
                      └─ KanbanView
                           └─ ProjectTrackerModal
```

Cuando el modal guarda un cambio de semáforo, % avance o responsable, llama `onUpdatePrioridad(n, patch)` que propaga el cambio a `WorkOSApp.localProjects` — reflejándose en las 4 vistas sin recargar la página.

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON=<anon key>
```

---

## Correr en local

```bash
npm install
npm run dev
```

---

## Deploy

Push a `main` → deploy automático en Vercel. Variables de entorno configuradas en Vercel Settings.

---

---

# Objetivo: Integración con fuentes de información real del gobierno

## Contexto del problema

Actualmente el 100% de la información en Work OS se ingresa manualmente:
- El semáforo RAG lo actualiza un funcionario a criterio propio
- El % de avance lo estima el mismo funcionario
- Los seguimientos son texto libre escrito por el equipo

Sin embargo, **buena parte de esta información ya existe publicada en portales del Estado chileno**. Distintos ministerios y servicios publican en línea el estado de sus proyectos, licitaciones, inversiones, obras y programas. El equipo ya navega esas fuentes hoy — pero lo hace manualmente y no conecta lo que ve con el sistema.

El objetivo es evaluar **cómo importar o sincronizar información desde esas fuentes externas hacia Work OS**, de manera que:

1. El sistema refleje la realidad con mayor fidelidad y menos esfuerzo manual
2. Los funcionarios puedan ver en un solo lugar el estado real de cada prioridad
3. La bandeja de atención detecte problemas más temprano (con datos reales, no estimaciones)
4. Las minutas PDF tengan información actualizada sin depender de que alguien la haya cargado

## Fuentes de información disponibles online

Las fuentes que el equipo ya consulta o podría consultar incluyen (sin estar limitadas a):

- **Mercado Público (Chile Compra)**: licitaciones, contratos y órdenes de compra de todos los organismos públicos. Tiene API pública y motor de búsqueda.
- **BIP (Banco Integrado de Proyectos – MDSF)**: proyectos de inversión pública con estado de iniciativa, RS, código BIP, monto, región y servicio ejecutor.
- **SIGFE / DIPRES**: ejecución presupuestaria por servicio y programa. Publicación mensual.
- **SEIA (Sistema de Evaluación de Impacto Ambiental)**: estado de proyectos sometidos a evaluación ambiental, con región, tipo, titular y resolución.
- **Plataforma de Seguimiento Presidencial / SEGPRES**: algunos gobiernos publican tableros de seguimiento de compromisos presidenciales.
- **Sitios web y portales de ministerios**: cada ministerio (Obras Públicas, Vivienda, Energía, etc.) publica avances de sus programas en distintos formatos (tablas HTML, PDFs, Excel descargables).
- **Datos.gob.cl**: portal de datos abiertos del Estado con datasets en CSV y JSON.
- **INE**: estadísticas regionales que podrían actualizar automáticamente las métricas de contexto (`region_metrics`).
- **SUBDERE**: información de inversión regional y FNDR.

## Restricciones del sistema actual

Para que NotebookLM entienda qué no puede romperse al integrar fuentes externas:

- **El semáforo RAG y el % avance son los campos centrales de gestión**: si se sobreescriben automáticamente sin control, los funcionarios perderían la capacidad de evaluar con criterio propio. Cualquier dato externo debería llegar como sugerencia o insumo, no como overwrite automático.
- **La estructura de prioridades es fija**: las 63 prioridades están definidas políticamente. No se crean nuevas desde una fuente externa — solo se enriquecen las existentes.
- **No hay ID único compartido con sistemas externos**: las prioridades no tienen un código BIP, un ID de Mercado Público ni ningún identificador que las conecte formalmente con otra base de datos. La vinculación habría que hacerla por matching (texto, ministerio, región, eje).
- **Los usuarios son pocos y no técnicos**: la integración debe ser transparente o muy simple de operar. No puede requerir que los funcionarios descarguen Excel y los suban manualmente.
- **El stack es Next.js + Supabase**: cualquier integración debe caber en ese modelo — idealmente como API routes, cron jobs en Vercel, o funciones de Supabase.
- **No hay presupuesto para APIs de pago**: solo fuentes abiertas y gratuitas.

---

## Preguntas para NotebookLM

Las siguientes preguntas están ordenadas de lo más estratégico a lo más técnico. El objetivo es que NotebookLM las responda con recomendaciones concretas y aplicables a este sistema.

### Estrategia general

1. ¿Qué fuentes de información pública del Estado chileno tienen la mejor cobertura para monitorear el avance de proyectos de infraestructura, inversión social y seguridad a nivel regional? ¿Cuáles tienen APIs o datasets descargables confiables?

2. Para un sistema como este — donde las prioridades están definidas políticamente y no tienen un ID externo — ¿cuál es la mejor estrategia para vincular cada prioridad con sus fuentes de información externa? ¿Matching por texto, matching asistido por un humano una sola vez, o alguna otra técnica?

3. ¿Cómo debería diseñarse la experiencia de usuario para que los datos externos lleguen como "insumos sugeridos" y no como sobreescritura automática? ¿Qué han hecho bien otros sistemas de seguimiento de gobierno en este sentido?

### Fuentes específicas

4. ¿Mercado Público (Chile Compra) tiene una API que permita buscar licitaciones por región y ministerio? ¿Qué información exactamente está disponible y en qué formato? ¿Cada cuánto se actualiza?

5. ¿El BIP (Banco Integrado de Proyectos) tiene acceso programático a los estados de iniciativas de inversión? ¿Es posible consultar proyectos por región, ministerio o tipo sin autenticación institucional?

6. ¿Datos.gob.cl publica datasets actualizados con frecuencia sobre ejecución presupuestaria, avance de obras o indicadores sociales por región? ¿Cuáles son los más útiles para este caso?

7. ¿El INE tiene API o datasets en CSV con los indicadores regionales que ya están en `region_metrics` (pobreza, desempleo, PIB, salud, educación)? ¿Con qué periodicidad se actualizan?

### Arquitectura técnica

8. En un stack Next.js + Supabase desplegado en Vercel, ¿cuál es la mejor manera de hacer scraping o fetch periódico de fuentes externas? Opciones: Vercel Cron Jobs, Supabase Edge Functions, un script externo con GitHub Actions, u otro. ¿Qué limitaciones tiene cada opción?

9. ¿Cómo debería estructurarse la base de datos para almacenar datos crudos importados desde fuentes externas, mantener el historial y a la vez separarlo claramente de los datos ingresados manualmente por los usuarios?

10. Si algunos portales de gobierno no tienen API y solo exponen tablas HTML o PDFs descargables, ¿qué técnicas de extracción son más robustas y mantenibles en el tiempo? ¿Hay bibliotecas específicas recomendadas para scraping de sitios del Estado chileno?

### Calidad y confiabilidad

11. ¿Cómo manejar el caso en que una fuente externa contradiga lo que el funcionario ingresó manualmente? ¿El sistema debería alertar la discrepancia, ignorar el dato externo, o proponer una revisión?

12. ¿Qué hacer cuando una fuente externa deja de estar disponible o cambia su estructura? ¿Cómo diseñar la integración para que sea resiliente a esos cambios sin romper el sistema?

13. ¿Qué nivel de automatización es adecuado para este tipo de sistema de gobierno, considerando que los errores tienen consecuencias políticas y que los usuarios no son técnicos?
