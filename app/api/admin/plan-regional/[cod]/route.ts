/**
 * Plan Regional de Gobierno por región (PDF).
 *
 * El bucket 'plan-regional' es PRIVADO: `archivo_url` guarda el PATH
 * (`<COD>.pdf`) y se firma al servir, igual que 'conflictos-regionales'.
 * Antes se guardaba la URL pública, lo que dejaba los 13 planes descargables
 * por cualquiera desde Internet con solo adivinar el cod de la región.
 */

import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { planPath } from '@/lib/storagePath'

const SIGNED_URL_TTL_SEC = 3600

export async function GET(_request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { cod } = await params
  const db = getSupabaseAdmin()
  const { data } = await db
    .from('planes_regionales')
    .select('region_cod, archivo_url, uploaded_at, uploaded_by')
    .eq('region_cod', cod)
    .single()

  if (!data?.archivo_url) return Response.json({ region_cod: cod, cargado: false })

  // archivo_url es el PATH en el bucket privado → se entrega firmado.
  const { data: signed } = await db.storage
    .from('plan-regional')
    .createSignedUrl(planPath(data.archivo_url), SIGNED_URL_TTL_SEC)

  return Response.json({ ...data, archivo_url: signed?.signedUrl ?? null })
}

export async function POST(request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { cod } = await params
  if (!(await requireCan(profile, 'docs_regionales.gestionar', cod))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await request.formData()
  const file = formData.get('pdf') as File | null
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 })
  if (file.type !== 'application/pdf') return Response.json({ error: 'File must be PDF' }, { status: 400 })

  const db = getSupabaseAdmin()
  const arrayBuffer = await file.arrayBuffer()
  const path = `${cod}.pdf`

  const { error: uploadError } = await db.storage
    .from('plan-regional')
    .upload(path, arrayBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 })

  // Se guarda el PATH, no una URL: el bucket es privado y el link se firma al
  // servirlo (una URL pública guardada en BD sería un link permanente y sin
  // sesión al PDF).
  await db.from('planes_regionales').upsert({
    region_cod:  cod,
    archivo_url: path,
    uploaded_at: new Date().toISOString(),
    uploaded_by: profile.email,
  })

  return Response.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { cod } = await params
  if (!(await requireCan(profile, 'docs_regionales.gestionar', cod))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getSupabaseAdmin()

  await db.storage.from('plan-regional').remove([`${cod}.pdf`])
  await db.from('planes_regionales').delete().eq('region_cod', cod)

  return Response.json({ ok: true })
}
