import { describe, it, expect } from 'vitest'
import {
  armarSeries, diferencia, marcasDelEje, resumirRegion, normalizarNombre, nombreInstitucion,
  type MetricaEstandar, type MetricaRegional,
} from '@/lib/seguimientoPolicial'

const estandar: MetricaEstandar[] = [
  { id: 1, institucion: 'carabineros', nombre: 'Detenidos durante la última semana', unidad: 'detenidos', orden: 1 },
  { id: 5, institucion: 'pdi', nombre: 'Droga decomisada', unidad: 'kg', orden: 1 },
]
const m = (id: number, region_cod: string, institucion: string, nombre: string, estandar_id: number | null = null): MetricaRegional =>
  ({ id, region_cod, institucion, nombre, unidad: null, tipo: 'numerico', estandar_id })
const metricas = [
  m(10, 'V', 'carabineros', 'Detenidos durante la ultima semana'),     // calza por nombre, sin tilde ni vínculo
  m(11, 'VII', 'carabineros', 'Total acumulado de Detenidos', 1),       // vinculada, otro nombre
  m(12, 'VI', 'carabineros', 'Bandas desarticuladas'),                  // propia
  m(13, 'VI', 'carabineros', 'Droga decomisada'),                       // mismo nombre, OTRA institución: no es la del PDI
]
const sesiones = [
  { id: 1, region_cod: 'V', fecha: '2026-09-14' }, { id: 2, region_cod: 'V', fecha: '2026-09-21' },
  { id: 3, region_cod: 'V', fecha: '2026-09-21' }, { id: 4, region_cod: 'VII', fecha: '2026-09-29' },
  { id: 5, region_cod: 'VI', fecha: '2026-10-06' },
]

describe('armar las series', () => {
  const s = armarSeries(estandar, metricas, sesiones, [
    { sesion_id: 2, metrica_id: 10, valor_num: 846 }, { sesion_id: 1, metrica_id: 10, valor_num: 924 },
    { sesion_id: 3, metrica_id: 10, valor_num: 850 }, { sesion_id: 4, metrica_id: 11, valor_num: 396 },
    { sesion_id: 5, metrica_id: 12, valor_num: 3 }, { sesion_id: 5, metrica_id: 13, valor_num: 7 },
    { sesion_id: 5, metrica_id: 12, valor_num: null }, { sesion_id: 99, metrica_id: 10, valor_num: 1 },
  ])
  it('una métrica regional es estándar por vínculo o por nombre en la misma institución', () => {
    expect(s.serie.V[1]).toEqual([['2026-09-14', 924], ['2026-09-21', 850]])
    expect(s.serie.VII[1]).toEqual([['2026-09-29', 396]])
  })
  it('dos sesiones el mismo día: queda el último valor', () => {
    expect(s.serie.V[1]).toHaveLength(2)
  })
  it('lo demás es propio de la región, también si se llama igual que una de otra institución', () => {
    expect(s.serie.VI).toBeUndefined()
    expect(s.propias.VI.map(p => p.nombre).sort()).toEqual(['Bandas desarticuladas', 'Droga decomisada'])
  })
  it('ignora valores vacíos y sesiones que no se pasaron', () => {
    expect(s.propias.VI.find(p => p.nombre === 'Bandas desarticuladas')?.pts).toEqual([['2026-10-06', 3]])
  })
  it('resume una región', () => {
    expect(resumirRegion('V', sesiones, s, '2026-10-08')).toEqual({ region: 'V', sesiones: 3, ultimoComite: '2026-09-21', dias: 17, estandar: 1, propias: 0 })
    expect(resumirRegion('X', sesiones, s, '2026-10-08')).toMatchObject({ sesiones: 0, ultimoComite: null, dias: null })
  })
})

describe('variación y eje', () => {
  it('compara el último reporte con el anterior', () => {
    expect(diferencia([['a', 800], ['b', 860]])).toEqual({ abs: 60, pct: 7.5 })
    expect(diferencia([['a', 0], ['b', 5]])).toEqual({ abs: 5, pct: null })
    expect(diferencia([['a', 5]])).toBeNull()
  })
  it('las marcas del eje son redondas y cubren los extremos', () => {
    expect(marcasDelEje(0, 924)).toEqual([0, 200, 400, 600, 800, 1000])
    expect(marcasDelEje(-9.5, 22, 3)).toEqual([-20, 0, 20, 40])
    expect(marcasDelEje(0, 0)[0]).toBe(0)
  })
})

it('nombres', () => {
  expect(normalizarNombre('  Población PENAL (semana) ')).toBe('poblacion penal semana')
  expect(nombreInstitucion('fiscalia_regional')).toBe('Fiscalia regional')
  expect(nombreInstitucion('gendarmeria')).toBe('Gendarmería')
})
