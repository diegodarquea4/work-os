import { describe, it, expect } from 'vitest'
import { buildKitDeViajeData, type AssemblerInputs } from '@/lib/kitDeViaje/assembler'
import type { Region } from '@/lib/regions'
import type { CensoRegionData } from '@/lib/hooks/useCensoRegiones'
import type { PibContexto, EmpleoContexto, CasenContexto } from '@/lib/kitDeViaje/metricasData'
import type { LeystopMinuta } from '@/lib/minutaAI'
import {
  COPY_AUTORIDADES_PENDIENTE,
  COPY_CONFLICTOS_MISSING,
  MINISTERIO,
  DIVISION,
} from '@/lib/kitDeViaje/constants'

// ── Factories ───────────────────────────────────────────────────────────────

const REGION: Region = {
  cod: 'VIII', nombre: 'Biobío', capital: 'Concepción', zona: 'Sur',
  lat: -36.827, lng: -73.0498, shortCod: 'BI',
  km2: 24021, comunasN: 33, provinciasN: 3,
}

const EMPTY_PIB: PibContexto = { pibRegionMM: null, periodo: null, pctPibNacional: null, ranking: null, variacionAnualPct: null, sectores: [] }
const EMPTY_EMPLEO: EmpleoContexto = {
  tasaDesocupacion: null, ocupadosMiles: null, fuerzaTrabajoMiles: null, periodo: null,
  rankingDesocupacion: null, variacionTrimestralPp: null,
}

function inputs(over: Partial<AssemblerInputs> = {}): AssemblerInputs {
  return {
    region: REGION,
    fecha: 'Julio 2026',
    geo: { km2: REGION.km2, pctTerritorioNacional: 3.2, comunasN: REGION.comunasN, provinciasN: REGION.provinciasN },
    censo: null,
    pib: EMPTY_PIB,
    empleo: EMPTY_EMPLEO,
    casen: null,
    leystop: null,
    dmcsPct: null,
    planPdfState: 'ok',
    aiContent: null,
    provincias: [],
    logoDataUrl: 'data:image/png;base64,ZZZ',
    footerBannerDataUrl: 'data:image/png;base64,YYY',
    aiFresh: true,
    hasAutoridadesFicha: false,
    hasConflictos: false,
    ...over,
  }
}

// ── Meta y branding ─────────────────────────────────────────────────────────

describe('buildKitDeViajeData — meta y branding', () => {
  it('emite MINISTERIO y DIVISION canónicos (no "y Seguridad Pública", no "Interregional")', () => {
    const d = buildKitDeViajeData(inputs())
    expect(d.branding.ministerio).toBe(MINISTERIO)
    expect(d.branding.division).toBe(DIVISION)
    expect(d.branding.ministerio).not.toMatch(/Seguridad Pública/i)
    expect(d.branding.division).not.toMatch(/Interregional/i)
  })

  it('marca ai_fresh según input', () => {
    expect(buildKitDeViajeData(inputs({ aiFresh: true })).meta.ai_fresh).toBe(true)
    expect(buildKitDeViajeData(inputs({ aiFresh: false })).meta.ai_fresh).toBe(false)
  })

  it('schema_version = 1', () => {
    expect(buildKitDeViajeData(inputs()).meta.schema_version).toBe(1)
  })
})

// ── Sección I: 5 bullets fijos ──────────────────────────────────────────────

describe('Sección I — Caracterización (5 bullets fijos)', () => {
  it('sin AI → fallback determinístico con superficie y % del territorio', () => {
    const d = buildKitDeViajeData(inputs())
    expect(d.caracterizacion.bullets.localizacion_superficie).toMatch(/Superficie: 24\.021/)
    expect(d.caracterizacion.bullets.localizacion_superficie).toMatch(/% del territorio nacional: 3,2%/)
  })

  it('sin censo → poblacion/estructura_etaria/composicion quedan vacíos (no "N/A")', () => {
    const d = buildKitDeViajeData(inputs({ censo: null }))
    expect(d.caracterizacion.bullets.poblacion).toBe('')
    expect(d.caracterizacion.bullets.estructura_etaria).toBe('')
    expect(d.caracterizacion.bullets.composicion).toBe('')
  })

  it('con censo → fallback de población incluye hombres/mujeres/densidad', () => {
    const censo = {
      n_per: 890284, n_mujeres: 453155, n_hombres: 437129,
      n_edad_0_5: 51440, n_edad_6_13: 93376, n_edad_14_17: 50739,
      n_edad_18_24: 70000, n_edad_25_44: 250000, n_edad_45_59: 180000,
      n_edad_60_mas: 171152, n_inmigrantes: 35085, n_pueblos_orig: 236813,
      n_jefatura_mujer: 163894, n_hog: 332395,
    } as CensoRegionData
    const d = buildKitDeViajeData(inputs({ censo }))
    expect(d.caracterizacion.bullets.poblacion).toMatch(/Población total: 890\.284/)
    expect(d.caracterizacion.bullets.poblacion).toMatch(/Mujeres: 453\.155/)
    expect(d.caracterizacion.bullets.poblacion).toMatch(/Hombres: 437\.129/)
    expect(d.caracterizacion.bullets.estructura_etaria).toMatch(/Índice de envejecimiento/)
    expect(d.caracterizacion.bullets.composicion).toMatch(/Pueblos originarios/)
  })

  it('organización político-administrativa es determinística (viene de provincias, no del AI)', () => {
    const provincias = [{ provincia: 'Osorno (capital Osorno)', comunas: 'Osorno, Puyehue (7 comunas)' }]
    const d = buildKitDeViajeData(inputs({ provincias }))
    expect(d.caracterizacion.bullets.organizacion_politico_administrativa).toEqual(provincias)
  })

  it('con aiContent → el texto de la IA reemplaza el fallback', () => {
    const d = buildKitDeViajeData(inputs({
      aiContent: {
        caracterizacion: { localizacion_superficie: 'Texto redactado por la IA.' },
        indicadores: {},
      },
    }))
    expect(d.caracterizacion.bullets.localizacion_superficie).toBe('Texto redactado por la IA.')
  })
})

// ── Sección II: 7 bullets fijos ─────────────────────────────────────────────

describe('Sección II — Indicadores (7 bullets fijos)', () => {
  it('sin casen → ingresos_pobreza queda vacío (no "N/A")', () => {
    const d = buildKitDeViajeData(inputs({ casen: null }))
    expect(d.indicadores.bullets.ingresos_pobreza).toBe('')
  })

  it('con casen → fallback incluye pobreza con comparación nacional', () => {
    const casen: CasenContexto = {
      pobrezaIngresos: 16.477, pobrezaExtrema: 6.3848, pobrezaSevera: 5.7358,
      pobrezaMultidimensional: 12.71, ingresoMonetario: 1247372.35,
      pctSubsidiosMonetarios: 7.89, fonasa: 88.61, isapre: 7.14,
      atencionMedicaPct: 89.42, problemasAccesoPct: 34.97, augeGesPct: 83.37,
    }
    const d = buildKitDeViajeData(inputs({ casen }))
    expect(d.indicadores.bullets.ingresos_pobreza).toMatch(/Pobreza por ingresos: 16,5%.*nacional 17,3%/)
    expect(d.indicadores.bullets.salud).toMatch(/Cobertura FONASA: 88,6%/)
  })

  it('PIB: sub-listado de sectores ordenado por % descendente, sin depender del AI', () => {
    const pib: PibContexto = {
      pibRegionMM: 7550, periodo: '2025', pctPibNacional: 3.54, ranking: 7, variacionAnualPct: 3.9,
      sectores: [
        { sector: 'Comercio', valorMM: 700, pct: 11.6, variacionAnualPct: 7.9 },
        { sector: 'Industria manufacturera', valorMM: 1465, pct: 23.4, variacionAnualPct: 12.5 },
      ],
    }
    const d = buildKitDeViajeData(inputs({ pib }))
    expect(d.indicadores.bullets.pib_sectores).toEqual([
      { sector: 'Industria manufacturera', pct: 23.4 },
      { sector: 'Comercio', pct: 11.6 },
    ])
    expect(d.indicadores.bullets.pib_regional).toMatch(/Ranking PIB entre regiones: 7°\/16/)
    expect(d.indicadores.bullets.pib_regional).toMatch(/Crecimiento PIB anual: \+3,9%/)
  })

  it('mercado laboral: tabla con columna Contexto (ranking + variación trimestral)', () => {
    const empleo: EmpleoContexto = {
      tasaDesocupacion: 6.6, ocupadosMiles: 410.6, fuerzaTrabajoMiles: 439.7, periodo: '2026-05',
      rankingDesocupacion: 3, variacionTrimestralPp: -0.3,
    }
    const d = buildKitDeViajeData(inputs({ empleo }))
    const fila = d.indicadores.bullets.mercado_laboral_tabla.find(r => r.indicador === 'Tasa de desocupación (trimestre móvil)')
    expect(fila?.valor).toBe('6,6%')
    expect(fila?.contexto).toMatch(/3°\/16 en desocupación/)
    expect(fila?.contexto).toMatch(/-0,3pp vs\. trimestre anterior/)
    expect(d.indicadores.bullets.mercado_laboral_periodo).toBe('2026-05')
  })

  it('con leystop → seguridad_publica incluye casos/delitos/DMCS y seguridad_semana se expone', () => {
    const leystop = {
      semana: 'SEMANA 25', casos_anno_fecha: 33198, var_anno_fecha: 10.08, tasa_registro: 1802.1,
      mayor_registro_1: 'CONSUMO DE ALCOHOL Y DE DROGAS EN LA VÍA PÚBLICA', pct_1: 9790,
      mayor_registro_2: null, pct_2: null, mayor_registro_3: null, pct_3: null,
      mayor_registro_4: null, pct_4: null, mayor_registro_5: null, pct_5: null,
    } as unknown as LeystopMinuta
    const d = buildKitDeViajeData(inputs({ leystop, dmcsPct: 41.3 }))
    expect(d.indicadores.bullets.seguridad_semana).toBe('SEMANA 25')
    expect(d.indicadores.bullets.seguridad_publica).toMatch(/Casos LeyStop \(año a la fecha\): 33\.198/)
    expect(d.indicadores.bullets.seguridad_publica).toMatch(/Consumo de alcohol y de drogas en la vía pública \(29,5%\)/)
    expect(d.indicadores.bullets.seguridad_publica).toMatch(/% de delitos DMCS: 41,3%/)
  })

  it('sin leystop → seguridad_publica vacío y seguridad_semana vacía (no "N/A")', () => {
    const d = buildKitDeViajeData(inputs({ leystop: null }))
    expect(d.indicadores.bullets.seguridad_publica).toBe('')
    expect(d.indicadores.bullets.seguridad_semana).toBe('')
  })

  it('con aiContent → el texto de la IA reemplaza el fallback (pero no la tabla ni los sectores)', () => {
    const d = buildKitDeViajeData(inputs({
      aiContent: {
        caracterizacion: {},
        indicadores: { pib_regional: 'Redactado por IA.' },
      },
    }))
    expect(d.indicadores.bullets.pib_regional).toBe('Redactado por IA.')
  })
})

// ── Sección III: Plan Regional de Gobierno ─────────────────────────────────

describe('Sección III — Plan Regional de Gobierno', () => {
  it('PDF ok + aiContent con resumen → disponible=true con párrafos', () => {
    const d = buildKitDeViajeData(inputs({
      planPdfState: 'ok',
      aiContent: {
        caracterizacion: {},
        indicadores: {},
        plan_regional_parrafos: ['El plan se organiza en tres ejes estratégicos.'],
      },
    }))
    expect(d.planRegional.disponible).toBe(true)
    expect(d.planRegional.disclaimer).toBeUndefined()
    expect(d.planRegional.parrafos).toEqual(['El plan se organiza en tres ejes estratégicos.'])
  })

  it('PDF missing → disponible=false con disclaimer de "no cargado"', () => {
    const d = buildKitDeViajeData(inputs({ planPdfState: 'missing' }))
    expect(d.planRegional.disponible).toBe(false)
    expect(d.planRegional.disclaimer).toMatch(/no se ha cargado/i)
    expect(d.planRegional.parrafos).toEqual([])
  })

  it('PDF invalid → disponible=false con disclaimer de "problemas de carga"', () => {
    const d = buildKitDeViajeData(inputs({ planPdfState: 'invalid' }))
    expect(d.planRegional.disponible).toBe(false)
    expect(d.planRegional.disclaimer).toMatch(/problemas de carga/i)
  })
})

// ── Sección IV: Conflictos y alertas ───────────────────────────────────────

describe('Sección IV — Conflictos y alertas', () => {
  it('sin PDF cargado → disponible=false + disclaimer', () => {
    const d = buildKitDeViajeData(inputs({ hasConflictos: false }))
    expect(d.conflictos.disponible).toBe(false)
    expect(d.conflictos.disclaimer).toBe(COPY_CONFLICTOS_MISSING)
  })

  it('con PDF en bucket → disponible=true SIN disclaimer (route anexa el PDF verbatim)', () => {
    const d = buildKitDeViajeData(inputs({ hasConflictos: true }))
    expect(d.conflictos.disponible).toBe(true)
    expect(d.conflictos.disclaimer).toBeUndefined()
  })
})

// ── Sección V: Autoridades skeleton ─────────────────────────────────────────

describe('Sección V — Autoridades', () => {
  it('sin ficha oficial → disponible=false + disclaimer + grupos vacío (fallback preview)', () => {
    const d = buildKitDeViajeData(inputs({ hasAutoridadesFicha: false }))
    expect(d.autoridades.disponible).toBe(false)
    expect(d.autoridades.disclaimer).toBe(COPY_AUTORIDADES_PENDIENTE)
    expect(d.autoridades.grupos).toEqual([])
  })

  it('con ficha oficial en bucket → disponible=true SIN disclaimer (renderer omite sección; route anexa PDF)', () => {
    const d = buildKitDeViajeData(inputs({ hasAutoridadesFicha: true }))
    expect(d.autoridades.disponible).toBe(true)
    expect(d.autoridades.disclaimer).toBeUndefined()
    expect(d.autoridades.grupos).toEqual([])
  })
})
