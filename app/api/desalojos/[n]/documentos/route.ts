/**
 * GET  /api/desalojos/[n]/documentos — lista de documentos del caso.
 * POST /api/desalojos/[n]/documentos — registra un documento.
 *
 * Ambas admin-only.
 *
 * Filtros GET: ?capa_id=<id|general>  ?dimension=<juridico|seguridad|social|financiamiento>
 *   capa_id=general → solo documentos del caso (capa_id IS NULL).
 *
 * POST acepta dos shapes:
 *
 *  A) JSON (flujo nuevo, direct-to-Storage):
 *     Cliente ya subió el archivo a Storage vía signed upload URL del
 *     endpoint /upload-url. Acá solo recibimos metadata para crear la fila.
 *     Body: { path, nombre, tipo_archivo?, tamano_bytes?, capa_id?,
 *             dimension?, fase?, item_key? }
 *
 *  B) multipart/form-data (legacy, server-side upload):
 *     Cliente envía el archivo. El server lo sube a Storage y luego inserta.
 *     Sujeto al límite de 4.5MB de body de Vercel — usar solo para archivos
 *     chicos o como fallback.
 *     Campos: file (File), capa_id?, dimension?, fase?, item_key?
 *
 * Storage: bucket privado `desalojos-docs` con paths
 *   {prioridad_id}/{capa_id|'general'}/{fase|''}/{Date.now()}_{file.name}
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

type ParsedMeta = {
  capaId:    number | null
  dimension: string | null
  fase:      DesalojoFaseConSemaforo | null
  itemKey:   string | null
}

function parseMeta(raw: {
  capa_id?:   unknown
  dimension?: unknown
  fase?:      unknown
  item_key?:  unknown
}): ParsedMeta | NextResponse {
  let capaId: number | null = null
  if (raw.capa_id !== undefined && raw.capa_id !== null && raw.capa_id !== '' && raw.capa_id !== 'null') {
    const v = Number(raw.capa_id)
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'capa_id inválido' }, { status: 400 })
    capaId = v
  }
  let dimension: string | null = null
  if (raw.dimension !== undefined && raw.dimension !== null && raw.dimension !== '') {
    if (typeof raw.dimension !== 'string' || !DIMENSIONS.has(raw.dimension)) {
      return NextResponse.json({ error: 'dimension inválida' }, { status: 400 })
    }
    dimension = raw.dimension
  }
  let fase: DesalojoFaseConSemaforo | null = null
  if (raw.fase !== undefined && raw.fase !== null && raw.fase !== '') {
    if (typeof raw.fase !== 'string' || !FASES_VALID.has(raw.fase as DesalojoFaseConSemaforo)) {
      return NextResponse.json({ error: 'fase inválida' }, { status: 400 })
    }
    fase = raw.fase as DesalojoFaseConSemaforo
  }
  let itemKey: string | null = null
  if (raw.item_key !== undefined && raw.item_key !== null && raw.item_key !== '') {
    if (typeof raw.item_key !== 'string' || !/^[a-z0-9_]+$/.test(raw.item_key)) {
      return NextResponse.json({ error: 'item_key inválido' }, { status: 400 })
    }
    if (fase === null) {
      return NextResponse.json({ error: 'item_key requiere fase' }, { status: 400 })
    }
    itemKey = raw.item_key
  }
  return { capaId, dimension, fase, itemKey }
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

  const contentType = req.headers.get('content-type') ?? ''
  const isJson      = contentType.includes('application/json')

  // ── Variables comunes a ambos flujos ──────────────────────────────────
  let nombre:       string
  let tipoArchivo:  string | null
  let tamanoBytes:  number | null
  let path:         string
  let storageUploadedHere = false  // si lo subimos server-side, lo limpiamos en caso de error
  let meta: ParsedMeta

  const db = getSupabaseAdmin()

  if (isJson) {
    // ── Flujo A: JSON (direct-to-Storage) ────────────────────────────────
    let body: {
      path?:         unknown
      nombre?:       unknown
      tipo_archivo?: unknown
      tamano_bytes?: unknown
      capa_id?:      unknown
      dimension?:    unknown
      fase?:         unknown
      item_key?:     unknown
    }
    try { body = await req.json() }
    catch { return NextResponse.json({ error: 'Body inválido (JSON)' }, { status: 400 }) }

    if (typeof body.path !== 'string' || body.path.trim() === '') {
      return NextResponse.json({ error: 'path requerido' }, { status: 400 })
    }
    if (typeof body.nombre !== 'string' || body.nombre.trim() === '') {
      return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
    }
    path        = body.path
    nombre      = body.nombre
    tipoArchivo = typeof body.tipo_archivo === 'string' && body.tipo_archivo ? body.tipo_archivo : null
    tamanoBytes = typeof body.tamano_bytes === 'number' && Number.isFinite(body.tamano_bytes) ? body.tamano_bytes : null

    // El path debe arrancar con el prioridad_id del caso (lo arma el endpoint
    // /upload-url, no el cliente). Esto cierra la puerta a que un admin del
    // caso A registre un archivo subido al folder del caso B.
    if (!path.startsWith(`${n}/`)) {
      return NextResponse.json({ error: 'path no pertenece al caso' }, { status: 400 })
    }

    // Verificar que el archivo exista en Storage antes de crear la fila.
    const folder   = path.substring(0, path.lastIndexOf('/'))
    const filename = path.substring(path.lastIndexOf('/') + 1)
    const { data: listed } = await db.storage.from('desalojos-docs').list(folder, { limit: 100, search: filename })
    if (!listed?.some(f => f.name === filename)) {
      return NextResponse.json({ error: 'archivo no encontrado en Storage' }, { status: 400 })
    }

    const parsed = parseMeta(body)
    if (parsed instanceof NextResponse) return parsed
    meta = parsed
  } else {
    // ── Flujo B: multipart legacy ───────────────────────────────────────
    let form: FormData
    try { form = await req.formData() }
    catch { return NextResponse.json({ error: 'Body inválido (multipart/form-data o JSON esperado)' }, { status: 400 }) }

    const file = form.get('file')
    if (!(file instanceof File))    return NextResponse.json({ error: 'file requerido' }, { status: 400 })
    if (file.size === 0)            return NextResponse.json({ error: 'archivo vacío' },  { status: 400 })

    const parsed = parseMeta({
      capa_id:   form.get('capa_id'),
      dimension: form.get('dimension'),
      fase:      form.get('fase'),
      item_key:  form.get('item_key'),
    })
    if (parsed instanceof NextResponse) return parsed
    meta = parsed

    const safeName = sanitizeFilename(file.name)
    const pathSegments = [String(n), meta.capaId === null ? 'general' : String(meta.capaId)]
    if (meta.fase) pathSegments.push(meta.fase)
    pathSegments.push(`${Date.now()}_${safeName}`)
    path = pathSegments.join('/')

    const buf  = Buffer.from(await file.arrayBuffer())
    const { error: upErr } = await db.storage
      .from('desalojos-docs')
      .upload(path, buf, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) {
      return NextResponse.json({ error: `Storage: ${upErr.message}` }, { status: 500 })
    }
    storageUploadedHere = true

    nombre      = file.name
    tipoArchivo = file.type || null
    tamanoBytes = file.size
  }

  // ── Validar capa_id pertenece al caso ─────────────────────────────────
  let capaTipologia: DesalojoTipologia | null = null
  if (meta.capaId !== null) {
    const { data: capa } = await db
      .from('desalojo_capas')
      .select('id, prioridad_id, tipologia')
      .eq('id', meta.capaId)
      .maybeSingle()
    if (!capa || capa.prioridad_id !== n) {
      if (storageUploadedHere) await db.storage.from('desalojos-docs').remove([path])
      return NextResponse.json({ error: 'capa_id no pertenece al caso' }, { status: 400 })
    }
    capaTipologia = (capa.tipologia ?? null) as DesalojoTipologia | null
  }

  // ── Validar item_key contra catálogo vigente ──────────────────────────
  if (meta.itemKey !== null && meta.fase !== null) {
    if (meta.capaId === null) {
      if (storageUploadedHere) await db.storage.from('desalojos-docs').remove([path])
      return NextResponse.json({ error: 'item_key requiere capa_id' }, { status: 400 })
    }
    const items = checklistItems(capaTipologia, meta.fase)
    if (!items.some(i => i.key === meta.itemKey)) {
      if (storageUploadedHere) await db.storage.from('desalojos-docs').remove([path])
      return NextResponse.json({ error: `item_key '${meta.itemKey}' no pertenece al checklist ${meta.fase} de la tipología` }, { status: 400 })
    }
  }

  // ── Insertar fila ──────────────────────────────────────────────────────
  const { data: doc, error: insErr } = await db
    .from('desalojo_documentos')
    .insert({
      prioridad_id: n,
      capa_id:      meta.capaId,
      dimension:    meta.dimension,
      fase:         meta.fase,
      item_key:     meta.itemKey,
      nombre,
      url:          path,
      tipo_archivo: tipoArchivo,
      tamano_bytes: tamanoBytes,
      subido_por:   profile.email || null,
    })
    .select('*')
    .single()
  if (insErr || !doc) {
    if (storageUploadedHere) await db.storage.from('desalojos-docs').remove([path])
    return NextResponse.json({ error: insErr?.message ?? 'Insert falló' }, { status: 500 })
  }

  const { data: signed } = await db.storage.from('desalojos-docs').createSignedUrl(path, SIGNED_URL_TTL_SEC)
  const documento: DesalojoDocumento = { ...(doc as DesalojoDocumento), url: signed?.signedUrl ?? path }

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        meta.capaId,
    fase:           meta.fase ?? null,
    campo:          meta.itemKey ? `documento.${meta.fase}.${meta.itemKey}` : meta.dimension ? `documento.${meta.dimension}` : 'documento',
    valor_anterior: null,
    valor_nuevo:    nombre,
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, documento })
}
