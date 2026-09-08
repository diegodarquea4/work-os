import { getMetricsSummaryByCod } from '@/lib/db'
import { requireAuth, isRegionRestricted } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cod: string }> }
) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { cod } = await params
  // Lee con service-role, o sea saltándose la RLS: el scope por región hay que
  // aplicarlo acá a mano.
  if (isRegionRestricted(profile) && !profile.region_cods.includes(cod)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const data = await getMetricsSummaryByCod(cod, getSupabaseAdmin())
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(data)
}
