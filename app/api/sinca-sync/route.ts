/**
 * SINCA (Sistema de Información Nacional de Calidad del Aire) sync route
 *
 * Fetches real-time air quality data from sinca.mma.gob.cl JSON API.
 * Aggregates PM2.5 and PM10 readings by region (average of all stations).
 *
 * Fills: AMB_MP25, AMB_MP10
 *
 * Source: https://sinca.mma.gob.cl/index.php/json/listadomapa2k19/
 * No API key required — public JSON endpoint.
 *
 * Auth: GET (Vercel Cron) or POST (Bearer CRON_SECRET)
 */

import { NextRequest } from 'next/server'
import { isAuthorizedSync, upsertV2WithLog } from '@/lib/syncHelper'
import { matchRegionName } from '@/lib/regionNameMatcher'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SINCA_URL = 'https://sinca.mma.gob.cl/index.php/json/listadomapa2k19/'

type SincaReading = {
  c: { v: string | number }[]
}

type SincaRealtime = {
  code: string
  name: string
  info: { rows: SincaReading[] }
}

type SincaStation = {
  nombre: string
  region: string
  realtime: SincaRealtime[]
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
  const errors: string[] = []

  // Fetch SINCA station data
  let stations: SincaStation[]
  try {
    const res = await fetch(SINCA_URL, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`SINCA HTTP ${res.status}`)
    stations = await res.json()
  } catch (err) {
    return Response.json({
      ok: false,
      error: `Failed to fetch SINCA: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // Aggregate PM2.5 and PM10 by region
  // For each station, take the latest valid (non-zero) reading
  const regionValues: Map<number, { pm25: number[]; pm10: number[] }> = new Map()

  for (const station of stations) {
    const regionId = matchRegionName(station.region)
    if (regionId === null || regionId === 0) continue

    if (!regionValues.has(regionId)) {
      regionValues.set(regionId, { pm25: [], pm10: [] })
    }
    const bucket = regionValues.get(regionId)!

    for (const rt of station.realtime ?? []) {
      const code = rt.code?.toUpperCase()
      if (code !== 'PM25' && code !== 'PM10') continue

      // Get last valid reading (non-zero value)
      const rows = rt.info?.rows ?? []
      let lastVal: number | null = null
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = Number(rows[i]?.c?.[1]?.v)
        if (v > 0) {
          lastVal = v
          break
        }
      }

      if (lastVal !== null) {
        if (code === 'PM25') bucket.pm25.push(lastVal)
        else bucket.pm10.push(lastVal)
      }
    }
  }

  // Build v2 rows — average per region
  const today = new Date().toISOString().slice(0, 10)
  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  for (const [regionId, vals] of regionValues.entries()) {
    if (vals.pm25.length > 0) {
      const avg = vals.pm25.reduce((s, v) => s + v, 0) / vals.pm25.length
      v2Rows.push({
        codigo_indicador: 'AMB_MP25',
        region_id: regionId,
        valor: parseFloat(avg.toFixed(1)),
        periodo: today,
        calidad: 'preliminar',
        cargado_por: 'sinca-sync',
      })
    }
    if (vals.pm10.length > 0) {
      const avg = vals.pm10.reduce((s, v) => s + v, 0) / vals.pm10.length
      v2Rows.push({
        codigo_indicador: 'AMB_MP10',
        region_id: regionId,
        valor: parseFloat(avg.toFixed(1)),
        periodo: today,
        calidad: 'preliminar',
        cargado_por: 'sinca-sync',
      })
    }
  }

  console.log(`[sinca-sync] ${stations.length} stations → ${regionValues.size} regions → ${v2Rows.length} values`)

  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'sinca-sync')
  if (v2Error) errors.push(`v2: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0 && upserted > 0,
    synced_at: new Date().toISOString(),
    stations: stations.length,
    regions_with_data: regionValues.size,
    upserted,
    errors: errors.length > 0 ? errors : undefined,
  })
}
