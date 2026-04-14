/**
 * BCCh sectoral PIB series discovery
 *
 * Scrapes the BCCh CCNN2018 regional PIB by industry cuadro to extract
 * series IDs. Run this once, copy the IDs to pib-sync/route.ts SERIES_CONFIG.
 *
 * Usage:
 *   GET /api/pib-discover   (Authorization: Bearer <CRON_SECRET>)
 */

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BCCH_API  = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

// BCCh cuadros for regional PIB by economic sector (annual, base 2018)
const CUADROS = [
  'https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_CCNN2018/MN_CCNN2018/CCNN2018_PIB_REGIONAL_INDUSTRIA_T',
  'https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_CCNN2018/MN_CCNN2018/CCNN2018_PIB_REGIONAL_INDUSTRIA',
]

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

  const candidateIds = new Set<string>()

  for (const cuadroUrl of CUADROS) {
    try {
      const res = await fetch(cuadroUrl, {
        headers: { 'Accept-Language': 'es', 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15_000),
      })
      const html = await res.text()

      // Extract embedded series IDs from BCCh cuadro page
      const patterns = [
        /['"](F\d{3}\.[A-Z0-9.]{8,})['"]/g,
        /"seriesId"\s*:\s*"([^"]+)"/g,
        /timeseries=([A-Z0-9.]+)&/g,
      ]
      for (const pat of patterns) {
        let m: RegExpExecArray | null
        while ((m = pat.exec(html)) !== null) {
          if (m[1].split('.').length >= 4) candidateIds.add(m[1])
        }
      }
    } catch { /* skip failed cuadros */ }
  }

  if (candidateIds.size === 0) {
    return Response.json({
      found_count: 0,
      series: [],
      note: 'No series IDs found in BCCh cuadro pages. Try the SearchSeries API function.',
      search_hint: `${BCCH_API}?user=USER&pass=PASS&function=SearchSeries&frequency=ANNUAL&type=json`,
    })
  }

  // Validate candidates against BCCh API — keep only those that return data
  const confirmed: { seriesId: string; descripEsp: string; frecuencia: string }[] = []
  const firstdate = '2020-01-01'
  const lastdate  = new Date().toISOString().slice(0, 10)

  for (const id of Array.from(candidateIds).slice(0, 100)) { // cap at 100
    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&timeseries=${id}&firstdate=${firstdate}&lastdate=${lastdate}&type=json`
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const data = await res.json() as {
        Codigo: number
        Series?: { seriesId: string; descripEsp: string; frecuencia: string }
      }
      if (data.Codigo === 0 && data.Series?.seriesId) {
        confirmed.push({
          seriesId:  data.Series.seriesId,
          descripEsp: data.Series.descripEsp,
          frecuencia: data.Series.frecuencia,
        })
      }
    } catch { /* skip */ }
  }

  // Filter to PIB-related series
  const pibSeries = confirmed.filter(s =>
    /pib|producto|industria|minería|mining|manufactur|construc|comercio|servicio/i.test(s.descripEsp)
  )

  return Response.json({
    found_count:  pibSeries.length,
    total_checked: candidateIds.size,
    series: pibSeries,
    next_step: 'Copy the seriesId values that match regional PIB sectors into SERIES_CONFIG in app/api/pib-sync/route.ts',
  })
}
