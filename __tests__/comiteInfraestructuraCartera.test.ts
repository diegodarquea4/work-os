import { describe, it, expect } from 'vitest'
import {
  SIN_COMUNA,
  SIN_ETAPA,
  SIN_MEGAPROYECTO,
  filtrarCartera,
  filtrosVacios,
  hayFiltros,
  megaproyectosDe,
  opcionesCartera,
  ordenarCartera,
  requierenAtencion,
  type FiltrosCartera,
} from '@/lib/comiteInfraestructuraCartera'
import type { Iniciativa } from '@/lib/projects'

/**
 * La cartera a pantalla completa filtra sobre `prioridades_territoriales`, no
 * sobre una tabla propia como el Comité Económico. Estos casos fijan las dos
 * decisiones que se toman distinto a él: qué pasa con los campos vacíos (que
 * igual hay que poder pedir) y que las opciones NO dependan de lo ya filtrado.
 */

const CURADOS = ['Carretera Austral', 'Aeropuerto Tepual']

// OJO: en `Iniciativa` (la que sale de mapRow) `estado_semaforo` y `pct_avance`
// NO son nullables — el mapeo siempre los rellena, con 'gris' y 0. El "sin
// dato" de esos dos campos son esos valores, no null; los que sí admiten null
// son comuna y etapa_actual.
function ini(over: Partial<Iniciativa> & { id: number }): Iniciativa {
  return {
    n: over.id,
    nombre: `Iniciativa ${over.id}`,
    estado_semaforo: 'verde',
    pct_avance: 0,
    ministerio: 'Ministerio de Obras Públicas',
    comuna: 'Chaitén',
    etapa_actual: 'Ejecución',
    capa: 'l',
    tags: [],
    ...over,
  } as Iniciativa
}

const CARTERA: Iniciativa[] = [
  ini({ id: 1, tags: ['CRI', 'Carretera Austral'], estado_semaforo: 'rojo', pct_avance: 10 }),
  ini({ id: 2, tags: ['CRI', 'Aeropuerto Tepual'], estado_semaforo: 'ambar', pct_avance: 50, comuna: 'Puerto Montt' }),
  ini({ id: 3, tags: ['CRI'], estado_semaforo: 'verde', pct_avance: 90, ministerio: 'Ministerio de Vivienda y Urbanismo' }),
  ini({ id: 4, tags: ['CRI'], estado_semaforo: 'gris', pct_avance: 0, comuna: null, etapa_actual: null, capa: 'lll' }),
]

describe('megaproyectosDe', () => {
  it('solo cuenta los tags que están en la curaduría de la región', () => {
    expect(megaproyectosDe(CARTERA[0], CURADOS)).toEqual(['Carretera Austral'])
    // 'CRI' es la etiqueta del comité, no un megaproyecto.
    expect(megaproyectosDe(CARTERA[2], CURADOS)).toEqual([])
  })

  it('una iniciativa puede pertenecer a varios', () => {
    const p = ini({ id: 9, tags: ['CRI', 'Carretera Austral', 'Aeropuerto Tepual'] })
    expect(megaproyectosDe(p, CURADOS)).toEqual(CURADOS)
  })
})

describe('filtrarCartera', () => {
  it('sin filtros devuelve la misma lista', () => {
    expect(filtrarCartera(CARTERA, filtrosVacios(), CURADOS)).toBe(CARTERA)
    expect(hayFiltros(filtrosVacios())).toBe(false)
  })

  it('filtra por semáforo, y "gris" agrupa a las sin evaluar', () => {
    const f: FiltrosCartera = { ...filtrosVacios(), semaforo: new Set(['rojo']) }
    expect(filtrarCartera(CARTERA, f, CURADOS).map(p => p.id)).toEqual([1])

    const g: FiltrosCartera = { ...filtrosVacios(), semaforo: new Set(['gris']) }
    expect(filtrarCartera(CARTERA, g, CURADOS).map(p => p.id)).toEqual([4])
  })

  it('O dentro de un filtro', () => {
    const f: FiltrosCartera = { ...filtrosVacios(), semaforo: new Set(['rojo', 'ambar']) }
    expect(filtrarCartera(CARTERA, f, CURADOS).map(p => p.id)).toEqual([1, 2])
  })

  it('Y entre filtros distintos', () => {
    const f: FiltrosCartera = {
      ...filtrosVacios(),
      semaforo: new Set(['rojo', 'ambar']),
      comuna: new Set(['Puerto Montt']),
    }
    expect(filtrarCartera(CARTERA, f, CURADOS).map(p => p.id)).toEqual([2])
  })

  it('el ministerio multi-valor calza por cualquiera de sus partes', () => {
    const p = ini({ id: 5, ministerio: 'Ministerio de Vivienda y Urbanismo;Ministerio de Obras Públicas' })
    const f: FiltrosCartera = { ...filtrosVacios(), ministerio: new Set(['Ministerio de Obras Públicas']) }
    expect(filtrarCartera([p], f, CURADOS).map(x => x.id)).toEqual([5])
  })

  // Lo que no tiene el dato igual tiene que poder pedirse, si no queda
  // invisible en la pantalla que sirve para encontrar cosas.
  it('los marcadores de "sin dato" encuentran las que están vacías', () => {
    const sinMega: FiltrosCartera = { ...filtrosVacios(), megaproyecto: new Set([SIN_MEGAPROYECTO]) }
    expect(filtrarCartera(CARTERA, sinMega, CURADOS).map(p => p.id)).toEqual([3, 4])

    const sinComuna: FiltrosCartera = { ...filtrosVacios(), comuna: new Set([SIN_COMUNA]) }
    expect(filtrarCartera(CARTERA, sinComuna, CURADOS).map(p => p.id)).toEqual([4])

    const sinEtapa: FiltrosCartera = { ...filtrosVacios(), etapa: new Set([SIN_ETAPA]) }
    expect(filtrarCartera(CARTERA, sinEtapa, CURADOS).map(p => p.id)).toEqual([4])
  })

  it('filtra por megaproyecto', () => {
    const f: FiltrosCartera = { ...filtrosVacios(), megaproyecto: new Set(['Carretera Austral']) }
    expect(filtrarCartera(CARTERA, f, CURADOS).map(p => p.id)).toEqual([1])
  })

  it('filtra por capa', () => {
    const f: FiltrosCartera = { ...filtrosVacios(), capa: new Set(['lll']) }
    expect(filtrarCartera(CARTERA, f, CURADOS).map(p => p.id)).toEqual([4])
  })
})

describe('opcionesCartera', () => {
  const o = opcionesCartera(CARTERA, CURADOS)

  it('cuenta cada megaproyecto y agrupa las que no tienen', () => {
    expect(o.megaproyecto.find(x => x.value === 'Carretera Austral')?.count).toBe(1)
    expect(o.megaproyecto.find(x => x.value === SIN_MEGAPROYECTO)?.count).toBe(2)
  })

  it('separa el ministerio multi-valor en sus partes', () => {
    const conMulti = [...CARTERA, ini({ id: 6, ministerio: 'Ministerio de Salud;Ministerio de Obras Públicas' })]
    const oo = opcionesCartera(conMulti, CURADOS)
    expect(oo.ministerio.find(x => x.value === 'Ministerio de Salud')?.count).toBe(1)
    // MOP está en las iniciativas 1, 2 y 4, más la mitad de esta multi-valor.
    expect(oo.ministerio.find(x => x.value === 'Ministerio de Obras Públicas')?.count).toBe(4)
  })

  it('ofrece solo las capas y semáforos presentes', () => {
    expect(o.capa.map(x => x.value)).toEqual(['l', 'lll'])
    expect(o.semaforo.map(x => x.value)).toEqual(['verde', 'ambar', 'rojo', 'gris'])
  })

  // Si dependieran de la selección propia, al elegir una las demás
  // desaparecerían y no habría cómo volver a agregarlas.
  it('las opciones NO dependen de los filtros aplicados', () => {
    const f: FiltrosCartera = { ...filtrosVacios(), semaforo: new Set(['rojo']) }
    const filtrada = filtrarCartera(CARTERA, f, CURADOS)
    expect(filtrada).toHaveLength(1)
    // Se siguen calculando sobre la cartera completa.
    expect(opcionesCartera(CARTERA, CURADOS).semaforo).toHaveLength(4)
  })
})

describe('ordenarCartera', () => {
  it('por semáforo pone el rojo primero y el verde al final', () => {
    expect(ordenarCartera(CARTERA, 'semaforo').map(p => p.id)).toEqual([1, 2, 4, 3])
  })

  it('por avance, tratando el nulo como cero', () => {
    expect(ordenarCartera(CARTERA, 'avance_desc').map(p => p.id)).toEqual([3, 2, 1, 4])
    expect(ordenarCartera(CARTERA, 'avance_asc').map(p => p.id)[0]).toBe(4)
  })

  it('no muta la lista que recibe', () => {
    const original = CARTERA.map(p => p.id)
    ordenarCartera(CARTERA, 'avance_desc')
    expect(CARTERA.map(p => p.id)).toEqual(original)
  })
})

describe('requierenAtencion', () => {
  it('son las de semáforo rojo', () => {
    expect(requierenAtencion(CARTERA).map(p => p.id)).toEqual([1])
  })
})
