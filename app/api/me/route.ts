import { requireAuth, loadCapabilities } from '@/lib/apiAuth'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Capas de usuarios: el cliente recibe sus capacidades EFECTIVAS, leídas de
  // user_capabilities (respeta lo personalizado en el editor). Con fallback al
  // espejo del rol si la tabla está vacía para él (ver loadCapabilities).
  return Response.json({ ...profile, capabilities: await loadCapabilities(profile) })
}
