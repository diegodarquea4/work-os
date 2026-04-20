import { requireAuth } from '@/lib/apiAuth'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json(profile)
}
