import { getSupabase } from './supabase'
import { safeAuditWrite } from './dbWrite'
import type {
  Prioridad, RegionMetrics, RegionalMetric, PregoRow, PregoEstado, PregoFaseKey,
  V2Indicador, V2IndicadorValor, V2IndicadorUltimo, V2Fuente,
} from './types'
import type { Iniciativa } from './projects'

// ---------------------------------------------------------------------------
// Prioridades
// ---------------------------------------------------------------------------

function mapRow(row: Prioridad): Iniciativa {
  return {
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
  }
}

/** All iniciativas — used for the initial page load. Paginates to bypass Supabase's 1000-row default. */
export async function getAllIniciativas(): Promise<Iniciativa[]> {
  const PAGE = 1000
  const all: Prioridad[] = []
  let from = 0

  while (true) {
    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .select('*')
      .order('n', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`DB error (iniciativas): ${error.message}`)
    if (!data || data.length === 0) break
    all.push(...(data as Prioridad[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  return all.map(mapRow)
}

/** Iniciativas for one region — used by the PDF minuta route. */
export async function getIniciativasByCod(cod: string): Promise<Iniciativa[]> {
  const { data, error } = await getSupabase()
    .from('prioridades_territoriales')
    .select('*')
    .eq('cod', cod)
    .order('n', { ascending: true })

  if (error) throw new Error(`DB error (iniciativas by cod): ${error.message}`)

  return (data as Prioridad[]).map(mapRow)
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
// v2 — Indicadores (new data model)
// ---------------------------------------------------------------------------

/** Full indicator catalog with joined source info. */
export async function getV2Catalogo(): Promise<V2Indicador[]> {
  const { data, error } = await getSupabase()
    .from('v2_indicadores_catalogo')
    .select('*, fuente:v2_fuentes(*)')
    .order('categoria')
    .order('orden_presentacion', { ascending: true, nullsFirst: false })

  if (error) throw new Error(`DB error (v2 catalogo): ${error.message}`)
  return (data ?? []) as V2Indicador[]
}

/** Latest value per indicator for a region (uses materialized view). */
export async function getV2UltimosPorRegion(regionId: number): Promise<V2IndicadorUltimo[]> {
  const { data, error } = await getSupabase()
    .from('v2_indicadores_ultimo')
    .select('*')
    .eq('region_id', regionId)

  if (error) throw new Error(`DB error (v2 ultimo): ${error.message}`)
  return (data ?? []) as V2IndicadorUltimo[]
}

/** Time-series for a specific indicator in a region. */
export async function getV2Serie(
  codigo: string,
  regionId: number,
  limit = 60,
): Promise<V2IndicadorValor[]> {
  const { data, error } = await getSupabase()
    .from('v2_indicadores_valores')
    .select('*')
    .eq('codigo_indicador', codigo)
    .eq('region_id', regionId)
    .order('periodo', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`DB error (v2 serie): ${error.message}`)
  return (data ?? []) as V2IndicadorValor[]
}

/** Latest national value for an indicator (region_id = 0). */
export async function getV2NacionalUltimo(codigo: string): Promise<V2IndicadorUltimo | null> {
  const { data, error } = await getSupabase()
    .from('v2_indicadores_ultimo')
    .select('*')
    .eq('codigo_indicador', codigo)
    .eq('region_id', 0)
    .maybeSingle()

  if (error) throw new Error(`DB error (v2 nacional): ${error.message}`)
  return data as V2IndicadorUltimo | null
}

/** All 16 regions ranked by an indicator (excludes national). */
export async function getV2RankingIndicador(codigo: string): Promise<V2IndicadorUltimo[]> {
  const { data, error } = await getSupabase()
    .from('v2_indicadores_ultimo')
    .select('*')
    .eq('codigo_indicador', codigo)
    .gt('region_id', 0)
    .order('valor', { ascending: true })

  if (error) throw new Error(`DB error (v2 ranking): ${error.message}`)
  return (data ?? []) as V2IndicadorUltimo[]
}
