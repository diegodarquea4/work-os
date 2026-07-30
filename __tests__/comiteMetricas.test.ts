import { describe, it, expect } from 'vitest'
import {
  agruparPorInstitucion,
  formatoValorComite,
  tieneValorComite,
  deltaPulso,
  COMITE_INSTITUCIONES,
} from '@/lib/sesiones/helpers'
import type { ComiteMetrica, SesionComiteValor } from '@/lib/types'

// ── Fixtures ─────────────────────────────────────────────────────────────────

function metrica(over: Partial<ComiteMetrica> & { id: number }): ComiteMetrica {
  return {
    region_cod: 'V',
    institucion: 'carabineros',
    nombre: `Métrica ${over.id}`,
    tipo: 'numerico',
    unidad: null,
    orden: 0,
    activo: true,
    ...over,
  }
}

function valor(over: Partial<SesionComiteValor> & { id: number; metrica_id: number }): SesionComiteValor {
  return {
    sesion_id: 1,
    valor_num: null,
    valor_texto: null,
    observaciones: null,
    desglose: [],
    ...over,
  }
}

// ── agruparPorInstitucion ────────────────────────────────────────────────────

describe('agruparPorInstitucion', () => {
  it('devuelve las 4 instituciones fijas en orden', () => {
    const grupos = agruparPorInstitucion([], [])
    expect(grupos.map(g => g.institucion)).toEqual(['carabineros', 'pdi', 'armada', 'gendarmeria'])
  })

  it('respeta el orden del catálogo y adjunta el valor (o null)', () => {
    const cat = [
      metrica({ id: 2, orden: 2 }),
      metrica({ id: 1, orden: 1 }),
      metrica({ id: 3, institucion: 'pdi', orden: 1 }),
    ]
    const vals = [valor({ id: 10, metrica_id: 1, valor_num: 42 })]
    const grupos = agruparPorInstitucion(cat, vals)
    const carab = grupos.find(g => g.institucion === 'carabineros')!
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1, 2]) // orden 1 antes que 2
    expect(carab.filas[0].valor?.valor_num).toBe(42)
    expect(carab.filas[1].valor).toBeNull() // sin valor → fila presente para digitar
    expect(grupos.find(g => g.institucion === 'pdi')!.filas).toHaveLength(1)
    expect(grupos.find(g => g.institucion === 'armada')!.filas).toEqual([])
  })

  it('excluye métricas inactivas', () => {
    const cat = [metrica({ id: 1 }), metrica({ id: 2, activo: false })]
    const carab = agruparPorInstitucion(cat, [])[0]
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1])
  })

  it('soloConValor=true filtra las filas sin dato (para el acta)', () => {
    const cat = [metrica({ id: 1, orden: 1 }), metrica({ id: 2, orden: 2 })]
    const vals = [valor({ id: 10, metrica_id: 1, valor_num: 5 })]
    const carab = agruparPorInstitucion(cat, vals, true)[0]
    expect(carab.filas.map(f => f.metrica.id)).toEqual([1])
  })
})

// ── tieneValorComite ─────────────────────────────────────────────────────────

describe('tieneValorComite', () => {
  it('null / fila vacía → false', () => {
    expect(tieneValorComite(null)).toBe(false)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1 }))).toBe(false)
  })
  it('detecta número, texto, observación o desglose', () => {
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_num: 0 }))).toBe(true) // 0 es un dato
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_texto: 'algo' }))).toBe(true)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, valor_texto: '   ' }))).toBe(false)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, observaciones: 'año a la fecha' }))).toBe(true)
    expect(tieneValorComite(valor({ id: 1, metrica_id: 1, desglose: [{ etiqueta: 'V', valor: '20%' }] }))).toBe(true)
  })
})

// ── formatoValorComite ───────────────────────────────────────────────────────

describe('formatoValorComite', () => {
  it('numérico con y sin unidad', () => {
    const m = metrica({ id: 1, tipo: 'numerico', unidad: 'detenidos' })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_num: 833 }), m)).toBe('833 detenidos')
    const mSin = metrica({ id: 1, tipo: 'numerico', unidad: null })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_num: 2236 }), mSin)).toBe('2.236')
  })
  it('texto usa valor_texto; vacío → —', () => {
    const m = metrica({ id: 1, tipo: 'texto' })
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1, valor_texto: 'Allanamiento OS7' }), m)).toBe('Allanamiento OS7')
    expect(formatoValorComite(null, m)).toBe('—')
    const mNum = metrica({ id: 1, tipo: 'numerico' })
    expect(formatoValorComite(null, mNum)).toBe('—')
    expect(formatoValorComite(valor({ id: 1, metrica_id: 1 }), mNum)).toBe('—')
  })
})

// ── deltaPulso reutilizado sobre la serie WoW por institución ────────────────

describe('deltaPulso (WoW del reporte por institución)', () => {
  it('delta absoluto y % entre las dos últimas semanas', () => {
    expect(deltaPulso(40, 44)).toEqual({ abs: 4, pct: 10 })
  })
  it('sin semana anterior → null (primera medición)', () => {
    expect(deltaPulso(null, 44)).toBeNull()
  })
  it('semana anterior 0 → pct null, delta absoluto igual', () => {
    expect(deltaPulso(0, 3)).toEqual({ abs: 3, pct: null })
  })
})

describe('COMITE_INSTITUCIONES', () => {
  it('son 4 con label legible', () => {
    expect(COMITE_INSTITUCIONES).toHaveLength(4)
    expect(COMITE_INSTITUCIONES.find(i => i.key === 'pdi')?.label).toBe('PDI')
  })
})
