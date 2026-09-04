import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS } from '@/lib/regions'
import { planPath } from '@/lib/storagePath'

// El bucket 'plan-regional' es PRIVADO: archivo_url guarda el PATH y se firma
// con un signed URL (TTL 1h) al servir el link "Ver". Mismo patrón que
// 'conflictos-regionales'.
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
    .from('planes_regionales')
    .select('region_cod, archivo_url, uploaded_at, uploaded_by')

  const loaded = new Map((data ?? []).map((r: Row) => [r.region_cod, r]))

  const result = await Promise.all(REGIONS.map(async r => {
    const row = loaded.get(r.cod)
    let signedUrl: string | null = null
    if (row?.archivo_url) {
      const { data: signed } = await db.storage
        .from('plan-regional')
        .createSignedUrl(planPath(row.archivo_url), SIGNED_URL_TTL_SEC)
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
