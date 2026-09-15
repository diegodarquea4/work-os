import { describe, it, expect } from 'vitest'
import {
  capasDe, filtrarPorCapas, parseCapaSel, toggleCapa, serializeCapaSel,
  capaSelLabel, capaSelCaption, esTodas, CAPA_SEL_DEFAULT, CAPA_SEL_TODAS,
} from '@/lib/capas'
import type { Capa } from '@/lib/projects'

/**
 * lib/capas.ts — el selector de capas por vista. Dolor: lo que llega de
 * localStorage (basura, valores viejos), la regla "nunca vacío" del toggle,
 * y la identidad de referencias que los memos del Mapa usan como deps — una
 * referencia nueva por render re-dispara pines y stats comunales sin que
 * haya cambiado nada.
 */

const lista = (['l', 'll', 'lll', 'l'] as Capa[]).map((capa, i) => ({ id: i, capa }))

describe('parseCapaSel', () => {
  it('rechaza basura, vacío y valores que no son del enum', () => {
    for (const raw of [null, undefined, '', 'I', 'L', 'todas', 42, {}, [], ['IV']]) {
      expect(parseCapaSel(raw)).toBeNull()
    }
  })
  it('acepta el string persistido y arrays, normalizando orden y duplicados', () => {
    expect(parseCapaSel('ll,l')).toEqual(['l', 'll'])
    expect(parseCapaSel(['lll', 'l', 'l'])).toEqual(['l', 'lll'])
    expect(parseCapaSel('l, ll ,basura')).toEqual(['l', 'll'])
    expect(serializeCapaSel(['lll', 'l'])).toBe('l,lll')
  })
})

describe('toggleCapa', () => {
  it('marca y desmarca, pero nunca deja la selección vacía', () => {
    expect(toggleCapa(['l'], 'll')).toEqual(['l', 'll'])
    expect(toggleCapa(['l', 'll'], 'l')).toEqual(['ll'])
    expect(toggleCapa(['ll'], 'll')).toEqual(['ll'])
  })
})

describe('filtrarPorCapas / capasDe / rótulos', () => {
  it('con las tres marcadas devuelve la MISMA referencia; con menos, filtra', () => {
    expect(filtrarPorCapas(lista, CAPA_SEL_TODAS)).toBe(lista)
    expect(filtrarPorCapas(lista, ['lll', 'll', 'l'])).toBe(lista)
    const r = filtrarPorCapas(lista, ['l', 'll'])
    expect(r).not.toBe(lista)
    expect(r.map(p => p.capa)).toEqual(['l', 'll', 'l'])
    expect(filtrarPorCapas(lista, ['lll'])).toHaveLength(1)
  })
  it('los Sets se cachean por selección (identidad estable en deps)', () => {
    expect([...capasDe(['ll', 'l'])].sort()).toEqual(['l', 'll'])
    expect(capasDe(['l', 'll'])).toBe(capasDe(['ll', 'l']))
    expect(esTodas(['l', 'll', 'lll'])).toBe(true)
    expect(esTodas(['l'])).toBe(false)
  })
  it('rótulos legibles; con las tres no hay caption', () => {
    expect(capaSelLabel(['l'])).toBe('Capa I')
    expect(capaSelLabel(['l', 'll'])).toBe('Capa I y II')
    expect(capaSelLabel(['l', 'll', 'lll'])).toBe('Capa I, II y III')
    expect(capaSelCaption(CAPA_SEL_TODAS)).toBeNull()
    expect(capaSelCaption(['ll', 'lll'])).toBe('Capa II y III')
  })
  it('las cuatro vistas parten solo con la Capa I (decisión de producto, 2026-09-15)', () => {
    expect(Object.values(CAPA_SEL_DEFAULT).every(v => v.length === 1 && v[0] === 'l')).toBe(true)
  })
})
