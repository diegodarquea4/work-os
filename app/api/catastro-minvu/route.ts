/**
 * GET /api/catastro-minvu — busca en el catastro nacional MINVU CNC 2026.
 *
 * Admin-only (mismo criterio que el resto de Desalojos: el catastro lista
 * tomas con datos sensibles — propietario, hogares, NNA implícitos en el
 * conteo).
 *
 * Query params (todos opcionales, AND entre sí):
 *   ?q=         — substring sobre nombre/comuna/folio (case-insensitive, sin tildes).
 *   ?region=    — match exacto sobre nombre de región (normalizado).
 *   ?comuna=    — match exacto sobre comuna.
 *   ?folio=     — match exacto sobre folio (ignora los demás filtros si está set).
 *   ?limit=     — cap del resultado (default 50, max 200).
 *
 * Respuesta:
 *   200 { results: CatastroEntry[] }
 *   401 / 403 / 500 standard
 *   500 si el JSON bundled no existe (correr scripts/build-catastro-minvu.mjs).
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { searchCatastro } from '@/lib/catastroMinvu'

export async function GET(req: Request) {
  const profile = await requireAuth()
  if (!profile)                 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden'    }, { status: 403 })

  const url = new URL(req.url)
  const q       = url.searchParams.get('q')      || undefined
  const region  = url.searchParams.get('region') || undefined
  const comuna  = url.searchParams.get('comuna') || undefined
  const folio   = url.searchParams.get('folio')  || undefined
  const limitRaw = url.searchParams.get('limit')
  const limit   = Math.min(200, Math.max(1, limitRaw ? Number(limitRaw) || 50 : 50))

  try {
    const results = await searchCatastro({ q, region, comuna, folio }, limit)
    return NextResponse.json({ results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Mensaje específico cuando falta el bundle.
    if (msg.includes('ENOENT')) {
      return NextResponse.json(
        { error: 'Catastro no disponible. Corre scripts/build-catastro-minvu.mjs para generar el bundle.' },
        { status: 500 },
      )
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
