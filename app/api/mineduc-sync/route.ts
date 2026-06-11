/**
 * MINEDUC (Ministerio de Educación) sync route
 *
 * Downloads enrollment data from datosabiertos.mineduc.cl
 * Fills: EDU_MATRICULA, EDU_PARVULARIA
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

const CODIGOS = ['EDU_MATRICULA', 'EDU_PARVULARIA']

export async function GET(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('mineduc', runSync)
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('mineduc', runSync)
}

async function runSync() {
  const sb = getSupabaseAdmin()
  const errors: string[] = []
  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  const { data: pipelineConfigs } = await sb
    .from('v2_indicadores_pipeline')
    .select('codigo_indicador, fuente_endpoint')
    .in('codigo_indicador', CODIGOS)

  const urlMap = new Map<string, string>()
  for (const p of pipelineConfigs ?? []) {
    if (p.fuente_endpoint) urlMap.set(p.codigo_indicador, p.fuente_endpoint)
  }

  if (urlMap.size === 0) {
    return Response.json({
      ok: false,
      error: 'No URLs configured. Set fuente_endpoint in v2_indicadores_pipeline for EDU_MATRICULA, EDU_PARVULARIA.',
      hint: 'Find the Excel at datosabiertos.mineduc.cl and set the URL in v2_indicadores_pipeline',
    })
  }

  for (const [codigo, url] of urlMap.entries()) {
    try {
      const buffer = await fetchExcel(url)
      const wb = parseWorkbook(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = sheetToJson(sheet)

      for (const row of json) {
        const regionEntry = Object.entries(row).find(([k]) =>
          k.toLowerCase().includes('region') || k.toLowerCase().includes('regi')
        )
        if (!regionEntry) continue

        const regionId = matchRegionName(String(regionEntry[1]))
        if (regionId === null || regionId === 0) continue

        // Find total/matricula column
        const valEntry = Object.entries(row).find(([k]) =>
          k.toLowerCase().includes('total') || k.toLowerCase().includes('matric') || k.toLowerCase().includes('cobertura')
        )
        if (!valEntry) continue

        const valor = Number(valEntry[1])
        if (isNaN(valor)) continue

        v2Rows.push({
          codigo_indicador: codigo,
          region_id: regionId,
          valor,
          periodo: new Date().toISOString().slice(0, 4) + '-01-01',
          calidad: 'verificado',
          cargado_por: 'mineduc-sync',
        })
      }
    } catch (err) {
      errors.push(`${codigo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'mineduc-sync')
  if (v2Error) errors.push(`v2: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0 || upserted > 0,
    synced_at: new Date().toISOString(),
    upserted,
    missing_urls: CODIGOS.filter(c => !urlMap.has(c)),
    errors: errors.length > 0 ? errors : undefined,
  })
}
