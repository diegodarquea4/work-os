import { describe, it, expect } from 'vitest'
import {
  snapshotDesdeCatalogo,
  cambiosDesdeCatalogo,
  descripcionDeCambios,
  parcheDeCartera,
  type SnapshotOrigen,
  type EspejoCartera,
} from '@/lib/carteraReconciliar'

const TITULAR = 'Energía del Norte SpA'

function snapshot(over: Partial<SnapshotOrigen> = {}): SnapshotOrigen {
  return { nombre: 'Parque Tamarugal', titular: TITULAR, estado: 'En Calificación', inversion: 120.5, ...over }
}

/** Cartera intacta: espeja exactamente el snapshot que recibe. */
function espejoDe(s: SnapshotOrigen, over: Partial<EspejoCartera> = {}): EspejoCartera {
  return {
    nombre: s.nombre,
    fuente_financiamiento: s.titular,
    responsable_operativo: s.titular,
    inversion_monto: s.inversion,
    ...over,
  }
}

describe('snapshotDesdeCatalogo', () => {
  // El catálogo entrega la inversión en unidades; la cartera la anota en
  // millones. El snapshot se guarda ya convertido para que la comparación sea
  // entre cifras de la misma escala.
  it('guarda la inversión en la escala de la cartera, no en la de la fuente', () => {
    expect(snapshotDesdeCatalogo({ nombre: 'X', titular: 'Y', estado: 'Aprobado', inversion: 3_000_000_000 }).inversion)
      .toBe(3000)
  })
})

describe('cambiosDesdeCatalogo', () => {
  // La primera corrida sobre un proyecto importado antes de esta funcionalidad
  // solo siembra el snapshot. Reportar "cambió todo" el día que se enciende
  // llenaría cada bitácora de ruido.
  it('sin snapshot previo no reporta nada', () => {
    const a = snapshot()
    expect(cambiosDesdeCatalogo(null, a, espejoDe(a))).toEqual([])
    expect(cambiosDesdeCatalogo(undefined, a, espejoDe(a))).toEqual([])
  })

  it('sin cambios en la fuente no reporta nada', () => {
    const a = snapshot()
    expect(cambiosDesdeCatalogo(a, snapshot(), espejoDe(a))).toEqual([])
  })

  it('detecta el estado, el monto, el titular y el nombre', () => {
    const previo = snapshot()
    const actual = snapshot({
      nombre: 'Parque Tamarugal II', titular: 'Otra Empresa SpA',
      estado: 'Aprobado', inversion: 140,
    })
    const campos = cambiosDesdeCatalogo(previo, actual, espejoDe(previo)).map(c => c.campo)
    expect(campos.sort()).toEqual(['estado', 'inversion', 'nombre', 'titular'])
  })

  it('no confunde mayúsculas ni espacios con un cambio real', () => {
    const previo = snapshot()
    const actual = snapshot({ titular: `  ${TITULAR.toUpperCase()} ` })
    expect(cambiosDesdeCatalogo(previo, actual, espejoDe(previo))).toEqual([])
  })

  // El monto se guarda con un decimal: una diferencia por redondeo no es un
  // cambio que valga anotar en la bitácora.
  it('ignora diferencias de redondeo en el monto', () => {
    const previo = snapshot({ inversion: 120.5 })
    expect(cambiosDesdeCatalogo(previo, snapshot({ inversion: 120.52 }), espejoDe(previo))).toEqual([])
    expect(cambiosDesdeCatalogo(previo, snapshot({ inversion: 121 }), espejoDe(previo))).toHaveLength(1)
  })

  describe('qué es seguro de propagar', () => {
    it('un campo que nadie tocó se puede actualizar', () => {
      const previo = snapshot()
      const actual = snapshot({ inversion: 200 })
      const [c] = cambiosDesdeCatalogo(previo, actual, espejoDe(previo))
      expect(c.seguroDeAplicar).toBe(true)
    })

    // Lo que una persona corrigió manda sobre la fuente: se informa el cambio
    // pero no se pisa lo escrito.
    it('un campo corregido a mano NO se pisa', () => {
      const previo = snapshot()
      const actual = snapshot({ inversion: 200 })
      const cartera = espejoDe(previo, { inversion_monto: 999 })
      const [c] = cambiosDesdeCatalogo(previo, actual, cartera)
      expect(c.seguroDeAplicar).toBe(false)
    })

    // El titular alimenta financiamiento y operación. Si UNO de los dos fue
    // corregido —el caso real: financia una empresa y opera otra— propagar
    // pisaría esa distinción.
    it('el titular no se propaga si cualquiera de sus dos campos fue editado', () => {
      const previo = snapshot()
      const actual = snapshot({ titular: 'Nueva Razón Social SpA' })
      const soloOperador = espejoDe(previo, { responsable_operativo: 'Operadora Austral Ltda.' })
      expect(cambiosDesdeCatalogo(previo, actual, soloOperador)[0].seguroDeAplicar).toBe(false)
      expect(cambiosDesdeCatalogo(previo, actual, espejoDe(previo))[0].seguroDeAplicar).toBe(true)
    })

    // `estado_actual` describe la obra y lo lleva el comité; el estado del
    // expediente describe el trámite ambiental. Son cosas distintas y el
    // segundo nunca pisa al primero.
    it('el estado del expediente nunca se propaga, solo se informa', () => {
      const previo = snapshot()
      const actual = snapshot({ estado: 'Aprobado' })
      const [c] = cambiosDesdeCatalogo(previo, actual, espejoDe(previo))
      expect(c.campo).toBe('estado')
      expect(c.seguroDeAplicar).toBe(false)
    })
  })
})

describe('descripcionDeCambios', () => {
  it('nombra el campo y el antes y después', () => {
    const previo = snapshot()
    const cambios = cambiosDesdeCatalogo(previo, snapshot({ estado: 'Aprobado' }), espejoDe(previo))
    const txt = descripcionDeCambios(cambios)
    expect(txt).toContain('Estado en el SEIA')
    expect(txt).toContain('En Calificación')
    expect(txt).toContain('Aprobado')
  })

  it('el monto se lee con su unidad, no como número pelado', () => {
    const previo = snapshot()
    const cambios = cambiosDesdeCatalogo(previo, snapshot({ inversion: 200 }), espejoDe(previo))
    expect(descripcionDeCambios(cambios)).toContain('200 MM$')
  })

  // Quien lea la bitácora en seis meses tiene que poder distinguir "la ficha
  // quedó actualizada" de "la fuente cambió pero se respetó lo escrito".
  it('avisa cuando el valor de la ficha se mantuvo', () => {
    const previo = snapshot()
    const cartera = espejoDe(previo, { inversion_monto: 999 })
    const cambios = cambiosDesdeCatalogo(previo, snapshot({ inversion: 200 }), cartera)
    expect(descripcionDeCambios(cambios)).toContain('se mantuvo el valor de la ficha')
  })

  it('concuerda el encabezado con la cantidad de cambios', () => {
    const previo = snapshot()
    const uno = cambiosDesdeCatalogo(previo, snapshot({ inversion: 200 }), espejoDe(previo))
    expect(descripcionDeCambios(uno)).toContain('El SEIA actualizó este proyecto.')
    const dos = cambiosDesdeCatalogo(previo, snapshot({ inversion: 200, estado: 'Aprobado' }), espejoDe(previo))
    expect(descripcionDeCambios(dos)).toContain('actualizó 2 datos')
  })
})

describe('parcheDeCartera', () => {
  it('escribe solo lo seguro y deja fuera lo demás', () => {
    const previo = snapshot()
    const actual = snapshot({ inversion: 200, estado: 'Aprobado' })
    const parche = parcheDeCartera(cambiosDesdeCatalogo(previo, actual, espejoDe(previo)), actual)
    expect(parche).toEqual({ inversion_monto: 200 })
    expect(parche).not.toHaveProperty('estado_actual')
  })

  it('el titular actualiza los dos campos que alimenta', () => {
    const previo = snapshot()
    const actual = snapshot({ titular: 'Nueva Razón Social SpA' })
    const parche = parcheDeCartera(cambiosDesdeCatalogo(previo, actual, espejoDe(previo)), actual)
    expect(parche).toEqual({
      fuente_financiamiento: 'Nueva Razón Social SpA',
      responsable_operativo: 'Nueva Razón Social SpA',
    })
  })

  it('sin cambios seguros el parche queda vacío', () => {
    const previo = snapshot()
    const actual = snapshot({ inversion: 200 })
    const cartera = espejoDe(previo, { inversion_monto: 999 })
    expect(parcheDeCartera(cambiosDesdeCatalogo(previo, actual, cartera), actual)).toEqual({})
  })
})
