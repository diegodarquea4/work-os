import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema } from '@/lib/schemas'
import { aplicarValorMetrica, puedeCerrar } from '@/lib/sesiones/helpers'
import { generarActa } from '@/lib/sesiones/generarActa'
import type { EjeSesion, SesionValor } from '@/lib/types'

/**
 * POST /api/sesiones/[id]/cerrar — el paso crítico del módulo Sesiones.
 *
 * Server-side SIEMPRE (spec §6): el cierre aplica los valores digitados a
 * metricas_eje (suma incrementa, pulso reemplaza) y genera el acta PDF.
 *
 * Idempotencia (sin RPC): claim atómico UPDATE ... WHERE estado='borrador'
 * — 0 filas = ya cerrada → 409. Tras el claim, cualquier fallo posterior
 * deja "cerrada sin acta" (reintenta POST /acta), NUNCA doble suma:
 * `metricas_aplicadas` marca el punto de no-repetición.
 *
 * Sin body: el borrador ya está persistido client-side (safeWrite).
 */

export const maxDuration = 120

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'viewer') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) {
    return NextResponse.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const sesionId = parse.data

  const db = getSupabaseAdmin()

  // ── Load + gates ───────────────────────────────────────────────────────────
  const { data: sesionRow } = await db.from('eje_sesiones').select('*').eq('id', sesionId).single()
  const sesion = sesionRow as EjeSesion | null

  const guard = puedeCerrar(sesion)
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  // Gate región (patrón minuta): regional solo cierra sesiones de sus regiones.
  const isRestricted = profile.role === 'regional'
  if (isRestricted && !profile.region_cods.includes(sesion!.region_cod)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Gate de activación: solo aplica a sesiones ancladas a un eje real
  // (instancia='eje', hoy Comité Policial). Comités sin eje (Gabinete
  // Regional, Comité Seguimiento de la Inversión) no tienen flag que revisar
  // — siempre están disponibles.
  if (sesion!.instancia === 'eje') {
    const { data: ejeRow } = await db
      .from('region_ejes').select('sesiones_habilitadas').eq('id', sesion!.eje_id).single()
    if (!ejeRow?.sesiones_habilitadas) {
      return NextResponse.json({ error: 'El eje no tiene sesiones habilitadas' }, { status: 422 })
    }
  }

  // ── Pre-carga de valores y métricas (validar antes del claim) ─────────────
  const { data: valoresData } = await db.from('sesion_valores').select('*').eq('sesion_id', sesionId)
  const valores = (valoresData ?? []) as SesionValor[]

  const metricaIds = valores.map(v => v.metrica_id)
  const { data: metricasData } = metricaIds.length
    ? await db.from('metricas_eje').select('id, tipo, valor_actual').in('id', metricaIds)
    : { data: [] }
  const metricas = new Map(
    ((metricasData ?? []) as { id: number; tipo: 'suma' | 'pulso'; valor_actual: number | null }[])
      .map(m => [m.id, m]),
  )
  const huerfanos = valores.filter(v => !metricas.has(v.metrica_id))
  if (huerfanos.length) {
    return NextResponse.json(
      { error: 'Hay valores digitados para métricas que ya no existen', metricas: huerfanos.map(h => h.metrica_id) },
      { status: 422 },
    )
  }

  // ── Claim atómico: de borrador a cerrada ──────────────────────────────────
  const { data: claimed, error: claimErr } = await db
    .from('eje_sesiones')
    .update({ estado: 'cerrada', closed_at: new Date().toISOString(), closed_by_email: profile.email })
    .eq('id', sesionId)
    .eq('estado', 'borrador')
    .select('id')
  if (claimErr) {
    return NextResponse.json({ error: `No se pudo cerrar: ${claimErr.message}` }, { status: 500 })
  }
  if (!claimed?.length) {
    // Carrera: otro request la cerró entre el load y el claim.
    return NextResponse.json({ error: 'La sesión ya está cerrada' }, { status: 409 })
  }

  // ── Aplicar métricas (secuencial + awaited — patrón O-04) ─────────────────
  for (const v of valores) {
    const m = metricas.get(v.metrica_id)!
    const nuevo = aplicarValorMetrica(m.tipo, m.valor_actual != null ? Number(m.valor_actual) : null, Number(v.valor))
    const { error: metErr } = await db
      .from('metricas_eje')
      .update({
        valor_actual:           nuevo,
        valor_updated_by_email: profile.email,
        valor_updated_at:       new Date().toISOString(),
        updated_at:             new Date().toISOString(),
      })
      .eq('id', v.metrica_id)
    if (metErr) {
      // Sesión queda cerrada + metricas_aplicadas=false: estado reparable de
      // forma determinista desde sesion_valores (fuente de verdad). El
      // reintento de acta NO re-aplica métricas (guard puedeRegenerarActa).
      console.error('[sesiones/cerrar] fallo aplicando métrica', { sesionId, metrica_id: v.metrica_id, metErr })
      return NextResponse.json(
        { error: `Fallo aplicando la métrica ${v.metrica_id}: ${metErr.message}. Contacta a la división.`, metrica_id: v.metrica_id },
        { status: 500 },
      )
    }
  }

  await db.from('eje_sesiones').update({ metricas_aplicadas: true }).eq('id', sesionId)

  // ── Compromisos cumplidos quedan sellados a esta sesión ───────────────────
  await db
    .from('sesion_compromisos')
    .update({ cerrado_en_sesion_id: sesionId })
    .eq('region_cod', sesion!.region_cod)
    .eq('instancia', sesion!.instancia)
    .eq('estado', 'cumplido')
    .is('cerrado_en_sesion_id', null)

  // ── Oficios resueltos quedan sellados a esta sesión (Comité Seguimiento de
  // la Inversión) — mismo patrón que compromisos. No-op para sesiones del
  // Comité Policial: esa tabla solo tiene filas de Inversión.
  await db
    .from('sesion_oficios_tratados')
    .update({ resuelto_en_sesion_id: sesionId })
    .eq('region_cod', sesion!.region_cod)
    .eq('estado', 'resuelto')
    .is('resuelto_en_sesion_id', null)

  // ── Acta — si falla NO se revierte el cierre (reintento vía POST /acta) ───
  try {
    const actaPath = await generarActa(sesionId)
    return NextResponse.json({
      ok: true,
      acta_generada: true,
      acta_path: actaPath,
      metricas_actualizadas: valores.length,
    })
  } catch (err) {
    console.error('[sesiones/cerrar] acta falló (sesión queda cerrada, reintentable):', err)
    return NextResponse.json({
      ok: true,
      acta_generada: false,
      metricas_actualizadas: valores.length,
      error: (err as Error).message,
    })
  }
}
