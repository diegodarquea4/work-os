import { describe, it, expect } from 'vitest'
import {
  estadoDe, colorBloque, respuestaVacia, ITEMS, BLOQUES, ID2ITEM, STATUS_ITEM,
  type Item, type Respuesta,
} from '@/lib/prevencionRespuesta'

/**
 * Tests de la lógica de semáforo del instrumento "Prevención y Respuesta".
 *
 * Es el punto frágil de la migración: el color de cada punto y del consolidado
 * se deriva de `estadoDe` / `colorBloque`. Un cambio silencioso acá cambiaría
 * lo que ve el equipo en las reuniones. Cubrimos las ramas, no cobertura.
 */

// Ítem con checks (verif) y sin checks (paso de flujo).
const conChecks: Item = { id: 't1', tipo: 'verif', t: '', como: '', base: '', prof: [], checks: ['a', 'b', 'c'] }
const sinChecks: Item = { id: 't2', tipo: 'flujo', t: '', como: '', base: '', prof: [] }

const resp = (over: Partial<Respuesta> = {}): Respuesta => ({ ...respuestaVacia(conChecks), ...over })

describe('estadoDe — semáforo derivado de checks', () => {
  it('0 casillas marcadas = sin evaluar (null)', () => {
    expect(estadoDe(resp({ checks: [false, false, false] }), conChecks)).toBeNull()
  })
  it('todas las casillas = listo', () => {
    expect(estadoDe(resp({ checks: [true, true, true] }), conChecks)).toBe('listo')
  })
  it('algunas casillas = parcial', () => {
    expect(estadoDe(resp({ checks: [true, false, true] }), conChecks)).toBe('parcial')
  })
  it('undefined = null', () => {
    expect(estadoDe(undefined, conChecks)).toBeNull()
  })
})

describe('estadoDe — override manual', () => {
  it('manual respeta el estado fijado, ignorando los checks', () => {
    expect(estadoDe(resp({ manual: true, estado: 'nolisto', checks: [true, true, true] }), conChecks)).toBe('nolisto')
  })
  it('paso de flujo (sin checks) usa el estado manual', () => {
    expect(estadoDe({ estado: 'listo', manual: false, checks: [], comentarios: [] }, sinChecks)).toBe('listo')
    expect(estadoDe({ estado: null, manual: false, checks: [], comentarios: [] }, sinChecks)).toBeNull()
  })
})

describe('colorBloque — color de celda del consolidado', () => {
  const items: Item[] = [conChecks, { ...conChecks, id: 't1b' }]

  it('gris cuando nada está evaluado', () => {
    expect(colorBloque({}, items)).toBe('gris')
  })
  it('verde solo cuando TODOS los ítems están listo', () => {
    expect(colorBloque({
      t1:  resp({ checks: [true, true, true] }),
      t1b: resp({ checks: [true, true, true] }),
    }, items)).toBe('verde')
  })
  it('amarillo si hay parciales o quedan ítems sin evaluar', () => {
    expect(colorBloque({ t1: resp({ checks: [true, false, false] }) }, items)).toBe('amarillo')
    expect(colorBloque({ t1: resp({ checks: [true, true, true] }) }, items)).toBe('amarillo') // t1b sin evaluar
  })
  it('rojo si algún ítem está nolisto (override manual)', () => {
    expect(colorBloque({
      t1:  resp({ manual: true, estado: 'nolisto' }),
      t1b: resp({ checks: [true, true, true] }),
    }, items)).toBe('rojo')
  })
})

describe('estructura del instrumento', () => {
  it('22 ítems con semáforo y 5 bloques (checklist DPR final)', () => {
    expect(ITEMS.length).toBe(22)
    expect(BLOQUES.length).toBe(5)
  })
  it('todos los ítems del consolidado están en ID2ITEM', () => {
    for (const it of ITEMS) expect(ID2ITEM[it.id]).toBeDefined()
  })
  it('el box de estado es resoluble pero NO cuenta en el consolidado', () => {
    // Debe existir en ID2ITEM para que se cargue/renderice, pero quedar fuera de
    // ITEMS/BLOQUES para no contaminar el conteo ni el color de las celdas.
    expect(ID2ITEM[STATUS_ITEM.id]).toBeDefined()
    expect(ITEMS.some(it => it.id === STATUS_ITEM.id)).toBe(false)
  })
})
