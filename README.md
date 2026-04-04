# Work OS — Prioridades Territoriales

Sistema de seguimiento de prioridades territoriales del Ministerio del Interior y Seguridad Pública de Chile. Permite visualizar, gestionar, hacer seguimiento activo y exportar las prioridades territoriales 2026–2028 para las 16 regiones del país.

El sistema es usado exclusivamente por profesionales de la **División de Coordinación Interregional** del Ministerio del Interior. No es público.

---

## Qué hace hoy

- **Mapa interactivo** de Chile con las 16 regiones. Al seleccionar una región aparece un panel lateral con sus prioridades, métricas de contexto regional y botón para exportar minuta PDF.
- **Dashboard nacional**: tabla con todas las prioridades del país, filtros por región, eje, semáforo y prioridad, y resumen RAG agregado.
- **Bandeja de atención**: identifica automáticamente prioridades que requieren acción inmediata — bloqueadas (semáforo rojo), sin actividad reciente (+15 días) o con avance bajo (menos del 30%).
- **Modal de seguimiento por prioridad**: registro de avances, reuniones, hitos y alertas con fecha, autor y estado. Vista de línea de tiempo y vista de calendario mensual.
- **Documentos adjuntos**: subida y descarga de archivos por prioridad, almacenados en Supabase Storage.
- **Semáforo RAG** por prioridad (verde / ámbar / rojo / gris), editable manualmente con persistencia en base de datos.
- **% de avance** por prioridad, editable con persistencia.
- **Minuta PDF** descargable por región con contexto regional (métricas) y lista de prioridades.
- **Autenticación**: acceso restringido por email y contraseña vía Supabase Auth. Los usuarios se crean manualmente.

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
  WorkOSApp.tsx              # Shell cliente — maneja estado global de proyectos y navegación entre vistas
  ChileMap.tsx               # Mapa interactivo (Leaflet, dynamic import)
  ProjectsPanel.tsx          # Panel lateral por región: prioridades + contexto regional + filtros
  NationalDashboard.tsx      # Tabla nacional con filtros y estadísticas agregadas
  AttentionTray.tsx          # Bandeja de atención: alertas automáticas agrupadas
  ProjectTrackerModal.tsx    # Modal de seguimiento: timeline, calendario, documentos
  MinutaDocument.tsx         # Documento PDF (react-pdf)

lib/
  supabase.ts                # Cliente Supabase browser (createBrowserClient)
  db.ts                      # Todas las funciones de acceso a datos
  types.ts                   # Tipos: Prioridad, RegionMetrics, Seguimiento, Documento
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
            └─ WorkOSApp (cliente, estado: localProjects)
                 ├─ ChileMap
                 ├─ ProjectsPanel
                 │    ├─ /api/metrics/[cod]   (métricas contexto)
                 │    ├─ /api/actividad/[cod] (última actividad)
                 │    └─ ProjectTrackerModal
                 │         ├─ seguimientos (fetch directo a Supabase desde cliente)
                 │         └─ documentos (fetch + upload a Supabase Storage)
                 ├─ NationalDashboard
                 └─ AttentionTray
                      └─ /api/actividad/all
```

Cuando el modal guarda un cambio de semáforo o % avance, llama `onUpdatePrioridad(n, patch)` que propaga el cambio hacia arriba en `WorkOSApp.localProjects` — sin recargar la página.

---

## Variables de entorno

```env
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
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
