import { getLastActividadByCod } from '@/lib/db'
import { requireAuth } from '@/lib/apiAuth'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cod: string }> }
) {
  if (!await requireAuth()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const { cod } = await params
  const data = await getLastActividadByCod(cod)
  return Response.json(data)
}
