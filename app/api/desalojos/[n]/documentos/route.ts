/**
 * GET  /api/desalojos/[n]/documentos — lista de documentos del caso.
 * POST /api/desalojos/[n]/documentos — sube un documento.
 *
 * Ambas admin-only.
 *
 * Filtros GET: ?capa_id=<id|general>  ?dimension=<juridico|seguridad|social|financiamiento>
 *   capa_id=general → solo documentos del caso (capa_id IS NULL).
 *
 * POST: multipart/form-data con campos:
 *   file:       File (requerido)
 *   capa_id:    number opcional (NULL = doc del caso)
 *   dimension:  string opcional (juridico|seguridad|social|financiamiento)
 *
 * Storage: bucket privado `desalojos-docs` con paths
 *   {prioridad_id}/{capa_id|'general'}/{Date.now()}_{file.name}
 *
 * El campo `url` de desalojo_documentos guarda el path RELATIVO (no signed
 * URL); el GET firma con TTL al servir.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { checklistItems } from '@/lib/desalojos'
import type { DesalojoDocumento, DesalojoFaseConSemaforo, DesalojoTipologia } from '@/lib/types'

const SIGNED_URL_TTL_SEC = 3600
const DIMENSIONS = new Set(['juridico', 'seguridad', 'social', 'financiamiento'])
const FASES_VALID = new Set<DesalojoFaseConSemaforo>(['pr', 'f1', 'f2', 'f3', 'f4', 'f5'])

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
}

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
  req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  const url       = new URL(req.url)
  const capaParam = url.searchParams.get('capa_id')
  const dimParam  = url.searchParams.get('dimension')

  const db = getSupabaseAdmin()
  let q = db.from('desalojo_documentos').select('*').eq('prioridad_id', n).order('created_at', { ascending: false })
  if (capaParam === 'general') {
    q = q.is('capa_id', null)
  } else if (capaParam) {
    const capaId = Number(capaParam)
    if (!Number.isFinite(capaId)) return NextResponse.json({ error: 'capa_id inválido' }, { status: 400 })
    q = q.eq('capa_id', capaId)
  }
  if (dimParam) {
    if (!DIMENSIONS.has(dimParam)) return NextResponse.json({ error: 'dimension inválida' }, { status: 400 })
    q = q.eq('dimension', dimParam)
  }
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const documentos = await withSignedUrls(db, (data ?? []) as DesalojoDocumento[])
  return NextResponse.json({ documentos })
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

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: 'Body inválido (multipart/form-data esperado)' }, { status: 400 }) }

  const file = form.get('file')
  if (!(file instanceof File))    return NextResponse.json({ error: 'file requerido' },        { status: 400 })
  if (file.size === 0)            return NextResponse.json({ error: 'archivo vacío' },         { status: 400 })

  const capaRaw = form.get('capa_id')
  let capaId: number | null = null
  if (capaRaw !== null && capaRaw !== '' && capaRaw !== 'null') {
    const v = Number(capaRaw)
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'capa_id inválido' }, { status: 400 })
    capaId = v
  }

  const dimRaw = form.get('dimension')
  let dimension: string | null = null
  if (dimRaw !== null && dimRaw !== '') {
    if (typeof dimRaw !== 'string' || !DIMENSIONS.has(dimRaw)) {
      return NextResponse.json({ error: 'dimension inválida' }, { status: 400 })
    }
    dimension = dimRaw
  }

  // Vinculación opcional a un item del checklist: fase + item_key.
  const faseRaw = form.get('fase')
  let fase: DesalojoFaseConSemaforo | null = null
  if (faseRaw !== null && faseRaw !== '') {
    if (typeof faseRaw !== 'string' || !FASES_VALID.has(faseRaw as DesalojoFaseConSemaforo)) {
      return NextResponse.json({ error: 'fase inválida' }, { status: 400 })
    }
    fase = faseRaw as DesalojoFaseConSemaforo
  }
  const itemKeyRaw = form.get('item_key')
  let itemKey: string | null = null
  if (itemKeyRaw !== null && itemKeyRaw !== '') {
    if (typeof itemKeyRaw !== 'string' || !/^[a-z0-9_]+$/.test(itemKeyRaw)) {
      return NextResponse.json({ error: 'item_key inválido' }, { status: 400 })
    }
    if (fase === null) {
      return NextResponse.json({ error: 'item_key requiere fase' }, { status: 400 })
    }
    itemKey = itemKeyRaw
  }

  const db = getSupabaseAdmin()

  // Si viene capa_id, validar que pertenezca al caso.
  let capaTipologia: DesalojoTipologia | null = null
  if (capaId !== null) {
    const { data: capa } = await db
      .from('desalojo_capas')
      .select('id, prioridad_id, tipologia')
      .eq('id', capaId)
      .maybeSingle()
    if (!capa || capa.prioridad_id !== n) {
      return NextResponse.json({ error: 'capa_id no pertenece al caso' }, { status: 400 })
    }
    capaTipologia = (capa.tipologia ?? null) as DesalojoTipologia | null
  }

  // Si viene item_key, validar que exista en el config vigente para la
  // tipología de la capa (evita orphans desde el cliente).
  if (itemKey !== null && fase !== null) {
    if (capaId === null) {
      return NextResponse.json({ error: 'item_key requiere capa_id' }, { status: 400 })
    }
    const items = checklistItems(capaTipologia, fase)
    if (!items.some(i => i.key === itemKey)) {
      return NextResponse.json({ error: `item_key '${itemKey}' no pertenece al checklist ${fase} de la tipología` }, { status: 400 })
    }
  }

  // Subir a Storage. Path: {n}/{capa_id|'general'}/{fase|''}/{Date.now()}_{file.name}
  const safeName = sanitizeFilename(file.name)
  const pathSegments = [String(n), capaId === null ? 'general' : String(capaId)]
  if (fase) pathSegments.push(fase)
  pathSegments.push(`${Date.now()}_${safeName}`)
  const path = pathSegments.join('/')
  const buf  = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await db.storage
    .from('desalojos-docs')
    .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
  if (upErr) {
    return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 500 })
  }

  // Insertar fila. `url` guarda el path; el GET firma al servir.
  const { data: doc, error: insErr } = await db
    .from('desalojo_documentos')
    .insert({
      prioridad_id: n,
      capa_id:      capaId,
      dimension,
      fase,
      item_key:     itemKey,
      nombre:       file.name,
      url:          path,
      tipo_archivo: file.type || null,
      tamano_bytes: file.size,
      subido_por:   profile.email || null,
    })
    .select('*')
    .single()
  if (insErr || !doc) {
    // Storage ya tiene el archivo. Intento limpiar para no dejar huérfano.
    await db.storage.from('desalojos-docs').remove([path])
    return NextResponse.json({ error: insErr?.message ?? 'Insert falló' }, { status: 500 })
  }

  // Firmar URL para la respuesta inmediata.
  const { data: signed } = await db.storage.from('desalojos-docs').createSignedUrl(path, SIGNED_URL_TTL_SEC)
  const documento: DesalojoDocumento = { ...(doc as DesalojoDocumento), url: signed?.signedUrl ?? path }

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        capaId,
    fase:           fase ?? null,
    campo:          itemKey ? `documento.${fase}.${itemKey}` : dimension ? `documento.${dimension}` : 'documento',
    valor_anterior: null,
    valor_nuevo:    file.name,
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, documento })
}
