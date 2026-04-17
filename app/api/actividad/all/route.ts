import { getLastActividadAll } from '@/lib/db'
import { requireAuth } from '@/lib/apiAuth'

export async function GET() {
  if (!await requireAuth()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const data = await getLastActividadAll()
  return Response.json(data)
}
