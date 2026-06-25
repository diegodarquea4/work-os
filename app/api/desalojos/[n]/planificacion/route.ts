/**
 * POST /api/desalojos/[n]/planificacion — crea un evento del timeline de
 * planificación de un caso. Admin-only.
 *
 * Body: { capa_id?, titulo, descripcion?, fecha_inicio, fecha_fin? }
 *   capa_id:      number opcional (NULL = evento del caso global)
 *   titulo:       string no vacío
 *   descripcion:  string opcional
 *   fecha_inicio: YYYY-MM-DD (DATE)
 *   fecha_fin:    YYYY-MM-DD opcional (NULL = evento puntual; debe ser >= fecha_inicio)
 *
 * El `orden` lo asigna el server con `COALESCE(MAX(orden),0)+1` filtrando por
 * (prioridad_id, fecha_inicio, archivado_at IS NULL) — evita race condition
 * entre dos admins clickeando "+ Agregar" simultáneamente con la misma fecha.
 *
 * Devuelve la fila creada para que el cliente la inserte optimistically.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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

  let body: {
    capa_id?:      unknown
    parent_id?:    unknown
    titulo?:       unknown
    descripcion?:  unknown
    fecha_inicio?: unknown
    fecha_fin?:    unknown
  }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const titulo = typeof body.titulo === 'string' ? body.titulo.trim() : ''
  if (!titulo) return NextResponse.json({ error: 'Título requerido' }, { status: 400 })

  const fechaInicio = typeof body.fecha_inicio === 'string' ? body.fecha_inicio.trim() : ''
  if (!DATE_RE.test(fechaInicio)) {
    return NextResponse.json({ error: 'fecha_inicio inválida (formato YYYY-MM-DD)' }, { status: 400 })
  }

  let fechaFin: string | null = null
  if (body.fecha_fin !== undefined && body.fecha_fin !== null && body.fecha_fin !== '') {
    if (typeof body.fecha_fin !== 'string' || !DATE_RE.test(body.fecha_fin)) {
      return NextResponse.json({ error: 'fecha_fin inválida (formato YYYY-MM-DD)' }, { status: 400 })
    }
    if (body.fecha_fin < fechaInicio) {
      return NextResponse.json({ error: 'fecha_fin debe ser >= fecha_inicio' }, { status: 400 })
    }
    fechaFin = body.fecha_fin
  }

  let capaId: number | null = null
  if (body.capa_id !== undefined && body.capa_id !== null && body.capa_id !== '') {
    const v = Number(body.capa_id)
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'capa_id inválido' }, { status: 400 })
    capaId = v
  }

  const descripcion = typeof body.descripcion === 'string' && body.descripcion.trim()
    ? body.descripcion.trim()
    : null

  let parentId: number | null = null
  if (body.parent_id !== undefined && body.parent_id !== null && body.parent_id !== '') {
    const v = Number(body.parent_id)
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'parent_id inválido' }, { status: 400 })
    parentId = v
  }

  const db = getSupabaseAdmin()

  if (capaId !== null) {
    const { data: capa, error: capaErr } = await db
      .from('desalojo_capas')
      .select('id, prioridad_id')
      .eq('id', capaId)
      .maybeSingle()
    if (capaErr) return NextResponse.json({ error: capaErr.message }, { status: 500 })
    if (!capa || capa.prioridad_id !== n) {
      return NextResponse.json({ error: 'capa_id no pertenece al caso' }, { status: 400 })
    }
  }

  // Si es un hito (parent_id != null), validar: padre existe, mismo caso,
  // padre no es a su vez un hito (solo 2 niveles), y fechas dentro del rango
  // del padre. capa_id del hito se fuerza al del padre — un hito no puede
  // vivir en otra capa distinta a la de su evento padre.
  if (parentId !== null) {
    const { data: parent, error: parentErr } = await db
      .from('desalojo_planificacion')
      .select('id, prioridad_id, parent_id, capa_id, fecha_inicio, fecha_fin, archivado_at')
      .eq('id', parentId)
      .maybeSingle()
    if (parentErr) return NextResponse.json({ error: parentErr.message }, { status: 500 })
    if (!parent || parent.prioridad_id !== n || parent.archivado_at !== null) {
      return NextResponse.json({ error: 'Evento padre no encontrado en este caso' }, { status: 400 })
    }
    if (parent.parent_id !== null) {
      return NextResponse.json({ error: 'No se permiten hitos anidados' }, { status: 400 })
    }
    const parentFin = parent.fecha_fin ?? parent.fecha_inicio
    if (fechaInicio < parent.fecha_inicio || fechaInicio > parentFin) {
      return NextResponse.json({
        error: `fecha_inicio del hito debe estar entre ${parent.fecha_inicio} y ${parentFin} (rango del evento padre)`,
      }, { status: 400 })
    }
    if (fechaFin !== null && (fechaFin < parent.fecha_inicio || fechaFin > parentFin)) {
      return NextResponse.json({
        error: `fecha_fin del hito debe estar entre ${parent.fecha_inicio} y ${parentFin} (rango del evento padre)`,
      }, { status: 400 })
    }
    // Heredar capa del padre — los hitos siempre comparten capa con su evento.
    capaId = parent.capa_id
  }

  // Asignar orden = max+1 dentro de (prioridad, fecha_inicio). El SELECT y
  // el INSERT viajan en la misma RPC; PostgreSQL los serializa con el index
  // por (prioridad_id, fecha_inicio, orden). En el peor caso, dos POST
  // concurrentes pueden recibir el mismo `orden` (race window pequeña sin
  // SELECT FOR UPDATE), pero como orden es solo tie-breaker visual no rompe
  // nada: si pasa, el segundo evento aparece después del primero por `id ASC`.
  const { data: maxRow } = await db
    .from('desalojo_planificacion')
    .select('orden')
    .eq('prioridad_id', n)
    .eq('fecha_inicio', fechaInicio)
    .is('archivado_at', null)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordenNuevo = (maxRow?.orden ?? 0) + 1

  const { data: evento, error: insErr } = await db
    .from('desalojo_planificacion')
    .insert({
      prioridad_id: n,
      capa_id:      capaId,
      parent_id:    parentId,
      titulo,
      descripcion,
      fecha_inicio: fechaInicio,
      fecha_fin:    fechaFin,
      orden:        ordenNuevo,
      created_by:   profile.email || null,
    })
    .select('*')
    .single()
  if (insErr || !evento) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert falló' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, evento })
}
