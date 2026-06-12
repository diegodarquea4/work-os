import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Iniciativa } from '@/lib/projects'
import {
  diasSinActividad,
  diasHastaHito,
  iniciativasDeRegion,
  iniciativasEnRojo,
  iniciativasConHitoCritico,
  iniciativasSinActividad,
  criticalAlertCountFor,
  diasDesdeUltimaActividad,
  ultimaActividadConIniciativa,
  ejeBreakdownFor,
  topEjesPorAtencion,
} from '@/lib/regionSummary'

/**
 * Tests de lib/regionSummary.ts.
 *
 * Helpers puros usados por el sidebar y preview del Mapa rediseñado. Foco:
 * los casos donde un edge case rompe el contador del sidebar (sin iniciativas,
 * sin actividad, hitos vencidos, todo en rojo). Cero tests sobre lógica trivial
 * — solo los caminos donde un cambio futuro puede divergir del comportamiento
 * original de VistaRegional.
 */

const NOW = new Date('2026-06-15T12:00:00Z').getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(NOW))
})

afterEach(() => {
  vi.useRealTimers()
})

function makeIniciativa(overrides: Partial<Iniciativa> = {}): Iniciativa {
  return {
    id:                 1,
    n:                  1,
    region:             'Antofagasta',
    cod:                'II',
    capital:            'Antofagasta',
    zona:               'Norte',
    eje:                'Eje 1: Vivienda',
    eje_id:             1,
    eje_gobierno:       null,
    nombre:             'Test',
    descripcion:        null,
    ministerio:         null,
    prioridad:          'Alta',
    etapa_actual:       null,
    estado_termino_gobierno: null,
    proximo_hito:       null,
    fecha_proximo_hito: null,
    fuente_financiamiento: null,
    codigo_bip:         null,
    inversion_mm:       null,
    comuna:             null,
    rat:                null,
    estado_semaforo:    'verde',
    pct_avance:         50,
    responsable:        null,
    codigo_iniciativa:  null,
    origen:             null,
    en_foco:            false,
    tags:               [],
    es_desalojo:        false,
    ...overrides,
  }
}

// ── diasSinActividad / diasHastaHito ──────────────────────────────────────────

describe('diasSinActividad', () => {
  it('devuelve null para null/undefined', () => {
    expect(diasSinActividad(null)).toBeNull()
    expect(diasSinActividad(undefined)).toBeNull()
  })

  it('cuenta días desde el ISO hasta hoy', () => {
    const hace4dias = new Date(NOW - 4 * 24 * 60 * 60 * 1000).toISOString()
    expect(diasSinActividad(hace4dias)).toBe(4)
  })
})

describe('diasHastaHito', () => {
  it('devuelve null para null/undefined', () => {
    expect(diasHastaHito(null)).toBeNull()
    expect(diasHastaHito(undefined)).toBeNull()
  })

  it('valor negativo si la fecha ya pasó', () => {
    expect(diasHastaHito('2026-06-10')).toBeLessThan(0)
  })

  it('valor positivo si la fecha es futura', () => {
    expect(diasHastaHito('2026-06-20')).toBeGreaterThan(0)
  })
})

// ── Filtros por región ────────────────────────────────────────────────────────

describe('iniciativasDeRegion', () => {
  it('filtra por cod exacto', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II' }),
      makeIniciativa({ id: 2, n: 2, cod: 'III' }),
      makeIniciativa({ id: 3, n: 3, cod: 'II' }),
    ]
    expect(iniciativasDeRegion('II', projects)).toHaveLength(2)
    expect(iniciativasDeRegion('XX', projects)).toHaveLength(0)
  })
})

// ── Alertas por región ────────────────────────────────────────────────────────

describe('iniciativasEnRojo', () => {
  it('cuenta solo las de la región con semáforo rojo', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II',  estado_semaforo: 'rojo' }),
      makeIniciativa({ id: 2, n: 2, cod: 'II',  estado_semaforo: 'verde' }),
      makeIniciativa({ id: 3, n: 3, cod: 'III', estado_semaforo: 'rojo' }),
    ]
    expect(iniciativasEnRojo('II', projects)).toHaveLength(1)
  })
})

describe('iniciativasConHitoCritico', () => {
  it('incluye hitos vencidos (días negativos) y ≤ 7 días', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', fecha_proximo_hito: '2026-06-10' }),  // vencido (-5)
      makeIniciativa({ id: 2, n: 2, cod: 'II', fecha_proximo_hito: '2026-06-20' }),  // en 5
      makeIniciativa({ id: 3, n: 3, cod: 'II', fecha_proximo_hito: '2026-07-15' }),  // lejano (>7)
      makeIniciativa({ id: 4, n: 4, cod: 'II', fecha_proximo_hito: null }),          // sin hito
    ]
    const critical = iniciativasConHitoCritico('II', projects)
    expect(critical).toHaveLength(2)
    expect(critical.map(p => p.id)).toEqual([1, 2])  // ordenado por urgencia
  })

  it('respeta umbralDias custom', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', fecha_proximo_hito: '2026-06-18' }),  // en 3
      makeIniciativa({ id: 2, n: 2, cod: 'II', fecha_proximo_hito: '2026-06-25' }),  // en 10
    ]
    expect(iniciativasConHitoCritico('II', projects, 5)).toHaveLength(1)
  })
})

describe('iniciativasSinActividad', () => {
  it('cuenta como críticas las sin actividad registrada (null)', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II' }),
      makeIniciativa({ id: 2, n: 2, cod: 'II' }),
    ]
    const actividad: Record<number, string | null> = { 1: null, 2: null }
    expect(iniciativasSinActividad('II', projects, actividad)).toHaveLength(2)
  })

  it('umbral default 15 días', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II' }),
      makeIniciativa({ id: 2, n: 2, cod: 'II' }),
    ]
    const actividad: Record<number, string | null> = {
      1: new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString(),  // hace 20 días → crítica
      2: new Date(NOW - 5  * 24 * 60 * 60 * 1000).toISOString(),  // hace 5 días → ok
    }
    const result = iniciativasSinActividad('II', projects, actividad)
    expect(result).toHaveLength(1)
    expect(result[0].n).toBe(1)
  })
})

describe('criticalAlertCountFor', () => {
  it('suma todas las categorías sin deduplicar', () => {
    // Una iniciativa en rojo + sin actividad cuenta 2 veces (intencional).
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', estado_semaforo: 'rojo' }),
    ]
    const actividad: Record<number, string | null> = { 1: null }
    // 1 en rojo + 1 sin actividad + 0 hitos = 2
    expect(criticalAlertCountFor('II', projects, actividad)).toBe(2)
  })

  it('devuelve 0 cuando la región no tiene iniciativas', () => {
    expect(criticalAlertCountFor('II', [], {})).toBe(0)
  })
})

// ── Última señal de vida ──────────────────────────────────────────────────────

describe('diasDesdeUltimaActividad', () => {
  it('devuelve null si NINGUNA iniciativa tiene actividad registrada', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II' }),
    ]
    expect(diasDesdeUltimaActividad('II', projects, { 1: null })).toBeNull()
  })

  it('devuelve los días desde la actividad MÁS RECIENTE', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II' }),
      makeIniciativa({ id: 2, n: 2, cod: 'II' }),
      makeIniciativa({ id: 3, n: 3, cod: 'II' }),
    ]
    const actividad: Record<number, string | null> = {
      1: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(),
      2: new Date(NOW - 3  * 24 * 60 * 60 * 1000).toISOString(),  // la más reciente
      3: null,
    }
    expect(diasDesdeUltimaActividad('II', projects, actividad)).toBe(3)
  })

  it('ignora iniciativas de otras regiones', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'III' }),
    ]
    const actividad: Record<number, string | null> = {
      1: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(diasDesdeUltimaActividad('II', projects, actividad)).toBeNull()
  })
})

describe('ultimaActividadConIniciativa', () => {
  it('devuelve null si NINGUNA iniciativa tiene actividad', () => {
    const projects = [makeIniciativa({ id: 1, n: 1, cod: 'II' })]
    expect(ultimaActividadConIniciativa('II', projects, { 1: null })).toBeNull()
  })

  it('devuelve la iniciativa con actividad más reciente y sus días', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', nombre: 'Vieja' }),
      makeIniciativa({ id: 2, n: 2, cod: 'II', nombre: 'Fresca' }),
    ]
    const actividad: Record<number, string | null> = {
      1: new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString(),
      2: new Date(NOW - 2  * 24 * 60 * 60 * 1000).toISOString(),
    }
    const result = ultimaActividadConIniciativa('II', projects, actividad)
    expect(result?.iniciativa.nombre).toBe('Fresca')
    expect(result?.dias).toBe(2)
  })

  it('ignora iniciativas de otras regiones', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'III', nombre: 'Otra región' }),
    ]
    const actividad: Record<number, string | null> = {
      1: new Date(NOW - 1 * 24 * 60 * 60 * 1000).toISOString(),
    }
    expect(ultimaActividadConIniciativa('II', projects, actividad)).toBeNull()
  })
})

// ── Eje breakdown ─────────────────────────────────────────────────────────────

describe('ejeBreakdownFor', () => {
  const REGION_EJES = [
    { id: 1, numero: 1, nombre: 'Vivienda' },
    { id: 2, numero: 2, nombre: 'Salud' },
    { id: 3, numero: 3, nombre: 'Educación' },
  ]

  it('agrega por eje_id con totales, avgPct, counts RAG e inversión', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', eje_id: 1, estado_semaforo: 'verde', pct_avance: 80, inversion_mm: 100 }),
      makeIniciativa({ id: 2, n: 2, cod: 'II', eje_id: 1, estado_semaforo: 'rojo',  pct_avance: 20, inversion_mm: 50 }),
      makeIniciativa({ id: 3, n: 3, cod: 'II', eje_id: 2, estado_semaforo: 'ambar', pct_avance: 50, inversion_mm: null }),
    ]
    const result = ejeBreakdownFor('II', projects, REGION_EJES)
    expect(result).toHaveLength(3)
    const vivienda = result.find(e => e.ejeId === 1)!
    expect(vivienda.total).toBe(2)
    expect(vivienda.avgPct).toBe(50)
    expect(vivienda.verde).toBe(1)
    expect(vivienda.rojo).toBe(1)
    expect(vivienda.invSum).toBe(150)
  })

  it('ejes sin iniciativas devuelven zeros (no se filtran)', () => {
    const result = ejeBreakdownFor('II', [], REGION_EJES)
    expect(result).toHaveLength(3)
    expect(result.every(e => e.total === 0)).toBe(true)
  })

  it('ignora iniciativas sin eje_id (legacy pre-migración 015)', () => {
    const projects = [
      makeIniciativa({ id: 1, n: 1, cod: 'II', eje_id: null, estado_semaforo: 'rojo' }),
    ]
    const result = ejeBreakdownFor('II', projects, REGION_EJES)
    expect(result.every(e => e.total === 0)).toBe(true)
  })
})

describe('topEjesPorAtencion', () => {
  it('devuelve los N ejes con menor avgPct, filtra los sin iniciativas', () => {
    const breakdown = [
      { ejeId: 1, numero: 1, nombre: 'A', total: 2, avgPct: 80, verde: 0, ambar: 0, rojo: 0, invSum: 0 },
      { ejeId: 2, numero: 2, nombre: 'B', total: 0, avgPct: 0,  verde: 0, ambar: 0, rojo: 0, invSum: 0 },
      { ejeId: 3, numero: 3, nombre: 'C', total: 3, avgPct: 20, verde: 0, ambar: 0, rojo: 0, invSum: 0 },
      { ejeId: 4, numero: 4, nombre: 'D', total: 1, avgPct: 50, verde: 0, ambar: 0, rojo: 0, invSum: 0 },
    ]
    const top = topEjesPorAtencion(breakdown, 2)
    expect(top.map(e => e.ejeId)).toEqual([3, 4])  // 20%, 50% — excluye el de total=0
  })
})
