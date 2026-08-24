import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { operarCapForInstancia } from '@/lib/permissions'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema, hojaConduccionSchema } from '@/lib/schemas'
import { renderHojaConduccionBuffer } from '@/lib/sesiones/generarHojaConduccion'
import type { EjeSesion } from '@/lib/types'

/**
 * POST /api/sesiones/[id]/hoja-conduccion — descarga la hoja de conducción de
 * 2 caras de una sesión de gabinete v2 (spec v2, PR-2). Binaria, on-demand
 * (mismo patrón que /api/cronograma-gabinete): el DPR la baja desde la
 * Preparación para llevarla a la mesa (o para adjuntarla a la citación).
 *
 * Server-side arma todo con service-role (bypass RLS) desde el modelo de pauta.
 * Gate: capacidad de OPERAR gabinete en la región de la sesión — viewer/otra
 * región quedan fuera. Solo aplica a sesiones de instancia 'gabinete'.
 *
 * Body opcional { horaInicio: "HH:MM" } — la hora de partida para las horas
 * objetivo por punto (ver hojaConduccionSchema).
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) {
    return NextResponse.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const sesionId = parse.data

  // Body opcional (la hora de inicio). Sin body válido cae al default del assembler.
  let horaInicio: string | undefined
  try {
    const raw = await request.json()
    const bodyParse = hojaConduccionSchema.safeParse(raw)
    if (bodyParse.success) horaInicio = bodyParse.data.horaInicio
  } catch { /* sin body — se usa el default */ }

  const db = getSupabaseAdmin()

  const { data: sesionRow } = await db.from('eje_sesiones').select('*').eq('id', sesionId).maybeSingle()
  const sesion = sesionRow as EjeSesion | null
  if (!sesion) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  if (sesion.instancia !== 'gabinete') {
    return NextResponse.json({ error: 'La hoja de conducción es solo del Gabinete Regional' }, { status: 422 })
  }

  const cap = operarCapForInstancia(sesion.instancia)
  if (!cap || !(await requireCan(profile, cap, sesion.region_cod))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let buffer: Buffer
  try {
    buffer = await renderHojaConduccionBuffer(db, sesion, { horaInicio, ahora: new Date() })
  } catch (err) {
    console.error('[hoja-conduccion] fallo al renderizar', { sesionId, err })
    return NextResponse.json({ error: `No se pudo generar la hoja: ${(err as Error).message}` }, { status: 500 })
  }

  const filename = `hoja-conduccion-${sesion.region_cod}-${sesion.fecha}.pdf`
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
