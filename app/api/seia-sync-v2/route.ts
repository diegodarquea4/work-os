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
 *
 * UNA CORRIDA NO ALCANZA, y es por diseño. Medido contra el SEIA real: el
 * universo filtrado son ~1.350 expedientes en 10 regiones y tarda 383s, sobre
 * un presupuesto de 240s. Además el SEIA corta la conexión alrededor de los 40
 * requests seguidos. Por eso TODO corte —tiempo agotado, HTTP != ok o
 * conexión caída— guarda el cursor y devuelve `partial:true`: quien dispara
 * esta ruta debe reinvocarla hasta recibir `partial:false`. Un fallo de red
 * NUNCA debe dejar una pasada por terminada: era justamente así como el sync
 * cerraba 'ok' con regiones a medias.
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS, INE_CODE } from '@/lib/regions'
import { recordSyncStatus } from '@/lib/syncStatus'
import { isCronAuthorized } from '@/lib/cronAuth'
import { requireAuth, requireCan } from '@/lib/apiAuth'

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

// ── Universo que se sigue ────────────────────────────────────────────────────
// El espejo NO trae los ~30.000 expedientes del SEIA: trae solo los que el
// comité puede seguir. Dos recortes, ambos aplicados EN EL ORIGEN (el buscador
// los soporta), que dejan la corrida en ~1 página por región en vez de 9:
//
//   · Por estado — `projectStatus` (códigos del formulario del SEIA). Quedan
//     fuera Caducado, Abandonado, Revocado, Renuncia RCA, Rechazado,
//     Desistido, No Admitido y No calificado: ninguno va a ejecutarse.
//   · Por antigüedad de la RCA — `CalificaMin` a 5 años. Una RCA caduca si el
//     proyecto no se inicia en ese plazo (art. 25 ter Ley 19.300), así que un
//     aprobado más viejo ya venció.
//
// El corte por fecha NO aplica a lo que sigue en evaluación: todavía no tiene
// RCA, y `CalificaMin` justamente los excluye. Por eso son pasadas separadas.
const ESTADO_APROBADO       = '4'
const ESTADO_EN_CALIFICACION = '3'
const ESTADO_EN_ADMISION     = '2'
const ANIOS_VIGENCIA_RCA     = 5

/** dd/mm/aaaa — formato que espera el buscador en CalificaMin. */
function fechaCorteRca(): string {
  const h = new Date()
  const c = new Date(h.getFullYear() - ANIOS_VIGENCIA_RCA, h.getMonth(), h.getDate())
  return `${String(c.getDate()).padStart(2, '0')}/${String(c.getMonth() + 1).padStart(2, '0')}/${c.getFullYear()}`
}

/**
 * Las pasadas por región. Cada una es una búsqueda distinta contra el SEIA y
 * se pagina por separado.
 */
function pasadas(): { nombre: string; projectStatus: string; calificaMin: string }[] {
  const corte = fechaCorteRca()
  return [
    // Con RCA vigente: aprobados calificados dentro de la ventana.
    { nombre: 'aprobado-vigente', projectStatus: ESTADO_APROBADO, calificaMin: corte },
    // Sin RCA todavía: siguen en evaluación, no tienen fecha de calificación.
    { nombre: 'en-calificacion',  projectStatus: ESTADO_EN_CALIFICACION, calificaMin: '' },
    { nombre: 'en-admision',      projectStatus: ESTADO_EN_ADMISION,     calificaMin: '' },
  ]
}
// Tope duro de páginas por región (~5.000 expedientes). La región más grande
// ronda los 1.000, así que nunca debería alcanzarse: está para que un SEIA
// que devuelva páginas llenas para siempre no deje el loop girando.
const MAX_PAGES    = 50

// ── Cursor ────────────────────────────────────────────────────────────────────
// Persistido en sync_status.notes como JSON. Forma:
//   { region_idx: number, pasada_idx: number, offset: number }
// region_idx = índice 0..15 en REGIONS (no es region_id ni cod).
// pasada_idx = índice en pasadas() — cada región se recorre 3 veces.
// offset = offset del buscador pendiente (1-based; avanza de a OFFSET_STEP).
// Los cursores viejos {region_idx, offset} se leen igual: pasada_idx cae en 0.

type Cursor = { region_idx: number; pasada_idx: number; offset: number }

const CURSOR_INICIAL: Cursor = { region_idx: 0, pasada_idx: 0, offset: 1 }

async function readCursor(db: ReturnType<typeof getSupabaseAdmin>): Promise<Cursor> {
  const { data } = await db
    .from('sync_status')
    .select('notes')
    .eq('name', SYNC_NAME)
    .maybeSingle()
  if (!data?.notes) return { ...CURSOR_INICIAL }
  try {
    const parsed = JSON.parse(data.notes as string) as Partial<Cursor>
    if (typeof parsed.region_idx === 'number' && typeof parsed.offset === 'number') {
      return {
        region_idx: parsed.region_idx,
        pasada_idx: typeof parsed.pasada_idx === 'number' ? parsed.pasada_idx : 0,
        offset:     parsed.offset,
      }
    }
  } catch { /* fall-through */ }
  return { ...CURSOR_INICIAL }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Una consulta al buscador, con un reintento ante corte de conexión. La espera
 * es corta a propósito: el presupuesto de tiempo del sync es de 240s y lo que
 * no alcance queda en el cursor para la reinvocación, así que no vale la pena
 * insistir mucho acá.
 */
async function fetchConReintento(body: string): Promise<Response> {
  const pedir = () => fetch(SEIA_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal:  AbortSignal.timeout(20_000),
  })
  try {
    return await pedir()
  } catch {
    await new Promise(r => setTimeout(r, 3_000))
    return pedir()   // si vuelve a fallar, propaga: lo toma el catch de la pasada
  }
}

function parseSeiaDate(raw: string | undefined | null): string | null {
  if (!raw) return null
  const ts = parseInt(raw, 10)
  if (isNaN(ts)) return null
  return new Date(ts * 1000).toISOString().slice(0, 10)
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Dos formas de entrar, y la diferencia importa:
 *
 *   · Sin `?region=` — la corrida nacional del cron. Recorre las 16 regiones
 *     con cursor reanudable y exige el CRON_SECRET.
 *   · Con `?region=<cod>` — el botón "Actualizar" del catálogo. Recorre UNA
 *     región completa, cabe de sobra en el presupuesto de tiempo, y lo puede
 *     disparar una persona con `comite.economico.operar` en esa región.
 *
 * La corrida por región **no toca el cursor nacional**: si lo hiciera, alguien
 * apretando el botón en Tarapacá le borraría al cron el avance de las otras
 * quince, y el sync volvería a mentir sobre lo que alcanzó a traer.
 */
async function autorizar(request: NextRequest): Promise<
  { ok: true; regionCod: string | null } | { ok: false; status: number; error: string }
> {
  const regionCod = new URL(request.url).searchParams.get('region')

  if (!regionCod) {
    return isCronAuthorized(request)
      ? { ok: true, regionCod: null }
      : { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (!REGIONS.some(r => r.cod === regionCod)) {
    return { ok: false, status: 400, error: `Región desconocida: ${regionCod}` }
  }

  // El cron también puede pedir una región puntual (útil para reparar una sola).
  if (isCronAuthorized(request)) return { ok: true, regionCod }

  const profile = await requireAuth()
  if (!profile) return { ok: false, status: 401, error: 'Unauthorized' }
  if (!(await requireCan(profile, 'comite.economico.operar', regionCod))) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, regionCod }
}

export async function GET(request: NextRequest) {
  const auth = await autorizar(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  return runSync(auth.regionCod)
}

export async function POST(request: NextRequest) {
  const auth = await autorizar(request)
  if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status })
  return runSync(auth.regionCod)
}

// ── Core ──────────────────────────────────────────────────────────────────────

async function runSync(soloRegionCod: string | null = null): Promise<Response> {
  const supabase  = getSupabaseAdmin()
  const startedAt = Date.now()
  let   totalUpserted = 0
  const errors: string[] = []

  // 1. Leer cursor — solo en la corrida nacional. Una corrida de una región no
  // lee ni escribe el cursor: es un recorrido completo y acotado, y pisarlo le
  // borraría al cron el avance de las otras quince.
  const soloRegionIdx = soloRegionCod
    ? REGIONS.findIndex(r => r.cod === soloRegionCod)
    : -1
  const cursor = soloRegionCod
    ? { region_idx: soloRegionIdx, pasada_idx: 0, offset: 1 }
    : await readCursor(supabase)
  const startRegion = cursor.region_idx
  const finRegion   = soloRegionCod ? soloRegionIdx + 1 : REGIONS.length
  const PASADAS = pasadas()
  // Marca de esta corrida: las filas que la ventana móvil de 5 años deja de
  // devolver conservan la marca vieja, y por ahí se detectan las RCA vencidas
  // sin necesidad de guardar la fecha de calificación (que el SEIA no expone).
  const vistoEnVentanaAt = new Date().toISOString()

  let exhaustedByBudget = false
  let finalRegionIdx = startRegion
  let finalPasadaIdx = cursor.pasada_idx
  let finalOffset    = cursor.offset

  regiones:
  for (let r = startRegion; r < finRegion; r++) {
    const region   = REGIONS[r]
    const regionId = INE_CODE[region.cod]
    if (regionId === undefined) {
      errors.push(`No INE_CODE for region ${region.cod}`)
      continue
    }

    // Al reanudar, la primera región retoma en su pasada; las siguientes en 0.
    const desdePasada = r === startRegion ? cursor.pasada_idx : 0

    for (let q = desdePasada; q < PASADAS.length; q++) {
      const pasada = PASADAS[q]
      // Solo la pasada donde quedó el cursor retoma su offset.
      let offset = (r === startRegion && q === cursor.pasada_idx) ? cursor.offset : 1
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
          finalPasadaIdx = q
          finalOffset    = offset
          break regiones
        }

        const body = new URLSearchParams({
          nombre: '', titular: '', folio: '',
          selectRegion:    String(regionId),
          selectComuna:    '', tipoPresentacion: '',
          // Recorte por estado y por vigencia de la RCA, en el origen.
          projectStatus:   pasada.projectStatus,
          PresentacionMin: '', PresentacionMax: '',
          CalificaMin:     pasada.calificaMin, CalificaMax: '',
          sectores_economicos: '', razoningreso: '', id_tipoexpediente: '',
          offset:      String(offset),
          limit:       String(PAGE_SIZE),
          orderColumn: 'FECHA_PRESENTACION',
          orderDir:    'desc',
        })

        // El SEIA corta la conexión cuando recibe muchas consultas seguidas
        // (medido: alrededor de los 40 requests). Un reintento con espera
        // recupera la mayoría de esos cortes; si igual falla, el catch de más
        // abajo guarda el cursor y la reinvocación retoma en esta página.
        const res = await fetchConReintento(body.toString())

        if (!res.ok) {
          // NO seguir de largo: una pasada que se corta por HTTP quedaría
          // incompleta y el sync la daría por buena. Se guarda el cursor acá
          // y la próxima invocación la retoma desde esta misma página.
          errors.push(`${region.cod}/${pasada.nombre} offset=${offset}: HTTP ${res.status}`)
          exhaustedByBudget = true
          finalRegionIdx = r
          finalPasadaIdx = q
          finalOffset    = offset
          break regiones
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
            visto_en_ventana_at: vistoEnVentanaAt,
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
      // Igual que el HTTP != ok: el SEIA corta la conexión cuando se le hacen
      // muchas consultas seguidas (medido: ~40 requests). Sin esto, la pasada
      // se daba por terminada y el sync cerraba 'ok' con la región a medias.
      errors.push(`${region.cod}/${pasada.nombre} offset=${offset}: ${err instanceof Error ? err.message : String(err)}`)
      exhaustedByBudget = true
      finalRegionIdx = r
      finalPasadaIdx = q
      finalOffset    = offset
      break regiones
    }
    }  // fin pasada
  }  // fin región

  const durationMs = Date.now() - startedAt

  // 2. Persistir resultado + cursor.
  //
  // Una corrida de una sola región NO escribe `sync_status`: ese registro y su
  // cursor son de la corrida nacional. Guardar acá un cursor apuntando a la
  // región de quien apretó el botón haría que el cron siguiente arrancara desde
  // ahí y diera por hechas las anteriores — el mismo silencio que este endpoint
  // dejó de tener. El resultado se le informa a quien apretó, y nada más.
  if (exhaustedByBudget) {
    const nextCursor: Cursor = { region_idx: finalRegionIdx, pasada_idx: finalPasadaIdx, offset: finalOffset }
    if (soloRegionCod) {
      return Response.json({
        ok:          true,
        partial:     true,
        region:      soloRegionCod,
        synced_at:   new Date().toISOString(),
        upserted:    totalUpserted,
        duration_ms: durationMs,
        errors:      errors.length > 0 ? errors : undefined,
        note:        'El SEIA cortó antes de terminar la región. Volver a apretar Actualizar retoma desde cero, sin perder lo ya guardado.',
      })
    }
    // Quedamos a medias. Guardamos cursor para reanudar en próxima invocación.
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
      note:        errors.length > 0
        ? 'Corte por error del SEIA (corta la conexión ante muchas consultas seguidas). Reinvocar para continuar desde el cursor.'
        : 'Presupuesto de tiempo agotado, reinvocar para continuar.',
    })
  }

  // 3. Terminamos todas las regiones — limpiar cursor y reportar ok.
  const finalStatus: 'ok' | 'partial' | 'error' =
    totalUpserted === 0 && errors.length > 0 ? 'error'
    : errors.length > 0 ? 'partial'
    : 'ok'

  if (!soloRegionCod) {
    await recordSyncStatus(SYNC_NAME, {
      status:   finalStatus,
      durationMs,
      rows:     totalUpserted,
      errors:   errors.length > 0 ? errors : undefined,
      notes:    '',  // limpiar cursor — terminó.
    })
  }

  if (finalStatus === 'error') return Response.json({ ok: false, errors })

  return Response.json({
    ok:          true,
    partial:     false,
    region:      soloRegionCod ?? undefined,
    synced_at:   new Date().toISOString(),
    upserted:    totalUpserted,
    regions:     soloRegionCod ? 1 : REGIONS.length,
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
  visto_en_ventana_at: string
  synced_at:          string
}
