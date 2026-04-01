import { getMetricsSummaryByCod } from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ cod: string }> }
) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: 'Supabase not configured' }, { status: 503 })
  }
  const { cod } = await params
  const data = await getMetricsSummaryByCod(cod)
  if (!data) return Response.json({ error: 'Not found' }, { status: 404 })
  return Response.json(data)
}
