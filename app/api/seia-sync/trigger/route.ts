import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'

/**
 * POST /api/seia-sync/trigger — botón manual "Actualizar proyectos en SEIA"
 * (Comité Seguimiento de la Inversión). Wrapper delgado: no duplica la
 * lógica de sync — llama al propio /api/seia-sync (v1, probado en prod)
 * server-to-server con el mismo Bearer CRON_SECRET que usa el cron de
 * GitHub Actions. El secret nunca se expone al navegador; el gate hacia el
 * usuario es la sesión normal (admin/editor), no el secret.
 *
 * v2 (/api/seia-sync-v2) queda fuera a propósito: nunca ha corrido en
 * producción — no es el momento de exponerla en un botón manual.
 */

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET no configurado en este entorno' }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const res = await fetch(`${origin}/api/seia-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.json().catch(() => ({}))
  return NextResponse.json(body, { status: res.status })
}
