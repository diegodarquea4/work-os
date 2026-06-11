/**
 * GET  /api/desalojos/[n]/capas — lista de capas de un caso, ordenadas por `orden`.
 * POST /api/desalojos/[n]/capas — crea una capa nueva.
 *
 * Ambas admin-only.
 *
 * POST body: { nombre: string, orden?: number }
 *   nombre: no vacío, max 200 chars.
 *   orden:  default = max(orden actual) + 1.
 *
 * Tipología, fase y campos por dimensión NO se asignan en la creación —
 * arrancan en sus defaults (NULL / habilitacion / gris) y se editan después
 * vía PATCH a /capas/[capa_id].
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  _req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('desalojo_capas')
    .select('*')
    .eq('prioridad_id', n)
    .order('orden', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ capas: data ?? [] })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  let body: { nombre?: unknown; orden?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (typeof body.nombre !== 'string' || !body.nombre.trim()) {
    return NextResponse.json({ error: 'nombre vacío' }, { status: 400 })
  }
  const nombre = body.nombre.trim().slice(0, 200)

  const db = getSupabaseAdmin()

  // Confirmar que el caso existe (es_desalojo=TRUE no se exige — admin podría
  // estar preparando capas antes de etiquetar, pero al menos que la iniciativa
  // exista).
  const { data: iniciativa, error: iniErr } = await db
    .from('prioridades_territoriales')
    .select('n')
    .eq('n', n)
    .maybeSingle()
  if (iniErr) return NextResponse.json({ error: iniErr.message }, { status: 500 })
  if (!iniciativa) return NextResponse.json({ error: `Iniciativa #${n} no encontrada` }, { status: 404 })

  // Calcular orden si no viene.
  let orden: number
  if (typeof body.orden === 'number' && Number.isInteger(body.orden) && body.orden >= 0) {
    orden = body.orden
  } else {
    const { data: maxRow } = await db
      .from('desalojo_capas')
      .select('orden')
      .eq('prioridad_id', n)
      .order('orden', { ascending: false })
      .limit(1)
      .maybeSingle()
    orden = ((maxRow?.orden as number | undefined) ?? -1) + 1
  }

  const { data: capa, error: insErr } = await db
    .from('desalojo_capas')
    .insert({ prioridad_id: n, nombre, orden })
    .select('*')
    .single()
  if (insErr || !capa) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert falló' }, { status: 500 })
  }

  // Inicializar las 6 filas de fase para la capa nueva.
  const fases: ('pr' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5')[] = ['pr', 'f1', 'f2', 'f3', 'f4', 'f5']
  const { error: faseErr } = await db
    .from('desalojo_fase_estado')
    .insert(fases.map(f => ({ prioridad_id: n, capa_id: capa.id, fase: f })))
  if (faseErr) console.error('[desalojos.capa.post] insert fases falló:', faseErr)

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        capa.id,
    fase:           null,
    campo:          'capa_creada',
    valor_anterior: null,
    valor_nuevo:    nombre,
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, capa })
}
