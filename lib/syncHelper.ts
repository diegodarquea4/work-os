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

  // Log per indicator + pipeline update.
  // Ojo: en Vercel serverless las promises sin await se pueden congelar tras
  // la Response (causa 6.10 de la auditoría: telemetría perdida). Awaiteamos
  // explícito; cuesta ~200ms en cron pero garantiza durabilidad.
  const codigos = [...new Set(rows.map(r => r.codigo_indicador))]
  for (const codigo of codigos) {
    const count = rows.filter(r => r.codigo_indicador === codigo).length
    await sb.from('v2_indicadores_pipeline_log').insert({
      codigo_indicador: codigo,
      estado: lastError ? 'error' : 'ok',
      filas_persistidas: count,
      errores: lastError ? { message: lastError } : null,
    })

    await sb.from('v2_indicadores_pipeline').update({
      ultima_ejecucion: new Date().toISOString(),
      ultima_ejecucion_estado: lastError ? 'error' : 'ok',
      ultima_ejecucion_mensaje: lastError ?? `${count} filas via ${sourceName}`,
    }).eq('codigo_indicador', codigo)
  }

  // Refresh materialized view
  if (!lastError) {
    await sb.rpc('refresh_v2_indicadores_ultimo')
  }

  return { upserted, error: lastError }
}

/**
 * Actualiza v2_indicadores_pipeline.ultima_ejecucion para los códigos dados.
 * Pensado para syncs que upsertan a v2_indicadores_valores manualmente
 * (pib, seia, mop, stop, external — los que no usan upsertV2WithLog).
 *
 * NO updatea pipeline_log — esa granularidad la maneja upsertV2WithLog cuando
 * aplica. Acá solo necesitamos que el indicador no se vea "nunca corrió" en
 * /admin/pipeline ni /api/health.
 */
export async function updateV2Pipeline(
  codigos: string[],
  sourceName: string,
  result: { count: number; error?: string },
): Promise<void> {
  if (codigos.length === 0) return
  const sb = getSupabaseAdmin()
  const mensaje = result.error ?? `${result.count} filas via ${sourceName}`
  const estado = result.error ? 'error' : 'ok'
  await sb.from('v2_indicadores_pipeline').update({
    ultima_ejecucion: new Date().toISOString(),
    ultima_ejecucion_estado: estado,
    ultima_ejecucion_mensaje: mensaje,
  }).in('codigo_indicador', codigos)
}
