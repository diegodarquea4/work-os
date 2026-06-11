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
 *   GET  — Vercel Cron (no se usa hoy — el cron sigue apuntando a la v1)
 *   POST — Manual (Bearer CRON_SECRET)
 *
 * NO cambiar vercel.json hasta que esta ruta demuestre 2-3 corridas
 * limpias contra prod. Para probar:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/seia-sync-v2
 *
 * Etapa 8 de la consolidación backend.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS, INE_CODE } from '@/lib/regions'
import { recordSyncStatus } from '@/lib/syncStatus'

export const dynamic     = 'force-dynamic'
export const runtime     = 'nodejs'
export const maxDuration = 300

const SEIA_URL     = 'https://seia.sea.gob.cl/busqueda/buscarProyectoResumenAction.php'
const PAGE_SIZE    = 100
const SYNC_NAME    = 'seia-v2'
const TIME_BUDGET  = 240_000  // 240s (80% del maxDuration 300s)

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

    try {
      while ((offset - 1) * PAGE_SIZE < totalRecs) {
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
              synced_at: r2.synced_at,
            }))
            const { error: v2Err } = await supabase
              .from('v2_proyectos_inversion')
              .upsert(v2Rows, { onConflict: 'id' })
            if (v2Err) errors.push(`${region.cod} offset=${offset} v2: ${v2Err.message}`)
          }
        }

        offset++
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
