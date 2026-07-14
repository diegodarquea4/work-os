import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS } from '@/lib/regions'

// El bucket 'conflictos-regionales' es PRIVADO: archivo_url guarda el PATH y se
// firma con un signed URL (TTL 1h) al servir el link "Ver".
const SIGNED_URL_TTL_SEC = 3600

type Row = {
  region_cod:  string
  archivo_url: string | null
  uploaded_at: string | null
  uploaded_by: string | null
}

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('conflictos_regionales')
    .select('region_cod, archivo_url, uploaded_at, uploaded_by')

  const loaded = new Map((data ?? []).map((r: Row) => [r.region_cod, r]))

  const result = await Promise.all(REGIONS.map(async r => {
    const row = loaded.get(r.cod)
    let signedUrl: string | null = null
    if (row?.archivo_url) {
      const { data: signed } = await db.storage
        .from('conflictos-regionales')
        .createSignedUrl(row.archivo_url, SIGNED_URL_TTL_SEC)
      signedUrl = signed?.signedUrl ?? null
    }
    return {
      region_cod:    r.cod,
      region_nombre: r.nombre,
      cargado:       loaded.has(r.cod),
      archivo_url:   signedUrl,          // signed URL para "Ver" (o null)
      uploaded_at:   row?.uploaded_at ?? null,
      uploaded_by:   row?.uploaded_by ?? null,
    }
  }))

  return Response.json(result)
}
