/**
 * CNE (Comisión Nacional de Energía) sync route
 *
 * Fetches energy data from api.cne.cl REST API.
 * Requires registration at api.cne.cl/register (free).
 * Token stored in env var CNE_API_TOKEN.
 *
 * Fills: ENE_CAP_INSTALADA, ENE_ERNC_PCT
 *
 * Endpoints used:
 *   - /api/ea/capacidadinstalada — installed capacity by region (MW)
 *   - Same data used to calculate % ERNC (ley_ernc field)
 *
 * Auth: GET (Vercel Cron) or POST (Bearer CRON_SECRET)
 */

import { NextRequest } from 'next/server'
import { isAuthorizedSync, upsertV2WithLog } from '@/lib/syncHelper'
import { matchRegionName } from '@/lib/regionNameMatcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const CNE_BASE = 'https://api.cne.cl/api/ea'

type CneUnit = {
  region_nombre: string
  potencia_neta_mw: number | string
  ley_ernc: string // "Si" or "No"
  estado: string
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

async function runSync() {
  const token = process.env.CNE_API_TOKEN
  if (!token) {
    return Response.json({
      ok: false,
      error: 'CNE_API_TOKEN not configured. Register at api.cne.cl/register to get a token.',
    })
  }

  const errors: string[] = []
  const headers = { Authorization: `Bearer ${token}` }

  // Fetch capacidad instalada
  let units: CneUnit[] = []
  try {
    const res = await fetch(`${CNE_BASE}/capacidadinstalada`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`CNE HTTP ${res.status}: ${await res.text().catch(() => '')}`)
    const json = await res.json()
    if (!json.success) throw new Error('CNE API returned success=false')
    units = json.data ?? []
  } catch (err) {
    errors.push(`capacidadinstalada: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (units.length === 0 && errors.length > 0) {
    return Response.json({ ok: false, errors })
  }

  // Aggregate by region: total MW and ERNC MW
  const regionAgg: Map<number, { total_mw: number; ernc_mw: number }> = new Map()

  for (const unit of units) {
    // Skip non-operational units
    if (unit.estado && unit.estado.toLowerCase().includes('desmantel')) continue

    const regionId = matchRegionName(unit.region_nombre ?? '')
    if (regionId === null || regionId === 0) continue

    const mw = Number(unit.potencia_neta_mw)
    if (isNaN(mw) || mw <= 0) continue

    const agg = regionAgg.get(regionId) ?? { total_mw: 0, ernc_mw: 0 }
    agg.total_mw += mw
    if (unit.ley_ernc?.toLowerCase() === 'si') {
      agg.ernc_mw += mw
    }
    regionAgg.set(regionId, agg)
  }

  // Build v2 rows
  const today = new Date().toISOString().slice(0, 10)
  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  for (const [regionId, agg] of regionAgg.entries()) {
    // ENE_CAP_INSTALADA — total installed capacity in MW
    v2Rows.push({
      codigo_indicador: 'ENE_CAP_INSTALADA',
      region_id: regionId,
      valor: parseFloat(agg.total_mw.toFixed(1)),
      periodo: today,
      calidad: 'verificado',
      cargado_por: 'cne-sync',
    })

    // ENE_ERNC_PCT — % of capacity that is ERNC
    if (agg.total_mw > 0) {
      v2Rows.push({
        codigo_indicador: 'ENE_ERNC_PCT',
        region_id: regionId,
        valor: parseFloat(((agg.ernc_mw / agg.total_mw) * 100).toFixed(1)),
        periodo: today,
        calidad: 'verificado',
        cargado_por: 'cne-sync',
      })
    }
  }

  console.log(`[cne-sync] ${units.length} units → ${regionAgg.size} regions → ${v2Rows.length} values`)

  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'cne-sync')
  if (v2Error) errors.push(`v2: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0 && upserted > 0,
    synced_at: new Date().toISOString(),
    units_processed: units.length,
    regions_with_data: regionAgg.size,
    upserted,
    errors: errors.length > 0 ? errors : undefined,
  })
}
