/**
 * BCCh (Banco Central de Chile) sync route
 *
 * Fetches regional macroeconomic series from the BCCh Statistical Database
 * and upserts them into regional_metrics.
 *
 * Auth:
 *   GET  — Vercel Cron (header: x-vercel-cron: 1)
 *   POST — Manual / CI (header: Authorization: Bearer <CRON_SECRET>)
 *
 * Required env vars:
 *   BCCH_USER          — BCCh API username (register free at si3.bcentral.cl)
 *   BCCH_PASS          — BCCh API password
 *   CRON_SECRET        — Bearer token for POST trigger
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase admin key
 *
 * BCCh API docs: https://si3.bcentral.cl/estadisticas/Principal1/web_services/index.htm
 *
 * Series IDs:
 *   Regional unemployment (tasa_desocupacion) uses the series discovery approach:
 *   the /api/ine-discover endpoint lists available series once you have credentials.
 *   National series confirmed: F049.DES.TAS.INE9.10.M
 *
 * Regional series format: F049.DES.TAS.INE9.{CODE}.M
 * Code mapping verified via BCCh SearchSeries (see /api/ine-discover):
 *   Confirmed: Arica y Parinacota = 25
 *   Remaining codes: run /api/ine-discover once to get the full list
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { INE_CODE } from '@/lib/regions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BCCH_API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

// ── Series configuration ─────────────────────────────────────────────────────
// regionCod: string  → stored by region (INE_CODE lookup)
// regionCod: 'NAC'   → stored as national (region_id = 0)
// regionCod: null    → skipped (reference only)
const SERIES_CONFIG: { seriesId: string; metric: string; regionCod: string | null }[] = [

  // ── Tasa de desocupación regional (F049.DES.TAS.INE9.{CODE}.M, monthly) ───
  // Confirmed via /api/ine-discover on 2026-04-05. Codes 11-26 map to INE regions.
  { seriesId: 'F049.DES.TAS.INE9.25.M',  metric: 'tasa_desocupacion', regionCod: 'XV'  }, // Arica y Parinacota
  { seriesId: 'F049.DES.TAS.INE9.11.M',  metric: 'tasa_desocupacion', regionCod: 'I'   }, // Tarapacá
  { seriesId: 'F049.DES.TAS.INE9.12.M',  metric: 'tasa_desocupacion', regionCod: 'II'  }, // Antofagasta
  { seriesId: 'F049.DES.TAS.INE9.13.M',  metric: 'tasa_desocupacion', regionCod: 'III' }, // Atacama
  { seriesId: 'F049.DES.TAS.INE9.14.M',  metric: 'tasa_desocupacion', regionCod: 'IV'  }, // Coquimbo
  { seriesId: 'F049.DES.TAS.INE9.15.M',  metric: 'tasa_desocupacion', regionCod: 'V'   }, // Valparaíso
  { seriesId: 'F049.DES.TAS.INE9.16.M',  metric: 'tasa_desocupacion', regionCod: 'VI'  }, // O'Higgins
  { seriesId: 'F049.DES.TAS.INE9.17.M',  metric: 'tasa_desocupacion', regionCod: 'VII' }, // Maule
  { seriesId: 'F049.DES.TAS.INE9.18N.M', metric: 'tasa_desocupacion', regionCod: 'VIII'}, // Biobío
  { seriesId: 'F049.DES.TAS.INE9.26.M',  metric: 'tasa_desocupacion', regionCod: 'XVI' }, // Ñuble
  { seriesId: 'F049.DES.TAS.INE9.19.M',  metric: 'tasa_desocupacion', regionCod: 'IX'  }, // La Araucanía
  { seriesId: 'F049.DES.TAS.INE9.24.M',  metric: 'tasa_desocupacion', regionCod: 'XIV' }, // Los Ríos
  { seriesId: 'F049.DES.TAS.INE9.20.M',  metric: 'tasa_desocupacion', regionCod: 'X'   }, // Los Lagos
  { seriesId: 'F049.DES.TAS.INE9.21.M',  metric: 'tasa_desocupacion', regionCod: 'XI'  }, // Aysén
  { seriesId: 'F049.DES.TAS.INE9.22.M',  metric: 'tasa_desocupacion', regionCod: 'XII' }, // Magallanes
  { seriesId: 'F049.DES.TAS.INE9.23.M',  metric: 'tasa_desocupacion', regionCod: 'RM'  }, // Metropolitana

  // ── PIB regional (F035.PIB.FLU.R.CLP.2018.Z.Z.Z.{01-16}.0.T, quarterly) ──
  // Confirmed via BCCh cuadro CCNN2018_PIB_REGIONAL_T on 2026-04-05.
  // Codes 01-16 are BCCh's sequential region ordering (not INE employment codes).
  // Values in miles de millones de pesos encadenados (referencia 2018).
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.15.0.T', metric: 'pib_regional', regionCod: 'XV'  }, // Arica y Parinacota
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.01.0.T', metric: 'pib_regional', regionCod: 'I'   }, // Tarapacá
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.02.0.T', metric: 'pib_regional', regionCod: 'II'  }, // Antofagasta
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.03.0.T', metric: 'pib_regional', regionCod: 'III' }, // Atacama
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.04.0.T', metric: 'pib_regional', regionCod: 'IV'  }, // Coquimbo
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.05.0.T', metric: 'pib_regional', regionCod: 'V'   }, // Valparaíso
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.06.0.T', metric: 'pib_regional', regionCod: 'VI'  }, // O'Higgins
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.07.0.T', metric: 'pib_regional', regionCod: 'VII' }, // Maule
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.08.0.T', metric: 'pib_regional', regionCod: 'VIII'}, // Biobío
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.16.0.T', metric: 'pib_regional', regionCod: 'XVI' }, // Ñuble
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.09.0.T', metric: 'pib_regional', regionCod: 'IX'  }, // La Araucanía
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.14.0.T', metric: 'pib_regional', regionCod: 'XIV' }, // Los Ríos
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.10.0.T', metric: 'pib_regional', regionCod: 'X'   }, // Los Lagos
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.11.0.T', metric: 'pib_regional', regionCod: 'XI'  }, // Aysén
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.12.0.T', metric: 'pib_regional', regionCod: 'XII' }, // Magallanes
  { seriesId: 'F035.PIB.FLU.R.CLP.2018.Z.Z.Z.13.0.T', metric: 'pib_regional', regionCod: 'RM'  }, // Metropolitana

  // ── Indicadores nacionales (regionCod: 'NAC' → region_id = 0) ────────────
  // IMACEC empalmado mensual — índice actividad económica (base 2018=100)
  { seriesId: 'F032.IMC.IND.Z.Z.EP18.Z.Z.0.M',    metric: 'imacec',           regionCod: 'NAC' },
  // PIB nacional trimestral — volumen encadenado (miles de millones $CLP, ref. 2018)
  { seriesId: 'F032.PIB.FLU.R.CLP.EP18.Z.Z.0.T',  metric: 'pib_nacional',     regionCod: 'NAC' },
  // Tasa de desocupación nacional mensual (comparación con regional)
  { seriesId: 'F049.DES.TAS.INE9.10.M',            metric: 'tasa_desocupacion', regionCod: 'NAC' },
]

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get('x-vercel-cron') !== '1') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
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
      error: 'Missing BCCH_USER or BCCH_PASS env vars. Register free at https://si3.bcentral.cl/estadisticas/Principal1/web_services/index.htm',
    }, { status: 503 })
  }

  const supabase = getSupabaseAdmin()

  // Only sync entries that have a regionCod (skip national)
  const regionalSeries = SERIES_CONFIG.filter(s => s.regionCod !== null)

  if (regionalSeries.length === 0) {
    return Response.json({
      ok: false,
      error: 'No regional series configured. Run GET /api/ine-discover to find series IDs, then add them to SERIES_CONFIG in app/api/ine-sync/route.ts',
    }, { status: 503 })
  }

  const firstdate = '2018-01-01'
  const lastdate  = new Date().toISOString().slice(0, 10)
  const rows: UpsertRow[] = []
  const errors: string[] = []

  // BCCh API only supports one series per call
  for (const config of regionalSeries) {
    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&timeseries=${config.seriesId}&firstdate=${firstdate}&lastdate=${lastdate}&type=json`

    let bcchData: BcchResponse
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      if (!res.ok) { errors.push(`${config.seriesId}: HTTP ${res.status}`); continue }
      bcchData = await res.json() as BcchResponse
    } catch (err) {
      errors.push(`${config.seriesId}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }

    if (bcchData.Codigo !== 0) {
      errors.push(`${config.seriesId}: BCCh error ${bcchData.Codigo} — ${bcchData.Descripcion}`)
      continue
    }

    if (!config.regionCod) continue
    const regionId = INE_CODE[config.regionCod]
    if (regionId === undefined) { errors.push(`Unknown region cod: ${config.regionCod}`); continue }

    for (const obs of bcchData.Series?.Obs ?? []) {
      if (obs.statusCode !== 'OK' || !obs.value || obs.value === 'NaN') continue
      const value = parseFloat(obs.value)
      if (isNaN(value)) continue

      // BCCh date format: "01-01-2024" (DD-MM-YYYY) → convert to "2024-01-01"
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
    return Response.json({ ok: false, errors, note: 'Add regional series to SERIES_CONFIG after running /api/ine-discover' })
  }

  const { error: dbErr } = await supabase
    .from('regional_metrics')
    .upsert(rows, { onConflict: 'region_id,metric_name,period' })

  if (dbErr) {
    return Response.json({ ok: false, error: `Supabase upsert: ${dbErr.message}` }, { status: 500 })
  }

  return Response.json({
    ok: true,
    synced_at: new Date().toISOString(),
    upserted:  rows.length,
    regions:   [...new Set(rows.map(r => r.region_id))].length,
    errors:    errors.length > 0 ? errors : undefined,
  })
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** BCCh returns dates as "01-01-2024" (DD-MM-YYYY). Convert to "2024-01-01". */
function parseBcchDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// ── Types ────────────────────────────────────────────────────────────────────

// BCCh returns Series as a single object (not array) when one series is requested
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
  region_id: number
  metric_name: string
  value: number
  period: string
  source_url: string
  updated_at: string
}
