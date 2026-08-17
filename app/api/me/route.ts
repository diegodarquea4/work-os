import { requireAuth } from '@/lib/apiAuth'
import { capabilitiesForProfile } from '@/lib/permissions'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Capas de usuarios (Fase 0): además del perfil, el cliente recibe sus
  // capacidades. Hoy derivadas del rol (espejo); en Fase 1 pasan a leerse de
  // user_capabilities para reflejar concesiones por usuario/región.
  return Response.json({ ...profile, capabilities: capabilitiesForProfile(profile) })
}
