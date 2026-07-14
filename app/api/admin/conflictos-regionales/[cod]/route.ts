import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { PDF_MAGIC_BYTES } from '@/lib/kitDeViaje/constants'

// Piso mínimo liviano: rechaza archivos truncados/corruptos sin exigir el mínimo
// de 20 KB de plan-regional (un PDF de conflictos legítimo puede ser pequeño).
const MIN_PDF_BYTES = 1_000

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
  if (file.type !== 'application/pdf') return Response.json({ error: 'El archivo debe ser un PDF' }, { status: 400 })

  const db = getSupabaseAdmin()
  const arrayBuffer = await file.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)

  // Defensa por contenido: tamaño mínimo + magic bytes %PDF- (el MIME se puede falsear).
  if (buf.byteLength < MIN_PDF_BYTES || buf.subarray(0, 5).toString('ascii') !== PDF_MAGIC_BYTES) {
    return Response.json({ error: 'El archivo no es un PDF válido o está corrupto' }, { status: 400 })
  }

  const path = `${cod}.pdf`
  const { error: uploadError } = await db.storage
    .from('conflictos-regionales')
    .upload(path, buf, { contentType: 'application/pdf', upsert: true })

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 })

  const { error: dbError } = await db.from('conflictos_regionales').upsert({
    region_cod:  cod,
    archivo_url: path,             // guardamos el PATH; se firma al servir (bucket privado)
    uploaded_at: new Date().toISOString(),
    uploaded_by: profile.email,
  })
  if (dbError) return Response.json({ error: dbError.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ cod: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { cod } = await params
  const db = getSupabaseAdmin()

  await db.storage.from('conflictos-regionales').remove([`${cod}.pdf`])
  await db.from('conflictos_regionales').delete().eq('region_cod', cod)

  return Response.json({ ok: true })
}
