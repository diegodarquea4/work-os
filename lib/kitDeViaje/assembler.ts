/**
 * Assembler del Kit de Viaje ("Contexto Regional"). Pure function que compone
 * `KitDeViajeData` a partir de la data ya fetcheada por `/api/minuta` + el
 * output del AI (opcional en tests).
 *
 * Diseño clave:
 *
 * - Sección I y II son dinámicas: bullets se construyen desde `region_metrics`.
 *   Si una métrica falta en la fila de la región, el bullet NO se emite (nada
 *   de "N/A"). Cero fuentes de datos estáticas nuevas.
 *
 * - Sección III (PREGO) ya no vive en este producto: migró a la minuta
 *   "Avance PREGO" (`MinutaEjecutiva.tsx`) como bloque diagnóstico.
 *
 * - Sección IV (Autoridades): el bucket `autoridades-fichas` provee el PDF
 *   oficial que el route anexa con pdf-lib. `disponible=true` → renderer
 *   omite la sección. `disponible=false` → renderer pinta disclaimer + sample.
 */

import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'
import type {
  FichaExtraData,
  TrendSummaries,
} from '@/lib/minutaAI'

import type {
  KitDeViajeData,
  KitDeViajeAIContent,
  KitDeViajeBranding,
  SeccionCaracterizacion,
  SeccionIndicadores,
  SeccionAutoridades,
  Bullet,
  IndicadorFila,
} from './types'

import {
  MINISTERIO,
  DIVISION,
  COPY_AUTORIDADES_PENDIENTE,
} from './constants'

import {
  fmtInt,
  fmtPct,
  fmtHab,
  fmtKm2,
  fmtAnios,
  fmtDensidad,
} from './format'

// ── Inputs del assembler ────────────────────────────────────────────────────

export interface AssemblerInputs {
  region: Region
  fecha: string
  metrics: RegionMetrics | null
  /** Producido por `generateKitViajeContent`. null durante tests unitarios. */
  aiContent: KitDeViajeAIContent | null
  fichaExtra: FichaExtraData | null
  trendSummaries: TrendSummaries | null
  /**
   * Lista {provincia, comunas} para la Sección I. Se toma del JSON estático
   * ya existente en `data/provincias-comunas.json` — pasado por el route
   * para mantener el assembler pure.
   */
  provincias: Array<{ provincia: string; comunas: string; poblacion?: string }>
  logoDataUrl: string
  aiFresh: boolean
  /**
   * True cuando el bucket `autoridades-fichas` tiene el PDF oficial para la
   * región. En ese caso el route post-procesa el Kit con pdf-lib y anexa las
   * páginas del ficha al final; el renderer NO pinta Sección IV.
   *
   * False = fallback: el renderer pinta Sección IV con disclaimer + sample.
   */
  hasAutoridadesFicha: boolean
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Agrega un bullet solo si el valor formateado no es null. */
function pushIf(list: Bullet[], label: string, value: string | null, nota?: string) {
  if (value == null) return
  list.push({ label, value, ...(nota ? { nota } : {}) })
}

/** Agrega una fila de tabla solo si el valor formateado no es null. */
function pushRowIf(list: IndicadorFila[], indicador: string, valor: string | null, nota?: string) {
  if (valor == null) return
  list.push({ indicador, valor, ...(nota ? { nota } : {}) })
}

// ── Sección I. Caracterización general ─────────────────────────────────────

function buildCaracterizacion(
  metrics: RegionMetrics | null,
  provincias: AssemblerInputs['provincias'],
  aiContent: KitDeViajeAIContent | null,
): SeccionCaracterizacion {
  const bullets: Bullet[] = []

  if (metrics) {
    pushIf(bullets, 'Superficie', fmtKm2(metrics.superficie_km2))
    pushIf(bullets, '% del territorio nacional', fmtPct(metrics.pct_territorio_nacional))
    pushIf(bullets, 'Provincias', fmtInt(metrics.provincias_n))
    pushIf(bullets, 'Comunas', fmtInt(metrics.comunas_n))
    pushIf(bullets, 'Población total', fmtHab(metrics.poblacion_total))
    pushIf(bullets, 'Densidad', fmtDensidad(metrics.densidad_poblacional))
    pushIf(bullets, 'Promedio de edad', fmtAnios(metrics.promedio_edad ?? metrics.prom_edad))
    pushIf(bullets, 'Población urbana', fmtPct(metrics.pct_urbana))
    pushIf(bullets, 'Población rural', fmtPct(metrics.pct_rural))
    pushIf(bullets, 'Población inmigrante', fmtPct(metrics.pct_inmigrantes))
    pushIf(bullets, 'Pueblos originarios', fmtPct(metrics.pct_indigena))
    pushIf(bullets, 'Jefatura de hogar femenina', fmtPct(metrics.pct_jefatura_mujer))
  }

  return {
    parrafos: aiContent?.caracterizacion_parrafos ?? [],
    bullets,
    provincias_tabla: provincias.length > 0 ? provincias : undefined,
  }
}

// ── Sección II. Indicadores socioeconómicos ────────────────────────────────

function buildIndicadores(
  metrics: RegionMetrics | null,
  fichaExtra: FichaExtraData | null,
  trendSummaries: TrendSummaries | null,
  aiContent: KitDeViajeAIContent | null,
): SeccionIndicadores {
  const bullets: Bullet[] = []
  const mercadoLaboral: IndicadorFila[] = []

  if (metrics) {
    // Pobreza
    pushIf(bullets, 'Pobreza por ingresos', fmtPct(metrics.pct_pobreza_ingresos), 'CASEN 2024')
    pushIf(bullets, 'Pobreza extrema', fmtPct(metrics.pct_pobreza_extrema), 'CASEN 2024')
    pushIf(bullets, 'Pobreza multidimensional', fmtPct(metrics.pct_pobreza_multidimensional), 'CASEN 2024')
    pushIf(bullets, 'Hogares RSH tramo 40%', fmtPct(metrics.pct_rsh_tramo40))
    // Salud & educación
    pushIf(bullets, 'Cobertura FONASA', fmtPct(metrics.pct_fonasa))
    pushIf(bullets, 'Camas hospitalarias / 1.000 hab', fmtInt(metrics.camas_por_1000_hab))
    pushIf(bullets, 'Escolaridad promedio', fmtAnios(metrics.anios_escolaridad_promedio))
    pushIf(bullets, 'Educación superior completa', fmtPct(metrics.pct_educacion_superior), 'Censo 2024')
    // Vivienda
    pushIf(bullets, 'Déficit habitacional cuantitativo', fmtInt(metrics.n_deficit_cuantitativo, 'viviendas'))
    pushIf(bullets, 'Hacinamiento', fmtPct(metrics.pct_viv_hacinadas ?? metrics.pct_hacinamiento))
    // Seguridad
    pushIf(bullets, 'Hogares víctimas de DMCS', fmtPct(metrics.pct_hogares_victimas_dmcs))
    pushIf(bullets, 'Percepción de inseguridad', fmtPct(metrics.pct_percepcion_inseguridad))
    // Conectividad
    pushIf(bullets, 'Acceso a internet fijo', fmtPct(metrics.pct_internet_fijo ?? metrics.pct_hogares_internet), 'Censo 2024')

    // Mercado laboral (tabla)
    pushRowIf(mercadoLaboral, 'Tasa de desocupación', fmtPct(metrics.tasa_desocupacion))
    pushRowIf(mercadoLaboral, 'Tasa de ocupación', fmtPct(metrics.tasa_ocupacion))
    pushRowIf(mercadoLaboral, 'Tasa de participación laboral', fmtPct(metrics.tasa_participacion_laboral))
    pushRowIf(mercadoLaboral, 'Ocupación informal', fmtPct(metrics.tasa_ocupacion_informal))
  }

  // Suplementos desde fichaExtra / trendSummaries (dinámicos, BCCh/v2)
  if (trendSummaries?.empleoINE) {
    pushRowIf(mercadoLaboral, 'Ocupados (miles)', fmtInt(trendSummaries.empleoINE.ocupados_miles), trendSummaries.empleoINE.period)
    if (trendSummaries.empleoINE.fuerza_trabajo_miles != null) {
      pushRowIf(mercadoLaboral, 'Fuerza de trabajo (miles)', fmtInt(trendSummaries.empleoINE.fuerza_trabajo_miles), trendSummaries.empleoINE.period)
    }
  }
  if (trendSummaries?.pibAnual) {
    pushIf(bullets, 'PIB regional (BCCh)', fmtInt(trendSummaries.pibAnual.value, 'MM$'), trendSummaries.pibAnual.period)
  }
  if (fichaExtra?.desocupacionNacional != null) {
    pushRowIf(mercadoLaboral, 'Tasa desocupación nacional', fmtPct(fichaExtra.desocupacionNacional), 'referencia')
  }

  const nar = aiContent?.indicadores_narrativa

  return {
    bullets,
    ...(mercadoLaboral.length > 0 ? { mercado_laboral_tabla: mercadoLaboral } : {}),
    ...(nar?.pib_comentario ? { pib_comentario: nar.pib_comentario } : {}),
    ...(nar?.matriz_productiva ? { matriz_productiva: nar.matriz_productiva } : {}),
    ...(nar?.ingresos_pobreza ? { ingresos_pobreza: nar.ingresos_pobreza } : {}),
    ...(nar?.educacion_nota ? { educacion_nota: nar.educacion_nota } : {}),
    ...(nar?.salud_nota ? { salud_nota: nar.salud_nota } : {}),
    ...(nar?.vivienda_nota ? { vivienda_nota: nar.vivienda_nota } : {}),
    ...(nar?.seguridad_nota ? { seguridad_nota: nar.seguridad_nota } : {}),
    ...(nar?.tendencia_general ? { tendencia_general: nar.tendencia_general } : {}),
  }
}

// ── Sección IV. Autoridades ─────────────────────────────────────────────────

/**
 * Cuando el bucket `autoridades-fichas` tiene el PDF oficial:
 *   - disponible = true, sin disclaimer, sin grupos
 *   - El renderer omite Sección IV; el route la anexa via pdf-lib
 *
 * Cuando NO hay ficha (región sin subir todavía):
 *   - disponible = false + disclaimer + grupos vacíos
 *   - El renderer pinta Sección IV con disclaimer + sample data preview
 */
function buildAutoridadesSection(hasAutoridadesFicha: boolean): SeccionAutoridades {
  if (hasAutoridadesFicha) {
    return { disponible: true, grupos: [] }
  }
  return {
    disponible: false,
    disclaimer: COPY_AUTORIDADES_PENDIENTE,
    grupos: [],
  }
}

// ── Root ────────────────────────────────────────────────────────────────────

/**
 * Compone `KitDeViajeData` desde los datos crudos ya fetcheados. Pure.
 *
 * Uso desde route.ts:
 *
 *   const kitData = buildKitDeViajeData({
 *     region, fecha, metrics, aiContent, fichaExtra, trendSummaries,
 *     provincias, logoDataUrl, aiFresh: !cachedAiContent, hasAutoridadesFicha,
 *   })
 *   const buffer = await renderKitDeViajePdf(kitData)
 */
export function buildKitDeViajeData(inputs: AssemblerInputs): KitDeViajeData {
  const branding: KitDeViajeBranding = {
    ministerio: MINISTERIO,
    division: DIVISION,
    logo_data_url: inputs.logoDataUrl,
  }

  return {
    meta: {
      schema_version: 1,
      generado_en: '',
      ai_fresh: inputs.aiFresh,
    },
    region: {
      cod: inputs.region.cod,
      nombre: inputs.region.nombre,
      capital: inputs.region.capital,
      provincias: inputs.provincias.map(p => p.provincia),
    },
    fecha: {
      display: inputs.fecha,
    },
    branding,
    caracterizacion: buildCaracterizacion(inputs.metrics, inputs.provincias, inputs.aiContent),
    indicadores: buildIndicadores(inputs.metrics, inputs.fichaExtra, inputs.trendSummaries, inputs.aiContent),
    autoridades: buildAutoridadesSection(inputs.hasAutoridadesFicha),
  }
}
