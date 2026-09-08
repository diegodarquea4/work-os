import { describe, it, expect } from 'vitest'
import { crearColaPorClave } from '@/lib/colaPorClave'

/**
 * Lo que esta cola protege es el contenido de un acta: si dos guardados de la
 * misma fila llegan desordenados, queda escrito el valor viejo y nadie se
 * entera. Por eso los casos son sobre ORDEN, no sobre rendimiento.
 */

/** Tarea que resuelve después de `ms` y deja constancia en `registro`. */
function tarea(registro: string[], nombre: string, ms: number) {
  return () => new Promise<string>(resolve => {
    setTimeout(() => { registro.push(nombre); resolve(nombre) }, ms)
  })
}

describe('crearColaPorClave', () => {
  it('respeta el orden aunque la primera tarde más que la segunda', async () => {
    // Este es EL caso: el guardado del número tarda y el de las observaciones
    // sale al toque. Sin cola, gana el que conteste primero.
    const registro: string[] = []
    const encolar = crearColaPorClave<number>()

    const a = encolar(1, tarea(registro, 'lenta', 30))
    const b = encolar(1, tarea(registro, 'rapida', 1))
    await Promise.all([a, b])

    expect(registro).toEqual(['lenta', 'rapida'])
  })

  it('claves distintas no se bloquean entre sí', async () => {
    // Guardar dos métricas distintas en paralelo está bien: serializar todo
    // haría lenta la captura en sala.
    const registro: string[] = []
    const encolar = crearColaPorClave<number>()

    await Promise.all([
      encolar(1, tarea(registro, 'metrica-1-lenta', 30)),
      encolar(2, tarea(registro, 'metrica-2-rapida', 1)),
    ])

    expect(registro).toEqual(['metrica-2-rapida', 'metrica-1-lenta'])
  })

  it('una tarea que falla no frena a la siguiente', async () => {
    // El guardado que viene detrás suele ser el reintento del usuario: dejarlo
    // colgado por el error anterior sería peor que el error.
    const registro: string[] = []
    const encolar = crearColaPorClave<string>()

    const falla = encolar('m', () => Promise.reject(new Error('RLS')))
    const luego = encolar('m', tarea(registro, 'reintento', 1))

    await expect(falla).rejects.toThrow('RLS')
    await expect(luego).resolves.toBe('reintento')
    expect(registro).toEqual(['reintento'])
  })

  it('devuelve el resultado de su propia tarea, no el de la anterior', async () => {
    const encolar = crearColaPorClave<string>()
    const a = encolar('m', () => Promise.resolve('primera'))
    const b = encolar('m', () => Promise.resolve('segunda'))
    expect(await a).toBe('primera')
    expect(await b).toBe('segunda')
  })

  it('no acumula claves: al vaciarse una cola, la clave se suelta', async () => {
    // Si no se limpiara, el Map crecería una entrada por cada métrica tocada
    // durante la sesión y no se vaciaría nunca.
    const encolar = crearColaPorClave<number>()
    const registro: string[] = []

    await encolar(1, tarea(registro, 'a', 1))
    // Tras vaciarse, una tarea nueva de la misma clave no espera a nada.
    const inicio = Date.now()
    await encolar(1, tarea(registro, 'b', 1))
    expect(Date.now() - inicio).toBeLessThan(25)
    expect(registro).toEqual(['a', 'b'])
  })
})
