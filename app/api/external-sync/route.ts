/**
 * External data sync route
 *
 * Fetches two data sources from the colleague's GitHub repo and stores them in Supabase:
 *   1. censo_regiones.json  → updates region_metrics (wide format, census 2024 fields)
 *   2. bcn_indicadores.db   → SQLite with LeyStop weekly crime data
 *      - tasa_delictual time series → regional_metrics
 *
 * Auth: same pattern as ine-sync
 *   GET  — Vercel Cron (x-vercel-cron: 1 header)
 *   POST — Manual (Authorization: Bearer <CRON_SECRET>)
 *
 * SQL migration required before first run — see plan file.
 */

import { NextRequest } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { INE_INVERSE } from '@/lib/regions'
import { withSyncStatus } from '@/lib/syncRunner'

// ── v2 mapping: Census fields → v2 indicator codes ──────────────────────────
// Only maps computed census fields that the external-sync calculates (pct_*, etc.)
const CENSUS_V2_MAP: Record<string, string> = {
  poblacion_total:          'DEM_POB_TOTAL',
  pct_hombres:              'DEM_PCT_HOMBRES',
  pct_mujeres:              'DEM_PCT_MUJERES',
  pct_inmigrantes:          'DEM_PCT_INMIGRANTES',
  pct_indigena:             'DEM_PCT_INDIGENA',
  n_inmigrantes:            'DEM_N_INMIGRANTES',
  n_pueblos_orig:           'DEM_N_PUEBLOS_ORIG',
  prom_edad:                'DEM_PROM_EDAD',
  pct_edad_60_mas:          'DEM_PCT_60MAS',
  anios_escolaridad_promedio: 'EDU_ESCOLARIDAD',
  n_discapacidad:           'DEM_N_DISCAPACIDAD',
  n_ocupado:                'EMP_N_OCUP',
  n_desocupado:             'EMP_N_DESOC',
  n_deficit_cuantitativo:   'VIV_DEF_CUANT',
  pct_hacinamiento:         'VIV_HACINAMIENTO',
  pct_acceso_agua_publica:  'VIV_AGUA',
  pct_hogares_internet:     'CON_INTERNET',
  pct_internet_movil:       'CON_INT_MOVIL',
  pct_internet_fijo:        'CON_INT_FIJO',
  pct_jefatura_mujer:       'DEM_PCT_JEF_MUJER',
  pct_educacion_superior:   'EDU_SUPERIOR',
}

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 60

const REPO_RAW = 'https://raw.githubusercontent.com/manuelcarvallo97-tech/dashboard-regional-chile/main'

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const isCron = req.headers.get('x-vercel-cron') === '1'
  if (isCron) return true
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  return !!secret && auth === `Bearer ${secret}`
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('external', runSync)
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return withSyncStatus('external', runSync)
}

// ── Main sync ─────────────────────────────────────────────────────────────────

async function runSync() {
  const sb = getSupabaseAdmin()
  const results: Record<string, unknown> = {}

  // ── Phase A: Census 2024 ──────────────────────────────────────────────────
  try {
    const censoRes = await fetch(`${REPO_RAW}/censo_regiones.json`)
    if (!censoRes.ok) throw new Error(`HTTP ${censoRes.status}`)
    const censoJson = await censoRes.json() as { datos: Record<string, CensoRegion> }
    const datos = censoJson.datos

    let censoCnt = 0
    for (const [key, r] of Object.entries(datos)) {
      const regionId = parseInt(key)
      const regionCod = INE_INVERSE[regionId]
      if (!regionCod) continue

      const safeDiv = (a: number | null | undefined, b: number | null | undefined, scale = 100) =>
        a != null && b != null && b > 0 ? parseFloat(((a / b) * scale).toFixed(4)) : null

      const hacinamiento = safeDiv(r.n_viv_hacinadas, r.n_vp_ocupada)
      const patch: Record<string, number | string | null> = {
        poblacion_total:         r.n_per ?? null,
        pct_hombres:             safeDiv(r.n_hombres, r.n_per),
        pct_mujeres:             safeDiv(r.n_mujeres, r.n_per),
        pct_inmigrantes:         safeDiv(r.n_inmigrantes, r.n_per),
        pct_indigena:            safeDiv(r.n_pueblos_orig, r.n_per),
        n_inmigrantes:           r.n_inmigrantes ?? null,
        n_pueblos_orig:          r.n_pueblos_orig ?? null,
        prom_edad:               r.prom_edad ?? null,
        pct_edad_60_mas:         safeDiv(r.n_edad_60_mas, r.n_per),
        anios_escolaridad_promedio: r.prom_escolaridad18 ?? null,
        n_discapacidad:          r.n_discapacidad ?? null,
        n_ocupado:               r.n_ocupado ?? null,
        n_desocupado:            r.n_desocupado ?? null,
        n_deficit_cuantitativo:  r.n_deficit_cuantitativo ?? null,
        pct_viv_hacinadas:       hacinamiento,
        pct_hacinamiento:        hacinamiento,   // alias leído por IndicadoresModal
        pct_acceso_agua_publica: safeDiv(r.n_fuente_agua_publica, r.n_vp_ocupada),
        pct_hogares_internet:    safeDiv(r.n_internet, r.n_hog),
        pct_internet_movil:      safeDiv(r.n_internet_movil ?? null, r.n_hog),
        pct_internet_fijo:       safeDiv(r.n_internet_fijo  ?? null, r.n_hog),
        pct_jefatura_mujer:      safeDiv(r.n_jefatura_mujer, r.n_hog),
        pct_educacion_superior:  safeDiv(r.n_cine_terciaria_maestria_doctorado, r.n_per),
        censo_updated_at:        new Date().toISOString(),
      }

      const { error } = await sb.from('region_metrics').update(patch).eq('region_cod', regionCod)
      if (error) console.error(`[external-sync] censo ${regionCod}:`, error.message)
      else censoCnt++
    }
    results.census = { regions_updated: censoCnt }
    console.log(`[external-sync] Censo: ${censoCnt} regiones actualizadas`)

    // ── v2 dual-write: census → v2_indicadores_valores ──────────────────
    try {
      const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []
      for (const [key, r] of Object.entries(datos)) {
        const regionId = parseInt(key)
        if (!INE_INVERSE[regionId]) continue

        const safeDiv = (a: number | null | undefined, b: number | null | undefined, scale = 100) =>
          a != null && b != null && b > 0 ? parseFloat(((a / b) * scale).toFixed(4)) : null

        const computed: Record<string, number | null> = {
          poblacion_total: r.n_per ?? null,
          pct_hombres: safeDiv(r.n_hombres, r.n_per),
          pct_mujeres: safeDiv(r.n_mujeres, r.n_per),
          pct_inmigrantes: safeDiv(r.n_inmigrantes, r.n_per),
          pct_indigena: safeDiv(r.n_pueblos_orig, r.n_per),
          n_inmigrantes: r.n_inmigrantes ?? null,
          n_pueblos_orig: r.n_pueblos_orig ?? null,
          prom_edad: r.prom_edad ?? null,
          pct_edad_60_mas: safeDiv(r.n_edad_60_mas, r.n_per),
          anios_escolaridad_promedio: r.prom_escolaridad18 ?? null,
          n_discapacidad: r.n_discapacidad ?? null,
          n_ocupado: r.n_ocupado ?? null,
          n_desocupado: r.n_desocupado ?? null,
          n_deficit_cuantitativo: r.n_deficit_cuantitativo ?? null,
          pct_hacinamiento: safeDiv(r.n_viv_hacinadas, r.n_vp_ocupada),
          pct_acceso_agua_publica: safeDiv(r.n_fuente_agua_publica, r.n_vp_ocupada),
          pct_hogares_internet: safeDiv(r.n_internet, r.n_hog),
          pct_internet_movil: safeDiv(r.n_internet_movil ?? null, r.n_hog),
          pct_internet_fijo: safeDiv(r.n_internet_fijo ?? null, r.n_hog),
          pct_jefatura_mujer: safeDiv(r.n_jefatura_mujer, r.n_hog),
          pct_educacion_superior: safeDiv(r.n_cine_terciaria_maestria_doctorado, r.n_per),
        }

        for (const [field, v2Code] of Object.entries(CENSUS_V2_MAP)) {
          const val = computed[field]
          if (val === null || val === undefined) continue
          v2Rows.push({
            codigo_indicador: v2Code,
            region_id: regionId,
            valor: val,
            periodo: '2024-01-01',
            calidad: 'verificado',
            cargado_por: 'external-sync',
          })
        }
      }

      if (v2Rows.length > 0) {
        for (let i = 0; i < v2Rows.length; i += 500) {
          await sb.from('v2_indicadores_valores')
            .upsert(v2Rows.slice(i, i + 500), { onConflict: 'codigo_indicador,region_id,periodo' })
        }
        sb.rpc('refresh_v2_indicadores_ultimo').then(() => {})
        console.log(`[external-sync] v2 census: ${v2Rows.length} valores`)
      }
    } catch (v2Err) {
      console.error('[external-sync] v2 census error:', v2Err)
    }
  } catch (err) {
    console.error('[external-sync] censo error:', err)
    results.census = { error: String(err) }
  }

  // ── Phase B: LeyStop from SQLite ─────────────────────────────────────────
  try {
    // Load sql.js with bundled WASM from node_modules (reliable in serverless)
    const initSqlJs = (await import('sql.js')).default
    const wasmBuf = readFileSync(
      join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
    )
    const wasmBinary = wasmBuf.buffer.slice(
      wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.byteLength
    ) as ArrayBuffer
    const SQL = await initSqlJs({ wasmBinary })

    // Download SQLite database from GitHub
    console.log('[external-sync] Downloading bcn_indicadores.db...')
    const dbRes = await fetch(`${REPO_RAW}/bcn_indicadores.db`)
    if (!dbRes.ok) throw new Error(`SQLite fetch HTTP ${dbRes.status}`)
    const dbBuf = await dbRes.arrayBuffer()
    console.log(`[external-sync] Downloaded ${(dbBuf.byteLength / 1024 / 1024).toFixed(1)} MB`)

    const db = new SQL.Database(new Uint8Array(dbBuf))

    // ── B1: Time-series for TREND_CONFIG (all weeks from 2024) ──────────────
    const tsResult = db.exec(`
      SELECT id_region, fecha_hasta_iso, tasa_registro
      FROM registros_leystop
      WHERE anno >= 2024 AND tasa_registro IS NOT NULL
      ORDER BY id_region, fecha_hasta_iso
    `)

    let tsRows = 0
    if (tsResult.length > 0) {
      const cols = tsResult[0].columns
      const idxRegion = cols.indexOf('id_region')
      const idxFecha  = cols.indexOf('fecha_hasta_iso')
      const idxTasa   = cols.indexOf('tasa_registro')

      const upsertBatch = (tsResult[0].values as (string | number | null)[][]).map(row => ({
        region_id:   row[idxRegion] as number,
        metric_name: 'tasa_delictual',
        value:       row[idxTasa] as number,
        period:      row[idxFecha] as string,
        source_url:  'https://leystop.carabineros.cl',
        updated_at:  new Date().toISOString(),
      }))

      const { error } = await sb
        .from('regional_metrics')
        .upsert(upsertBatch, { onConflict: 'region_id,metric_name,period' })

      if (error) console.error('[external-sync] leystop time-series:', error.message)
      tsRows = upsertBatch.length
    }

    db.close()

    results.leystop = { time_series_rows: tsRows }
    console.log(`[external-sync] LeyStop: ${tsRows} series`)
  } catch (err) {
    console.error('[external-sync] leystop error:', err)
    results.leystop = { error: String(err) }
  }

  return Response.json({ ok: true, synced_at: new Date().toISOString(), ...results })
}

// ── Census types ──────────────────────────────────────────────────────────────

type CensoRegion = {
  nombre: string
  cod: number
  n_per: number
  n_hombres: number
  n_mujeres: number
  n_edad_0_5: number
  n_edad_6_13: number
  n_edad_14_17: number
  n_edad_18_24: number
  n_edad_25_44: number
  n_edad_45_59: number
  n_edad_60_mas: number
  n_inmigrantes: number
  n_pueblos_orig: number
  n_afrodescendencia: number
  n_discapacidad: number
  n_analfabet: number
  n_cine_terciaria_maestria_doctorado: number
  n_ocupado: number
  n_desocupado: number
  n_fuera_fuerza_trabajo: number
  n_hog: number
  n_vp: number
  n_vp_ocupada: number
  n_vp_desocupada: number
  n_viv_hacinadas: number
  n_deficit_cuantitativo: number
  n_fuente_agua_publica: number
  n_internet: number
  n_internet_movil?: number
  n_internet_fijo?: number
  n_jefatura_mujer: number
  prom_edad: number
  prom_escolaridad18: number
  prom_per_hog: number
}
