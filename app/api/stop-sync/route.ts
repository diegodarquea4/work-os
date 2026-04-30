/**
 * Ley S.T.O.P (Carabineros de Chile) sync route
 *
 * Fetches weekly public safety statistics per region from
 * https://leystop.carabineros.cl and upserts into stop_stats.
 *
 * Only syncs weeks newer than the latest stored semana_id (incremental).
 * Session is renewed every 48 requests to avoid WAF blocking.
 *
 * Auth:
 *   GET  — Vercel Cron (x-vercel-cron: 1)
 *   POST — Manual (Authorization: Bearer <CRON_SECRET>)
 *
 * Table: stop_stats (region_id, semana_id) PRIMARY KEY
 * Create SQL in Supabase before first run:
 *   → see /api/stop-sync comments below for CREATE TABLE statement
 *
 * CREATE TABLE stop_stats (
 *   region_id     smallint NOT NULL,
 *   semana_id     int      NOT NULL,
 *   fecha_desde   date     NOT NULL,
 *   fecha_hasta   date     NOT NULL,
 *   controles_total        int, controles_identidad int, controles_vehicular int,
 *   fiscalizaciones        int, fiscal_alcohol       int, fiscal_bancaria     int,
 *   incautaciones          int, incaut_fuego         int, incaut_blancas      int,
 *   decomisos_semana       numeric, decomisos_anno    numeric,
 *   allanamientos_semana   int,     allanamientos_anno int,
 *   vehiculos_rec_semana   int,     vehiculos_rec_anno  int,
 *   casos_total            int,     casos_ultima_semana int,
 *   casos_28dias           int,     casos_anno_fecha    int,
 *   mayor_registro_1 text, pct_1 numeric,
 *   mayor_registro_2 text, pct_2 numeric,
 *   mayor_registro_3 text, pct_3 numeric,
 *   mayor_registro_4 text, pct_4 numeric,
 *   mayor_registro_5 text, pct_5 numeric,
 *   synced_at timestamptz DEFAULT now(),
 *   PRIMARY KEY (region_id, semana_id)
 * );
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { INE_CODE } from '@/lib/regions'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 300

const BASE_URL    = 'https://leystop.carabineros.cl'
const DELAY_MS    = 1200   // ms between requests (WAF)
const RENEW_EVERY = 48     // renew session after N requests
const UA          = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Carabineros region IDs 1-16 (sequential, matching INE_CODE ordering)
// INE_CODE maps our region string codes to region_id 1-16
const REGION_CODS = ['XV','I','II','III','IV','V','RM','VI','VII','XVI','VIII','IX','XIV','X','XI','XII']

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
  const supabase = getSupabaseAdmin()

  // Get latest semana_id already stored to avoid re-processing
  const { data: maxRow } = await supabase
    .from('stop_stats')
    .select('semana_id')
    .order('semana_id', { ascending: false })
    .limit(1)
    .single()

  const latestStored: number = maxRow?.semana_id ?? 0

  // Initialize session — get XSRF token from cookies
  let session = await initSession()
  if (!session) {
    return Response.json({ ok: false, error: 'Failed to initialize session with leystop.carabineros.cl' }, { status: 502 })
  }

  // Fetch available weeks
  let semanas: Semana[]
  try {
    const res = await fetchWithSession('/api/semanas', session)
    semanas   = await res.json() as Semana[]
  } catch (err) {
    return Response.json({ ok: false, error: `Failed to fetch semanas: ${err instanceof Error ? err.message : String(err)}` }, { status: 502 })
  }

  // Only process weeks newer than what we have
  const newSemanas = semanas.filter(s => s.id > latestStored)

  if (newSemanas.length === 0) {
    return Response.json({ ok: true, note: 'Already up to date', latest_semana_id: latestStored })
  }

  const rows: StopRow[]   = []
  const errors: string[]  = []
  let requestCount        = 0

  for (const semana of newSemanas) {
    for (const cod of REGION_CODS) {
      const regionId = INE_CODE[cod]
      if (regionId === undefined) continue

      // Renew session every N requests
      if (requestCount > 0 && requestCount % RENEW_EVERY === 0) {
        const renewed = await initSession()
        if (renewed) session = renewed
      }

      await sleep(DELAY_MS)
      requestCount++

      let stat: StopStat | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetchWithSession(
            `/api/estadistica/${semana.id}/REGION/${regionId}`,
            session,
          )
          if (!res.ok) {
            if (attempt < 2) { await sleep(5000 * (attempt + 1)); continue }
            errors.push(`semana=${semana.id} region=${cod}: HTTP ${res.status}`)
            break
          }
          stat = await res.json() as StopStat
          break
        } catch (err) {
          if (attempt < 2) { await sleep(5000 * (attempt + 1)); continue }
          errors.push(`semana=${semana.id} region=${cod}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      if (!stat) continue

      rows.push({
        region_id:            regionId,
        semana_id:            semana.id,
        fecha_desde:          semana.fecha_desde_iso?.slice(0, 10) ?? semana.fecha_desde,
        fecha_hasta:          semana.fecha_hasta_iso?.slice(0, 10) ?? semana.fecha_hasta,
        controles_total:      stat.controles ?? null,
        controles_identidad:  stat.controles_de_identidad ?? null,
        controles_vehicular:  stat.controles_vehiculares ?? null,
        fiscalizaciones:      stat.fiscalizaciones ?? null,
        fiscal_alcohol:       stat.fiscalizaciones_locales_alcohol ?? null,
        fiscal_bancaria:      stat.fiscalizaciones_entidades_comerciales_bancarias ?? null,
        incautaciones:        stat.incautaciones ?? null,
        incaut_fuego:         stat.incautaciones_armas_fuego ?? null,
        incaut_blancas:       stat.incautaciones_armas_blancas ?? null,
        decomisos_semana:     parseFloatCL(stat.decomisos_ultima_semana),
        decomisos_anno:       parseFloatCL(stat.decomisos_anno_a_la_fecha),
        allanamientos_semana: stat.allanamientos_ultima_semana ?? null,
        allanamientos_anno:   stat.allanamientos_anno_a_la_fecha ?? null,
        vehiculos_rec_semana: stat.vehiculos_recuperados_ultima_semana ?? null,
        vehiculos_rec_anno:   stat.vehiculos_recuperados_anno_a_la_fecha ?? null,
        casos_total:          stat.casos ?? null,
        casos_ultima_semana:  stat.casos_ultima_semana ?? null,
        casos_28dias:         stat.casos_ultimos_28_dias ?? null,
        casos_anno_fecha:     stat.casos_anno_a_la_fecha ?? null,
        mayor_registro_1:     stat.mayor_registro_1_nombre ?? null,
        pct_1:                parseFloatCL(stat.mayor_registro_1_valor),
        mayor_registro_2:     stat.mayor_registro_2_nombre ?? null,
        pct_2:                parseFloatCL(stat.mayor_registro_2_valor),
        mayor_registro_3:     stat.mayor_registro_3_nombre ?? null,
        pct_3:                parseFloatCL(stat.mayor_registro_3_valor),
        mayor_registro_4:     stat.mayor_registro_4_nombre ?? null,
        pct_4:                parseFloatCL(stat.mayor_registro_4_valor),
        mayor_registro_5:     stat.mayor_registro_5_nombre ?? null,
        pct_5:                parseFloatCL(stat.mayor_registro_5_valor),
        synced_at:            new Date().toISOString(),
      })
    }

    // Upsert per week to avoid losing progress if we hit the 5min limit
    if (rows.length >= 16) {
      const batch = rows.splice(0, rows.length)
      const { error: dbErr } = await supabase
        .from('stop_stats')
        .upsert(batch, { onConflict: 'region_id,semana_id' })
      if (dbErr) errors.push(`DB upsert semana ${semana.id}: ${dbErr.message}`)
    }
  }

  // Upsert remaining rows
  if (rows.length > 0) {
    const { error: dbErr } = await supabase
      .from('stop_stats')
      .upsert(rows, { onConflict: 'region_id,semana_id' })
    if (dbErr) errors.push(`DB final upsert: ${dbErr.message}`)
  }

  const totalUpserted = newSemanas.length * REGION_CODS.length - errors.filter(e => e.includes('semana=')).length

  return Response.json({
    ok:            true,
    synced_at:     new Date().toISOString(),
    new_semanas:   newSemanas.length,
    requests_made: requestCount,
    upserted:      totalUpserted,
    errors:        errors.length > 0 ? errors : undefined,
  })
}

// ── Session helpers ───────────────────────────────────────────────────────────

type Session = { cookies: string; xsrf: string }

async function initSession(): Promise<Session | null> {
  try {
    const res = await fetch(`${BASE_URL}/estadistica`, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'es' },
      signal: AbortSignal.timeout(15_000),
    })

    const setCookies = res.headers.getSetCookie?.() ?? []

    let cookieStr = ''
    let xsrf      = ''

    for (const c of setCookies) {
      const [pair] = c.split(';')
      cookieStr += (cookieStr ? '; ' : '') + pair
      const [k, v] = pair.split('=')
      if (k.trim() === 'XSRF-TOKEN') {
        xsrf = decodeURIComponent(v ?? '')
      }
    }

    if (!xsrf) return null
    return { cookies: cookieStr, xsrf }
  } catch {
    return null
  }
}

async function fetchWithSession(path: string, session: Session): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, {
    headers: {
      'User-Agent':       UA,
      'Accept':           'application/json, text/plain, */*',
      'Accept-Language':  'es-US,es-419;q=0.9,es;q=0.8',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN':     session.xsrf,
      'Referer':          `${BASE_URL}/estadistica`,
      'Cookie':           session.cookies,
      'Sec-Fetch-Dest':   'empty',
      'Sec-Fetch-Mode':   'cors',
      'Sec-Fetch-Site':   'same-origin',
    },
    signal: AbortSignal.timeout(15_000),
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Parse numbers that may use comma as decimal separator (e.g. "1,50") */
function parseFloatCL(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? null : n
}

// ── Types ────────────────────────────────────────────────────────────────────

type Semana = {
  id: number
  nombre: string
  anno: number
  semana: number
  fecha_desde: string
  fecha_hasta: string
  fecha_desde_iso?: string
  fecha_hasta_iso?: string
}

type StopStat = {
  controles?: number | null
  controles_de_identidad?: number | null
  controles_vehiculares?: number | null
  fiscalizaciones?: number | null
  fiscalizaciones_locales_alcohol?: number | null
  fiscalizaciones_entidades_comerciales_bancarias?: number | null
  incautaciones?: number | null
  incautaciones_armas_fuego?: number | null
  incautaciones_armas_blancas?: number | null
  decomisos_ultima_semana?: number | string | null
  decomisos_anno_a_la_fecha?: number | string | null
  allanamientos_ultima_semana?: number | null
  allanamientos_anno_a_la_fecha?: number | null
  vehiculos_recuperados_ultima_semana?: number | null
  vehiculos_recuperados_anno_a_la_fecha?: number | null
  casos?: number | null
  casos_ultima_semana?: number | null
  casos_ultimos_28_dias?: number | null
  casos_anno_a_la_fecha?: number | null
  mayor_registro_1_nombre?: string | null
  mayor_registro_1_valor?: number | string | null
  mayor_registro_2_nombre?: string | null
  mayor_registro_2_valor?: number | string | null
  mayor_registro_3_nombre?: string | null
  mayor_registro_3_valor?: number | string | null
  mayor_registro_4_nombre?: string | null
  mayor_registro_4_valor?: number | string | null
  mayor_registro_5_nombre?: string | null
  mayor_registro_5_valor?: number | string | null
}

type StopRow = {
  region_id:            number
  semana_id:            number
  fecha_desde:          string
  fecha_hasta:          string
  controles_total:      number | null
  controles_identidad:  number | null
  controles_vehicular:  number | null
  fiscalizaciones:      number | null
  fiscal_alcohol:       number | null
  fiscal_bancaria:      number | null
  incautaciones:        number | null
  incaut_fuego:         number | null
  incaut_blancas:       number | null
  decomisos_semana:     number | null
  decomisos_anno:       number | null
  allanamientos_semana: number | null
  allanamientos_anno:   number | null
  vehiculos_rec_semana: number | null
  vehiculos_rec_anno:   number | null
  casos_total:          number | null
  casos_ultima_semana:  number | null
  casos_28dias:         number | null
  casos_anno_fecha:     number | null
  mayor_registro_1:     string | null
  pct_1:                number | null
  mayor_registro_2:     string | null
  pct_2:                number | null
  mayor_registro_3:     string | null
  pct_3:                number | null
  mayor_registro_4:     string | null
  pct_4:                number | null
  mayor_registro_5:     string | null
  pct_5:                number | null
  synced_at:            string
}
