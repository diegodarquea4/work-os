/**
 * GET /api/desalojos — lista de casos etiquetados, con sus capas anidadas.
 * Admin-only.
 *
 * v2: la unidad de gestión pasa a ser la capa (polígono). El listado lateral
 * de DesalojosView necesita, por caso, todas sus capas activas para hacer
 * rollup de semáforos y mostrar la matriz del tablero sin N+1.
 *
 * Se hacen 2 queries paralelas a desalojo_detalle y desalojo_capas y se
 * agrupa en cliente del handler. Index `idx_desalojo_capas_lookup` cubre el
 * join lógico por prioridad_id.
 *
 * Forma de la respuesta:
 *   { casos: [{ prioridad_id, detalle, capas: DesalojoCapa[] }, ...] }
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { regionCodByPrioridad } from '@/lib/desalojoAccess'
import type { DesalojoCapa, DesalojoDetalle, DesalojoFaseEstado } from '@/lib/types'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // admin (todo) o regional (solo sus regiones, read-only). Editor/viewer: no.
  if (profile.role !== 'admin' && profile.role !== 'regional') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  const [detalleRes, capasRes, fasesRes] = await Promise.all([
    db.from('desalojo_detalle').select('*'),
    db.from('desalojo_capas').select('*').order('orden', { ascending: true }),
    db.from('desalojo_fase_estado').select('*'),
  ])
  if (detalleRes.error) return NextResponse.json({ error: detalleRes.error.message }, { status: 500 })
  if (capasRes.error)   return NextResponse.json({ error: capasRes.error.message },   { status: 500 })
  if (fasesRes.error)   return NextResponse.json({ error: fasesRes.error.message },   { status: 500 })

  const detalles = (detalleRes.data ?? []) as DesalojoDetalle[]
  const capas    = (capasRes.data   ?? []) as DesalojoCapa[]
  const fases    = (fasesRes.data   ?? []) as DesalojoFaseEstado[]

  const capasByPid = new Map<number, DesalojoCapa[]>()
  for (const c of capas) {
    const arr = capasByPid.get(c.prioridad_id) ?? []
    arr.push(c)
    capasByPid.set(c.prioridad_id, arr)
  }

  const fasesByPid = new Map<number, DesalojoFaseEstado[]>()
  for (const f of fases) {
    const arr = fasesByPid.get(f.prioridad_id) ?? []
    arr.push(f)
    fasesByPid.set(f.prioridad_id, arr)
  }

  let casos = detalles.map(d => ({
    prioridad_id: d.prioridad_id,
    detalle:      d,
    capas:        capasByPid.get(d.prioridad_id) ?? [],
    fases_estado: fasesByPid.get(d.prioridad_id) ?? [],
  }))

  // Scoping regional: solo casos cuya prioridad esté en sus region_cods.
  if (profile.role === 'regional') {
    const codByN = await regionCodByPrioridad(db, casos.map(c => c.prioridad_id))
    casos = casos.filter(c => {
      const cod = codByN.get(c.prioridad_id)
      return !!cod && profile.region_cods.includes(cod)
    })
  }

  return NextResponse.json({ casos })
}
