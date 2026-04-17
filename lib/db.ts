import { getSupabase } from './supabase'
import type { Prioridad, RegionMetrics, RegionalMetric, PregoRow, PregoEstado, PregoFaseKey } from './types'
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
  }
}

/** All iniciativas — used for the initial page load. */
export async function getAllIniciativas(): Promise<Iniciativa[]> {
  const { data, error } = await getSupabase()
    .from('prioridades_territoriales')
    .select('*')
    .order('n', { ascending: true })

  if (error) throw new Error(`DB error (iniciativas): ${error.message}`)

  return (data as Prioridad[]).map(mapRow)
}

/** @deprecated Use getAllIniciativas() */
export const getAllPrioridades = getAllIniciativas

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

/** @deprecated Use getIniciativasByCod() */
export const getPrioridadesByCod = getIniciativasByCod

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
  await getSupabase().from('semaforo_log').insert({
    prioridad_id:   prioridadId,
    campo,
    valor_anterior: valorAnterior !== null ? String(valorAnterior) : null,
    valor_nuevo:    String(valorNuevo),
    cambiado_por:   cambiadoPor,
  })
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
