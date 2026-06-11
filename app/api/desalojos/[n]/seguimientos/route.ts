/**
 * POST /api/desalojos/[n]/seguimientos — sumar un seguimiento a una dimensión
 * de una capa específica. Admin-only.
 *
 * v2: el seguimiento ahora pertenece a una CAPA (FK lógico vía capa_id), no
 * al caso entero. La timeline de cada acordeón de dimensión filtra por
 * `capa_id === capa.id`. Se mantiene esta ruta (en vez de mover a
 * /capas/[capa_id]/seguimientos) para evitar churn en el cliente.
 *
 * Body: { capa_id, dimension, tipo, descripcion }
 *   capa_id:     id de la capa (debe pertenecer al caso n)
 *   dimension:   'juridico' | 'seguridad' | 'social' | 'financiamiento'
 *   tipo:        'avance' | 'reunion' | 'hito' | 'alerta'
 *   descripcion: string no vacío
 *
 * Devuelve la fila creada para que el cliente la prependa a la timeline
 * optimistically sin re-fetch.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

const DIMENSIONS = new Set(['juridico', 'seguridad', 'social', 'financiamiento'])
const TIPOS      = new Set(['avance', 'reunion', 'hito', 'alerta'])

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

  let body: { capa_id?: unknown; dimension?: unknown; tipo?: unknown; descripcion?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { capa_id, dimension, tipo, descripcion } = body
  const capaId = Number(capa_id)
  if (!Number.isFinite(capaId) || capaId <= 0)                        return NextResponse.json({ error: 'capa_id inválido' },     { status: 400 })
  if (typeof dimension   !== 'string' || !DIMENSIONS.has(dimension))  return NextResponse.json({ error: 'dimension inválida' },   { status: 400 })
  if (typeof tipo        !== 'string' || !TIPOS.has(tipo))            return NextResponse.json({ error: 'tipo inválido' },        { status: 400 })
  if (typeof descripcion !== 'string' || !descripcion.trim())         return NextResponse.json({ error: 'descripcion vacía' },    { status: 400 })

  const db = getSupabaseAdmin()

  // La capa debe pertenecer al caso n. Defensa contra body forjado que
  // intente sumar un seguimiento a una capa de otro caso.
  const { data: capa, error: capaErr } = await db
    .from('desalojo_capas')
    .select('id, prioridad_id')
    .eq('id', capaId)
    .maybeSingle()
  if (capaErr) return NextResponse.json({ error: capaErr.message }, { status: 500 })
  if (!capa || capa.prioridad_id !== n) {
    return NextResponse.json({ error: 'Capa no pertenece al caso' }, { status: 400 })
  }

  const { data, error } = await db
    .from('desalojo_seguimientos')
    .insert({
      prioridad_id: n,
      capa_id:      capaId,
      dimension,
      tipo,
      descripcion:  descripcion.trim(),
      created_by:   profile.email || null,
    })
    .select('*')
    .single()
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Insert falló' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, seguimiento: data })
}
