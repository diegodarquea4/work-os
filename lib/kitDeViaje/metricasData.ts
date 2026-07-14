/**
 * Fetchers server-side para "Contexto Regional", leyendo exclusivamente de
 * las tablas que alimentan el panel de Métricas (`registros_bce`,
 * `registros_bce_empleo`, `casen_regiones`, `censo_regiones.json`) — nunca
 * `region_metrics` ni `v2_indicadores_*`.
 *
 * Espejo server-side (Supabase admin client, sin hooks de React) de la
 * lógica ya usada por `components/MetricasView.tsx` y sus hooks en
 * `lib/hooks/useMetricasPib.ts` / `useMetricasEmpleo.ts` — mismas fórmulas,
 * mismas columnas, para no divergir del panel que el usuario ya audita.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Region } from '@/lib/regions'
import { TOTAL_KM2 } from '@/lib/regions'
import { calcFuerzaTrabajo, calcDesocupados, calcTasaTrimestreMovil } from '@/lib/metricas/empleoFormulas'
import type { CensoRegionData } from '@/lib/hooks/useCensoRegiones'

// ── Geografía (constante, no viene de ninguna tabla) ────────────────────────

export type GeoContexto = {
  km2: number
  pctTerritorioNacional: number
  comunasN: number
  provinciasN: number
}

export function buildGeoContexto(region: Region): GeoContexto {
  return {
    km2: region.km2,
    pctTerritorioNacional: parseFloat((region.km2 / TOTAL_KM2 * 100).toFixed(1)),
    comunasN: region.comunasN,
    provinciasN: region.provinciasN,
  }
}

// ── Censo 2024 (public/data/censo_regiones.json) ────────────────────────────

let censoCache: Record<string, CensoRegionData> | null = null

function loadCensoJson(): Record<string, CensoRegionData> {
  if (!censoCache) {
    const filePath = path.join(process.cwd(), 'public', 'data', 'censo_regiones.json')
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { datos: Record<string, CensoRegionData> }
    censoCache = raw.datos
  }
  return censoCache
}

/** `ineCode` es el código numérico INE (1-16), no el código de work-os ('X', 'RM', ...). */
export function fetchCensoContexto(ineCode: number): CensoRegionData | null {
  return loadCensoJson()[String(ineCode)] ?? null
}

// ── PIB regional (registros_bce) ────────────────────────────────────────────

/**
 * Regla real-vs-nominal (misma que `components/MetricasView.tsx` /
 * `lib/hooks/useMetricasPib.ts`, panel de Métricas):
 * - Crecimientos/variaciones interanuales → SIEMPRE en volumen encadenado
 *   (real, serie empalmada referencia 2018): `variacionAnualPct` (total y
 *   por sector), `ranking`, `pctPibNacional`.
 * - Cifras "foto" del último año → en pesos nominales (corrientes):
 *   `pibRegionMM` y `sectores[].valorMM`/`.pct`.
 * Mezclar bases da un % de sector o una variación sin sentido económico —
 * por eso se consultan como dos unidades separadas, nunca combinadas.
 */
const PIB_UNIDAD_ENC = 'miles de millones de pesos encadenados'
const PIB_UNIDAD_NOM = 'miles de millones de pesos corrientes (base 2018)'

// Sectores "hoja" (excluye 'PIB' total y los rollups 'PIB Producción de
// bienes' / 'PIB Resto de bienes' / 'PIB Servicios') — mismo universo que
// `SECTOR_DISP` de MetricasView.tsx, sin los agregados.
const SECTOR_LEAF_DISP: Record<string, string> = {
  'PIB Minería': 'Minería',
  'PIB Industria manufacturera': 'Industria manufacturera',
  'PIB Comercio': 'Comercio',
  'PIB Servicios financieros y empresariales': 'Servicios financieros',
  'PIB Agropecuario-silvícola': 'Agropecuario-silvícola',
  'PIB Construcción': 'Construcción',
  'PIB Servicios personales': 'Servicios personales',
  'PIB Administración pública': 'Administración pública',
  'PIB Restaurantes y hoteles': 'Restaurantes y hoteles',
  'PIB Electricidad, gas y agua': 'Electricidad, gas y agua',
  'PIB Pesca': 'Pesca',
}

function anioDePeriodo(periodo: string): string {
  const parts = periodo.split('-')
  if (parts.length !== 3) return '?'
  return parts[0].length === 4 ? parts[0] : parts[2]
}

type PibRow = { nombre_region: string; periodo: string; valor_corregido: number | null; indicador_limpio: string; series_id: string }

/** Fila "hoja" del PIB sectorial: no es el total 'PIB' ni un rollup, y con valor. */
function esSectorHoja(r: PibRow): boolean {
  return !!r.series_id?.endsWith('A') && r.indicador_limpio in SECTOR_LEAF_DISP && r.valor_corregido != null
}

/**
 * PostgREST cappea en 1000 filas por default — `registros_bce` filtrado solo
 * por indicador+unidad ya supera eso (1221 filas para el PIB total de las 16
 * regiones). Sin paginar, la "última" fila por región puede quedar fuera de
 * la página y el ranking/% nacional sale mal. Mismo patrón que
 * `useMetricasPibRegion`/`useMetricasPibNacional` (cliente).
 *
 * `unidad` default = encadenado (real) — pasar `PIB_UNIDAD_NOM` para las
 * cifras "foto" nominales (ver nota de la regla real-vs-nominal arriba).
 */
async function fetchAllPibRows(
  sb: SupabaseClient,
  filtro: { nombreRegion?: string; soloNoNull?: boolean; unidad?: string },
): Promise<PibRow[]> {
  const all: PibRow[] = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    let query = sb.from('registros_bce')
      .select('nombre_region,periodo,valor_corregido,indicador_limpio,series_id')
      .eq('unidad_limpia', filtro.unidad ?? PIB_UNIDAD_ENC)
      // Orden determinístico: sin él, la paginación con .range() puede saltar o
      // duplicar filas entre páginas (PostgREST no garantiza orden estable sin
      // ORDER BY) → total nacional/ranking mal. Mismo patrón que el fetcher de
      // empleo (fetchAllEmpleoRows).
      .order('series_id', { ascending: true })
      .order('periodo', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (filtro.nombreRegion) query = query.eq('nombre_region', filtro.nombreRegion)
    if (filtro.soloNoNull) query = query.not('nombre_region', 'is', null)
    const { data, error } = await query
    if (error || !data?.length) break
    all.push(...(data as PibRow[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

export type PibContexto = {
  pibRegionMM: number | null
  periodo: string | null
  pctPibNacional: number | null
  ranking: number | null   // 1..16, 1 = mayor PIB
  /** Crecimiento del PIB total vs el año anterior, en %. */
  variacionAnualPct: number | null
  sectores: { sector: string; valorMM: number; pct: number; variacionAnualPct: number | null }[]
}

/** % de variación entre un valor y el del año anterior, o null si falta alguno. */
function variacionPct(actual: number | null | undefined, anterior: number | null | undefined): number | null {
  if (actual == null || anterior == null || anterior === 0) return null
  return parseFloat(((actual / anterior - 1) * 100).toFixed(1))
}

export async function fetchPibContexto(sb: SupabaseClient, regionNombre: string): Promise<PibContexto> {
  // REAL (encadenado) — único uso: ranking y % del PIB nacional entre las 16 regiones.
  const allRowsReal = await fetchAllPibRows(sb, { soloNoNull: true })

  const annual = allRowsReal
    .filter(r => r.indicador_limpio === 'PIB' && r.series_id?.endsWith('A') && r.valor_corregido != null)

  const latestByRegion = new Map<string, { valor: number; periodo: string }>()
  for (const r of annual) {
    const prev = latestByRegion.get(r.nombre_region)
    if (!prev || r.periodo > prev.periodo) {
      latestByRegion.set(r.nombre_region, { valor: r.valor_corregido as number, periodo: r.periodo })
    }
  }

  const totalNacional = [...latestByRegion.values()].reduce((s, v) => s + v.valor, 0)
  const ranked = [...latestByRegion.entries()].sort((a, b) => b[1].valor - a[1].valor)
  const regionEntry = latestByRegion.get(regionNombre) ?? null
  const ranking = regionEntry ? ranked.findIndex(([nombre]) => nombre === regionNombre) + 1 : null

  let sectores: PibContexto['sectores'] = []
  let variacionAnualPct: number | null = null
  let pibRegionNominalMM: number | null = null
  let periodoNominal: string | null = null

  if (regionEntry) {
    const lastYear = anioDePeriodo(regionEntry.periodo)
    const prevYear = String(parseInt(lastYear, 10) - 1)

    // ── REAL (encadenado): variación anual del total y de cada sector ──
    const regionRowsReal = await fetchAllPibRows(sb, { nombreRegion: regionNombre })

    const pibPrevYear = regionRowsReal.find(r =>
      r.indicador_limpio === 'PIB' && r.series_id?.endsWith('A') &&
      anioDePeriodo(r.periodo) === prevYear && r.valor_corregido != null,
    )
    variacionAnualPct = variacionPct(regionEntry.valor, pibPrevYear?.valor_corregido)

    const variacionPorSector = new Map<string, number | null>()
    const prevPorSectorReal = new Map(
      regionRowsReal
        .filter(r => esSectorHoja(r) && anioDePeriodo(r.periodo) === prevYear)
        .map(r => [r.indicador_limpio, r.valor_corregido as number]),
    )
    regionRowsReal
      .filter(r => esSectorHoja(r) && anioDePeriodo(r.periodo) === lastYear)
      .forEach(r => variacionPorSector.set(r.indicador_limpio, variacionPct(r.valor_corregido, prevPorSectorReal.get(r.indicador_limpio))))

    // ── NOMINAL (corriente): "foto" del PIB total y de cada sector ──
    const regionRowsNominal = await fetchAllPibRows(sb, { nombreRegion: regionNombre, unidad: PIB_UNIDAD_NOM })

    const pibNominalRow = regionRowsNominal.find(r =>
      r.indicador_limpio === 'PIB' && r.series_id?.endsWith('A') &&
      anioDePeriodo(r.periodo) === lastYear && r.valor_corregido != null,
    )
    pibRegionNominalMM = pibNominalRow?.valor_corregido ?? null
    periodoNominal = pibNominalRow?.periodo ?? null

    const sectorLastYearNominal = regionRowsNominal.filter(r => esSectorHoja(r) && anioDePeriodo(r.periodo) === lastYear)
    const sectorTotalNominal = sectorLastYearNominal.reduce((s, r) => s + (r.valor_corregido as number), 0)

    sectores = sectorLastYearNominal
      .map(r => ({
        sector: SECTOR_LEAF_DISP[r.indicador_limpio],
        valorMM: r.valor_corregido as number,
        pct: sectorTotalNominal > 0 ? parseFloat(((r.valor_corregido as number) / sectorTotalNominal * 100).toFixed(1)) : 0,
        variacionAnualPct: variacionPorSector.get(r.indicador_limpio) ?? null,
      }))
      .sort((a, b) => b.valorMM - a.valorMM)
  }

  return {
    pibRegionMM: pibRegionNominalMM,
    periodo: periodoNominal ?? regionEntry?.periodo ?? null,
    pctPibNacional: regionEntry && totalNacional > 0
      ? parseFloat((regionEntry.valor / totalNacional * 100).toFixed(2))
      : null,
    ranking,
    variacionAnualPct,
    sectores,
  }
}

// ── Mercado laboral (registros_bce_empleo) ──────────────────────────────────

export type EmpleoContexto = {
  /** Tasa de desocupación en trimestre móvil (estándar INE) — no la tasa mensual simple. */
  tasaDesocupacion: number | null
  ocupadosMiles: number | null
  fuerzaTrabajoMiles: number | null
  periodo: string | null
  /** 1 = menor tasa de desocupación entre las 16 regiones (mejor posición). */
  rankingDesocupacion: number | null
  /** Cambio en puntos porcentuales vs. el trimestre móvil inmediatamente anterior. */
  variacionTrimestralPp: number | null
}

type EmpleoRow = { nombre_region: string; periodo: string; indicador: string; valor: number | null }

/**
 * PostgREST cappea en 1000 filas — `registros_bce_empleo` completa (16
 * regiones) trae ~6.200 filas. Necesario para el ranking entre regiones.
 */
async function fetchAllEmpleoRows(sb: SupabaseClient): Promise<EmpleoRow[]> {
  const all: EmpleoRow[] = []
  let offset = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await sb.from('registros_bce_empleo')
      .select('nombre_region,periodo,indicador,valor')
      .order('periodo', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error || !data?.length) break
    all.push(...(data as EmpleoRow[]))
    if (data.length < pageSize) break
    offset += pageSize
  }
  return all
}

/**
 * Serie de tasa en trimestre móvil (estándar INE) para una región, con las
 * mismas fórmulas verbatim de `lib/hooks/useMetricasEmpleo.ts`.
 */
function computeTasaTmSeries(rowsRegion: EmpleoRow[]): { periodos: string[]; tasaTm: (number | null)[] } {
  const periodos = [...new Set(rowsRegion.map(r => r.periodo))].sort()
  const tasaMap = new Map(rowsRegion.filter(r => r.indicador === 'Tasa de desocupación').map(r => [r.periodo, r.valor]))
  const ocuMap = new Map(rowsRegion.filter(r => r.indicador === 'Ocupados').map(r => [r.periodo, r.valor]))

  const tasa = periodos.map(p => tasaMap.get(p) ?? null)
  const ocupados = periodos.map(p => ocuMap.get(p) ?? null)
  const ft = tasa.map((t, i) => calcFuerzaTrabajo(ocupados[i], t))
  const desocupados = ft.map((f, i) => calcDesocupados(f, ocupados[i]))
  const tasaTm = periodos.map((_, i) => calcTasaTrimestreMovil(desocupados, ft, i))
  return { periodos, tasaTm }
}

function ultimoValido(vals: (number | null)[]): { idx: number; valor: number | null } {
  let idx = vals.length - 1
  while (idx >= 0 && vals[idx] == null) idx--
  return { idx, valor: idx >= 0 ? vals[idx] : null }
}

/**
 * Tasa de desocupación en trimestre móvil (estándar INE), no la tasa mensual
 * simple, más ranking entre las 16 regiones y variación vs el trimestre móvil
 * inmediatamente anterior.
 */
export async function fetchEmpleoContexto(sb: SupabaseClient, regionNombre: string): Promise<EmpleoContexto> {
  const allRows = await fetchAllEmpleoRows(sb)
  const byRegion = new Map<string, EmpleoRow[]>()
  for (const r of allRows) {
    const arr = byRegion.get(r.nombre_region) ?? []
    arr.push(r)
    byRegion.set(r.nombre_region, arr)
  }

  const latestByRegion = new Map<string, number>()
  let regionSeries: { periodos: string[]; tasaTm: (number | null)[] } | null = null
  for (const [nombre, rowsRegion] of byRegion.entries()) {
    const serie = computeTasaTmSeries(rowsRegion)
    const { valor } = ultimoValido(serie.tasaTm)
    if (valor != null) latestByRegion.set(nombre, valor)
    if (nombre === regionNombre) regionSeries = serie
  }

  if (!regionSeries) {
    return { tasaDesocupacion: null, ocupadosMiles: null, fuerzaTrabajoMiles: null, periodo: null, rankingDesocupacion: null, variacionTrimestralPp: null }
  }

  const { idx, valor: tasaActual } = ultimoValido(regionSeries.tasaTm)
  if (idx < 0) {
    return { tasaDesocupacion: null, ocupadosMiles: null, fuerzaTrabajoMiles: null, periodo: null, rankingDesocupacion: null, variacionTrimestralPp: null }
  }

  // Recalcula ocupados/ft del índice hallado (mismas fórmulas, sin recomputar todo).
  const rowsRegion = byRegion.get(regionNombre)!
  const periodos = regionSeries.periodos
  const tasaMap = new Map(rowsRegion.filter(r => r.indicador === 'Tasa de desocupación').map(r => [r.periodo, r.valor]))
  const ocuMap = new Map(rowsRegion.filter(r => r.indicador === 'Ocupados').map(r => [r.periodo, r.valor]))
  const ocupadosActual = ocuMap.get(periodos[idx]) ?? null
  const ftActual = calcFuerzaTrabajo(ocupadosActual, tasaMap.get(periodos[idx]) ?? null)

  const ranked = [...latestByRegion.entries()].sort((a, b) => a[1] - b[1])
  const rankingDesocupacion = ranked.findIndex(([nombre]) => nombre === regionNombre) + 1

  const { valor: tasaAnterior } = ultimoValido(regionSeries.tasaTm.slice(0, idx))
  const variacionTrimestralPp = tasaActual != null && tasaAnterior != null
    ? parseFloat((tasaActual - tasaAnterior).toFixed(2))
    : null

  return {
    tasaDesocupacion: tasaActual,
    ocupadosMiles: ocupadosActual,
    fuerzaTrabajoMiles: ftActual,
    periodo: periodos[idx],
    rankingDesocupacion: rankingDesocupacion > 0 ? rankingDesocupacion : null,
    variacionTrimestralPp,
  }
}

// ── CASEN 2024 (casen_regiones) ─────────────────────────────────────────────

export type CasenContexto = {
  pobrezaIngresos: number | null
  pobrezaExtrema: number | null
  pobrezaSevera: number | null
  pobrezaMultidimensional: number | null
  ingresoMonetario: number | null
  pctSubsidiosMonetarios: number | null
  fonasa: number | null
  isapre: number | null
  atencionMedicaPct: number | null
  problemasAccesoPct: number | null
  augeGesPct: number | null
}

/**
 * Cifras nacionales CASEN 2024 publicadas — constantes, no calculadas.
 * `casen_regiones.json` trae solo las 16 regiones, sin fila "Nacional"; el
 * generador original (pdf_minuta.js) usaba estos mismos 4 valores hardcodeados.
 */
export const CASEN_NACIONAL_2024 = {
  pobrezaIngresos: 17.3,
  pobrezaExtrema: 6.1,
  pobrezaSevera: 6.1,
  pobrezaMultidimensional: 17.7,
}

type CasenDatosJson = {
  pobreza_ingresos?: Record<string, number>
  pobreza_severa?: Record<string, number>
  multi_incidencia?: Record<string, number>
  ingresos?: Record<string, number>
  composicion_ing?: Record<string, number>
  previsional?: Record<string, number>
  atencion_medica?: Record<string, number>
  prob_atencion?: Record<string, number>
  auge_ges?: Record<string, number>
}

/**
 * `casen_regiones.region` no usa los mismos nombres que `lib/regions.ts`
 * para RM y XII (viene del JSON fuente CASEN, no de nuestro catálogo):
 * 'Metropolitana de Santiago' en vez de 'Metropolitana', y 'Magallanes' en
 * vez de 'Magallanes y Antártica'. `registros_bce`/`registros_bce_empleo`
 * sí calzan 1:1 con `region.nombre` — no necesitan este mapeo.
 */
function casenRegionName(region: Region): string {
  if (region.cod === 'RM') return 'Metropolitana de Santiago'
  if (region.cod === 'XII') return 'Magallanes'
  return region.nombre
}

export async function fetchCasenContexto(sb: SupabaseClient, region: Region): Promise<CasenContexto | null> {
  const { data } = await sb.from('casen_regiones')
    .select('datos')
    .eq('region', casenRegionName(region))
    .eq('anno', 2024)
    .maybeSingle()

  const d = (data as { datos: CasenDatosJson } | null)?.datos
  if (!d) return null

  return {
    pobrezaIngresos: d.pobreza_ingresos?.['Pobreza total'] ?? null,
    pobrezaExtrema: d.pobreza_ingresos?.['Pobreza extrema'] ?? null,
    pobrezaSevera: d.pobreza_severa?.['Pobreza Severa'] ?? null,
    pobrezaMultidimensional: d.multi_incidencia?.met2024_2024_per ?? null,
    ingresoMonetario: d.ingresos?.['Ingreso monetario'] ?? null,
    pctSubsidiosMonetarios: d.composicion_ing?.['Subsidios monetarios'] ?? null,
    fonasa: d.previsional?.['Sistema Público FONASA'] ?? null,
    isapre: d.previsional?.Isapre ?? null,
    atencionMedicaPct: d.atencion_medica?.['Sí'] ?? null,
    problemasAccesoPct: d.prob_atencion?.Tuvo ?? null,
    augeGesPct: d.auge_ges?.Si ?? null,
  }
}

// ── Seguridad pública — % DMCS (registros_leystop_delitos) ─────────────────

/**
 * % de los delitos registrados (año a la fecha) que son DMCS (Delitos de
 * Mayor Connotación Social), para la semana más reciente con datos de la
 * región. `registros_leystop_delitos` trae una fila por delito/semana con
 * `es_dmcs` y el acumulado `anno_fecha` — el % es Σ DMCS / Σ total.
 */
export async function fetchDmcsPct(sb: SupabaseClient, regionId: number): Promise<number | null> {
  const { data: ultimaSemanaRes } = await sb.from('registros_leystop_delitos')
    .select('id_semana')
    .eq('id_region', regionId)
    .order('id_semana', { ascending: false })
    .limit(1)
    .maybeSingle()
  const idSemana = (ultimaSemanaRes as { id_semana: number } | null)?.id_semana
  if (idSemana == null) return null

  const { data } = await sb.from('registros_leystop_delitos')
    .select('anno_fecha,es_dmcs')
    .eq('id_region', regionId)
    .eq('id_semana', idSemana)

  const rows = (data ?? []) as { anno_fecha: number | null; es_dmcs: boolean | null }[]
  const total = rows.reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
  if (total === 0) return null
  const dmcs = rows.filter(r => r.es_dmcs).reduce((s, r) => s + (r.anno_fecha ?? 0), 0)
  return parseFloat((dmcs / total * 100).toFixed(1))
}
