/**
 * Mercado Público / ChileCompra sync route
 *
 * Downloads aggregated procurement data by region from a configured URL.
 * The Mercado Público real-time API only returns individual orders without
 * regional aggregation, so this route uses pre-aggregated Excel/CSV files
 * (e.g., annual transparency reports from chilecompra.cl).
 *
 * Fills: ECO_COMPRAS_PUB (total procurement amount by region, MM CLP)
 *
 * URL is read from v2_indicadores_pipeline.fuente_endpoint.
 * Auth: GET (Vercel Cron) or POST (Bearer CRON_SECRET)
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { isAuthorizedSync, upsertV2WithLog } from '@/lib/syncHelper'
import { fetchExcel, parseWorkbook, sheetToJson } from '@/lib/parseExcel'
import { matchRegionName } from '@/lib/regionNameMatcher'
import { withSyncStatus } from '@/lib/syncRunner'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const CODIGO = 'ECO_COMPRAS_PUB'

export async function GET(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('mercadopublico', runSync)
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('mercadopublico', runSync)
}

async function runSync() {
  const sb = getSupabaseAdmin()
  const errors: string[] = []

  // Get URL from pipeline config
  const { data: config } = await sb
    .from('v2_indicadores_pipeline')
    .select('fuente_endpoint')
    .eq('codigo_indicador', CODIGO)
    .single()

  if (!config?.fuente_endpoint) {
    return Response.json({
      ok: false,
      error: `No URL configured for ${CODIGO}. Set fuente_endpoint in v2_indicadores_pipeline.`,
      hint: 'Find the ChileCompra annual statistics Excel and set the URL in v2_indicadores_pipeline',
    })
  }

  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  try {
    const buffer = await fetchExcel(config.fuente_endpoint)
    const wb = parseWorkbook(buffer)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const json = sheetToJson(sheet)

    for (const row of json) {
      // Find region column
      const regionEntry = Object.entries(row).find(([k]) =>
        k.toLowerCase().includes('region') || k.toLowerCase().includes('regi')
      )
      if (!regionEntry) continue

      const regionId = matchRegionName(String(regionEntry[1]))
      if (regionId === null || regionId === 0) continue

      // Find amount column (monto, total, compras)
      const valEntry = Object.entries(row).find(([k]) => {
        const kl = k.toLowerCase()
        return kl.includes('monto') || kl.includes('total') || kl.includes('compra') || kl.includes('adjudic')
      })
      if (!valEntry) continue

      const valor = Number(valEntry[1])
      if (isNaN(valor)) continue

      v2Rows.push({
        codigo_indicador: CODIGO,
        region_id: regionId,
        valor: parseFloat((valor / 1_000_000).toFixed(1)), // Convert to MM CLP
        periodo: new Date().toISOString().slice(0, 4) + '-01-01',
        calidad: 'verificado',
        cargado_por: 'mercadopublico-sync',
      })
    }
  } catch (err) {
    errors.push(`${CODIGO}: ${err instanceof Error ? err.message : String(err)}`)
  }

  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'mercadopublico-sync')
  if (v2Error) errors.push(`v2: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0 && upserted > 0,
    synced_at: new Date().toISOString(),
    upserted,
    errors: errors.length > 0 ? errors : undefined,
  })
}
