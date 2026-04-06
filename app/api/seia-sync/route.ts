/**
 * SEIA (Sistema de Evaluación de Impacto Ambiental) sync route
 *
 * Fetches project data from SEIA's internal search API and upserts into seia_projects.
 * Iterates all 16 regions, paginating at 100 records per page.
 *
 * Auth:
 *   GET  — Vercel Cron (header: x-vercel-cron: 1)
 *   POST — Manual / CI (header: Authorization: Bearer <CRON_SECRET>)
 *
 * SEIA API (undocumented but stable):
 *   POST https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php
 *   Content-Type: application/x-www-form-urlencoded
 *   Response: { data: [...], totalRegistros: "N" }
 *
 * Region mapping: selectRegion uses INE numeric codes (same as INE_CODE).
 * Confirmed 2026-04-06.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS, INE_CODE } from '@/lib/regions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SEIA_URL = 'https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php'
const PAGE_SIZE = 100

// ── Helpers ──────────────────────────────────────────────────────────────────

/** SEIA returns dates as Unix timestamps (seconds). Convert to "YYYY-MM-DD". */
function parseSeiaDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const ts = parseInt(raw, 10)
  if (isNaN(ts)) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

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
  const supabase     = getSupabaseAdmin()
  let   totalUpserted = 0
  const errors: string[] = []

  for (const region of REGIONS) {
    const regionId = INE_CODE[region.cod]
    if (regionId === undefined) {
      errors.push(`No INE_CODE for region ${region.cod}`)
      continue
    }

    let offset    = 1
    let totalRecs = Infinity

    try {
      while ((offset - 1) * PAGE_SIZE < totalRecs) {
        const body = new URLSearchParams({
          nombre: '', titular: '', folio: '',
          selectRegion:    String(regionId),
          selectComuna:    '', tipoPresentacion: '', projectStatus: '',
          PresentacionMin: '', PresentacionMax: '',
          CalificaMin:     '', CalificaMax:     '',
          sectores_economicos: '', razoningreso: '', id_tipoexpediente: '',
          offset:      String(offset),
          limit:       String(PAGE_SIZE),
          orderColumn: 'FECHA_PRESENTACION',
          orderDir:    'desc',
        })

        const res = await fetch(SEIA_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:    body.toString(),
          signal:  AbortSignal.timeout(20_000),
        })

        if (!res.ok) {
          errors.push(`${region.cod} offset=${offset}: HTTP ${res.status}`)
          break
        }

        // SEIA responds in ISO-8859-1 — decode manually before JSON.parse
        const buf  = await res.arrayBuffer()
        const text = new TextDecoder('iso-8859-1').decode(buf)
        const json = JSON.parse(text) as SeiaResponse
        totalRecs  = parseInt(json.totalRegistros ?? '0', 10)

        const pageRows: UpsertRow[] = (json.data ?? []).map(p => {
          const inv = parseFloat(p.INVERSION_MM ?? '')
          return {
            id:                 p.EXPEDIENTE_ID,
            region_id:          regionId,
            nombre:             p.EXPEDIENTE_NOMBRE ?? '',
            tipo:               p.DESCRIPCION_TIPOLOGIA || null,
            estado:             p.ESTADO_PROYECTO      || null,
            titular:            p.TITULAR              || null,
            inversion_mm:       isNaN(inv) ? null : inv,
            fecha_presentacion: parseSeiaDate(p.FECHA_PRESENTACION),
            fecha_plazo:        parseSeiaDate(p.FECHA_PLAZO),
            actividad_actual:   p.ACTIVIDAD_ACTUAL      || null,
            url_ficha:          p.EXPEDIENTE_URL_PPAL   || null,
            synced_at:          new Date().toISOString(),
          }
        })

        if (pageRows.length > 0) {
          const { error: dbErr } = await supabase
            .from('seia_projects')
            .upsert(pageRows, { onConflict: 'id' })
          if (dbErr) {
            errors.push(`${region.cod} offset=${offset}: Supabase: ${dbErr.message}`)
          } else {
            totalUpserted += pageRows.length
          }
        }

        offset++
        if ((json.data ?? []).length < PAGE_SIZE) break   // last page
      }
    } catch (err) {
      errors.push(`${region.cod}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (totalUpserted === 0 && errors.length > 0) {
    return Response.json({ ok: false, errors })
  }

  return Response.json({
    ok:         true,
    synced_at:  new Date().toISOString(),
    upserted:   totalUpserted,
    regions:    REGIONS.length,
    errors:     errors.length > 0 ? errors : undefined,
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

type SeiaResponse = {
  data?: SeiaRawProject[]
  totalRegistros?: string
}

type SeiaRawProject = {
  EXPEDIENTE_ID:        string
  EXPEDIENTE_NOMBRE:    string
  DESCRIPCION_TIPOLOGIA: string
  REGION_NOMBRE:        string
  ESTADO_PROYECTO:      string
  INVERSION_MM:         string
  FECHA_PRESENTACION:   string
  FECHA_PLAZO:          string
  TITULAR:              string
  ACTIVIDAD_ACTUAL:     string
  EXPEDIENTE_URL_PPAL:  string
}

type UpsertRow = {
  id:                 string
  region_id:          number
  nombre:             string
  tipo:               string | null
  estado:             string | null
  titular:            string | null
  inversion_mm:       number | null
  fecha_presentacion: string | null
  fecha_plazo:        string | null
  actividad_actual:   string | null
  url_ficha:          string | null
  synced_at:          string
}
