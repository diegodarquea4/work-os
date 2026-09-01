import { describe, it, expect } from 'vitest'
import { moverEnLista, composeEjeLabel } from '@/lib/ejes'

describe('moverEnLista — reordenamiento de ejes con flechas', () => {
  it('mueve un elemento hacia arriba (swap con el anterior)', () => {
    expect(moverEnLista([9, 25, 24, 26, 15], 2, -1)).toEqual([9, 24, 25, 26, 15])
  })

  it('mueve un elemento hacia abajo (swap con el siguiente)', () => {
    expect(moverEnLista([9, 25, 24, 26, 15], 2, 1)).toEqual([9, 25, 26, 24, 15])
  })

  it('no muta la lista original', () => {
    const orig = [1, 2, 3]
    const out = moverEnLista(orig, 0, 1)
    expect(orig).toEqual([1, 2, 3])
    expect(out).toEqual([2, 1, 3])
    expect(out).not.toBe(orig)
  })

  it('devuelve la MISMA referencia si el movimiento sale de rango (arriba en el tope)', () => {
    const orig = [1, 2, 3]
    expect(moverEnLista(orig, 0, -1)).toBe(orig)
  })

  it('devuelve la MISMA referencia si el movimiento sale de rango (abajo en el fondo)', () => {
    const orig = [1, 2, 3]
    expect(moverEnLista(orig, 2, 1)).toBe(orig)
  })

  it('es reversible: subir y bajar deja la lista igual', () => {
    const orig = [10, 20, 30, 40]
    const subido = moverEnLista(orig, 2, -1)
    expect(moverEnLista(subido, 1, 1)).toEqual(orig)
  })

  it('mover en una lista de un solo elemento no cambia nada', () => {
    expect(moverEnLista([7], 0, 1)).toEqual([7])
    expect(moverEnLista([7], 0, -1)).toEqual([7])
  })
})

describe('composeEjeLabel — el label que el trigger SQL re-escribe', () => {
  // El trigger 083 compone "Eje N: Nombre" con la misma forma que este helper.
  // Este test ancla el formato: si cambia acá, hay que cambiar el trigger.
  it('compone "Eje N: Nombre"', () => {
    expect(composeEjeLabel(4, 'Desarrollo Social y Medio Ambiente'))
      .toBe('Eje 4: Desarrollo Social y Medio Ambiente')
  })
})
