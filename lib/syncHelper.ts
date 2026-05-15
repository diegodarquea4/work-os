/**
 * Shared helpers for sync routes.
 *
 * Extracts the repeated auth + dual-write + logging pattern
 * so each new sync route only needs ~20 lines of source-specific code.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from './supabaseServer'

type V2Row = {
  codigo_indicador: string
  region_id: number
  valor: number
  periodo: string
  calidad?: string
  cargado_por: string
}

type SyncResult = {
  ok: boolean
  upserted: number
  errors: string[]
  v2_upserted: number
}

/**
 * Check auth for sync routes (Vercel Cron or Bearer token).
 * Returns true if authorized.
 */
export function isAuthorizedSync(request: NextRequest): boolean {
  if (request.headers.get('x-vercel-cron') === '1') return true
  const auth = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  return !!secret && auth === `Bearer ${secret}`
}

/**
 * Upsert rows to v2_indicadores_valores with logging.
 *
 * Handles batching (500 rows), pipeline log, and materialized view refresh.
 * Returns count of upserted rows.
 */
export async function upsertV2WithLog(
  rows: V2Row[],
  sourceName: string,
): Promise<{ upserted: number; error?: string }> {
  if (rows.length === 0) return { upserted: 0 }

  const sb = getSupabaseAdmin()
  let upserted = 0
  let lastError: string | undefined

  // Batch upsert
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500).map(r => ({
      ...r,
      calidad: r.calidad ?? 'verificado',
    }))
    const { error } = await sb
      .from('v2_indicadores_valores')
      .upsert(batch, { onConflict: 'codigo_indicador,region_id,periodo' })
    if (error) {
      lastError = error.message
      break
    }
    upserted += batch.length
  }

  // Log per indicator
  const codigos = [...new Set(rows.map(r => r.codigo_indicador))]
  for (const codigo of codigos) {
    const count = rows.filter(r => r.codigo_indicador === codigo).length
    sb.from('v2_indicadores_pipeline_log').insert({
      codigo_indicador: codigo,
      estado: lastError ? 'error' : 'ok',
      filas_persistidas: count,
      errores: lastError ? { message: lastError } : null,
    }).then(() => {})

    sb.from('v2_indicadores_pipeline').update({
      ultima_ejecucion: new Date().toISOString(),
      ultima_ejecucion_estado: lastError ? 'error' : 'ok',
      ultima_ejecucion_mensaje: lastError ?? `${count} filas via ${sourceName}`,
    }).eq('codigo_indicador', codigo).then(() => {})
  }

  // Refresh materialized view
  if (!lastError) {
    sb.rpc('refresh_v2_indicadores_ultimo').then(() => {})
  }

  return { upserted, error: lastError }
}
