import { describe, it, expect } from 'vitest'
import {
  armarFoto,
  atrasoAlCerrar,
  cuentaComoAtraso,
  diasDeAtraso,
  necesitaRespaldo,
  serieDeFotos,
  type OficioParaFoto,
} from '@/lib/oficiosFotos'

const oficio = (p: Partial<OficioParaFoto> = {}): OficioParaFoto => ({
  region_cod: 'X',
  oaeca_sea: 'DGA, Región de Los Lagos',
  oaeca_nombre: null,
  ministerio: 'MOP',
  fecha_limite: '2026-09-20',
  proyecto_privado_id: null,
  ...p,
})

describe('diasDeAtraso', () => {
  it('cuenta los días desde la fecha límite', () => {
    expect(diasDeAtraso('2026-09-20', '2026-09-30')).toBe(10)
  })

  it('es negativo si todavía está en plazo', () => {
    expect(diasDeAtraso('2026-10-05', '2026-09-30')).toBe(-5)
  })

  it('el día del vencimiento es cero, no un atraso', () => {
    expect(diasDeAtraso('2026-09-30', '2026-09-30')).toBe(0)
  })

  it('sin fecha límite es null, que no es cero', () => {
    // Cero se promediaría con los demás; null se descarta.
    expect(diasDeAtraso(null, '2026-09-30')).toBeNull()
    expect(diasDeAtraso(undefined, '2026-09-30')).toBeNull()
  })

  it('cruza el cambio de hora sin perder un día', () => {
    // Chile cambia de hora el primer sábado de septiembre; con medianoche en
    // vez de mediodía, este tramo daba 29 o 31.
    expect(diasDeAtraso('2026-08-25', '2026-09-24')).toBe(30)
  })

  it('acepta un timestamp completo y se queda con el día', () => {
    expect(diasDeAtraso('2026-09-20T00:00:00Z', '2026-09-30T18:45:00Z')).toBe(10)
  })
})

describe('atrasoAlCerrar', () => {
  it('congela el atraso del día en que se cerró, no el de hoy', () => {
    expect(atrasoAlCerrar('2026-01-10', '2026-01-18T09:00:00Z')).toBe(8)
  })

  it('respondió a tiempo: queda negativo, y eso también sirve', () => {
    expect(atrasoAlCerrar('2026-01-20', '2026-01-18T09:00:00Z')).toBe(-2)
  })
})

describe('cuentaComoAtraso', () => {
  it('respondió y cerrado a mano cuentan', () => {
    expect(cuentaComoAtraso('respondio')).toBe(true)
    expect(cuentaComoAtraso('cerrado_a_mano')).toBe(true)
  })

  it('un expediente muerto NO cuenta', () => {
    // Es la regla que evita los 855 días promedio de los 27 expedientes
    // terminados anticipadamente.
    expect(cuentaComoAtraso('expediente_cerrado')).toBe(false)
  })

  it('sin motivo no cuenta: son las filas cerradas antes de la mig 122', () => {
    expect(cuentaComoAtraso(null)).toBe(false)
    expect(cuentaComoAtraso(undefined)).toBe(false)
  })
})

describe('armarFoto', () => {
  it('agrupa por organismo y separa vencidos de en plazo', () => {
    const foto = armarFoto([
      oficio({ fecha_limite: '2026-09-20' }),                       // 10 días
      oficio({ fecha_limite: '2026-09-25' }),                       // 5 días
      oficio({ fecha_limite: '2026-10-10' }),                       // en plazo
    ], 'X', '2026-09-30')

    expect(foto).toHaveLength(1)
    expect(foto[0]).toMatchObject({
      region_cod: 'X',
      tomada_el: '2026-09-30',
      pendientes: 3,
      vencidos: 2,
      dias_atraso_total: 15,
    })
  })

  it('el mismo organismo escrito distinto es uno solo', () => {
    const foto = armarFoto([
      oficio({ oaeca_sea: 'DGA, Región de Los Lagos' }),
      oficio({ oaeca_sea: '  dga, región de los lagos  ' }),
    ], 'X', '2026-09-30')
    expect(foto).toHaveLength(1)
    expect(foto[0].pendientes).toBe(2)
    // Se guarda el primer nombre visto, no el normalizado.
    expect(foto[0].oaeca).toBe('DGA, Región de Los Lagos')
  })

  it('cuenta aparte lo que es de la cartera', () => {
    // El corte que hace comparables dos regiones: de 546 pendientes en el país
    // solo 90 eran de un proyecto de alguna cartera.
    const foto = armarFoto([
      oficio({ fecha_limite: '2026-09-20', proyecto_privado_id: 7 }),
      oficio({ fecha_limite: '2026-09-20', proyecto_privado_id: null }),
      oficio({ fecha_limite: '2026-10-20', proyecto_privado_id: 7 }),
    ], 'X', '2026-09-30')

    expect(foto[0]).toMatchObject({
      pendientes: 3, vencidos: 2, de_cartera: 2, vencidos_de_cartera: 1,
    })
  })

  it('ignora los de otra región', () => {
    const foto = armarFoto([
      oficio({ region_cod: 'X' }),
      oficio({ region_cod: 'IX' }),
    ], 'X', '2026-09-30')
    expect(foto).toHaveLength(1)
    expect(foto[0].pendientes).toBe(1)
  })

  it('cae a oaeca_nombre cuando no hay oaeca_sea', () => {
    const foto = armarFoto([oficio({ oaeca_sea: null, oaeca_nombre: 'SEREMI de Salud' })], 'X', '2026-09-30')
    expect(foto[0].oaeca).toBe('SEREMI de Salud')
  })

  it('un oficio sin organismo no arma fila', () => {
    const foto = armarFoto([oficio({ oaeca_sea: null, oaeca_nombre: null })], 'X', '2026-09-30')
    expect(foto).toHaveLength(0)
  })

  it('un oficio sin fecha límite cuenta como pendiente pero no como vencido', () => {
    const foto = armarFoto([oficio({ fecha_limite: null })], 'X', '2026-09-30')
    expect(foto[0]).toMatchObject({ pendientes: 1, vencidos: 0, dias_atraso_total: 0 })
  })

  it('rescata el ministerio de cualquier fila del grupo que lo traiga', () => {
    const foto = armarFoto([
      oficio({ ministerio: null }),
      oficio({ ministerio: 'MOP' }),
    ], 'X', '2026-09-30')
    expect(foto[0].ministerio).toBe('MOP')
  })

  it('ordena por vencidos, que es como se lee', () => {
    const foto = armarFoto([
      oficio({ oaeca_sea: 'A', fecha_limite: '2026-10-30' }),
      oficio({ oaeca_sea: 'B', fecha_limite: '2026-09-01' }),
    ], 'X', '2026-09-30')
    expect(foto.map(f => f.oaeca)).toEqual(['B', 'A'])
  })

  it('sin oficios no hay foto, y eso no es un error', () => {
    expect(armarFoto([], 'X', '2026-09-30')).toEqual([])
  })
})

describe('necesitaRespaldo', () => {
  it('si nunca se sacó una, sí', () => {
    expect(necesitaRespaldo(null, '2026-09-30')).toBe(true)
  })

  it('a los 20 días, sí', () => {
    expect(necesitaRespaldo('2026-09-10', '2026-09-30')).toBe(true)
  })

  it('a los 19, todavía no: la sesión de mañana saca una mejor', () => {
    expect(necesitaRespaldo('2026-09-11', '2026-09-30')).toBe(false)
  })

  it('una fecha ilegible saca una foto de más, que es el error barato', () => {
    expect(necesitaRespaldo('cuando sea', '2026-09-30')).toBe(true)
  })
})

describe('serieDeFotos', () => {
  const fotos = [
    { tomada_el: '2026-09-15', oaeca: 'A', ministerio: null, vencidos: 3, dias_atraso_total: 30, vencidos_de_cartera: 3 },
    { tomada_el: '2026-09-15', oaeca: 'B', ministerio: null, vencidos: 1, dias_atraso_total: 2,  vencidos_de_cartera: 0 },
    { tomada_el: '2026-09-01', oaeca: 'A', ministerio: null, vencidos: 2, dias_atraso_total: 10, vencidos_de_cartera: 2 },
  ]

  it('un punto por fecha, en orden cronológico', () => {
    expect(serieDeFotos(fotos).map(p => p.tomada_el)).toEqual(['2026-09-01', '2026-09-15'])
  })

  it('el promedio sale de la suma y la cuenta, no de promediar promedios', () => {
    // A tiene 3 vencidos y 30 días (10 c/u); B tiene 1 y 2 días. El promedio
    // real es 32/4 = 8. Promediando promedios daría (10 + 2) / 2 = 6.
    const p = serieDeFotos(fotos).find(x => x.tomada_el === '2026-09-15')!
    expect(p.vencidos).toBe(4)
    expect(p.atrasoPromedio).toBe(8)
    expect(p.organismosConAtraso).toBe(2)
  })

  it('una foto sin vencidos no promedia cero: promedia null', () => {
    const p = serieDeFotos([
      { tomada_el: '2026-09-15', oaeca: 'A', ministerio: null, vencidos: 0, dias_atraso_total: 0, vencidos_de_cartera: 0 },
    ])[0]
    expect(p.vencidos).toBe(0)
    expect(p.atrasoPromedio).toBeNull()
  })
})
