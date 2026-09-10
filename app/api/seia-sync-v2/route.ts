/**
 * SEIA sync v2 — troceado reanudable.
 *
 * Cubre el hallazgo 6.6 de la auditoría: el sync original tarda ~340s
 * pero el techo de Vercel (maxDuration) es 300s. Cuando se acerca al
 * límite, la función se mata sin commit del cursor — quedando sync_status
 * congelado y datos parciales. Es lo que disparó el incidente "53 días
 * de silencio" (2026-04).
 *
 * Estrategia:
 *   - Mismo upsert que seia-sync original (seia_projects + dual-write
 *     v2_proyectos_inversion). Misma tabla destino. Cero cambio de schema.
 *   - Loop por región × página, con check de presupuesto de tiempo en
 *     cada página: corta limpio a 240s (80% de maxDuration).
 *   - Cursor persiste en sync_status.notes como JSON. Al reanudar, lee
 *     el cursor y arranca donde quedó.
 *   - Al terminar TODAS las regiones, limpia el cursor y reporta 'ok'.
 *   - Si corta a mitad, reporta status='partial' y next='continue' —
 *     el cron puede invocar 2-3 veces hasta que termine.
 *
 * Auth:
 *   GET  — Cron (GitHub Actions, lunes 8:30 — ver .github/workflows/cron-syncs.yml)
 *   POST — Manual (Bearer CRON_SECRET)
 *
 * OJO con la paginación — tenía DOS fallas que se tapaban entre sí, y juntas
 * dejaban al sync trayendo ~14% de la fuente sin reportar ningún error
 * (arregladas 2026-09, verificadas contra la API):
 *
 *   1. `offset` NO es un número de página: avanza de a 10 FILAS por unidad,
 *      sea cual sea el `limit`. Con limit=100 y `offset++`, cada vuelta
 *      releía 90 de las 100 filas anteriores. La página siguiente está 10
 *      unidades más allá (OFFSET_STEP).
 *   2. El buscador informa `totalRegistros` SOLO en la primera página; de la
 *      segunda en adelante devuelve "0". El loop tomaba ese 0 como total y
 *      cortaba a la tercera vuelta.
 *
 * Como salía por la condición del while y no por error, el sync grababa 'ok'
 * con el cursor limpio: silencio total. Tarapacá terminaba con ~113 de 823
 * expedientes. Ahora el total solo se toma cuando viene con valor, y el fin
 * real de la paginación lo marca la página incompleta.
 *
 * Cobertura de campos: el buscador devuelve 25 campos por expediente y se
 * guardan todos los útiles (mig 104). Lo que NO está y no hay que buscar acá:
 * mano de obra y vida útil viven dentro del EIA/DIA como documento, y el
 * estado de EJECUCIÓN (construcción / operación) no existe en el SEIA — su
 * vocabulario termina en la calificación ambiental. Eso se responde con SNIFA.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS, INE_CODE } from '@/lib/regions'
import { recordSyncStatus } from '@/lib/syncStatus'
import { isCronAuthorized } from '@/lib/cronAuth'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 300

const SEIA_URL     = 'https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php'
const PAGE_SIZE    = 100
const SYNC_NAME    = 'seia-v2'
const TIME_BUDGET  = 240_000  // 240s (80% del maxDuration 300s)
// `offset` del buscador del SEIA NO es un número de página: avanza de a 10
// FILAS por unidad, sea cual sea el `limit`. Verificado contra la API
// (2026-09): offset=1 y offset=2 comparten 90 de 100 filas; offset=1 y
// offset=11 no comparten ninguna. Con limit=100, la página siguiente está
// 10 unidades más allá.
const OFFSET_ROWS  = 10
const OFFSET_STEP  = PAGE_SIZE / OFFSET_ROWS   // 10
// Tope duro de páginas por región (~5.000 expedientes). La región más grande
// ronda los 1.000, así que nunca debería alcanzarse: está para que un SEIA
// que devuelva páginas llenas para siempre no deje el loop girando.
const MAX_PAGES    = 50

// ── Cursor ────────────────────────────────────────────────────────────────────
// Persistido en sync_status.notes como JSON. Forma:
//   { region_idx: number, offset: number }
// region_idx = índice 0..15 en REGIONS (no es region_id ni cod).
// offset = página de SEIA pendiente (1-based, como en la API original).

type Cursor = { region_idx: number; offset: number }

async function readCursor(db: ReturnType<typeof getSupabaseAdmin>): Promise<Cursor> {
  const { data } = await db
    .from('sync_status')
    .select('notes')
    .eq('name', SYNC_NAME)
    .maybeSingle()
  if (!data?.notes) return { region_idx: 0, offset: 1 }
  try {
    const parsed = JSON.parse(data.notes as string) as Cursor
    if (typeof parsed.region_idx === 'number' && typeof parsed.offset === 'number') {
      return parsed
    }
  } catch { /* fall-through */ }
  return { region_idx: 0, offset: 1 }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseSeiaDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const ts = parseInt(raw, 10)
  if (isNaN(ts)) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

// ── Core ──────────────────────────────────────────────────────────────────────

async function runSync(): Promise<Response> {
  const supabase  = getSupabaseAdmin()
  const startedAt = Date.now()
  let   totalUpserted = 0
  const errors: string[] = []

  // 1. Leer cursor.
  const cursor = await readCursor(supabase)
  const startRegion = cursor.region_idx
  let startOffset   = cursor.offset

  let exhaustedByBudget = false
  let finalRegionIdx = startRegion
  let finalOffset    = startOffset

  for (let r = startRegion; r < REGIONS.length; r++) {
    const region   = REGIONS[r]
    const regionId = INE_CODE[region.cod]
    if (regionId === undefined) {
      errors.push(`No INE_CODE for region ${region.cod}`)
      // Avanzamos la región igual — no se queda atascada.
      startOffset = 1
      continue
    }

    let offset = r === startRegion ? startOffset : 1
    let totalRecs = Infinity
    let paginas = 0

    try {
      // Filas ya consumidas antes de esta página = (offset - 1) * OFFSET_ROWS.
      while ((offset - 1) * OFFSET_ROWS < totalRecs && paginas < MAX_PAGES) {
        paginas++
        // Check de presupuesto de tiempo ANTES de la página.
        if (Date.now() - startedAt > TIME_BUDGET) {
          exhaustedByBudget = true
          finalRegionIdx = r
          finalOffset    = offset
          break
        }

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

        const buf  = await res.arrayBuffer()
        const text = new TextDecoder('iso-8859-1').decode(buf)
        const json = JSON.parse(text) as SeiaResponse

        // El SEIA informa `totalRegistros` SOLO en la primera página; de la
        // segunda en adelante devuelve "0". Pisar `totalRecs` con ese 0 hacía
        // que la condición del while (`200 < 0`) cortara el loop en la página
        // 3 — cada región quedaba topada en 200 expedientes y el sync
        // terminaba "ok", sin error ni cursor pendiente. Por eso Tarapacá
        // tenía 113 filas guardadas de 823 disponibles.
        // Solo se toma el total cuando viene con valor; el fin real de la
        // paginación lo marca la página incompleta (break de más abajo).
        const totalReportado = parseInt(json.totalRegistros ?? '0', 10)
        if (totalReportado > 0) totalRecs = totalReportado

        const pageRows: UpsertRow[] = (json.data ?? []).map(p => {
          const inv  = parseFloat(p.INVERSION_MM ?? '')
          const dias = parseInt(p.DIAS_LEGALES ?? '', 10)
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
            // Campos que el buscador ya devolvía y se estaban descartando
            // (mig 104): ubicación, vía de ingreso y estado del trámite.
            comuna_nombre:      p.COMUNA_NOMBRE         || null,
            region_nombre:      p.REGION_NOMBRE         || null,
            via_ingreso:        p.WORKFLOW_DESCRIPCION  || null,
            razon_ingreso:      p.RAZON_INGRESO         || null,
            tipo_proyecto:      p.TIPO_PROYECTO         || null,
            suspendido:         p.SUSPENDIDO            || null,
            dias_legales:       isNaN(dias) ? null : dias,
            url_detalle:        p.EXPEDIENTE_URL_FICHA  || null,
            // LINK_MAPA llega como objeto {SHOW, URL}; solo sirve con SHOW.
            url_mapa:           p.LINK_MAPA?.SHOW && p.LINK_MAPA.URL
              ? new URL(p.LINK_MAPA.URL, 'https://seia.sea.gob.cl').toString()
              : null,
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
            // v2 dual-write → v2_proyectos_inversion
            const v2Rows = pageRows.map(r2 => ({
              id: `seia_${r2.id}`,
              region_id: r2.region_id,
              sistema_origen: 'seia' as const,
              nombre: r2.nombre,
              tipo: r2.tipo,
              estado: r2.estado,
              titular: r2.titular,
              etapa: null,
              inversion: r2.inversion_mm,
              moneda: 'USD_MM' as const,
              fecha_presentacion: r2.fecha_presentacion,
              url_ficha: r2.url_ficha,
              // Antes se quedaban en seia_projects y no llegaban a la tabla
              // que consume la app (mig 104).
              comuna_nombre: r2.comuna_nombre,
              via_ingreso: r2.via_ingreso,
              suspendido: r2.suspendido,
              fecha_plazo: r2.fecha_plazo,
              actividad_actual: r2.actividad_actual,
              url_mapa: r2.url_mapa,
              synced_at: r2.synced_at,
            }))
            const { error: v2Err } = await supabase
              .from('v2_proyectos_inversion')
              .upsert(v2Rows, { onConflict: 'id' })
            if (v2Err) errors.push(`${region.cod} offset=${offset} v2: ${v2Err.message}`)
          }
        }

        offset += OFFSET_STEP
        if ((json.data ?? []).length < PAGE_SIZE) break  // última página
      }
    } catch (err) {
      errors.push(`${region.cod}: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (exhaustedByBudget) break

    // Región completa — al avanzar a la siguiente, offset arranca en 1.
    startOffset = 1
  }

  const durationMs = Date.now() - startedAt

  // 2. Persistir resultado + cursor.
  if (exhaustedByBudget) {
    // Quedamos a medias. Guardamos cursor para reanudar en próxima invocación.
    const nextCursor: Cursor = { region_idx: finalRegionIdx, offset: finalOffset }
    await recordSyncStatus(SYNC_NAME, {
      status:   'partial',
      durationMs,
      rows:     totalUpserted,
      errors:   errors.length > 0 ? errors : undefined,
      notes:    JSON.stringify(nextCursor),
    })
    return Response.json({
      ok:          true,
      partial:     true,
      next:        'continue',
      next_cursor: nextCursor,
      synced_at:   new Date().toISOString(),
      upserted:    totalUpserted,
      duration_ms: durationMs,
      errors:      errors.length > 0 ? errors : undefined,
      note:        'Presupuesto agotado, reinvocar para continuar.',
    })
  }

  // 3. Terminamos todas las regiones — limpiar cursor y reportar ok.
  const finalStatus: 'ok' | 'partial' | 'error' =
    totalUpserted === 0 && errors.length > 0 ? 'error'
    : errors.length > 0 ? 'partial'
    : 'ok'

  await recordSyncStatus(SYNC_NAME, {
    status:   finalStatus,
    durationMs,
    rows:     totalUpserted,
    errors:   errors.length > 0 ? errors : undefined,
    notes:    '',  // limpiar cursor — terminó.
  })

  if (finalStatus === 'error') return Response.json({ ok: false, errors })

  return Response.json({
    ok:          true,
    partial:     false,
    synced_at:   new Date().toISOString(),
    upserted:    totalUpserted,
    regions:     REGIONS.length,
    duration_ms: durationMs,
    errors:      errors.length > 0 ? errors : undefined,
  })
}

// ── Types ────────────────────────────────────────────────────────────────────

type SeiaResponse = {
  data?: SeiaProject[]
  totalRegistros?: string
}

type SeiaProject = {
  EXPEDIENTE_ID:          string
  EXPEDIENTE_NOMBRE?:     string
  DESCRIPCION_TIPOLOGIA?: string
  ESTADO_PROYECTO?:       string
  TITULAR?:               string
  INVERSION_MM?:          string
  FECHA_PRESENTACION?:    string
  FECHA_PLAZO?:           string
  ACTIVIDAD_ACTUAL?:      string
  EXPEDIENTE_URL_PPAL?:   string
  // Devueltos por el buscador y guardados desde la mig 104.
  EXPEDIENTE_URL_FICHA?:  string
  COMUNA_NOMBRE?:         string
  REGION_NOMBRE?:         string
  WORKFLOW_DESCRIPCION?:  string
  RAZON_INGRESO?:         string
  TIPO_PROYECTO?:         string
  SUSPENDIDO?:            string
  DIAS_LEGALES?:          string
  LINK_MAPA?:             { SHOW?: boolean; URL?: string }
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
  comuna_nombre:      string | null
  region_nombre:      string | null
  via_ingreso:        string | null
  razon_ingreso:      string | null
  tipo_proyecto:      string | null
  suspendido:         string | null
  dias_legales:       number | null
  url_detalle:        string | null
  url_mapa:           string | null
  synced_at:          string
}
