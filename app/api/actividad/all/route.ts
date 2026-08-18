import { getLastActividadAll } from '@/lib/db'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET() {
  if (!await requireAuth()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Service-role: la cartera del panel ya viene scopeada por región (SSR, Fase 3);
  // este mapa es solo fechas de última actividad por prioridad_id, y el cliente
  // solo usa las de sus iniciativas visibles.
  const data = await getLastActividadAll(getSupabaseAdmin())
  return Response.json(data)
}
