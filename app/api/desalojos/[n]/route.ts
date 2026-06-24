/**
 * GET    /api/desalojos/[n] — `{ detalle, capas, seguimientos, documentos }` del caso.
 * PATCH  /api/desalojos/[n] — solo `resumen_narrativo` (lo único editable a nivel caso).
 *
 * Ambas admin-only.
 *
 * v2: `desalojo_detalle` se redujo a contexto del caso (resumen narrativo +
 * agregados derivados en cliente). Todo lo operativo por dimensión vive en
 * `desalojo_capas` 1:N — ver /api/desalojos/[n]/capas para mutaciones.
 *
 * `documentos.url` es path en bucket `desalojos-docs`; el GET firma con TTL.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { desalojoDetallePatchSchema } from '@/lib/schemas'
import type { DesalojoDocumento } from '@/lib/types'

const SIGNED_URL_TTL_SEC = 3600

async function withSignedUrls(
  db:   ReturnType<typeof getSupabaseAdmin>,
  docs: DesalojoDocumento[],
): Promise<DesalojoDocumento[]> {
  return Promise.all(docs.map(async d => {
    const { data } = await db.storage.from('desalojos-docs').createSignedUrl(d.url, SIGNED_URL_TTL_SEC)
    return data?.signedUrl ? { ...d, url: data.signedUrl } : d
  }))
}

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
  const [detalleRes, capasRes, fasesRes, segRes, docsRes, planRes] = await Promise.all([
    db.from('desalojo_detalle')      .select('*').eq('prioridad_id', n).maybeSingle(),
    db.from('desalojo_capas')        .select('*').eq('prioridad_id', n).order('orden', { ascending: true }),
    db.from('desalojo_fase_estado')  .select('*').eq('prioridad_id', n),
    db.from('desalojo_seguimientos') .select('*').eq('prioridad_id', n).order('created_at', { ascending: false }),
    db.from('desalojo_documentos')   .select('*').eq('prioridad_id', n).order('created_at', { ascending: false }),
    db.from('desalojo_planificacion').select('*').eq('prioridad_id', n).is('archivado_at', null)
      .order('fecha_inicio', { ascending: true })
      .order('orden',        { ascending: true })
      .order('id',           { ascending: true }),
  ])
  for (const r of [detalleRes, capasRes, fasesRes, segRes, docsRes, planRes]) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
  }

  const documentos = await withSignedUrls(db, (docsRes.data ?? []) as DesalojoDocumento[])

  return NextResponse.json({
    detalle:       detalleRes.data ?? null,
    capas:         capasRes.data   ?? [],
    fases_estado:  fasesRes.data   ?? [],
    seguimientos:  segRes.data     ?? [],
    documentos,
    planificacion: planRes.data    ?? [],
  })
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  let rawBody: unknown
  try { rawBody = await req.json() }
  catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = desalojoDetallePatchSchema.safeParse(rawBody)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Solicitud inválida', detalle: parse.error.issues },
      { status: 400 },
    )
  }
  // Único campo editable a nivel caso. Operación por dimensión va a /capas.
  const raw = parse.data.resumen_narrativo
  const nuevo = raw === null ? null : (raw.trim() || null)

  const db = getSupabaseAdmin()

  const { data: prev, error: readErr } = await db
    .from('desalojo_detalle')
    .select('*')
    .eq('prioridad_id', n)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!prev) {
    return NextResponse.json(
      { error: `Caso #${n} sin detalle. Marca la iniciativa como desalojo primero.` },
      { status: 404 },
    )
  }

  const anterior = (prev as { resumen_narrativo: string | null }).resumen_narrativo
  if (anterior === nuevo) {
    return NextResponse.json({ ok: true, detalle: prev, noop: true })
  }

  const { data: updated, error: updErr } = await db
    .from('desalojo_detalle')
    .update({ resumen_narrativo: nuevo, updated_at: new Date().toISOString() })
    .eq('prioridad_id', n)
    .select('*')
    .maybeSingle()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Update falló' }, { status: 500 })
  }

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        null,
    campo:          'resumen_narrativo',
    valor_anterior: anterior !== null ? anterior : null,
    valor_nuevo:    nuevo ?? '',
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, detalle: updated })
}
