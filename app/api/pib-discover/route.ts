/**
 * BCCh sectoral PIB series discovery
 *
 * Uses the BCCh SearchSeries API to find regional PIB-by-industry series.
 * Run once, copy the IDs to pib-sync/route.ts SERIES_CONFIG.
 *
 * Usage:
 *   GET /api/pib-discover   (Authorization: Bearer <CRON_SECRET>)
 */

import { NextRequest } from 'next/server'

export const dynamic    = 'force-dynamic'
export const runtime    = 'nodejs'
export const maxDuration = 60

const BCCH_API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

// Known prefix for BCCh regional PIB series (base 2018)
// Full PIB (no sector breakdown): F035.PIB.FLU.R.CLP.2018.Z.Z.Z.{01-16}.0.T
// Sectoral PIB: F035.PIB.FLU.R.CLP.2018.{SECTOR}.Z.Z.{01-16}.0.T
const PIB_SERIES_PREFIX = 'F035.PIB.FLU.R.CLP.2018'

export async function GET(request: NextRequest) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = process.env.BCCH_USER
  const pass = process.env.BCCH_PASS
  if (!user || !pass) {
    return Response.json({ error: 'Missing BCCH_USER or BCCH_PASS' }, { status: 503 })
  }

  // Search for all regional PIB series using the series prefix pattern
  const queries = [
    'PIB regional industria 2018',
    'producto interno bruto regional actividad',
    'PIB regional sector',
  ]

  const allSeries: SearchResult[] = []
  const seenIds = new Set<string>()

  for (const q of queries) {
    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&function=SearchSeries&q=${encodeURIComponent(q)}&type=json`
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(15_000) })
      const data = await res.json() as SearchResponse
      if (data.Codigo === 0 && Array.isArray(data.SeriesBusqueda)) {
        for (const s of data.SeriesBusqueda) {
          if (!seenIds.has(s.seriesId)) {
            seenIds.add(s.seriesId)
            allSeries.push(s)
          }
        }
      }
    } catch { /* skip */ }
  }

  // Filter to regional PIB sectorial series only
  const pibSectorial = allSeries.filter(s =>
    s.seriesId.startsWith(PIB_SERIES_PREFIX) &&
    // exclude total (all-sector) series: ...Z.Z.Z...
    !s.seriesId.includes('.Z.Z.Z.') &&
    // must have a numeric region code (01–16) in it
    /\.\d{2}\.0\.T$/.test(s.seriesId)
  )

  // Also collect unique sector codes found
  const sectorCodes = [...new Set(
    pibSectorial.map(s => {
      // Extract sector portion: F035.PIB.FLU.R.CLP.2018.{SECTOR}.Z.Z.{NN}.0.T
      const parts = s.seriesId.split('.')
      return parts[6] ?? 'unknown'
    })
  )].sort()

  return Response.json({
    found_count:    pibSectorial.length,
    total_searched: allSeries.length,
    sector_codes:   sectorCodes,
    series:         pibSectorial.map(s => ({
      seriesId:   s.seriesId,
      descripEsp: s.descripEsp,
      frecuencia: s.frecuencia,
    })),
    next_step: 'Copy seriesId values into SERIES_CONFIG in app/api/pib-sync/route.ts',
  })
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SearchResult = {
  seriesId:   string
  descripEsp: string
  frecuencia: string
}

type SearchResponse = {
  Codigo:           number
  Descripcion:      string
  SeriesBusqueda?:  SearchResult[]
}
