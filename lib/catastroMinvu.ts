/**
 * Loader del catastro nacional de campamentos MINVU (CNC 2026).
 *
 * El catastro vive como JSON estático en `public/data/catastro-minvu-2026.json`
 * (ver scripts/build-catastro-minvu.mjs). El cliente puede pedirlo via
 * `/api/catastro-minvu` (search server-side) o vía fetch directo al archivo
 * estático si necesita el listado completo (no recomendado por peso).
 *
 * Server-side: este módulo carga el JSON una vez en memoria y lo cachea.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CatastroEntry } from '@/lib/types'

export type { CatastroEntry }

let _cache: CatastroEntry[] | null = null

/** Path al JSON bundled. Resuelve desde process.cwd() (Next.js corre desde la raíz). */
function bundlePath(): string {
  return join(process.cwd(), 'public', 'data', 'catastro-minvu-2026.json')
}

/** Carga el catastro completo. Cachea en memoria. Lanza si el archivo no existe. */
export async function loadCatastro(): Promise<CatastroEntry[]> {
  if (_cache !== null) return _cache
  const raw = await readFile(bundlePath(), 'utf-8')
  const data = JSON.parse(raw) as CatastroEntry[]
  _cache = data
  return data
}

/** Lookup por folio exacto. Devuelve null si no existe. */
export async function findByFolio(folio: string): Promise<CatastroEntry | null> {
  const all = await loadCatastro()
  return all.find(e => e.folio === folio) ?? null
}

/**
 * Búsqueda con filtros. `q` matchea substring sobre nombre o comuna
 * (case-insensitive, ignora tildes). `region` y `comuna` son matches exactos.
 * Devuelve hasta `limit` resultados, sin orden particular (orden del JSON).
 */
export async function searchCatastro(
  query:  { q?: string; region?: string; comuna?: string; folio?: string },
  limit = 50,
): Promise<CatastroEntry[]> {
  const all = await loadCatastro()

  if (query.folio) {
    const hit = all.find(e => e.folio === query.folio)
    return hit ? [hit] : []
  }

  // Quita tildes para hacer el match resiliente a "Valparaíso" vs "valparaiso".
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const q       = query.q      ? norm(query.q.trim())      : null
  const region  = query.region ? norm(query.region.trim()) : null
  const comuna  = query.comuna ? norm(query.comuna.trim()) : null

  const out: CatastroEntry[] = []
  for (const e of all) {
    if (region && norm(e.region) !== region) continue
    if (comuna && norm(e.comuna) !== comuna) continue
    if (q) {
      const inName = norm(e.nombre).includes(q)
      const inCom  = norm(e.comuna).includes(q)
      const inFol  = e.folio.includes(query.q!.trim())
      if (!inName && !inCom && !inFol) continue
    }
    out.push(e)
    if (out.length >= limit) break
  }
  return out
}
