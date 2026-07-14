/**
 * Assembler del Kit de Viaje ("Contexto Regional"). Pure function que compone
 * `KitDeViajeData` a partir de la data ya fetcheada por `/api/minuta` + el
 * output del AI (opcional en tests).
 *
 * Diseño clave:
 *
 * - Secciones I y II tienen una estructura fija de bullets (5 + 7, ver
 *   `types.ts`): cada bullet trae un texto en prosa redactado por el AI a
 *   partir de `buildRawDataLines()` (única fuente de verdad, ver prompts.ts).
 *   Si el AI no corrió (sin ANTHROPIC_API_KEY o falla soft), se usa un
 *   fallback determinístico que concatena esas mismas líneas — nunca "N/A".
 *   "Organización político-administrativa", los sectores del PIB y la tabla
 *   de Mercado laboral (con su columna Contexto) son 100% determinísticos,
 *   nunca dependen del AI.
 *
 * - Sección III (Plan Regional de Gobierno): resumen redactado por
 *   `generatePregoResumen()` a partir del PDF en el bucket `plan-regional`.
 *   Independiente del bloque "Del diagnóstico a la priorización" de Avance
 *   PREGO (`generateJustificacionEjes`, por eje) — acá es un resumen general.
 *   `disponible=false` → renderer pinta disclaimer (mismo copy que Avance PREGO).
 *
 * - Sección IV (Autoridades): el bucket `autoridades-fichas` provee el PDF
 *   oficial que el route anexa con pdf-lib. `disponible=true` → renderer
 *   omite la sección. `disponible=false` → renderer pinta disclaimer + sample.
 */

import type { Region } from '@/lib/regions'
import type { CensoRegionData } from '@/lib/hooks/useCensoRegiones'
import type { LeystopMinuta } from '@/lib/minutaAI'
import type {
  GeoContexto,
  PibContexto,
  EmpleoContexto,
  CasenContexto,
} from './metricasData'
import { CASEN_NACIONAL_2024 } from './metricasData'

import type {
  KitDeViajeData,
  KitDeViajeAIContent,
  KitDeViajeBranding,
  SeccionCaracterizacion,
  SeccionIndicadores,
  SeccionPlanRegional,
  SeccionAutoridades,
  PlanPdfState,
  Bullet,
  IndicadorFila,
  PibSectorFila,
  ProvinciaFila,
} from './types'

import {
  MINISTERIO,
  DIVISION,
  COPY_AUTORIDADES_PENDIENTE,
  COPY_PLAN_REGIONAL_MISSING,
  COPY_PLAN_REGIONAL_INVALID,
} from './constants'

import {
  fmtInt,
  fmtPct,
  fmtHab,
  fmtKm2,
  fmtAnios,
  fmtDensidad,
  fmtBillonesPesos,
  fmtMilesPesos,
} from './format'

// ── Inputs del assembler ────────────────────────────────────────────────────

export interface AssemblerInputs {
  region: Region
  fecha: string
  /** "61" en "Minuta DCI N°61" — ingresado por quien genera el documento. */
  numeroMinuta?: string
  geo: GeoContexto
  censo: CensoRegionData | null
  pib: PibContexto
  empleo: EmpleoContexto
  casen: CasenContexto | null
  leystop: LeystopMinuta | null
  /** % de los delitos LeyStop (año a la fecha, última semana) que son DMCS. */
  dmcsPct: number | null
  /** Estado del PDF plan-regional — decide si Sección III pinta disclaimer. */
  planPdfState: PlanPdfState
  /** Producido por `generateKitViajeContent` + `generatePregoResumen`. null durante tests unitarios. */
  aiContent: KitDeViajeAIContent | null
  /**
   * Lista {provincia, comunas} para la Sección I. Se toma del JSON estático
   * ya existente en `data/provincias-comunas.json` — pasado por el route
   * para mantener el assembler pure. `comunas` ya trae la capital primero y
   * el conteo entre paréntesis (ver data/provincias-comunas.json).
   */
  provincias: ProvinciaFila[]
  logoDataUrl: string
  footerBannerDataUrl: string
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

/** Agrega una línea solo si el valor formateado no es null. */
function pushIf(list: Bullet[], label: string, value: string | null, nota?: string) {
  if (value == null) return
  list.push({ label, value, ...(nota ? { nota } : {}) })
}

/** % sobre un total, o null si el total es 0/ausente. */
function pct(parte: number | null | undefined, total: number | null | undefined): number | null {
  if (parte == null || total == null || total === 0) return null
  return (parte / total) * 100
}

/** "CONSUMO DE ALCOHOL..." (LeyStop, todo en mayúsculas) → "Consumo de alcohol...". */
function toOracionCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Concatena líneas crudas en una oración simple — fallback cuando el AI no redactó. */
function joinFallback(lines: Bullet[]): string {
  if (lines.length === 0) return ''
  return lines.map(b => `${b.label}: ${b.value}${b.nota ? ` (${b.nota})` : ''}.`).join(' ')
}

function fmtVariacion(v: number | null, decimals = 1): string | null {
  if (v == null || !Number.isFinite(v)) return null
  return `${v > 0 ? '+' : ''}${v.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}%`
}

// ── Líneas de datos crudos — fuente única para el AI y para los fallbacks ──

export interface RawDataLines {
  localizacion: Bullet[]
  poblacion: Bullet[]
  estructuraEtaria: Bullet[]
  composicion: Bullet[]
  pibRegional: Bullet[]
  mercadoLaboral: Bullet[]
  ingresosPobreza: Bullet[]
  educacion: Bullet[]
  salud: Bullet[]
  vivienda: Bullet[]
  seguridad: Bullet[]
}

/**
 * Arma las líneas de datos crudos, agrupadas por tema (5 de Sección I + 7 de
 * Sección II). Es la ÚNICA fuente que consumen tanto el prompt de IA
 * (`buildContextPrompt`) como los fallbacks determinísticos de este archivo —
 * garantiza que la IA nunca vea un dato distinto al que el fallback usaría.
 */
export function buildRawDataLines(params: {
  region: Region
  geo: GeoContexto
  censo: CensoRegionData | null
  pib: PibContexto
  empleo: EmpleoContexto
  casen: CasenContexto | null
  leystop: LeystopMinuta | null
  dmcsPct: number | null
}): RawDataLines {
  const { region, geo, censo, pib, empleo, casen, leystop, dmcsPct } = params

  // ── Sección I ──
  const localizacion: Bullet[] = []
  pushIf(localizacion, 'Superficie', fmtKm2(geo.km2))
  pushIf(localizacion, '% del territorio nacional', fmtPct(geo.pctTerritorioNacional))
  pushIf(localizacion, 'Zona geográfica de Chile', region.zona || null)

  const poblacion: Bullet[] = []
  const estructuraEtaria: Bullet[] = []
  const composicion: Bullet[] = []
  const vivienda: Bullet[] = []

  if (censo) {
    pushIf(poblacion, 'Población total', fmtHab(censo.n_per), 'Censo 2024')
    pushIf(poblacion, 'Mujeres', fmtHab(censo.n_mujeres), 'Censo 2024')
    pushIf(poblacion, 'Hombres', fmtHab(censo.n_hombres), 'Censo 2024')
    pushIf(poblacion, 'Densidad', fmtDensidad(censo.n_per / geo.km2))

    const menores15 = censo.n_edad_0_5 + censo.n_edad_6_13 + censo.n_edad_14_17
    const entre15y64 = censo.n_edad_18_24 + censo.n_edad_25_44 + censo.n_edad_45_59
    const mayores60 = censo.n_edad_60_mas
    pushIf(estructuraEtaria, 'Promedio de edad', fmtAnios(censo.prom_edad), 'Censo 2024')
    pushIf(estructuraEtaria, 'Población menor de 15 años', fmtPct(pct(menores15, censo.n_per)), 'Censo 2024')
    pushIf(estructuraEtaria, 'Población entre 15 y 64 años', fmtPct(pct(entre15y64, censo.n_per)), 'Censo 2024')
    pushIf(estructuraEtaria, 'Población de 60 años o más', fmtPct(pct(mayores60, censo.n_per)), 'Censo 2024')
    if (menores15 > 0) {
      const indice = (mayores60 / menores15) * 100
      pushIf(estructuraEtaria, 'Índice de envejecimiento', fmtInt(indice), 'adultos mayores por cada 100 menores de 15 años, Censo 2024')
    }

    pushIf(composicion, 'Población inmigrante', fmtPct(pct(censo.n_inmigrantes, censo.n_per)), 'Censo 2024')
    pushIf(composicion, 'Pueblos originarios', fmtPct(pct(censo.n_pueblos_orig, censo.n_per)), 'Censo 2024')

    // Vivienda (Censo 2024) — jefatura de hogar vive acá, no en Caracterización.
    pushIf(vivienda, 'Jefatura de hogar femenina', fmtPct(pct(censo.n_jefatura_mujer, censo.n_hog)), 'Censo 2024')
    pushIf(vivienda, 'Hacinamiento', fmtPct(pct(censo.n_viv_hacinadas, censo.n_vp_ocupada)), 'Censo 2024')
    pushIf(vivienda, 'Déficit habitacional cuantitativo', fmtInt(censo.n_deficit_cuantitativo, 'viviendas'), 'Censo 2024')
    pushIf(vivienda, 'Acceso a internet', fmtPct(pct(censo.n_internet, censo.n_hog)), 'Censo 2024')
    pushIf(vivienda, 'Acceso a agua potable de red pública', fmtPct(pct(censo.n_fuente_agua_publica, censo.n_hog)), 'Censo 2024')
    pushIf(vivienda, 'Conexión a alcantarillado', fmtPct(pct(censo.n_serv_hig_alc_dentro, censo.n_hog)), 'Censo 2024')
  }

  // ── Sección II ──
  // PIB: las cifras "foto" (total y por sector) van en nominal — lo marcamos
  // explícito en el label para no mezclarlo con crecimiento/ranking/%nacional,
  // que siguen en volumen encadenado (real). Mismo criterio que las KpiCard
  // del panel de Métricas ("billones de pesos, nominal").
  const pibRegional: Bullet[] = []
  pushIf(pibRegional, 'PIB regional (nominal)', fmtBillonesPesos(pib.pibRegionMM), pib.periodo ?? undefined)
  pushIf(pibRegional, '% del PIB nacional', fmtPct(pib.pctPibNacional))
  if (pib.ranking != null) pibRegional.push({ label: 'Ranking PIB entre regiones', value: `${pib.ranking}°/16` })
  pushIf(pibRegional, 'Crecimiento PIB anual', fmtVariacion(pib.variacionAnualPct))
  pib.sectores.slice(0, 8).forEach(s => {
    pushIf(pibRegional, `Sector — ${s.sector}`, `${s.pct.toLocaleString('es-CL', { minimumFractionDigits: 1 })}% del PIB (nominal)`, fmtVariacion(s.variacionAnualPct) ? `${fmtVariacion(s.variacionAnualPct)} anual` : undefined)
  })

  const mercadoLaboral: Bullet[] = []
  pushIf(mercadoLaboral, 'Tasa de desocupación (trimestre móvil)', fmtPct(empleo.tasaDesocupacion), empleo.periodo ?? undefined)
  if (empleo.rankingDesocupacion != null) mercadoLaboral.push({ label: 'Ranking en desocupación entre regiones', value: `${empleo.rankingDesocupacion}°/16 (1° = menor desocupación)` })
  pushIf(mercadoLaboral, 'Variación vs. trimestre móvil anterior', empleo.variacionTrimestralPp != null ? `${fmtVariacion(empleo.variacionTrimestralPp, 1)?.replace('%', 'pp')}` : null)
  pushIf(mercadoLaboral, 'Ocupados', fmtInt(empleo.ocupadosMiles, 'miles'))
  pushIf(mercadoLaboral, 'Fuerza de trabajo', fmtInt(empleo.fuerzaTrabajoMiles, 'miles'))

  const ingresosPobreza: Bullet[] = []
  if (casen) {
    const nac = CASEN_NACIONAL_2024
    pushIf(ingresosPobreza, 'Pobreza por ingresos', fmtPct(casen.pobrezaIngresos), `CASEN 2024, nacional ${nac.pobrezaIngresos.toLocaleString('es-CL', { minimumFractionDigits: 1 })}%`)
    pushIf(ingresosPobreza, 'Pobreza extrema', fmtPct(casen.pobrezaExtrema), `CASEN 2024, nacional ${nac.pobrezaExtrema.toLocaleString('es-CL', { minimumFractionDigits: 1 })}%`)
    pushIf(ingresosPobreza, 'Pobreza severa', fmtPct(casen.pobrezaSevera), `CASEN 2024, nacional ${nac.pobrezaSevera.toLocaleString('es-CL', { minimumFractionDigits: 1 })}%`)
    pushIf(ingresosPobreza, 'Pobreza multidimensional', fmtPct(casen.pobrezaMultidimensional), `CASEN 2024, nacional ${nac.pobrezaMultidimensional.toLocaleString('es-CL', { minimumFractionDigits: 1 })}%`)
    pushIf(ingresosPobreza, 'Ingreso monetario del hogar', fmtMilesPesos(casen.ingresoMonetario), 'CASEN 2024')
    pushIf(ingresosPobreza, 'Subsidios monetarios (% del ingreso)', fmtPct(casen.pctSubsidiosMonetarios), 'CASEN 2024')
  }

  const educacion: Bullet[] = []
  const salud: Bullet[] = []
  if (censo) {
    pushIf(educacion, 'Escolaridad promedio', fmtAnios(censo.prom_escolaridad18), 'Censo 2024')
    pushIf(educacion, 'Analfabetismo', fmtPct(pct(censo.n_analfabet, censo.n_per)), 'Censo 2024')
    const totalCine = censo.n_cine_nunca_curso_primera_infancia + censo.n_cine_primaria +
      censo.n_cine_secundaria + censo.n_cine_terciaria_maestria_doctorado + censo.n_cine_especial_diferencial
    pushIf(educacion, 'Educación terciaria completa', fmtPct(pct(censo.n_cine_terciaria_maestria_doctorado, totalCine)), 'Censo 2024')
  }
  if (casen) {
    pushIf(salud, 'Cobertura FONASA', fmtPct(casen.fonasa), 'CASEN 2024')
    pushIf(salud, 'Recibió atención médica', fmtPct(casen.atencionMedicaPct), 'CASEN 2024')
    pushIf(salud, 'Tuvo problemas de acceso a salud', fmtPct(casen.problemasAccesoPct), 'CASEN 2024')
    pushIf(salud, 'Cobertura AUGE-GES', fmtPct(casen.augeGesPct), 'CASEN 2024')
  }

  const seguridad: Bullet[] = []
  if (leystop) {
    pushIf(seguridad, 'Casos LeyStop (año a la fecha)', fmtInt(leystop.casos_anno_fecha), leystop.semana ?? undefined)
    pushIf(seguridad, 'Variación anual LeyStop', fmtVariacion(leystop.var_anno_fecha))
    pushIf(seguridad, 'Tasa LeyStop / 100 mil hab.', fmtInt(leystop.tasa_registro))

    const delitos: { nombre: string | null; casos: number | null }[] = [
      { nombre: leystop.mayor_registro_1, casos: leystop.pct_1 },
      { nombre: leystop.mayor_registro_2, casos: leystop.pct_2 },
      { nombre: leystop.mayor_registro_3, casos: leystop.pct_3 },
      { nombre: leystop.mayor_registro_4, casos: leystop.pct_4 },
      { nombre: leystop.mayor_registro_5, casos: leystop.pct_5 },
    ]
    delitos.forEach((d, i) => {
      if (!d.nombre) return
      const pctDelito = d.casos != null ? pct(d.casos, leystop.casos_anno_fecha) : null
      seguridad.push({
        label: `Delito más registrado #${i + 1}`,
        value: pctDelito != null ? `${toOracionCase(d.nombre)} (${fmtPct(pctDelito)})` : toOracionCase(d.nombre),
      })
    })

    pushIf(seguridad, '% de delitos DMCS', fmtPct(dmcsPct), 'de mayor connotación social, año a la fecha')
  }

  return { localizacion, poblacion, estructuraEtaria, composicion, pibRegional, mercadoLaboral, ingresosPobreza, educacion, salud, vivienda, seguridad }
}

// ── Sección I. Caracterización general ─────────────────────────────────────

function buildCaracterizacion(
  raw: RawDataLines,
  provincias: ProvinciaFila[],
  aiContent: KitDeViajeAIContent | null,
): SeccionCaracterizacion {
  const ai = aiContent?.caracterizacion
  return {
    bullets: {
      localizacion_superficie: ai?.localizacion_superficie || joinFallback(raw.localizacion),
      organizacion_politico_administrativa: provincias,
      poblacion: ai?.poblacion || joinFallback(raw.poblacion),
      estructura_etaria: ai?.estructura_etaria || joinFallback(raw.estructuraEtaria),
      composicion: ai?.composicion || joinFallback(raw.composicion),
    },
  }
}

// ── Sección II. Indicadores socioeconómicos ────────────────────────────────

function buildIndicadores(
  raw: RawDataLines,
  pib: PibContexto,
  empleo: EmpleoContexto,
  leystop: LeystopMinuta | null,
  aiContent: KitDeViajeAIContent | null,
): SeccionIndicadores {
  const ai = aiContent?.indicadores

  const pibSectores: PibSectorFila[] = [...pib.sectores]
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5)
    .map(s => ({ sector: s.sector, pct: s.pct }))

  const mercadoLaboralTabla: IndicadorFila[] = []
  if (fmtPct(empleo.tasaDesocupacion) != null) {
    const partesContexto: string[] = []
    if (empleo.rankingDesocupacion != null) partesContexto.push(`${empleo.rankingDesocupacion}°/16 en desocupación`)
    if (empleo.variacionTrimestralPp != null) {
      const v = empleo.variacionTrimestralPp
      partesContexto.push(`${v > 0 ? '+' : ''}${v.toLocaleString('es-CL', { minimumFractionDigits: 1 })}pp vs. trimestre anterior`)
    }
    mercadoLaboralTabla.push({
      indicador: 'Tasa de desocupación (trimestre móvil)',
      valor: fmtPct(empleo.tasaDesocupacion) as string,
      contexto: partesContexto.length > 0 ? partesContexto.join(' · ') : undefined,
    })
  }
  if (fmtInt(empleo.ocupadosMiles) != null) {
    mercadoLaboralTabla.push({ indicador: 'Ocupados', valor: `${fmtInt(empleo.ocupadosMiles)} miles` })
  }
  if (fmtInt(empleo.fuerzaTrabajoMiles) != null) {
    mercadoLaboralTabla.push({ indicador: 'Fuerza de trabajo', valor: `${fmtInt(empleo.fuerzaTrabajoMiles)} miles` })
  }

  return {
    bullets: {
      pib_regional: ai?.pib_regional || joinFallback(raw.pibRegional),
      pib_sectores: pibSectores,
      mercado_laboral_periodo: empleo.periodo ?? '',
      mercado_laboral_tabla: mercadoLaboralTabla,
      ingresos_pobreza: ai?.ingresos_pobreza || joinFallback(raw.ingresosPobreza),
      educacion: ai?.educacion || joinFallback(raw.educacion),
      salud: ai?.salud || joinFallback(raw.salud),
      vivienda: ai?.vivienda || joinFallback(raw.vivienda),
      seguridad_publica: ai?.seguridad_publica || joinFallback(raw.seguridad),
      seguridad_semana: leystop?.semana ?? '',
    },
  }
}

// ── Sección III. Plan Regional de Gobierno ─────────────────────────────────

/**
 * `disponible=false` cuando el PDF no existe (`missing`) o está corrupto
 * (`invalid`) — mismos dos casos que Avance PREGO, copy propio (resumen, no
 * "justificación de ejes").
 */
function buildPlanRegional(
  planPdfState: PlanPdfState,
  aiContent: KitDeViajeAIContent | null,
): SeccionPlanRegional {
  if (planPdfState !== 'ok') {
    return {
      disponible: false,
      disclaimer: planPdfState === 'invalid' ? COPY_PLAN_REGIONAL_INVALID : COPY_PLAN_REGIONAL_MISSING,
      parrafos: [],
    }
  }
  return {
    disponible: true,
    parrafos: aiContent?.plan_regional_parrafos ?? [],
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
 *     region, fecha, geo, censo, pib, empleo, casen, leystop, aiContent,
 *     provincias, logoDataUrl, aiFresh: !cachedAiContent, hasAutoridadesFicha,
 *   })
 *   const buffer = await renderKitDeViajePdf(kitData)
 */
export function buildKitDeViajeData(inputs: AssemblerInputs): KitDeViajeData {
  const branding: KitDeViajeBranding = {
    ministerio: MINISTERIO,
    division: DIVISION,
    logo_data_url: inputs.logoDataUrl,
    footer_banner_data_url: inputs.footerBannerDataUrl,
  }

  const raw = buildRawDataLines({
    region: inputs.region,
    geo: inputs.geo,
    censo: inputs.censo,
    pib: inputs.pib,
    empleo: inputs.empleo,
    casen: inputs.casen,
    leystop: inputs.leystop,
    dmcsPct: inputs.dmcsPct,
  })

  return {
    meta: {
      schema_version: 1,
      generado_en: new Date().toISOString(),
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
    numeroMinuta: inputs.numeroMinuta,
    branding,
    caracterizacion: buildCaracterizacion(raw, inputs.provincias, inputs.aiContent),
    indicadores: buildIndicadores(raw, inputs.pib, inputs.empleo, inputs.leystop, inputs.aiContent),
    planRegional: buildPlanRegional(inputs.planPdfState, inputs.aiContent),
    autoridades: buildAutoridadesSection(inputs.hasAutoridadesFicha),
  }
}
