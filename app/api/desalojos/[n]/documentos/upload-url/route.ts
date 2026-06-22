/**
 * POST /api/desalojos/[n]/documentos/upload-url
 *
 * Genera una signed upload URL para subir un documento directo a Supabase
 * Storage desde el browser, evitando el límite de 4.5MB del body de las API
 * routes en Vercel.
 *
 * Flujo cliente:
 *   1. POST acá con `{ filename, contentType?, capa_id?, fase? }` → recibe
 *      `{ uploadUrl, path }`.
 *   2. PUT del archivo a `uploadUrl` (directo a Storage).
 *   3. POST a `/api/desalojos/[n]/documentos` con metadata (incluye `path`)
 *      para crear la fila en `desalojo_documentos`.
 *
 * Admin-only. Valida que la capa pertenezca al caso si se pasa capa_id.
 *
 * El path se arma server-side para evitar que el cliente sobreescriba
 * archivos de otros casos. Formato:
 *   {prioridad_id}/{capa_id|'general'}/{fase|''}/{Date.now()}_{filename}
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import type { DesalojoFaseConSemaforo } from '@/lib/types'

const FASES_VALID = new Set<DesalojoFaseConSemaforo>(['pr', 'f1', 'f2', 'f3', 'f4', 'f5'])

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
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

  let body: { filename?: unknown; capa_id?: unknown; fase?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Body inválido (JSON esperado)' }, { status: 400 }) }

  if (typeof body.filename !== 'string' || body.filename.trim() === '') {
    return NextResponse.json({ error: 'filename requerido' }, { status: 400 })
  }
  const filename = body.filename.trim()

  let capaId: number | null = null
  if (body.capa_id !== undefined && body.capa_id !== null) {
    const v = Number(body.capa_id)
    if (!Number.isFinite(v) || v <= 0) return NextResponse.json({ error: 'capa_id inválido' }, { status: 400 })
    capaId = v
  }

  let fase: DesalojoFaseConSemaforo | null = null
  if (body.fase !== undefined && body.fase !== null && body.fase !== '') {
    if (typeof body.fase !== 'string' || !FASES_VALID.has(body.fase as DesalojoFaseConSemaforo)) {
      return NextResponse.json({ error: 'fase inválida' }, { status: 400 })
    }
    fase = body.fase as DesalojoFaseConSemaforo
  }

  const db = getSupabaseAdmin()

  if (capaId !== null) {
    const { data: capa } = await db
      .from('desalojo_capas')
      .select('id, prioridad_id')
      .eq('id', capaId)
      .maybeSingle()
    if (!capa || capa.prioridad_id !== n) {
      return NextResponse.json({ error: 'capa_id no pertenece al caso' }, { status: 400 })
    }
  }

  const safeName = sanitizeFilename(filename)
  const pathSegments = [String(n), capaId === null ? 'general' : String(capaId)]
  if (fase) pathSegments.push(fase)
  pathSegments.push(`${Date.now()}_${safeName}`)
  const path = pathSegments.join('/')

  const { data, error } = await db.storage
    .from('desalojos-docs')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: `Storage: ${error?.message ?? 'no signed URL'}` }, { status: 500 })
  }

  return NextResponse.json({
    uploadUrl: data.signedUrl,
    path:      data.path,
    token:     data.token,
  })
}
