/**
 * Assembler del Kit de Viaje. Pure function que compone `KitDeViajeData` a
 * partir de la data ya fetcheada por la ruta `/api/minuta` + el output del
 * AI (opcional en tiempo de test).
 *
 * Diseño clave (per decisiones Diego 2026-07-01):
 *
 * - Sección I y II son **dinámicas**: bullets se construyen desde
 *   `region_metrics`. Si una métrica falta en la fila de la región, el bullet
 *   NO se emite (nada de "N/A"). Cero fuentes de datos estáticas nuevas.
 *
 * - Sección III agrupa iniciativas por `eje_id` (FK a `region_ejes`), usa
 *   `region_ejes.numero` para orden y `region_ejes.nombre` puro para etiquetas.
 *   Iniciativas con `eje_id === null` van a `sin_eje_asignado_count` para no
 *   under-reportar totales.
 *
 * - Sección III maneja el caso Biobío-en-prod (567 iniciativas todas gris/pct=0):
 *   cuando >95% del bucket está en gris o pct_avance=0, `pct_avance_promedio`
 *   se emite como `null` y se agrega `nota_sin_datos` en lugar de mostrar "0%
 *   avance promedio" (que sería engañoso).
 *
 * - `PlanPdfState` es orquestado desde el route; el assembler solo lo consume
 *   y decide qué disclaimer poner. Escalable: cuando alguien re-sube el PDF
 *   corrupto, `estado` pasa a 'ok' y la sección se completa sin cambio de
 *   código.
 *
 * - Sección IV (Autoridades) queda como skeleton hasta Fase D. `disponible=
 *   false`, disclaimer visible, `grupos=[]`.
 */

import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, RegionEje } from '@/lib/types'
import type {
  FichaExtraData,
  TrendSummaries,
} from '@/lib/minutaAI'

import type {
  KitDeViajeData,
  KitDeViajeAIContent,
  KitDeViajeBranding,
  PlanPdfState,
  SeccionCaracterizacion,
  SeccionIndicadores,
  SeccionPrego,
  SeccionAutoridades,
  EjePrego,
  EjeResumen,
  EjeSemaforoResumen,
  IniciativaDestacada,
  Bullet,
  IndicadorFila,
} from './types'

import {
  MINISTERIO,
  DIVISION,
  COPY_PREGO_INVALID,
  COPY_PREGO_MISSING,
  COPY_PREGO_SIN_INICIATIVAS,
  COPY_EJE_SIN_DATOS,
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
  projects: Iniciativa[]
  regionEjes: RegionEje[]
  planPdfState: PlanPdfState
  /** Producido por Fase A.2 (generateKitViajeContent). null durante tests unitarios. */
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

/** Umbral: si >95% del bucket está en gris O tiene pct_avance=0, no computamos promedio. */
const SIN_DATOS_THRESHOLD = 0.95

/** Lookup nombre ministerio → sin sufijo, para tarjetas de destacadas. */
function trimMinisterio(s: string | null): string | undefined {
  if (!s) return undefined
  return s.replace(/^Ministerio\s+(del|de\s+la|de\s+los|de|de\s+)?/i, '').trim() || s
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

// ── Sección III. PREGO ─────────────────────────────────────────────────────

/** Semáforo counts para un bucket de iniciativas. */
function contarSemaforo(iniciativas: Iniciativa[]): EjeSemaforoResumen {
  const acc: EjeSemaforoResumen = { verde: 0, ambar: 0, rojo: 0, gris: 0 }
  for (const p of iniciativas) {
    const s = p.estado_semaforo
    if (s === 'verde' || s === 'ambar' || s === 'rojo' || s === 'gris') acc[s] += 1
  }
  return acc
}

/**
 * Resumen cuantitativo por eje. Aplica la regla Biobío-safe: si >95% del
 * bucket está en gris o pct_avance=0, `pct_avance_promedio = null` y se
 * emite `nota_sin_datos`. Sin esto, la sección III de Biobío mostraría
 * "0% avance promedio" y sería engañoso.
 */
function resumirEje(iniciativas: Iniciativa[]): EjeResumen {
  const total = iniciativas.length
  const semaforo = contarSemaforo(iniciativas)

  const sinDatos = total > 0 && iniciativas.filter(p => p.estado_semaforo === 'gris' || p.pct_avance === 0).length / total >= SIN_DATOS_THRESHOLD
  const pctAvg = total > 0 && !sinDatos
    ? Math.round(iniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / total)
    : null

  // Destacadas: primero las que tienen tag 'Prioritaria PREGO', luego
  // completar hasta 5 con rojas + ámbar + verdes en pct_avance desc.
  const withPregoTag = iniciativas.filter(p => (p.tags ?? []).includes('Prioritaria PREGO'))
  const rest = iniciativas.filter(p => !withPregoTag.includes(p))
  rest.sort((a, b) => {
    const SEV: Record<string, number> = { rojo: 3, ambar: 2, verde: 1, gris: 0 }
    const s = (SEV[b.estado_semaforo] ?? 0) - (SEV[a.estado_semaforo] ?? 0)
    if (s !== 0) return s
    return (b.pct_avance ?? 0) - (a.pct_avance ?? 0)
  })

  const destacadasSrc = [...withPregoTag, ...rest].slice(0, 5)
  const iniciativas_destacadas: IniciativaDestacada[] = destacadasSrc.map(p => ({
    nombre: p.nombre,
    ministerio: trimMinisterio(p.ministerio),
    estado_semaforo: p.estado_semaforo,
    pct_avance: p.pct_avance ?? null,
  }))

  return {
    total_iniciativas: total,
    semaforo,
    pct_avance_promedio: pctAvg,
    iniciativas_destacadas,
    ...(sinDatos ? { nota_sin_datos: COPY_EJE_SIN_DATOS } : {}),
  }
}

function buildPrego(
  projects: Iniciativa[],
  regionEjes: RegionEje[],
  planPdfState: PlanPdfState,
  aiContent: KitDeViajeAIContent | null,
): SeccionPrego {
  // Estado no-ok → sección bloqueada; ejes vacío, disclaimer visible.
  if (planPdfState !== 'ok') {
    const disclaimer = planPdfState === 'invalid' ? COPY_PREGO_INVALID : COPY_PREGO_MISSING
    return {
      estado: planPdfState,
      disclaimer,
      ejes: [],
      ...(aiContent?.prego?.sin_pdf_texto ? { intro: aiContent.prego.sin_pdf_texto } : {}),
    }
  }

  // Estado ok pero región sin iniciativas → sección con intro pero ejes vacíos.
  if (projects.length === 0) {
    return {
      estado: 'ok',
      ejes: [],
      sin_iniciativas_nota: COPY_PREGO_SIN_INICIATIVAS,
      ...(aiContent?.prego?.intro ? { intro: aiContent.prego.intro } : {}),
    }
  }

  // Group projects by eje_id
  const porEjeId = new Map<number, Iniciativa[]>()
  let sinEje = 0
  for (const p of projects) {
    if (p.eje_id == null) { sinEje += 1; continue }
    const arr = porEjeId.get(p.eje_id) ?? []
    arr.push(p)
    porEjeId.set(p.eje_id, arr)
  }

  // Lookup AI narrative por numero de eje (llegan como {numero, nombre, narrativa, progreso_cualitativo})
  const aiByNumero = new Map<number, KitDeViajeAIContent['prego']['ejes'][number]>()
  for (const e of aiContent?.prego?.ejes ?? []) {
    aiByNumero.set(e.numero, e)
  }

  const ejes: EjePrego[] = []
  const catalogoOrdenado = [...regionEjes].sort((a, b) => a.numero - b.numero)
  for (const cat of catalogoOrdenado) {
    const iniciativas = porEjeId.get(cat.id) ?? []
    const ai = aiByNumero.get(cat.numero)
    ejes.push({
      numero: cat.numero,
      nombre: cat.nombre,
      narrativa: ai?.narrativa ?? '',
      progreso_cualitativo: ai?.progreso_cualitativo ?? '',
      resumen: resumirEje(iniciativas),
    })
  }

  return {
    estado: 'ok',
    ejes,
    ...(aiContent?.prego?.intro ? { intro: aiContent.prego.intro } : {}),
    ...(sinEje > 0 ? { sin_eje_asignado_count: sinEje } : {}),
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
 *     region, fecha, metrics, projects, regionEjes, planPdfState,
 *     aiContent, fichaExtra, trendSummaries, provincias, logoDataUrl,
 *     aiFresh: !cachedAiContent,
 *   })
 *   const buffer = await renderKitDeViajePdf(kitData)   // Fase B
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
      // NOTE: intentionally NOT using Date.now() — el timestamp lo estampa
      // el route al persistir a v2_minutas_log. Acá lo dejamos como marcador
      // vacío para no romper resume-ability de workflows si alguien más
      // instancia esto en un contexto determinista.
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
    prego: buildPrego(inputs.projects, inputs.regionEjes, inputs.planPdfState, inputs.aiContent),
    autoridades: buildAutoridadesSection(inputs.hasAutoridadesFicha),
  }
}
