/**
 * BCCh series discovery endpoint
 *
 * Call this once after adding BCCH_USER + BCCH_PASS to .env.local
 * to find the correct series IDs for regional unemployment.
 *
 * Usage:
 *   GET /api/ine-discover
 *
 * Returns a list of BCCh series matching "desocupacion" with their IDs
 * and descriptions, so you can map them to the SERIES_CONFIG in /api/ine-sync.
 */

import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const BCCH_API = 'https://si3.bcentral.cl/SieteRestWS/SieteRestWS.ashx'

export async function GET(request: NextRequest) {
  // Protect with CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized — add Authorization: Bearer <CRON_SECRET> header' }, { status: 401 })
  }

  const user = process.env.BCCH_USER
  const pass = process.env.BCCH_PASS

  if (!user || !pass) {
    return Response.json({
      error: 'Missing BCCH_USER or BCCH_PASS. Register free at https://si3.bcentral.cl/estadisticas/Principal1/web_services/index.htm and add both to .env.local (and Vercel env vars)',
    }, { status: 503 })
  }

  // Strategy: scrape the BCCh regional unemployment cuadro page and extract
  // series IDs embedded in the page JavaScript/HTML.
  const cuadroUrl = 'https://si3.bcentral.cl/siete/ES/Siete/Cuadro/CAP_EMP_REM_DEM/MN_EMP_REM_DEM13/ED_TDNRM2'

  let html = ''
  try {
    const res = await fetch(cuadroUrl, {
      headers: { 'Accept-Language': 'es', 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(15_000),
    })
    html = await res.text()
  } catch (err) {
    return Response.json({ error: `Could not fetch BCCh cuadro page: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  // Extract series IDs — BCCh embeds them in JS as strings like "F049.XXX.YYY..."
  // or in data attributes. Try multiple patterns.
  const seriesPattern = /['"](F\d{3}\.[A-Z0-9.]{6,})['"]/g
  const found = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = seriesPattern.exec(html)) !== null) {
    if (m[1].split('.').length >= 4) found.add(m[1])
  }

  // Also look for series IDs in JSON blobs inside <script> tags
  const scriptPattern = /"seriesId"\s*:\s*"([^"]+)"/g
  while ((m = scriptPattern.exec(html)) !== null) found.add(m[1])

  const seriesIds = Array.from(found)

  if (seriesIds.length === 0) {
    const excerpt = html.slice(0, 3000).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    return Response.json({ found_count: 0, series: [], html_excerpt: excerpt })
  }

  // Call each candidate individually (BCCh API does not support multiple IDs per call)
  const confirmed: { seriesId: string; descripEsp: string }[] = []

  for (const id of seriesIds) {
    const url = `${BCCH_API}?user=${encodeURIComponent(user)}&pass=${encodeURIComponent(pass)}&timeseries=${id}&firstdate=2024-01-01&lastdate=2024-04-01&type=json`
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const data = await res.json() as {
        Codigo: number
        Series?: { seriesId: string; descripEsp: string }
      }
      if (data.Codigo === 0 && data.Series?.seriesId) {
        confirmed.push({ seriesId: data.Series.seriesId, descripEsp: data.Series.descripEsp })
      }
    } catch { /* skip */ }
  }

  return Response.json({
    found_count: confirmed.length,
    series: confirmed,
    next_step: 'Map each seriesId to its region cod (use descripEsp to identify the region) and update SERIES_CONFIG in app/api/ine-sync/route.ts',
  })
}
