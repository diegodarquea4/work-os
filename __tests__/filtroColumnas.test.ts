import { describe, it, expect } from 'vitest'
import {
  VACIAS, pasaFiltro, filtrarFilas, opcionesDeColumna, ordenarFilas, normalizarFiltro,
  type ColumnaFiltrable,
} from '@/lib/filtroColumnas'

type P = { nombre: string; via: string | null; comuna: string | null; inv: number | null; ingreso: string | null }
const filas: P[] = [
  { nombre: 'Parque Eólico', via: 'EIA', comuna: 'Osorno, San Pablo', inv: 150, ingreso: '2026-08-19' },
  { nombre: 'Loteo Ñuble', via: 'DIA', comuna: 'Chillán', inv: 10, ingreso: '2025-03-01' },
  { nombre: 'Tranque', via: 'DIA', comuna: null, inv: null, ingreso: null },
]
const via: ColumnaFiltrable<P> = { clave: 'via', tipo: 'lista', valores: f => [f.via] }
const comuna: ColumnaFiltrable<P> = { clave: 'comuna', tipo: 'lista', valores: f => (f.comuna ?? '').split(',') }
const inv: ColumnaFiltrable<P> = { clave: 'inv', tipo: 'numero', valor: f => f.inv }
const ingreso: ColumnaFiltrable<P> = { clave: 'ingreso', tipo: 'fecha', valor: f => f.ingreso }
const cols = [via, comuna, inv, ingreso]

describe('filtro de lista', () => {
  it('las vacías son un valor más y una comuna múltiple calza por cualquiera', () => {
    expect(opcionesDeColumna(filas, comuna as Extract<typeof comuna, { tipo: 'lista' }>))
      .toEqual([{ valor: 'Chillán', n: 1 }, { valor: 'Osorno', n: 1 }, { valor: 'San Pablo', n: 1 }, { valor: VACIAS, n: 1 }])
    expect(pasaFiltro(filas[0], comuna, { tipo: 'lista', incluidos: new Set(['San Pablo']) })).toBe(true)
    expect(pasaFiltro(filas[2], comuna, { tipo: 'lista', incluidos: new Set([VACIAS]) })).toBe(true)
  })

  it('las opciones de una columna ignoran su propio filtro pero respetan los demás', () => {
    const filtros = { via: { tipo: 'lista' as const, incluidos: new Set(['DIA']) } }
    expect(filtrarFilas(filas, cols, filtros).map(f => f.nombre)).toEqual(['Loteo Ñuble', 'Tranque'])
    expect(filtrarFilas(filas, cols, filtros, 'via')).toHaveLength(3)
  })

  it('con todo marcado deja de ser filtro', () => {
    expect(normalizarFiltro({ tipo: 'lista', incluidos: new Set(['EIA', 'DIA']) }, ['EIA', 'DIA'])).toBeUndefined()
    expect(normalizarFiltro({ tipo: 'lista', incluidos: new Set(['EIA']) }, ['EIA', 'DIA'])).toBeDefined()
  })
})

describe('filtro de rango', () => {
  it('número inclusive; sin valor no pasa si hay rango', () => {
    const f = { tipo: 'rango' as const, desde: '10', hasta: '100' }
    expect(filas.map(x => pasaFiltro(x, inv, f))).toEqual([false, true, false])
  })
  it('fecha por extremos ISO', () => {
    const f = { tipo: 'rango' as const, desde: '2026-01-01', hasta: null }
    expect(filas.map(x => pasaFiltro(x, ingreso, f))).toEqual([true, false, false])
  })
})

describe('ordenar', () => {
  it('números y texto en ambos sentidos, vacíos siempre al final', () => {
    expect(ordenarFilas(filas, inv, -1).map(f => f.inv)).toEqual([150, 10, null])
    expect(ordenarFilas(filas, inv, 1).map(f => f.inv)).toEqual([10, 150, null])
    expect(ordenarFilas(filas, comuna, 1).map(f => f.nombre)).toEqual(['Loteo Ñuble', 'Parque Eólico', 'Tranque'])
  })
})
