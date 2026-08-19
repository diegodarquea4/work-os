/**
 * Ruta gateada de los datos del modo «Autoridades» (Panel Territorial SUBDERE).
 *
 * GATE DURO: reemplaza el servido estático desde `public/` (accesible a cualquier
 * usuario logueado por URL directa) por una ruta que exige la capacidad
 * `mapa.autoridades` server-side. Sin sesión → 401; con sesión pero sin la
 * capacidad → 403. Solo quien nosotros habilitamos (admin por defecto; concedible
 * a usuarios puntuales desde Usuarios→Permisos) puede bajar estos datos.
 *
 * Los archivos viven en `territorial-data/` (FUERA de `public/`) y se incluyen en
 * el bundle serverless vía `outputFileTracingIncludes` (next.config.ts). Se
 * regeneran con `scripts/{snapshot-territorial,export-territorios-geojson}.mjs`.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAuth, requireCan } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'

// Allowlist: `asset` (param de la URL) → archivo real. Cierra el path traversal:
// nunca se compone la ruta con el input del usuario.
const ASSETS: Record<string, { file: string; type: string }> = {
  snapshot:          { file: 'snapshot.json',             type: 'application/json' },
  fotos:             { file: 'fotos.json',                type: 'application/json' },
  distritos:         { file: 'distritos.geojson',         type: 'application/geo+json' },
  circunscripciones: { file: 'circunscripciones.geojson', type: 'application/geo+json' },
}

export async function GET(_request: Request, { params }: { params: Promise<{ asset: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'No autenticado' }, { status: 401 })
  if (!(await requireCan(profile, 'mapa.autoridades'))) {
    return Response.json({ error: 'Sin permiso para ver Autoridades' }, { status: 403 })
  }

  const { asset } = await params
  const meta = ASSETS[asset]
  if (!meta) return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })

  let contenido: string
  try {
    contenido = await readFile(path.join(process.cwd(), 'territorial-data', meta.file), 'utf-8')
  } catch {
    return Response.json({ error: 'Recurso no disponible' }, { status: 500 })
  }

  return new Response(contenido, {
    headers: {
      'Content-Type': meta.type,
      // Datos sensibles: nunca en caché compartida (CDN). El navegador re-valida en
      // cada carga completa; dentro de una sesión el módulo de source.ts evita el
      // re-fetch. Así una revocación de permiso corta el acceso al recargar.
      'Cache-Control': 'private, no-store',
    },
  })
}
