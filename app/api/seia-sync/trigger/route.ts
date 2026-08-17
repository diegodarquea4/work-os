import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'

/**
 * POST /api/seia-sync/trigger — botón manual "Actualizar proyectos en SEIA"
 * (Comité Seguimiento de la Inversión). SEIA pasó a refresco on-demand: ya
 * no hay cron, el catálogo se actualiza cuando se aprieta el botón.
 *
 * Llama a la v2 REANUDABLE (/api/seia-sync-v2) server-to-server con el
 * Bearer CRON_SECRET. La v2 procesa un tramo (≤240s), guarda el cursor en
 * sync_status.notes y devuelve `partial:true` si quedó a medias. Una sola
 * invocación no puede pasar el techo de 300s de Vercel y el sync completo
 * tarda ~340s, así que el frontend (ComiteInversionPanel) vuelve a llamar a
 * este endpoint hasta recibir `partial:false` → un click completa las 16
 * regiones sin dejar ninguna afuera. Ese era el defecto de la v1: moría a
 * los 300s antes de llegar a la última región (Magallanes).
 *
 * El secret nunca se expone al navegador; el gate hacia el usuario es la
 * sesión normal (admin/editor), no el secret.
 */

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireCan(profile, 'comite.seia_sync'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado en este entorno' }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const res = await fetch(`${origin}/api/seia-sync-v2`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json(body, { status: res.status })
}
