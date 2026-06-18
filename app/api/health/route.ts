/**
 * /api/health — endpoint de monitoreo de syncs.
 *
 * Cubre el hallazgo 6.7 de la auditoría: SEIA estuvo 53 días caído sin
 * que nadie se enterara. Este endpoint lee sync_status, compara contra el
 * intervalo esperado por sync (derivado de los crons en vercel.json) y
 * devuelve un resumen.
 *
 * Auth:
 *   GET  — Vercel Cron (header: x-vercel-cron: 1)
 *   POST — Manual / health checks externos (Authorization: Bearer <CRON_SECRET>)
 *
 * Comportamiento:
 *   - Devuelve 200 con JSON { ok, atrasados, con_errores, all }.
 *     - ok = true si no hay atrasados ni con errores.
 *     - atrasados: syncs cuyo last_run_at supera el umbral por más de 1.5x
 *       el período esperado.
 *     - con_errores: syncs cuyo last_status != 'ok'.
 *     - all: el snapshot completo para debugging.
 *   - Si process.env.ALERT_WEBHOOK_URL está definida y hay algo malo,
 *     postea un resumen al webhook (formato Slack/Discord compatible).
 *
 * Etapa 3 de la consolidación backend.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ── Período esperado de cada sync ──────────────────────────────────────────────
// Derivado de los crons en vercel.json. El umbral de "atrasado" es 1.5x este
// valor. Si la fila no existe en sync_status, se considera "nunca corrió"
// (también es alerta).
//
// Atención: estos valores son días entre corridas esperadas (NO días desde la
// última corrida). El cálculo de atraso suma ese valor + margen.
const EXPECTED_DAYS: Record<string, { intervalDays: number; cron: string; descripcion: string }> = {
  ine:            { intervalDays:  7, cron: 'Lun 07:00 UTC',     descripcion: 'BCCh — desocupación, PIB, ventas regionales' },
  seia:           { intervalDays:  7, cron: 'Lun 08:00 UTC',     descripcion: 'SEIA — proyectos de evaluación ambiental' },
  mop:            { intervalDays:  7, cron: 'Lun 09:00 UTC',     descripcion: 'MOP — proyectos de obras públicas' },
  stop:           { intervalDays:  7, cron: 'Mié 10:00 UTC',     descripcion: 'Ley S.T.O.P. — estadísticas de seguridad' },
  pib:            { intervalDays:  7, cron: 'Lun 11:00 UTC',     descripcion: 'PIB sectorial trimestral' },
  external:       { intervalDays:  7, cron: 'Lun 12:00 UTC',     descripcion: 'Censo + indicadores externos' },
  sinca:          { intervalDays:  1, cron: 'Diario 06:00 UTC',  descripcion: 'SINCA — calidad del aire' },
  cne:            { intervalDays:  7, cron: 'Lun 13:00 UTC',     descripcion: 'CNE — generación eléctrica' },
  deis:           { intervalDays: 30, cron: 'Mensual día 1',     descripcion: 'DEIS — salud (hospitales, camas)' },
  subtel:         { intervalDays:180, cron: 'Semestral (ene/jul)', descripcion: 'SUBTEL — conexiones internet' },
  dipres:         { intervalDays: 90, cron: 'Trimestral',        descripcion: 'DIPRES — ejecución presupuestaria' },
  mineduc:        { intervalDays:365, cron: 'Anual marzo 15',    descripcion: 'MINEDUC — matrícula escolar' },
  mercadopublico: { intervalDays:180, cron: 'Semestral (ene/jul)', descripcion: 'Mercado Público — compras' },
}

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron') === '1') return true
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  return !!secret && auth === `Bearer ${secret}`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runHealth()
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runHealth()
}

// ── Core ──────────────────────────────────────────────────────────────────────

type SyncStatusRow = {
  name: string
  last_run_at: string | null
  last_status: 'ok' | 'partial' | 'error'
  last_rows: number | null
  last_error_count: number | null
  last_duration_ms: number | null
  last_error_sample: string | null
}

async function runHealth(): Promise<Response> {
  const sb = getSupabaseAdmin()
  const [syncRes, pipelineRes] = await Promise.all([
    sb.from('sync_status')
      .select('name, last_run_at, last_status, last_rows, last_error_count, last_duration_ms, last_error_sample')
      .order('last_run_at', { ascending: false, nullsFirst: false }),
    // O-02: segundo sistema de observabilidad. v2_indicadores_pipeline tiene
    // una fila por indicador (84+) con su tolerancia_atraso_dias propia.
    // NO agrupamos por fuente_endpoint (en prod es URL HTTPS o descriptor
    // BCCh, no nombre de sync — un agrupado por endpoint sería ruido).
    sb.from('v2_indicadores_pipeline')
      .select('codigo_indicador, parser_module, ultima_ejecucion, ultima_ejecucion_estado, ultima_ejecucion_mensaje, tolerancia_atraso_dias, activo')
      .eq('activo', true),
  ])

  if (syncRes.error) {
    return Response.json(
      { ok: false, error: `sync_status query: ${syncRes.error.message}` },
      { status: 500 },
    )
  }
  // Pre-fix workflow adversarial: antes solo logueábamos warning y seguíamos.
  // Eso hacía que la mitad de la observabilidad nueva pudiera fallar
  // silenciosamente y /api/health devolviera ok=true. Ahora propagamos.
  const pipelineQueryError = pipelineRes.error?.message
  if (pipelineQueryError) {
    console.warn('[health] v2_indicadores_pipeline query falló:', pipelineQueryError)
  }
  const rows = syncRes.data
  const pipelineRows = pipelineRes.data ?? []

  const now = Date.now()
  const byName = new Map<string, SyncStatusRow>()
  for (const r of (rows ?? []) as SyncStatusRow[]) byName.set(r.name, r)

  type AtrasadoEntry = {
    name: string
    last_run_at: string | null
    dias_atraso: number
    intervalo_esperado_dias: number
    cron: string
    descripcion: string
  }
  type ErrorEntry = {
    name: string
    last_status: string
    last_error_count: number
    last_error_sample: string | null
    last_run_at: string | null
  }

  const atrasados: AtrasadoEntry[] = []
  const conErrores: ErrorEntry[] = []

  for (const [name, expected] of Object.entries(EXPECTED_DAYS)) {
    const row = byName.get(name)

    // Nunca corrió o sin last_run_at → atrasado.
    if (!row || !row.last_run_at) {
      atrasados.push({
        name,
        last_run_at: null,
        dias_atraso: -1, // sentinel para "nunca corrió"
        intervalo_esperado_dias: expected.intervalDays,
        cron: expected.cron,
        descripcion: expected.descripcion,
      })
      continue
    }

    // Atraso real.
    const lastMs = new Date(row.last_run_at).getTime()
    const ageDays = (now - lastMs) / (1000 * 60 * 60 * 24)
    const threshold = expected.intervalDays * 1.5

    if (ageDays > threshold) {
      atrasados.push({
        name,
        last_run_at: row.last_run_at,
        dias_atraso: Math.round(ageDays * 10) / 10,
        intervalo_esperado_dias: expected.intervalDays,
        cron: expected.cron,
        descripcion: expected.descripcion,
      })
    }

    if (row.last_status !== 'ok') {
      conErrores.push({
        name,
        last_status: row.last_status,
        last_error_count: row.last_error_count ?? 0,
        last_error_sample: row.last_error_sample,
        last_run_at: row.last_run_at,
      })
    }
  }

  // ── Pipelines v2: análisis por-indicador (no por fuente_endpoint) ──────────
  // Pre-fix workflow adversarial: agregamos por fuente_endpoint asumiendo que
  // era nombre de sync. En prod es URL HTTPS o descriptor BCCh. staleCount
  // siempre quedaba 0. Ahora calculamos stale por fila usando la columna
  // tolerancia_atraso_dias que vive en el catálogo del pipeline (default 7d).
  type IndicadorProblema = {
    codigo: string
    parser_module: string | null
    motivo: 'error' | 'never' | 'stale' | 'parcial'
    ultima_ejecucion: string | null
    dias_desde: number | null
    tolerancia_dias: number | null
    mensaje: string | null
  }

  const problemas: IndicadorProblema[] = []
  let conData = 0
  let errorCount = 0
  let parcialCount = 0
  let neverCount = 0
  let staleCount = 0

  for (const p of pipelineRows) {
    const ultimaIso = p.ultima_ejecucion as string | null
    const estado = p.ultima_ejecucion_estado as string | null
    const tolerancia = (p.tolerancia_atraso_dias as number | null) ?? 7
    if (ultimaIso) conData += 1

    // Schema usa español: 'ok' | 'parcial' | 'error' | 'pendiente'. La
    // versión anterior comparaba contra 'partial' (inglés) y nunca matcheaba.
    if (estado === 'error') {
      errorCount += 1
      problemas.push({
        codigo: p.codigo_indicador,
        parser_module: p.parser_module ?? null,
        motivo: 'error',
        ultima_ejecucion: ultimaIso,
        dias_desde: ultimaIso ? Math.round((now - new Date(ultimaIso).getTime()) / 86400000) : null,
        tolerancia_dias: tolerancia,
        mensaje: p.ultima_ejecucion_mensaje ?? null,
      })
      continue
    }
    if (estado === 'parcial') {
      parcialCount += 1
      problemas.push({
        codigo: p.codigo_indicador,
        parser_module: p.parser_module ?? null,
        motivo: 'parcial',
        ultima_ejecucion: ultimaIso,
        dias_desde: ultimaIso ? Math.round((now - new Date(ultimaIso).getTime()) / 86400000) : null,
        tolerancia_dias: tolerancia,
        mensaje: p.ultima_ejecucion_mensaje ?? null,
      })
      continue
    }
    if (!ultimaIso) {
      // Nunca corrió: indicador activo en catálogo sin ejecución. Lo
      // contamos pero NO disparamos ok=false (puede ser indicador recién
      // agregado al catálogo antes del primer cron — backlog, no falla).
      neverCount += 1
      problemas.push({
        codigo: p.codigo_indicador,
        parser_module: p.parser_module ?? null,
        motivo: 'never',
        ultima_ejecucion: null,
        dias_desde: null,
        tolerancia_dias: tolerancia,
        mensaje: null,
      })
      continue
    }
    // Stale: ultima_ejecucion > now - tolerancia_atraso_dias. Cada indicador
    // trae su propia tolerancia (censos toleran 1825d, ine 7d, sinca 1d).
    const ageDays = (now - new Date(ultimaIso).getTime()) / 86400000
    if (ageDays > tolerancia) {
      staleCount += 1
      problemas.push({
        codigo: p.codigo_indicador,
        parser_module: p.parser_module ?? null,
        motivo: 'stale',
        ultima_ejecucion: ultimaIso,
        dias_desde: Math.round(ageDays),
        tolerancia_dias: tolerancia,
        mensaje: p.ultima_ejecucion_mensaje ?? null,
      })
    }
  }
  // Ordenar problemas por días desde (más viejo primero), nulls al final.
  problemas.sort((a, b) => (b.dias_desde ?? -1) - (a.dias_desde ?? -1))

  const pipelineSummary = {
    activos: pipelineRows.length,
    con_data: conData,
    error: errorCount,
    parcial: parcialCount,
    never: neverCount,
    stale: staleCount,
  }

  // `never` NO entra en ok=false: backlog vs falla son cosas distintas. Si la
  // query a v2 falló, propagamos como issue (era silenciosamente verde).
  const v2HasIssues = errorCount > 0 || parcialCount > 0 || staleCount > 0 || !!pipelineQueryError
  const ok = atrasados.length === 0 && conErrores.length === 0 && !v2HasIssues

  const result = {
    ok,
    checked_at: new Date().toISOString(),
    atrasados,
    con_errores: conErrores,
    indicadores_v2: pipelineSummary,
    indicadores_v2_problemas: problemas,
    indicadores_v2_query_error: pipelineQueryError ?? null,
    syncs_conocidos: Object.keys(EXPECTED_DAYS).length,
    syncs_con_registro: (rows ?? []).length,
    all: rows ?? [],
  }

  // Postear al webhook si está configurado y hay algo malo. Best effort.
  if (!ok && process.env.ALERT_WEBHOOK_URL) {
    void postAlert(process.env.ALERT_WEBHOOK_URL, result).catch(e =>
      console.warn('[health] alerta webhook falló:', e),
    )
  }

  return Response.json(result)
}

async function postAlert(
  webhookUrl: string,
  result: {
    atrasados: unknown[]
    con_errores: unknown[]
    indicadores_v2: { error: number; parcial: number; stale: number }
    indicadores_v2_query_error: string | null
  },
): Promise<void> {
  const atrasadosCount = result.atrasados.length
  const erroresCount = result.con_errores.length
  const v2 = result.indicadores_v2
  const v2QueryError = result.indicadores_v2_query_error

  const lines: string[] = ['🔴 Work OS — alertas de sync']
  if (atrasadosCount > 0)   lines.push(`Syncs atrasados: ${atrasadosCount}`)
  if (erroresCount > 0)     lines.push(`Syncs con errores: ${erroresCount}`)
  if (v2.error > 0)         lines.push(`Indicadores v2 con error: ${v2.error}`)
  if (v2.parcial > 0)       lines.push(`Indicadores v2 parciales: ${v2.parcial}`)
  if (v2.stale > 0)         lines.push(`Indicadores v2 atrasados (stale por tolerancia): ${v2.stale}`)
  if (v2QueryError)         lines.push(`Query v2 falló: ${v2QueryError}`)
  lines.push('')
  lines.push('Detalle en /api/health (con bearer).')

  // Formato Slack/Discord-compatible: ambos aceptan { text: "..." }.
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: lines.join('\n') }),
    signal: AbortSignal.timeout(5000),
  })
}
