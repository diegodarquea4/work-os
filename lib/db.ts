import { getSupabase } from './supabase'
import { safeAuditWrite, safeWrite } from './dbWrite'
import type {
  Prioridad, RegionMetrics, RegionalMetric, PregoRow, PregoEstado, PregoFaseKey,
} from './types'
import type { Iniciativa } from './projects'

// ---------------------------------------------------------------------------
// Prioridades
// ---------------------------------------------------------------------------

// Exportado para tests (etapa 6). En producción solo se usa internamente.
export function mapRow(row: Prioridad): Iniciativa {
  return {
    id:                     row.id,
    n:                      row.n,
    region:                 row.region,
    cod:                    row.cod,
    capital:                row.capital,
    zona:                   row.zona,
    eje:                    row.eje,
    eje_id:                 row.eje_id ?? null,
    eje_gobierno:           row.eje_gobierno ?? null,
    nombre:                 row.nombre,
    descripcion:            row.descripcion ?? null,
    ministerio:             row.ministerio,
    prioridad:              row.prioridad as Iniciativa['prioridad'],
    etapa_actual:           row.etapa_actual ?? null,
    estado_termino_gobierno: row.estado_termino_gobierno ?? null,
    proximo_hito:           row.proximo_hito ?? null,
    fecha_proximo_hito:     row.fecha_proximo_hito ?? null,
    fuente_financiamiento:  row.fuente_financiamiento ?? null,
    codigo_bip:             row.codigo_bip ?? null,
    inversion_mm:           row.inversion_mm ?? null,
    comuna:                 row.comuna ?? null,
    rat:                    row.rat ?? null,
    estado_semaforo:        (row.estado_semaforo ?? 'gris') as Iniciativa['estado_semaforo'],
    pct_avance:             row.pct_avance ?? 0,
    responsable:            row.responsable ?? null,
    codigo_iniciativa:      row.codigo_iniciativa ?? null,
    origen:                 row.origen ?? null,
    en_foco:                row.en_foco ?? false,
    // Defensive: pre-migración 016 las filas pueden venir sin tags. La columna
    // tiene DEFAULT '{}' así que post-deploy esto siempre será array.
    tags:                   row.tags ?? [],
    // Defensive: pre-migración 017 las filas vienen sin es_desalojo.
    es_desalojo:            row.es_desalojo ?? false,
    // Defensive: pre-migración 024 las filas vienen sin capa. Default 'lll'
    // (cartera regular). La BD tiene NOT NULL DEFAULT 'lll' — post-deploy
    // siempre vendrá seteado.
    capa:                   (row.capa ?? 'lll') as Iniciativa['capa'],
  }
}

// Proyección explícita: exactamente las columnas que consume mapRow. Evita
// traer `select('*')` (columnas no usadas por el panel) en el SELECT de ~6.833
// filas del load inicial. Si mapRow agrega un campo, agregarlo acá también.
const PRIORIDAD_COLS =
  'id,n,region,cod,capital,zona,eje,eje_id,eje_gobierno,nombre,descripcion,ministerio,' +
  'prioridad,etapa_actual,estado_termino_gobierno,proximo_hito,fecha_proximo_hito,' +
  'fuente_financiamiento,codigo_bip,inversion_mm,comuna,rat,estado_semaforo,pct_avance,' +
  'responsable,codigo_iniciativa,origen,en_foco,tags,es_desalojo,capa'

/**
 * All iniciativas — used for the initial page load.
 *
 * Supabase capea las respuestas en 1000 filas (PostgREST max-rows), así que hay
 * que paginar. Antes se hacía en un `while` SERIAL (cada página esperaba a la
 * anterior → 7 viajes en serie para 6.833 filas). Ahora: un `count` head barato
 * para saber cuántas páginas hay, y todas las páginas se disparan EN PARALELO
 * (Promise.all). El wall-clock pasa de "suma de 7 viajes" a "1 count + el viaje
 * más lento". Más proyección de columnas (PRIORIDAD_COLS) para achicar el payload.
 */
export async function getAllIniciativas(): Promise<Iniciativa[]> {
  const db = getSupabase()
  const PAGE = 1000

  const { count, error: cErr } = await db
    .from('prioridades_territoriales')
    .select('id', { count: 'exact', head: true })
  if (cErr) throw new Error(`DB error (iniciativas count): ${cErr.message}`)

  const total = count ?? 0
  if (total === 0) return []

  const pages = Math.ceil(total / PAGE)
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) =>
      db
        .from('prioridades_territoriales')
        .select(PRIORIDAD_COLS)
        .order('n', { ascending: true })
        .range(i * PAGE, i * PAGE + PAGE - 1)
        .then(({ data, error }) => {
          if (error) throw new Error(`DB error (iniciativas page ${i}): ${error.message}`)
          return (data ?? []) as unknown as Prioridad[]
        }),
    ),
  )

  // Promise.all preserva el orden del array → las páginas quedan en orden de `n`.
  return results.flat().map(mapRow)
}

/** Iniciativas for one region — used by the PDF minuta route. */
export async function getIniciativasByCod(cod: string): Promise<Iniciativa[]> {
  const { data, error } = await getSupabase()
    .from('prioridades_territoriales')
    .select(PRIORIDAD_COLS)
    .eq('cod', cod)
    .order('n', { ascending: true })

  if (error) throw new Error(`DB error (iniciativas by cod): ${error.message}`)

  return (data as unknown as Prioridad[]).map(mapRow)
}

// ---------------------------------------------------------------------------
// Region Metrics
// ---------------------------------------------------------------------------

/** Full metrics row — used by the PDF minuta route. */
export async function getMetricsByCod(cod: string): Promise<RegionMetrics | null> {
  const { data, error } = await getSupabase()
    .from('region_metrics')
    .select('*')
    .eq('region_cod', cod)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null  // row not found
    throw new Error(`DB error (metrics): ${error.message}`)
  }
  return data as RegionMetrics
}

/** Last seguimiento date per prioridad for a region — used by ProjectsPanel activity indicators. */
export async function getLastActividadByCod(cod: string): Promise<Record<number, string | null>> {
  // Get prioridad IDs for this region
  const { data: prioridades, error: pErr } = await getSupabase()
    .from('prioridades_territoriales')
    .select('n')
    .eq('cod', cod)

  if (pErr || !prioridades?.length) return {}

  const ids = prioridades.map((p: { n: number }) => p.n)

  const { data, error } = await getSupabase()
    .from('seguimientos')
    .select('prioridad_id, created_at')
    .in('prioridad_id', ids)
    .order('created_at', { ascending: false })

  if (error || !data) return {}

  // Keep only the most recent entry per prioridad_id
  const result: Record<number, string | null> = {}
  for (const row of data as { prioridad_id: number; created_at: string }[]) {
    if (!(row.prioridad_id in result)) {
      result[row.prioridad_id] = row.created_at
    }
  }
  return result
}

/** Last seguimiento date for ALL prioridades — used by NationalDashboard. */
export async function getLastActividadAll(): Promise<Record<number, string | null>> {
  const { data, error } = await getSupabase()
    .from('seguimientos')
    .select('prioridad_id, created_at')
    .order('created_at', { ascending: false })

  if (error || !data) return {}

  const result: Record<number, string | null> = {}
  for (const row of data as { prioridad_id: number; created_at: string }[]) {
    if (!(row.prioridad_id in result)) {
      result[row.prioridad_id] = row.created_at
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Semáforo log — audit trail for semáforo and % avance changes
// ---------------------------------------------------------------------------

export async function logSemaforoChange(
  prioridadId: number,
  campo: 'semaforo' | 'pct_avance',
  valorAnterior: string | number | null,
  valorNuevo: string | number,
  cambiadoPor: string | null,
): Promise<void> {
  // Audit log: si RLS bloquea, NO romper la operación principal — solo warn.
  // Ver lib/dbWrite.ts::safeAuditWrite.
  await safeAuditWrite(
    getSupabase().from('semaforo_log').insert({
      prioridad_id:   prioridadId,
      campo,
      valor_anterior: valorAnterior !== null ? String(valorAnterior) : null,
      valor_nuevo:    String(valorNuevo),
      cambiado_por:   cambiadoPor,
    }),
    `semaforo_log ${campo} prioridad=${prioridadId}`,
  )
}

// ---------------------------------------------------------------------------
// Desalojo log — audit trail para cambios en desalojo_detalle + toggle
// ---------------------------------------------------------------------------
// Clon de logSemaforoChange pero apunta a `desalojo_log` y acepta cualquier
// `campo` string (todas las columnas del detalle + `es_desalojo` mismo).
// Convierte booleans a 'true'/'false' para almacenarlos como TEXT.
//
// IMPORTANTE: este helper usa `getSupabase()` (cliente browser, RLS aplica).
// Solo va a poder escribir si el usuario es admin (policy admin_all). Si lo
// invocás desde una API route, usá getSupabaseAdmin() en el llamador.

export async function logDesalojoChange(
  prioridadId:    number,
  campo:          string,
  valorAnterior:  string | number | boolean | null,
  valorNuevo:     string | number | boolean | null,
  cambiadoPor:    string | null,
  capaId:         number | null = null,
  fase:           string | null = null,
): Promise<void> {
  // Audit log: mismo criterio que logSemaforoChange. La policy de
  // desalojo_log es admin-only; un usuario no-admin que llegue acá
  // (no debería pasar — la UI lo gatea) verá warning en consola.
  await safeAuditWrite(
    getSupabase().from('desalojo_log').insert({
      prioridad_id:   prioridadId,
      capa_id:        capaId,
      fase,
      campo,
      valor_anterior: valorAnterior !== null ? String(valorAnterior) : null,
      valor_nuevo:    String(valorNuevo ?? ''),
      cambiado_por:   cambiadoPor,
    }),
    `desalojo_log ${campo} prioridad=${prioridadId}`,
  )
}

// ---------------------------------------------------------------------------
// Regional Metrics (time-series) — separate from the static region_metrics table
// ---------------------------------------------------------------------------

/** Time-series metrics for a region — used by ProjectsPanel trend charts. */
export async function getRegionalMetricSeries(
  regionId: number,
  metricNames: string[],
): Promise<RegionalMetric[]> {
  const { data, error } = await getSupabase()
    .from('regional_metrics')
    .select('*')
    .eq('region_id', regionId)
    .in('metric_name', metricNames)
    .order('period', { ascending: true })

  if (error) throw new Error(`DB error (regional_metrics): ${error.message}`)
  return (data ?? []) as RegionalMetric[]
}

// ---------------------------------------------------------------------------

/** Light metrics subset — used by the ProjectsPanel summary cards. */
export async function getMetricsSummaryByCod(cod: string): Promise<Partial<RegionMetrics> | null> {
  const { data, error } = await getSupabase()
    .from('region_metrics')
    .select(`
      region_cod, region_nombre,
      poblacion_total, densidad_poblacional, pct_urbana, pct_rural,
      pct_pobreza_ingresos, pct_pobreza_multidimensional, pct_rsh_tramo40,
      tasa_desocupacion, tasa_participacion_laboral, tasa_ocupacion_informal,
      pib_regional, pct_pib_nacional, variacion_interanual,
      pct_fonasa, hospitales_n, lista_espera_n, camas_por_1000_hab,
      anios_escolaridad_promedio, tasa_alfabetismo,
      deficit_habitacional, pct_hacinamiento,
      pct_hogares_victimas_dmcs, pct_percepcion_inseguridad,
      pct_hogares_internet, localidades_aisladas_n,
      sectores_productivos_principales, vocacion_regional
    `)
    .eq('region_cod', cod)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw new Error(`DB error (metrics summary): ${error.message}`)
  }
  return data as Partial<RegionMetrics>
}

// ---------------------------------------------------------------------------
// PREGO
// ---------------------------------------------------------------------------

export async function getAllPrego(): Promise<PregoRow[]> {
  const { data, error } = await getSupabase()
    .from('prego_monitoreo')
    .select('*')
  if (error) throw new Error(`DB error (prego): ${error.message}`)
  return (data ?? []) as PregoRow[]
}

export async function updatePregoFase(
  regionCod: string,
  fase: PregoFaseKey,
  estado: PregoEstado,
  updatedBy?: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from('prego_monitoreo')
    .update({ [fase]: estado, updated_at: new Date().toISOString(), updated_by: updatedBy ?? null })
    .eq('region_cod', regionCod)
  if (error) throw new Error(`DB error (prego update): ${error.message}`)
}

// ---------------------------------------------------------------------------
// Prevención y Respuesta (diagnóstico de preparación COGRID Regional · subtab de PREGO)
// ---------------------------------------------------------------------------
// Una fila por (region_cod, item_id). El contenido del instrumento vive en
// lib/prevencionRespuesta.ts; acá solo persistimos la respuesta por región.

export type PrevencionRespuestaRow = {
  region_cod:  string
  item_id:     string
  estado:      'listo' | 'parcial' | 'nolisto' | null
  manual:      boolean
  checks:      boolean[]
  comentarios: { ts: number; texto: string; autor?: string }[]
  updated_at:  string
  updated_by:  string | null
}

export async function getAllPrevencionRespuesta(): Promise<PrevencionRespuestaRow[]> {
  const { data, error } = await getSupabase()
    .from('prevencion_respuesta')
    .select('*')
  if (error) throw new Error(`DB error (prevencion_respuesta): ${error.message}`)
  return (data ?? []) as PrevencionRespuestaRow[]
}

/**
 * Guarda la fila COMPLETA del ítem (estado + manual + checks + comentarios) en
 * cada cambio. Simple y sin problemas de append concurrente sobre el jsonb para
 * el caso de uso (una región editada a la vez en la reunión). Vía safeWrite por
 * el invariante del RLS-200-vacío (lib/dbWrite.ts).
 */
export async function upsertPrevencionRespuesta(
  regionCod: string,
  itemId: string,
  patch: Pick<PrevencionRespuestaRow, 'estado' | 'manual' | 'checks' | 'comentarios'>,
  autor?: string,
): Promise<void> {
  const builder = getSupabase()
    .from('prevencion_respuesta')
    .upsert({
      region_cod: regionCod,
      item_id:    itemId,
      ...patch,
      updated_at: new Date().toISOString(),
      updated_by: autor ?? null,
    }, { onConflict: 'region_cod,item_id' })
  await safeWrite(builder, `prevencion_respuesta ${regionCod}/${itemId}`)
}

