import { getLastActividadByCod } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cod: string }> }
) {
  const { cod } = await params
  const data = await getLastActividadByCod(cod)
  return Response.json(data)
}
