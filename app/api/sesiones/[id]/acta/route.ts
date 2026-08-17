import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { operarCapForInstancia } from '@/lib/permissions'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema } from '@/lib/schemas'
import { puedeRegenerarActa } from '@/lib/sesiones/helpers'
import { generarActa } from '@/lib/sesiones/generarActa'
import type { UserProfile } from '@/lib/apiAuth'
import type { EjeSesion } from '@/lib/types'

/**
 * GET  /api/sesiones/[id]/acta — URL firmada (5 min) del acta en comite-docs.
 * POST /api/sesiones/[id]/acta — reintento de generación cuando el PDF falló
 *      al cerrar. Guard estricto (puedeRegenerarActa): solo sesión cerrada,
 *      con métricas aplicadas y SIN acta previa — NUNCA re-aplica métricas
 *      ni regenera un acta existente (es el registro oficial del cierre).
 *
 * Viewer no tiene acceso al módulo (matriz spec §5) → 403.
 */

export const maxDuration = 120

const SIGNED_URL_TTL_SEC = 300
const BUCKET = 'comite-docs'

type Gate =
  | { ok: true; sesion: EjeSesion }
  | { ok: false; res: NextResponse }

async function loadAndGate(id: string, profile: UserProfile): Promise<Gate> {
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) {
    return { ok: false, res: NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }
  }
  const db = getSupabaseAdmin()
  const { data } = await db.from('eje_sesiones').select('*').eq('id', parse.data).single()
  if (!data) {
    return { ok: false, res: NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 }) }
  }
  const sesion = data as EjeSesion
  // Operar el acta (descargar/generar) requiere operar el comité de esa instancia
  // en esa región. Reemplaza el gate de rol+región: viewer sin la capacidad queda
  // fuera; regional solo en sus regiones; admin/editor ('all') pasan. Instancia
  // sin cap conocida → fail-closed.
  const cap = operarCapForInstancia(sesion.instancia)
  if (!cap || !(await requireCan(profile, cap, sesion.region_cod))) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ok: true, sesion }
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const gate = await loadAndGate(id, profile)
  if (!gate.ok) return gate.res

  if (!gate.sesion.acta_path) {
    return NextResponse.json({ error: 'Esta sesión no tiene acta generada' }, { status: 404 })
  }

  const db = getSupabaseAdmin()
  const { data: signed, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(gate.sesion.acta_path, SIGNED_URL_TTL_SEC)
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: `No se pudo firmar el acta: ${error?.message ?? 'sin URL'}` }, { status: 500 })
  }
  return NextResponse.json({ url: signed.signedUrl, expires_in: SIGNED_URL_TTL_SEC })
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const gate = await loadAndGate(id, profile)
  if (!gate.ok) return gate.res

  const guard = puedeRegenerarActa(gate.sesion)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    const actaPath = await generarActa(gate.sesion.id)
    return NextResponse.json({ ok: true, acta_generada: true, acta_path: actaPath })
  } catch (err) {
    console.error('[sesiones/acta] reintento falló:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
