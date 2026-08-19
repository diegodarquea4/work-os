import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { operarCapForInstancia } from '@/lib/permissions'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema } from '@/lib/schemas'
import { renderActaBuffer } from '@/lib/sesiones/generarActa'
import type { EjeSesion } from '@/lib/types'

/**
 * GET /api/sesiones/[id]/acta/preview — VISTA PREVIA del acta antes de cerrar.
 *
 * Renderiza el PDF del acta con el estado BORRADOR actual (sin cerrar, sin
 * aplicar métricas ni sellar nada) y lo devuelve inline. Sirve a todos los
 * comités/gabinete (renderActaBuffer despacha por instancia). El PDF sale
 * marcado "BORRADOR". Mismo gate que descargar/generar el acta: operar el comité
 * de esa instancia en esa región (viewer sin la capacidad → 403).
 */

export const maxDuration = 120

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data } = await db.from('eje_sesiones').select('*').eq('id', parse.data).single()
  if (!data) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  const sesion = data as EjeSesion

  const cap = operarCapForInstancia(sesion.instancia)
  if (!cap || !(await requireCan(profile, cap, sesion.region_cod))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const buffer = await renderActaBuffer(db, sesion, { preview: true, currentUserEmail: profile.email })
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="acta-borrador.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[sesiones/acta/preview] falló:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
