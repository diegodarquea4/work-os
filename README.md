# Work OS — Prioridades Territoriales

Sistema de seguimiento de prioridades territoriales del Ministerio del Interior y Seguridad Pública. Permite visualizar, gestionar y exportar las prioridades de cada región de Chile.

---

## Qué hace

- **Mapa interactivo** de Chile con las 16 regiones, coloreadas por zona geográfica
- **Panel lateral** al seleccionar una región: muestra las prioridades registradas, métricas de contexto regional (población, pobreza, desempleo, PIB, etc.) y un botón para exportar la minuta
- **Minuta PDF** descargable por región con las prioridades y contexto regional
- **Seguimiento de prioridades**: al hacer clic en una prioridad se abre un modal para registrar avances, reuniones, hitos y alertas, y adjuntar documentos
- **Autenticación**: acceso restringido por email y contraseña vía Supabase Auth

---

## Stack

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| Base de datos | Supabase (Postgres) |
| Autenticación | Supabase Auth |
| Storage (archivos) | Supabase Storage |
| Mapa | Leaflet + react-leaflet |
| PDF | @react-pdf/renderer |
| Estilos | Tailwind CSS |
| Deploy | Vercel |

---

## Estructura del proyecto

```
app/
  page.tsx                  # Página principal (Server Component, carga datos desde Supabase)
  layout.tsx                # Layout global
  login/page.tsx            # Página de inicio de sesión
  auth/callback/route.ts    # Callback de autenticación
  api/
    metrics/[cod]/route.ts  # GET métricas de una región por código
    minuta/route.ts         # POST genera PDF de minuta

components/
  WorkOSApp.tsx             # Shell principal (cliente), maneja selección de región
  ChileMap.tsx              # Mapa interactivo de Chile
  ProjectsPanel.tsx         # Panel lateral de prioridades y métricas
  MinutaDocument.tsx        # Documento PDF (react-pdf)
  ProjectTrackerModal.tsx   # Modal de seguimiento y documentos de una prioridad

lib/
  supabase.ts               # Cliente Supabase (browser, cookie-based)
  db.ts                     # Funciones de acceso a datos (Supabase)
  types.ts                  # Tipos TypeScript: Prioridad, RegionMetrics, Seguimiento, Documento
  regions.ts                # Lista de regiones con coordenadas y zona
  projects.ts               # Fallback local (CSV) cuando Supabase no está configurado

middleware.ts               # Protege todas las rutas, redirige a /login sin sesión

public/
  chile-regiones.geojson    # GeoJSON con los polígonos de las 16 regiones
```

---

## Base de datos (Supabase)

### Tablas

| Tabla | Descripción |
|---|---|
| `prioridades_territoriales` | Una fila por prioridad (63 total), con región, eje, meta, ministerios, prioridad (Alta/Media) y plazo |
| `region_metrics` | Una fila por región (16 total), con ~90 métricas de contexto (demografía, empleo, economía, salud, educación, vivienda, seguridad, conectividad) |
| `seguimientos` | Actualizaciones de seguimiento de una prioridad (avances, reuniones, hitos, alertas) |
| `documentos_prioridad` | Archivos adjuntos a una prioridad (metadata); los archivos se almacenan en Supabase Storage |

### Storage

| Bucket | Descripción |
|---|---|
| `project-docs` | Archivos adjuntos a prioridades. Ruta: `{prioridad_id}/{timestamp}_{nombre}` |

---

## Variables de entorno

Crear archivo `.env.local` en la raíz del proyecto:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<proyecto>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON=<anon key>
```

En Vercel, agregar las mismas variables en **Settings → Environment Variables**.

---

## Correr en local

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000). Se pedirá login con email y contraseña.

---

## Gestión de usuarios

Los usuarios se crean manualmente desde el dashboard de Supabase:

**Authentication → Users → Add user → Create new user**

No hay registro público. Solo los usuarios que tú crees tienen acceso.

---

## Deploy

El proyecto se despliega automáticamente en Vercel al hacer push a `main`. Asegurarse de que las variables de entorno estén configuradas en Vercel antes del primer deploy.
