import { describe, it, expect } from 'vitest'
import {
  agruparPorMegaproyecto,
  aplicarValorMetrica,
  deltaPulso,
  esCompromisoAbierto,
  institucionesSugeridas,
  puedeCerrar,
  puedeRegenerarActa,
} from '@/lib/sesiones/helpers'
import { sesionIdSchema } from '@/lib/schemas'

// Criterio del repo: buscar dolor, no cobertura. Estos tests cubren la
// lógica que rompe silenciosamente: null+n=NaN, doble aplicación de sumas,
// compromisos que reaparecen, dedupe de instituciones.

describe('aplicarValorMetrica (suma/pulso)', () => {
  it('suma con valor_actual null parte de 0 (no NaN)', () => {
    expect(aplicarValorMetrica('suma', null, 12)).toBe(12)
    expect(Number.isNaN(aplicarValorMetrica('suma', null, 12))).toBe(false)
  })

  it('suma incrementa el acumulado', () => {
    expect(aplicarValorMetrica('suma', 30, 12)).toBe(42)
  })

  it('suma con decimales (48.5 estilo BCCh)', () => {
    expect(aplicarValorMetrica('suma', 10.25, 48.5)).toBeCloseTo(58.75)
  })

  it('pulso reemplaza — ignora el acumulado', () => {
    expect(aplicarValorMetrica('pulso', 900, 48)).toBe(48)
  })

  it('pulso con valor_actual null también reemplaza', () => {
    expect(aplicarValorMetrica('pulso', null, 7)).toBe(7)
  })
})

describe('deltaPulso (tendencia vs sesión anterior)', () => {
  it('sin sesión anterior (prev null) → null, no un delta falso', () => {
    expect(deltaPulso(null, 50)).toBeNull()
  })

  it('prev 0 → delta absoluto sin % (división por cero)', () => {
    const d = deltaPulso(0, 5)
    expect(d).toEqual({ abs: 5, pct: null })
  })

  it('signo correcto en baja y en alza', () => {
    expect(deltaPulso(100, 80)).toEqual({ abs: -20, pct: -20 })
    expect(deltaPulso(80, 100)).toEqual({ abs: 20, pct: 25 })
  })
})

describe('esCompromisoAbierto', () => {
  it('pendiente y en_curso están abiertos; cumplido no', () => {
    expect(esCompromisoAbierto({ estado: 'pendiente' })).toBe(true)
    expect(esCompromisoAbierto({ estado: 'en_curso' })).toBe(true)
    expect(esCompromisoAbierto({ estado: 'cumplido' })).toBe(false)
  })
})

describe('institucionesSugeridas (dedupe tabs de apuntes)', () => {
  it('dedupe insensible a mayúsculas y espacios, conserva primera forma', () => {
    expect(institucionesSugeridas(['PDI', 'Carabineros'], [' pdi ', 'Gendarmería'])).toEqual([
      'PDI',
      'Carabineros',
      'Gendarmería',
    ])
  })

  it('descarta strings vacíos', () => {
    expect(institucionesSugeridas(['', '  '], ['Armada'])).toEqual(['Armada'])
  })
})

describe('guards de idempotencia del cierre', () => {
  const base = { estado: 'borrador' as const, metricas_aplicadas: false, acta_path: null }

  it('puedeCerrar: borrador ok; cerrada 409; inexistente 404', () => {
    expect(puedeCerrar(base)).toEqual({ ok: true })
    expect(puedeCerrar({ ...base, estado: 'cerrada' })).toMatchObject({ ok: false, status: 409 })
    expect(puedeCerrar(null)).toMatchObject({ ok: false, status: 404 })
  })

  it('puedeRegenerarActa: solo cerrada + métricas aplicadas + sin acta previa', () => {
    // el caso feliz del reintento: cerró bien pero el PDF falló
    expect(puedeRegenerarActa({ estado: 'cerrada', metricas_aplicadas: true, acta_path: null }))
      .toEqual({ ok: true })
    // borrador: el acta se genera al cerrar, no antes
    expect(puedeRegenerarActa(base)).toMatchObject({ ok: false, status: 409 })
    // cierre a medio aplicar: NUNCA generar acta sobre métricas inconsistentes
    expect(puedeRegenerarActa({ estado: 'cerrada', metricas_aplicadas: false, acta_path: null }))
      .toMatchObject({ ok: false, status: 409 })
    // acta ya existe: no se regenera (regla 5 — es el registro oficial)
    expect(puedeRegenerarActa({ estado: 'cerrada', metricas_aplicadas: true, acta_path: 'VS/9/acta.pdf' }))
      .toMatchObject({ ok: false, status: 409 })
  })
})

describe('sesionIdSchema', () => {
  it('acepta enteros positivos (incluso como string de URL param)', () => {
    expect(sesionIdSchema.parse('42')).toBe(42)
    expect(sesionIdSchema.parse(7)).toBe(7)
  })

  it('rechaza no-numéricos, negativos y decimales', () => {
    expect(sesionIdSchema.safeParse('abc').success).toBe(false)
    expect(sesionIdSchema.safeParse(-1).success).toBe(false)
    expect(sesionIdSchema.safeParse(1.5).success).toBe(false)
  })
})

describe('agruparPorMegaproyecto', () => {
  type Item = { id: number; tags: string[] }
  const tagsDe = (it: Item) => it.tags

  it('sin megaproyectos configurados, todo cae en sinMegaproyecto (lista plana)', () => {
    const items = [{ id: 1, tags: ['Manuel', 'Puerto de Arica'] }, { id: 2, tags: ['Manuel'] }]
    const r = agruparPorMegaproyecto(items, tagsDe, [])
    expect(r.grupos).toEqual([])
    expect(r.sinMegaproyecto).toBe(items) // sin trabajo extra — ni siquiera copia el array
  })

  it('agrupa por tag y ordena los grupos alfabéticamente', () => {
    const items = [
      { id: 1, tags: ['Manuel', 'Ruta 5'] },
      { id: 2, tags: ['Manuel', 'Puerto de Arica'] },
      { id: 3, tags: ['Manuel'] }, // sin megaproyecto
    ]
    const r = agruparPorMegaproyecto(items, tagsDe, ['Ruta 5', 'Puerto de Arica'])
    expect(r.grupos.map(g => g.tag)).toEqual(['Puerto de Arica', 'Ruta 5'])
    expect(r.grupos[0].items.map(i => i.id)).toEqual([2])
    expect(r.grupos[1].items.map(i => i.id)).toEqual([1])
    expect(r.sinMegaproyecto.map(i => i.id)).toEqual([3])
  })

  it('un ítem con varios tags-megaproyecto aparece en cada grupo que le corresponde', () => {
    const items = [{ id: 1, tags: ['Puerto de Arica', 'Ruta 5'] }]
    const r = agruparPorMegaproyecto(items, tagsDe, ['Ruta 5', 'Puerto de Arica'])
    expect(r.grupos).toHaveLength(2)
    expect(r.grupos.every(g => g.items[0].id === 1)).toBe(true)
    expect(r.sinMegaproyecto).toEqual([])
  })

  it('un megaproyecto configurado sin ninguna iniciativa no genera grupo vacío', () => {
    const items = [{ id: 1, tags: ['Manuel'] }]
    const r = agruparPorMegaproyecto(items, tagsDe, ['Puerto de Arica'])
    expect(r.grupos).toEqual([])
    expect(r.sinMegaproyecto.map(i => i.id)).toEqual([1])
  })

  it('tags null/undefined no rompe (fallback a [])', () => {
    const items = [{ id: 1, tags: undefined as unknown as string[] }]
    const r = agruparPorMegaproyecto(items, tagsDe, ['Puerto de Arica'])
    expect(r.sinMegaproyecto.map(i => i.id)).toEqual([1])
  })
})
