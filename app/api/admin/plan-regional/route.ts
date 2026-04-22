import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS } from '@/lib/regions'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data } = await db
    .from('planes_regionales')
    .select('region_cod, archivo_url, uploaded_at, uploaded_by')

  const loaded = new Map((data ?? []).map((r: { region_cod: string; archivo_url: string | null; uploaded_at: string; uploaded_by: string | null }) => [r.region_cod, r]))

  const result = REGIONS.map(r => ({
    region_cod:   r.cod,
    region_nombre: r.nombre,
    cargado:      loaded.has(r.cod),
    archivo_url:  loaded.get(r.cod)?.archivo_url ?? null,
    uploaded_at:  loaded.get(r.cod)?.uploaded_at ?? null,
    uploaded_by:  loaded.get(r.cod)?.uploaded_by ?? null,
  }))

  return Response.json(result)
}
