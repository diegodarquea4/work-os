import { getSupabase } from './supabase'
import type { Prioridad, RegionMetrics } from './types'
import type { Project } from './projects'

// ---------------------------------------------------------------------------
// Prioridades
// ---------------------------------------------------------------------------

/** All 63 priorities — used for the initial page load (replaces getProjects). */
export async function getAllPrioridades(): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from('prioridades_territoriales')
    .select('*')
    .order('n', { ascending: true })

  if (error) throw new Error(`DB error (prioridades): ${error.message}`)

  return (data as Prioridad[]).map(row => ({
    n: row.n,
    region: row.region,
    cod: row.cod,
    capital: row.capital,
    zona: row.zona,
    eje: row.eje,
    meta: row.meta,
    ministerios: row.ministerios
      .split('\n')
      .map((m: string) => m.trim())
      .filter(Boolean),
    prioridad: row.prioridad as 'Alta' | 'Media',
    plazo: row.plazo,
    estado_semaforo: (row.estado_semaforo ?? 'gris') as Project['estado_semaforo'],
    pct_avance: row.pct_avance ?? 0,
  }))
}

/** Priorities for one region — used by the PDF minuta route. */
export async function getPrioridadesByCod(cod: string): Promise<Project[]> {
  const { data, error } = await getSupabase()
    .from('prioridades_territoriales')
    .select('*')
    .eq('cod', cod)
    .order('n', { ascending: true })

  if (error) throw new Error(`DB error (prioridades by cod): ${error.message}`)

  return (data as Prioridad[]).map(row => ({
    n: row.n,
    region: row.region,
    cod: row.cod,
    capital: row.capital,
    zona: row.zona,
    eje: row.eje,
    meta: row.meta,
    ministerios: row.ministerios
      .split('\n')
      .map((m: string) => m.trim())
      .filter(Boolean),
    prioridad: row.prioridad as 'Alta' | 'Media',
    plazo: row.plazo,
    estado_semaforo: (row.estado_semaforo ?? 'gris') as Project['estado_semaforo'],
    pct_avance: row.pct_avance ?? 0,
  }))
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
  await getSupabase().from('semaforo_log').insert({
    prioridad_id:   prioridadId,
    campo,
    valor_anterior: valorAnterior !== null ? String(valorAnterior) : null,
    valor_nuevo:    String(valorNuevo),
    cambiado_por:   cambiadoPor,
  })
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
