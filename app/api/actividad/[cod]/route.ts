import { getLastActividadByCod } from '@/lib/db'
import { requireAuth, isRegionRestricted } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cod: string }> }
) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { cod } = await params
  // Lee con service-role (sin RLS) → el scope por región va explícito acá.
  if (isRegionRestricted(profile) && !profile.region_cods.includes(cod)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }
  const data = await getLastActividadByCod(cod, getSupabaseAdmin())
  return Response.json(data)
}
