import { getLastActividadAll } from '@/lib/db'

export async function GET() {
  const data = await getLastActividadAll()
  return Response.json(data)
}
