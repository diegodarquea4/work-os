import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

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

  return Response.json(data ?? { region_cod: cod, cargado: false })
}

export async function POST(request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { cod } = await params
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

  const { data: { publicUrl } } = db.storage.from('plan-regional').getPublicUrl(path)

  await db.from('planes_regionales').upsert({
    region_cod:  cod,
    archivo_url: publicUrl,
    uploaded_at: new Date().toISOString(),
    uploaded_by: profile.email,
  })

  return Response.json({ ok: true, url: publicUrl })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { cod } = await params
  const db = getSupabaseAdmin()

  await db.storage.from('plan-regional').remove([`${cod}.pdf`])
  await db.from('planes_regionales').delete().eq('region_cod', cod)

  return Response.json({ ok: true })
}
