/**
 * DEIS/MINSAL (Departamento de Estadísticas e Información de Salud) sync route
 *
 * Downloads Excel files from DEIS portal with hospital infrastructure data
 * and upserts into v2_indicadores_valores.
 *
 * Fills: SAL_HOSP_N, SAL_CAMAS_1K, SAL_LISTA_ESP
 *
 * IMPORTANT: DEIS URLs change frequently. The download URL is read from
 * v2_indicadores_pipeline.fuente_endpoint so it can be updated via admin
 * without redeploying.
 *
 * Auth: GET (Vercel Cron) or POST (Bearer CRON_SECRET)
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { isAuthorizedSync, upsertV2WithLog } from '@/lib/syncHelper'
import { fetchExcel, parseWorkbook, sheetToJson } from '@/lib/parseExcel'
import { matchRegionName } from '@/lib/regionNameMatcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const CODIGOS = ['SAL_HOSP_N', 'SAL_CAMAS_1K', 'SAL_LISTA_ESP']

export async function GET(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

async function runSync() {
  const sb = getSupabaseAdmin()
  const errors: string[] = []
  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  // Read URLs from pipeline config
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
      error: 'No URLs configured. Set fuente_endpoint in v2_indicadores_pipeline for SAL_HOSP_N, SAL_CAMAS_1K, SAL_LISTA_ESP.',
      hint: 'Go to Supabase → v2_indicadores_pipeline → update fuente_endpoint with the DEIS Excel download URL',
    })
  }

  // Get population for per-capita calculation (SAL_CAMAS_1K)
  const { data: popData } = await sb
    .from('v2_indicadores_ultimo')
    .select('region_id, valor')
    .eq('codigo_indicador', 'DEM_POB_TOTAL')

  const population = new Map<number, number>()
  for (const p of popData ?? []) {
    if (p.valor != null) population.set(p.region_id, Number(p.valor))
  }

  // Process each indicator that has a URL
  for (const [codigo, url] of urlMap.entries()) {
    try {
      const buffer = await fetchExcel(url)
      const wb = parseWorkbook(buffer)
      const sheet = wb.Sheets[wb.SheetNames[0]]
      const json = sheetToJson(sheet)

      for (const row of json) {
        // Find region name
        const regionEntry = Object.entries(row).find(([k]) =>
          k.toLowerCase().includes('region') || k.toLowerCase().includes('regi')
        )
        if (!regionEntry) continue

        const regionId = matchRegionName(String(regionEntry[1]))
        if (regionId === null || regionId === 0) continue

        // Find the value depending on the indicator
        let valor: number | null = null
        const keys = Object.keys(row)

        if (codigo === 'SAL_HOSP_N') {
          // Look for column with "hospital" or "establecimiento"
          const valEntry = Object.entries(row).find(([k]) =>
            k.toLowerCase().includes('hospital') || k.toLowerCase().includes('total')
          )
          valor = valEntry ? Number(valEntry[1]) : null
        } else if (codigo === 'SAL_CAMAS_1K') {
          // Look for "camas" column, then divide by population/1000
          const valEntry = Object.entries(row).find(([k]) => k.toLowerCase().includes('cama'))
          const rawCamas = valEntry ? Number(valEntry[1]) : null
          const pop = population.get(regionId)
          if (rawCamas != null && pop && pop > 0) {
            valor = (rawCamas / pop) * 1000
          }
        } else if (codigo === 'SAL_LISTA_ESP') {
          // Look for "lista" or "espera" column
          const valEntry = Object.entries(row).find(([k]) =>
            k.toLowerCase().includes('lista') || k.toLowerCase().includes('espera') || k.toLowerCase().includes('total')
          )
          valor = valEntry ? Number(valEntry[1]) : null
        }

        if (valor === null || isNaN(valor)) continue

        v2Rows.push({
          codigo_indicador: codigo,
          region_id: regionId,
          valor: parseFloat(valor.toFixed(4)),
          periodo: new Date().toISOString().slice(0, 4) + '-01-01', // annual
          calidad: 'verificado',
          cargado_por: 'deis-sync',
        })
      }

      console.log(`[deis-sync] ${codigo}: parsed ${v2Rows.filter(r => r.codigo_indicador === codigo).length} values`)
    } catch (err) {
      errors.push(`${codigo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'deis-sync')
  if (v2Error) errors.push(`v2 upsert: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0 || upserted > 0,
    synced_at: new Date().toISOString(),
    upserted,
    configured_urls: urlMap.size,
    missing_urls: CODIGOS.filter(c => !urlMap.has(c)),
    errors: errors.length > 0 ? errors : undefined,
  })
}
