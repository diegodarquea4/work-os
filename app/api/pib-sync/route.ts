/**
 * BCCh regional PIB sectorial sync
 *
 * Fetches PIB by economic sector for all 16 regions and stores in regional_metrics.
 * Uses the same BCCh REST API and upsert pattern as ine-sync.
 *
 * metric_name format: "pib_sector_{sector_slug}"
 * e.g.: pib_sector_mineria, pib_sector_construccion, pib_sector_comercio
 *
 * Setup:
 *   1. Run GET /api/pib-discover to get series IDs
 *   2. Add them to SERIES_CONFIG below
 *   3. Trigger: POST /api/pib-sync (Authorization: Bearer <CRON_SECRET>)
 *              GET  /api/pib-sync (x-vercel-cron: 1)
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { INE_CODE } from '@/lib/regions'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 300

const BCCH_API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

// ── Series configuration ─────────────────────────────────────────────────────
// Populate after running GET /api/pib-discover.
// metric must start with "pib_sector_" so the hook can filter them.
// regionCod uses the same codes as INE_CODE in lib/regions.ts.
//
// Format: F035.PIB.FLU.R.CLP.2018.{SECTOR}.Z.Z.{01-16}.0.T (annual, base 2018)
const SERIES_CONFIG: { seriesId: string; metric: string; regionCod: string }[] = [
  // ── Example entries — replace with IDs from pib-discover ──
  // { seriesId: 'F035.PIB.FLU.R.CLP.2018.MIN.Z.Z.13.0.T', metric: 'pib_sector_mineria',       regionCod: 'RM' },
  // { seriesId: 'F035.PIB.FLU.R.CLP.2018.CON.Z.Z.13.0.T', metric: 'pib_sector_construccion',  regionCod: 'RM' },
  // { seriesId: 'F035.PIB.FLU.R.CLP.2018.COM.Z.Z.13.0.T', metric: 'pib_sector_comercio',      regionCod: 'RM' },
]

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get('x-vercel-cron') !== '1') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

// ── Core sync ────────────────────────────────────────────────────────────────

async function runSync() {
  const user = process.env.BCCH_USER
  const pass = process.env.BCCH_PASS

  if (!user || !pass) {
    return Response.json({
      ok: false,
      error: 'Missing BCCH_USER or BCCH_PASS',
    }, { status: 503 })
  }

  if (SERIES_CONFIG.length === 0) {
    return Response.json({
      ok: false,
      error: 'SERIES_CONFIG is empty. Run GET /api/pib-discover first, then add series IDs to app/api/pib-sync/route.ts',
    }, { status: 503 })
  }

  const supabase  = getSupabaseAdmin()
  const firstdate = '2018-01-01'
  const lastdate  = new Date().toISOString().slice(0, 10)

  const rows: UpsertRow[] = []
  const errors: string[]  = []

  for (const config of SERIES_CONFIG) {
    const regionId = INE_CODE[config.regionCod]
    if (regionId === undefined) {
      errors.push(`Unknown region cod: ${config.regionCod}`)
      continue
    }

    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&timeseries=${config.seriesId}&firstdate=${firstdate}&lastdate=${lastdate}&type=json`

    let data: BcchResponse
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { errors.push(`${config.seriesId}: HTTP ${res.status}`); continue }
      data = await res.json() as BcchResponse
    } catch (err) {
      errors.push(`${config.seriesId}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    if (data.Codigo !== 0) {
      errors.push(`${config.seriesId}: BCCh error ${data.Codigo} — ${data.Descripcion}`)
      continue
    }

    for (const obs of data.Series?.Obs ?? []) {
      if (obs.statusCode !== 'OK' || !obs.value || obs.value === 'NaN') continue
      const value = parseFloat(obs.value)
      if (isNaN(value)) continue

      const period = parseBcchDate(obs.indexDateString)
      if (!period) continue

      rows.push({
        region_id:   regionId,
        metric_name: config.metric,
        value,
        period,
        source_url:  `${BCCH_API}?timeseries=${config.seriesId}`,
        updated_at:  new Date().toISOString(),
      })
    }
  }

  if (rows.length === 0) {
    return Response.json({ ok: false, errors, note: 'No data — check SERIES_CONFIG IDs' })
  }

  const { error: dbErr } = await supabase
    .from('regional_metrics')
    .upsert(rows, { onConflict: 'region_id,metric_name,period' })

  if (dbErr) {
    return Response.json({ ok: false, error: `Supabase upsert: ${dbErr.message}` }, { status: 500 })
  }

  return Response.json({
    ok: true,
    synced_at:  new Date().toISOString(),
    upserted:   rows.length,
    regions:    [...new Set(rows.map(r => r.region_id))].length,
    sectors:    [...new Set(rows.map(r => r.metric_name))],
    errors:     errors.length > 0 ? errors : undefined,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** BCCh dates arrive as "DD-MM-YYYY" → convert to ISO "YYYY-MM-DD" */
function parseBcchDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// ── Types ────────────────────────────────────────────────────────────────────

type BcchResponse = {
  Codigo: number
  Descripcion: string
  Series?: {
    seriesId: string
    descripEsp: string
    Obs?: { indexDateString: string; value: string; statusCode: string }[]
  }
}

type UpsertRow = {
  region_id:   number
  metric_name: string
  value:       number
  period:      string
  source_url:  string
  updated_at:  string
}
