import { describe, it, expect } from 'vitest'
import { capasDe, filtrarPorCapas, parseCapaSel, CAPA_SEL_VALUES, CAPA_SEL_DEFAULT } from '@/lib/capas'
import type { Capa } from '@/lib/projects'

/**
 * lib/capas.ts — el selector de capas por vista. Dolor: lo que llega de
 * localStorage (basura, valores viejos), y la identidad de referencias que
 * los memos del Mapa usan como deps — una referencia nueva por render
 * re-dispara pines y stats comunales sin que haya cambiado nada.
 */

const lista = (['l', 'll', 'lll', 'l'] as Capa[]).map((capa, i) => ({ id: i, capa }))

describe('parseCapaSel', () => {
  it('rechaza basura y valores que no son del enum', () => {
    for (const raw of [null, undefined, '', 'I', 'L', 'l+lll', 'todos', 42, {}]) {
      expect(parseCapaSel(raw)).toBeNull()
    }
  })
  it('acepta los 5 valores', () => {
    for (const v of CAPA_SEL_VALUES) expect(parseCapaSel(v)).toBe(v)
  })
})

describe('filtrarPorCapas / capasDe', () => {
  it("'todas' devuelve la MISMA referencia; 'l+ll' saca la III", () => {
    expect(filtrarPorCapas(lista, 'todas')).toBe(lista)
    const r = filtrarPorCapas(lista, 'l+ll')
    expect(r).not.toBe(lista)
    expect(r.map(p => p.capa)).toEqual(['l', 'll', 'l'])
    expect(filtrarPorCapas(lista, 'lll')).toHaveLength(1)
  })
  it('los Sets son constantes de módulo (identidad estable en deps)', () => {
    expect([...capasDe('l+ll')].sort()).toEqual(['l', 'll'])
    expect(capasDe('l+ll')).toBe(capasDe('l+ll'))
    expect(capasDe('todas').size).toBe(3)
  })
  it('las cuatro vistas parten en Capa I (decisión de producto, 2026-09-15)', () => {
    expect(Object.values(CAPA_SEL_DEFAULT).every(v => v === 'l')).toBe(true)
  })
})
