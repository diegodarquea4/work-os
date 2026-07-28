import { describe, it, expect } from 'vitest'
import { computeComunaStats, fmtMM } from '@/lib/comunaStats'
import type { Iniciativa } from '@/lib/projects'

/**
 * Reglas de conteo del nivel comunal (lib/comunaStats.ts): multi-comuna sin
 * prorrateo, buckets que garantizan que ninguna iniciativa desaparece
 * (incluidos los CUT foráneos de las filas cross-región), orden de la lista.
 */

function ini(over: Partial<Iniciativa>): Iniciativa {
  return {
    cod: 'V',
    inversion_mm: null,
    comuna: null,
    comuna_cods: [],
    alcance_regional: false,
    ...over,
  } as Iniciativa
}

describe('computeComunaStats', () => {
  it('multi-comuna cuenta COMPLETA en cada comuna, monto incluido (sin prorrateo)', () => {
    const stats = computeComunaStats([
      ini({ comuna: 'Valparaíso;Viña del Mar', comuna_cods: [5101, 5109], inversion_mm: 100 }),
      ini({ comuna: 'Valparaíso', comuna_cods: [5101], inversion_mm: 50 }),
    ], 'V')
    expect(stats.statsByCut.get(5101)).toEqual({ n: 2, mm: 150 })
    expect(stats.statsByCut.get(5109)).toEqual({ n: 1, mm: 100 })
  })

  it('buckets: alcance regional con texto vs sin comuna (texto vacío)', () => {
    const stats = computeComunaStats([
      ini({ comuna: 'Regional', comuna_cods: [], alcance_regional: true, inversion_mm: 10 }),
      ini({ comuna: null, comuna_cods: [], alcance_regional: true, inversion_mm: 7 }),
      ini({ comuna: '  ', comuna_cods: [], alcance_regional: true }),
    ], 'V')
    expect(stats.alcanceRegional).toEqual({ n: 1, mm: 10 })
    expect(stats.sinComuna).toEqual({ n: 2, mm: 7 })
  })

  it('CUT solo de OTRA región → bucket Sin comuna (no desaparece)', () => {
    const stats = computeComunaStats([
      ini({ comuna: 'Alto Hospicio', comuna_cods: [1107], inversion_mm: 33 }),
    ], 'V')
    expect(stats.sinComuna).toEqual({ n: 1, mm: 33 })
    expect(stats.rows).toEqual([])
  })

  it('CUT mixto (propio + foráneo): cuenta en el propio, no va al bucket', () => {
    const stats = computeComunaStats([
      ini({ comuna: 'Valparaíso;Copiapó', comuna_cods: [5101, 3101], inversion_mm: 20 }),
    ], 'V')
    expect(stats.statsByCut.get(5101)).toEqual({ n: 1, mm: 20 })
    expect(stats.sinComuna.n).toBe(0)
  })

  it('ignora iniciativas de otra región y ordena n desc / MM$ desc', () => {
    const stats = computeComunaStats([
      ini({ comuna_cods: [5109], inversion_mm: 900 }),
      ini({ comuna_cods: [5101], inversion_mm: 1 }),
      ini({ comuna_cods: [5101], inversion_mm: 1 }),
      ini({ cod: 'RM', comuna_cods: [13101], inversion_mm: 500 }),
    ], 'V')
    expect(stats.rows.map(r => r.cut)).toEqual([5101, 5109])
    expect(stats.statsByCut.get(5101)!.n).toBe(2)
  })

  it('statsByCut incluye comunas con 0 iniciativas (tooltips del mapa)', () => {
    const stats = computeComunaStats([], 'V')
    expect(stats.statsByCut.size).toBe(38)
    expect(stats.statsByCut.get(5601)).toEqual({ n: 0, mm: 0 })
    expect(stats.rows).toEqual([])
  })
})

describe('fmtMM', () => {
  it('formatea con separador de miles es-CL', () => {
    expect(fmtMM(542235)).toBe(`MM$ ${(542235).toLocaleString('es-CL')}`)
    expect(fmtMM(0)).toBe('MM$ 0')
  })
})
