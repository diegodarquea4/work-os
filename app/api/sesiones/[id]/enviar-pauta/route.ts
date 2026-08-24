import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { operarCapForInstancia } from '@/lib/permissions'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema } from '@/lib/schemas'
import type { EjeSesion } from '@/lib/types'

/**
 * POST /api/sesiones/[id]/enviar-pauta — marca la pauta como ENVIADA a los
 * seremis (spec v2, PR-2). Es el cierre del paso de Preparación: estampa
 * `pauta_enviada_at`, con lo que el panel deriva la fase "pauta enviada"
 * (deja de ser un borrador en construcción). NO bloquea la edición posterior
 * (la pauta es referencia; re-enviar re-estampa el timestamp).
 *
 * La hoja de conducción se descarga aparte (POST .../hoja-conduccion) — el DPR
 * la baja y la reparte con la citación. Server-side siempre; gate: capacidad de
 * OPERAR gabinete en la región. Sin body (los puntos ya están persistidos
 * client-side vía safeWrite, como el borrador de una sesión).
 */

export const maxDuration = 30

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) {
    return NextResponse.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const sesionId = parse.data

  const db = getSupabaseAdmin()

  const { data: sesionRow } = await db.from('eje_sesiones').select('*').eq('id', sesionId).maybeSingle()
  const sesion = sesionRow as EjeSesion | null
  if (!sesion) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  if (sesion.instancia !== 'gabinete') {
    return NextResponse.json({ error: 'La pauta es solo del Gabinete Regional' }, { status: 422 })
  }
  if (sesion.estado !== 'borrador') {
    return NextResponse.json({ error: 'La sesión ya está cerrada' }, { status: 409 })
  }

  const cap = operarCapForInstancia(sesion.instancia)
  if (!cap || !(await requireCan(profile, cap, sesion.region_cod))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Una pauta vacía no se envía: exige al menos un punto con título.
  const { data: temas } = await db
    .from('gabinete_temas').select('id, titulo, texto').eq('sesion_id', sesionId)
  const conTitulo = ((temas ?? []) as { titulo: string | null; texto: string | null }[])
    .filter(t => ((t.titulo ?? t.texto) ?? '').trim().length > 0)
  if (conTitulo.length === 0) {
    return NextResponse.json({ error: 'La pauta no tiene puntos. Agrega al menos uno antes de enviarla.' }, { status: 422 })
  }

  const { data: updated, error: updErr } = await db
    .from('eje_sesiones')
    .update({ pauta_enviada_at: new Date().toISOString() })
    .eq('id', sesionId)
    .eq('estado', 'borrador')
    .select('id, pauta_enviada_at')
  if (updErr) {
    return NextResponse.json({ error: `No se pudo enviar la pauta: ${updErr.message}` }, { status: 500 })
  }
  if (!updated?.length) {
    return NextResponse.json({ error: 'La sesión ya está cerrada' }, { status: 409 })
  }

  return NextResponse.json({
    ok: true,
    pauta_enviada_at: (updated[0] as { pauta_enviada_at: string }).pauta_enviada_at,
    puntos: conTitulo.length,
  })
}
