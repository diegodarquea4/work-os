import { describe, it, expect } from 'vitest'
import {
  agruparPorOaeca,
  claveOaeca,
  compromisosACerrar,
  descripcionSeguimiento,
  nombreOaeca,
  type CompromisoSeguimiento,
  type OficioSeguimiento,
} from '@/lib/oficiosSeguimiento'

/**
 * El seguimiento de oficios se mira desde QUIEN DEBE RESPONDER, no desde el
 * proyecto. Lo que se prueba acá es que la identidad del organismo aguante lo
 * que la fuente escribe de verdad —con jurisdicción, con mayúsculas
 * inconsistentes— y que un compromiso no se cierre mientras quede algo
 * pendiente.
 */

const HOY = '2026-09-29'

const of = (over: Partial<OficioSeguimiento> & { id: number }): OficioSeguimiento => ({
  oaeca_sea: 'DGA, Región de Los Lagos',
  oaeca_nombre: 'Dirección General de Aguas',
  nombre_proyecto: 'Parque Gramado',
  proyecto_privado_id: 287,
  fecha_limite: '2026-10-01',
  estado: 'pendiente',
  ...over,
})

describe('nombreOaeca', () => {
  // La jurisdicción es parte de la identidad: «CONAF» no dice cuál de las 15.
  it('prefiere el nombre con jurisdicción', () => {
    expect(nombreOaeca({ oaeca_sea: 'CONAF, Región de Coquimbo', oaeca_nombre: 'CONAF' }))
      .toBe('CONAF, Región de Coquimbo')
  })

  it('cae al nombre corto cuando la fuente no trae el largo', () => {
    expect(nombreOaeca({ oaeca_sea: null, oaeca_nombre: 'CONAF' })).toBe('CONAF')
  })

  it('no devuelve vacío cuando no hay ninguno', () => {
    expect(nombreOaeca({ oaeca_sea: null, oaeca_nombre: null })).toBe('Organismo sin identificar')
  })
})

describe('claveOaeca', () => {
  it('ignora mayúsculas, bordes y espacios repetidos', () => {
    expect(claveOaeca('  DGA,   Región de Los Lagos ')).toBe(claveOaeca('dga, Región de los lagos'))
  })

  it('no confunde dos regiones del mismo organismo', () => {
    expect(claveOaeca('DGA, Región de Los Lagos')).not.toBe(claveOaeca('DGA, Región de Los Ríos'))
  })
})

describe('agruparPorOaeca', () => {
  it('junta los oficios de un organismo y cuenta sus proyectos', () => {
    const g = agruparPorOaeca([
      of({ id: 1, proyecto_privado_id: 287, nombre_proyecto: 'Gramado' }),
      of({ id: 2, proyecto_privado_id: 287, nombre_proyecto: 'Gramado' }),
      of({ id: 3, proyecto_privado_id: 300, nombre_proyecto: 'Otro' }),
    ], HOY)

    expect(g).toHaveLength(1)
    expect(g[0].oficios).toHaveLength(3)
    expect(g[0].proyectos).toEqual([
      { proyectoId: 287, nombre: 'Gramado', oficios: 2 },
      { proyectoId: 300, nombre: 'Otro', oficios: 1 },
    ])
  })

  it('separa al mismo organismo de dos regiones', () => {
    const g = agruparPorOaeca([
      of({ id: 1, oaeca_sea: 'DGA, Región de Los Lagos' }),
      of({ id: 2, oaeca_sea: 'DGA, Región de Los Ríos' }),
    ], HOY)
    expect(g).toHaveLength(2)
  })

  it('cuenta vencidos y por vencer por separado', () => {
    const g = agruparPorOaeca([
      of({ id: 1, fecha_limite: '2026-09-20' }),  // pasó
      of({ id: 2, fecha_limite: '2026-10-05' }),  // falta
      of({ id: 3, fecha_limite: HOY }),           // hoy todavía no está vencido
    ], HOY)
    expect(g[0].vencidos).toBe(1)
    expect(g[0].porVencer).toBe(2)
  })

  it('deja fuera los resueltos', () => {
    const g = agruparPorOaeca([
      of({ id: 1, estado: 'resuelto' }),
      of({ id: 2 }),
    ], HOY)
    expect(g[0].oficios.map(o => o.id)).toEqual([2])
  })

  it('no devuelve grupo para un organismo sin nada pendiente', () => {
    expect(agruparPorOaeca([of({ id: 1, estado: 'resuelto' })], HOY)).toEqual([])
  })

  it('ordena por lo más atrasado primero', () => {
    const g = agruparPorOaeca([
      of({ id: 1, oaeca_sea: 'SAG',  fecha_limite: '2026-10-10' }),
      of({ id: 2, oaeca_sea: 'DGA',  fecha_limite: '2026-09-01' }),
      of({ id: 3, oaeca_sea: 'CONAF', fecha_limite: '2026-09-28' }),
    ], HOY)
    expect(g.map(x => x.nombre)).toEqual(['DGA', 'CONAF', 'SAG'])
  })

  // Un grupo sin ningún plazo no dice nada y no debe desplazar a los que sí.
  it('manda al final al que no tiene ningún plazo', () => {
    const g = agruparPorOaeca([
      of({ id: 1, oaeca_sea: 'Sin plazo', fecha_limite: null }),
      of({ id: 2, oaeca_sea: 'Con plazo', fecha_limite: '2026-10-10' }),
    ], HOY)
    expect(g.map(x => x.nombre)).toEqual(['Con plazo', 'Sin plazo'])
  })

  // Dos oficios de un proyecto que nadie sumó a la cartera son un proyecto.
  it('agrupa por nombre los proyectos sin id de cartera', () => {
    const g = agruparPorOaeca([
      of({ id: 1, proyecto_privado_id: null, nombre_proyecto: 'Planta Los Lilenes' }),
      of({ id: 2, proyecto_privado_id: null, nombre_proyecto: 'planta los lilenes' }),
    ], HOY)
    expect(g[0].proyectos).toHaveLength(1)
    expect(g[0].proyectos[0].oficios).toBe(2)
  })
})

describe('compromisosACerrar', () => {
  const comp = (over: Partial<CompromisoSeguimiento> & { id: number }): CompromisoSeguimiento => ({
    oaeca_objetivo: 'DGA, Región de Los Lagos',
    estado: 'en_curso',
    ...over,
  })

  it('cierra el compromiso del organismo que no debe nada', () => {
    expect(compromisosACerrar([comp({ id: 1 })], [])).toEqual([1])
  })

  it('NO cierra mientras le quede un oficio pendiente', () => {
    expect(compromisosACerrar([comp({ id: 1 })], [of({ id: 9 })])).toEqual([])
  })

  // El caso que rompería si `pendientes` llegara filtrado a solo vencidos.
  it('no cierra por un oficio que todavía no vence', () => {
    const futuro = of({ id: 9, fecha_limite: '2026-12-31' })
    expect(compromisosACerrar([comp({ id: 1 })], [futuro])).toEqual([])
  })

  it('compara sin importar mayúsculas ni espacios', () => {
    const c = comp({ id: 1, oaeca_objetivo: '  dga,  región de los lagos ' })
    expect(compromisosACerrar([c], [of({ id: 9 })])).toEqual([])
  })

  it('ignora los compromisos comunes, sin organismo', () => {
    expect(compromisosACerrar([comp({ id: 1, oaeca_objetivo: null })], [])).toEqual([])
  })

  it('no vuelve a cerrar uno ya cumplido', () => {
    expect(compromisosACerrar([comp({ id: 1, estado: 'cumplido' })], [])).toEqual([])
  })

  it('un oficio resuelto no cuenta como deuda', () => {
    expect(compromisosACerrar([comp({ id: 1 })], [of({ id: 9, estado: 'resuelto' })])).toEqual([1])
  })

  it('no cierra al organismo equivocado', () => {
    const cs = [
      comp({ id: 1, oaeca_objetivo: 'DGA, Región de Los Lagos' }),
      comp({ id: 2, oaeca_objetivo: 'SAG, Región de Los Lagos' }),
    ]
    expect(compromisosACerrar(cs, [of({ id: 9, oaeca_sea: 'SAG, Región de Los Lagos' })])).toEqual([1])
  })
})

describe('descripcionSeguimiento', () => {
  it('dice cuántos oficios, de cuántos proyectos y cuántos vencidos', () => {
    const [g] = agruparPorOaeca([
      of({ id: 1, proyecto_privado_id: 1, fecha_limite: '2026-09-01' }),
      of({ id: 2, proyecto_privado_id: 1, fecha_limite: '2026-09-02' }),
      of({ id: 3, proyecto_privado_id: 2, fecha_limite: '2026-10-30' }),
    ], HOY)
    expect(descripcionSeguimiento(g))
      .toBe('Seguimiento a DGA, Región de Los Lagos: 3 oficios pendientes de 2 proyectos (2 vencidos).')
  })

  it('no habla de vencidos cuando no hay', () => {
    const [g] = agruparPorOaeca([of({ id: 1, fecha_limite: '2026-10-30' })], HOY)
    expect(descripcionSeguimiento(g))
      .toBe('Seguimiento a DGA, Región de Los Lagos: 1 oficio pendiente de 1 proyecto.')
  })
})
