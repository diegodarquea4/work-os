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
 * Server-side SIEMPRE (spec §6). Bifurca por `sesion.instancia`:
 *  - Comité ('eje'): aplica los valores digitados a metricas_eje (suma
 *    incrementa, pulso reemplaza) y genera el acta PDF.
 *  - Gabinete: NO toca metricas_eje. En su lugar, escribe el snapshot
 *    (semáforo + % avance) de las iniciativas tratadas en sesion_iniciativas
 *    y sella también los compromisos escalados cumplidos.
 *
 * Idempotencia (sin RPC): claim atómico UPDATE ... WHERE estado='borrador'
 * — 0 filas = ya cerrada → 409. Tras el claim, cualquier fallo posterior
 * deja "cerrada sin acta" (reintenta POST /acta), NUNCA doble suma:
 * `metricas_aplicadas` marca el punto de no-repetición. El cierre de
 * GABINETE también lo setea (no hay métricas, pero puedeRegenerarActa lo
 * exige como marcador de "cierre core completo" — sin él, el reintento de
 * acta quedaría bloqueado en 409).
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

  const esGabinete = sesion!.instancia === 'gabinete'

  // ── Gate de habilitación por instancia ─────────────────────────────────────
  // Comités sin eje (Gabinete Regional, Comité Económico) no
  // usan region_ejes.sesiones_habilitadas — Gabinete tiene su propio flag en
  // region_config; Inversión no tiene flag y siempre está disponible.
  if (esGabinete) {
    const { data: cfg } = await db
      .from('region_config').select('gabinete_habilitado').eq('region_cod', sesion!.region_cod).maybeSingle()
    if (!cfg?.gabinete_habilitado) {
      return NextResponse.json({ error: 'El gabinete no está habilitado en esta región' }, { status: 422 })
    }
  } else if (sesion!.instancia === 'eje') {
    const { data: ejeRow } = await db
      .from('region_ejes').select('sesiones_habilitadas').eq('id', sesion!.eje_id).single()
    if (!ejeRow?.sesiones_habilitadas) {
      return NextResponse.json({ error: 'El eje no tiene sesiones habilitadas' }, { status: 422 })
    }
  }

  // ── Pre-carga de valores y métricas (validar antes del claim) ─────────────
  // Gabinete: sin zona de indicadores — valores queda vacío y el loop de
  // aplicación no-opea solo.
  const { data: valoresData } = esGabinete
    ? { data: [] }
    : await db.from('sesion_valores').select('*').eq('sesion_id', sesionId)
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

  // Marcador de "cierre core completo" — también en gabinete (ver header).
  await db.from('eje_sesiones').update({ metricas_aplicadas: true }).eq('id', sesionId)

  // ── Gabinete: snapshot de las iniciativas tratadas ─────────────────────────
  // Semáforo y % avance al momento del cierre (para el acta y el historial).
  // Secuencial + awaited (patrón O-04); service-role pasa el trigger de
  // inmutabilidad por el guard auth.uid() IS NULL. Una iniciativa borrada
  // entre la sesión y el cierre queda con snapshot null (el acta muestra —).
  if (esGabinete) {
    const { data: agendaData } = await db
      .from('sesion_iniciativas').select('id, prioridad_id').eq('sesion_id', sesionId)
    const agenda = (agendaData ?? []) as { id: number; prioridad_id: number }[]
    if (agenda.length) {
      const { data: prioData } = await db
        .from('prioridades_territoriales')
        .select('id, estado_semaforo, pct_avance')
        .in('id', agenda.map(a => a.prioridad_id))
      const prioPorId = new Map(
        ((prioData ?? []) as { id: number; estado_semaforo: string | null; pct_avance: number | null }[])
          .map(p => [p.id, p]),
      )
      for (const fila of agenda) {
        const p = prioPorId.get(fila.prioridad_id)
        const { error: snapErr } = await db
          .from('sesion_iniciativas')
          .update({
            semaforo_al_momento:   p?.estado_semaforo ?? null,
            pct_avance_al_momento: p?.pct_avance ?? null,
          })
          .eq('id', fila.id)
        if (snapErr) {
          console.error('[sesiones/cerrar] fallo snapshot iniciativa', { sesionId, fila: fila.id, snapErr })
          // No abortar: el snapshot es informativo; el acta cae a "—".
        }
      }
    }
  }

  // ── Compromisos cumplidos quedan sellados a esta sesión ───────────────────
  if (esGabinete) {
    // Propios del gabinete…
    await db
      .from('sesion_compromisos')
      .update({ cerrado_en_sesion_id: sesionId })
      .eq('region_cod', sesion!.region_cod)
      .eq('instancia', 'gabinete')
      .eq('estado', 'cumplido')
      .is('cerrado_en_sesion_id', null)
    // …y los escalados desde comités que el gabinete verificó como cumplidos
    // (regla 3 del spec gabinete: cumplido en cualquiera de las dos
    // instancias desaparece de ambas; el primer cierre sella). Los mandatos
    // NO se sellan acá — los sella el cierre del comité destino.
    await db
      .from('sesion_compromisos')
      .update({ cerrado_en_sesion_id: sesionId })
      .eq('region_cod', sesion!.region_cod)
      .eq('instancia', 'eje')
      .eq('escalado_a_gabinete', true)
      .eq('estado', 'cumplido')
      .is('cerrado_en_sesion_id', null)
  } else if (sesion!.instancia === 'eje') {
    await db
      .from('sesion_compromisos')
      .update({ cerrado_en_sesion_id: sesionId })
      .eq('region_cod', sesion!.region_cod)
      .eq('eje_id', sesion!.eje_id)
      .eq('estado', 'cumplido')
      .is('cerrado_en_sesion_id', null)
  } else {
    // instancia === 'inversion' — sin eje, análogo a Gabinete: filtra por instancia.
    await db
      .from('sesion_compromisos')
      .update({ cerrado_en_sesion_id: sesionId })
      .eq('region_cod', sesion!.region_cod)
      .eq('instancia', 'inversion')
      .eq('estado', 'cumplido')
      .is('cerrado_en_sesion_id', null)
  }

  // ── Oficios resueltos quedan sellados a esta sesión (Comité Seguimiento de
  // la Inversión) — mismo patrón que compromisos. SOLO para 'inversion':
  // sesion_oficios_tratados no tiene columna de instancia (es region_cod +
  // sesion_origen_id), así que sin este guard el cierre de un Comité Policial
  // o Gabinete de la misma región estamparía resuelto_en_sesion_id de oficios
  // de Inversión aún sin sellar, con el id de una sesión de otra instancia.
  if (sesion!.instancia === 'inversion') {
    await db
      .from('sesion_oficios_tratados')
      .update({ resuelto_en_sesion_id: sesionId })
      .eq('region_cod', sesion!.region_cod)
      .eq('estado', 'resuelto')
      .is('resuelto_en_sesion_id', null)
  }

  // ── Mesa Empleo: sumar el valor digitado en la sesión al acumulado ────────
  // Mismo mecanismo que aplicarValorMetrica('suma', ...) de metricas_eje
  // (mig 014), pero un único indicador por región (mig 052) — no hay
  // catálogo de métricas acá, solo un valor opcional por sesión.
  if (sesion!.instancia === 'inversion') {
    const { data: valorMeta } = await db
      .from('sesion_meta_empleo_valor').select('empleos_generados').eq('sesion_id', sesionId).maybeSingle()
    if (valorMeta) {
      const { data: metaRow } = await db
        .from('region_meta_empleo').select('valor_actual').eq('region_cod', sesion!.region_cod).maybeSingle()
      const nuevoAcumulado = aplicarValorMetrica(
        'suma',
        metaRow?.valor_actual != null ? Number(metaRow.valor_actual) : null,
        Number(valorMeta.empleos_generados),
      )
      const { error: metaErr } = await db
        .from('region_meta_empleo')
        .upsert({
          region_cod: sesion!.region_cod,
          valor_actual: nuevoAcumulado,
          valor_updated_by_email: profile.email,
          valor_updated_at: new Date().toISOString(),
        }, { onConflict: 'region_cod' })
      if (metaErr) {
        // No abortar: la sesión ya quedó cerrada; el acumulado es reparable
        // desde sesion_meta_empleo_valor (fuente de verdad), igual que metricas_eje.
        console.error('[sesiones/cerrar] fallo sumando Meta Empleo', { sesionId, metaErr })
      }
    }
  }

  // ── Mesa Empleo: sumar los subsidios digitados en la sesión (mig 053) ─────
  // Mismo mecanismo que Meta Empleo, con tres campos en vez de uno.
  if (sesion!.instancia === 'inversion') {
    const { data: valorSub } = await db
      .from('sesion_subsidio_empleo_valor').select('postulados, entregados, empresas_postulantes')
      .eq('sesion_id', sesionId).maybeSingle()
    if (valorSub) {
      const { data: subRow } = await db
        .from('region_subsidio_empleo').select('postulados, entregados, empresas_postulantes')
        .eq('region_cod', sesion!.region_cod).maybeSingle()
      const suma = (actual: number | null, delta: number) => aplicarValorMetrica('suma', actual, delta)
      const { error: subErr } = await db
        .from('region_subsidio_empleo')
        .upsert({
          region_cod: sesion!.region_cod,
          postulados:            suma(subRow?.postulados != null ? Number(subRow.postulados) : null, Number(valorSub.postulados)),
          entregados:            suma(subRow?.entregados != null ? Number(subRow.entregados) : null, Number(valorSub.entregados)),
          empresas_postulantes:  suma(subRow?.empresas_postulantes != null ? Number(subRow.empresas_postulantes) : null, Number(valorSub.empresas_postulantes)),
          valor_updated_by_email: profile.email,
          valor_updated_at: new Date().toISOString(),
        }, { onConflict: 'region_cod' })
      if (subErr) {
        // No abortar: reparable desde sesion_subsidio_empleo_valor (fuente de verdad).
        console.error('[sesiones/cerrar] fallo sumando Subsidios', { sesionId, subErr })
      }
    }
  }

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
