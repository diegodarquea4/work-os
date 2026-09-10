import { describe, it, expect } from 'vitest'
import {
  agruparPorMegaproyecto,
  aplicarValorMetrica,
  deltaPulso,
  esCompromisoAbierto,
  institucionesSugeridas,
  puedeCerrar,
  puedeRegenerarActa,
  bloquesMesaEmpleoEnActa,
  serieGraficoComite,
  alinearConTimeline,
  desgloseInicial,
  valorDesglosePara,
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

describe('serieGraficoComite (gráfico de la zona de reporte)', () => {
  const historico = [{ fecha: '2026-08-01', valor: 10 }, { fecha: '2026-08-08', valor: 12 }]

  it('agrega el valor en curso al final, marcado enCurso', () => {
    const serie = serieGraficoComite(historico, '2026-08-15', 15)
    expect(serie).toHaveLength(3)
    expect(serie[2]).toEqual({ fecha: '2026-08-15', valor: 15, enCurso: true })
    expect(serie[0].enCurso).toBeUndefined()
  })

  it('sin valor en curso (nada digitado todavía), solo el histórico', () => {
    expect(serieGraficoComite(historico, '2026-08-15', null)).toEqual(historico)
  })

  it('sin histórico y con valor en curso, un solo punto', () => {
    expect(serieGraficoComite([], '2026-08-15', 5)).toEqual([{ fecha: '2026-08-15', valor: 5, enCurso: true }])
  })

  it('sin histórico ni valor en curso, arreglo vacío', () => {
    expect(serieGraficoComite([], '2026-08-15', null)).toEqual([])
  })

  it('no muta el arreglo histórico recibido', () => {
    const original = [...historico]
    serieGraficoComite(historico, '2026-08-15', 20)
    expect(historico).toEqual(original)
  })
})

describe('alinearConTimeline (huecos honestos en el gráfico)', () => {
  it('rellena con null las fechas sin dato, preservando el orden del timeline', () => {
    const serie = [{ fecha: '2026-08-01', valor: 10 }, { fecha: '2026-08-15', valor: 12 }]
    const fechas = ['2026-08-01', '2026-08-08', '2026-08-15']
    expect(alinearConTimeline(serie, fechas)).toEqual([
      { fecha: '2026-08-01', valor: 10 },
      { fecha: '2026-08-08', valor: null },
      { fecha: '2026-08-15', valor: 12 },
    ])
  })

  it('timeline vacío, arreglo vacío', () => {
    expect(alinearConTimeline([{ fecha: '2026-08-01', valor: 10 }], [])).toEqual([])
  })

  it('serie vacía, todo null', () => {
    expect(alinearConTimeline([], ['2026-08-01', '2026-08-08'])).toEqual([
      { fecha: '2026-08-01', valor: null },
      { fecha: '2026-08-08', valor: null },
    ])
  })

  it('no muta la serie ni el timeline recibidos', () => {
    const serie = [{ fecha: '2026-08-01', valor: 10 }]
    const fechas = ['2026-08-01', '2026-08-08']
    const serieCopia = [...serie]
    const fechasCopia = [...fechas]
    alinearConTimeline(serie, fechas)
    expect(serie).toEqual(serieCopia)
    expect(fechas).toEqual(fechasCopia)
  })
})

describe('desgloseInicial (plantilla → filas listas para digitar)', () => {
  it('sin plantilla, arreglo vacío', () => {
    expect(desgloseInicial({ desglose_plantilla: [] })).toEqual([])
  })

  it('mapea cada ítem de la plantilla a una fila con valor vacío', () => {
    const plantilla = [{ clave: '5303', etiqueta: 'Rinconada' }, { clave: '5301', etiqueta: 'Los Andes' }]
    expect(desgloseInicial({ desglose_plantilla: plantilla })).toEqual([
      { etiqueta: 'Rinconada', clave: '5303', valor: '' },
      { etiqueta: 'Los Andes', clave: '5301', valor: '' },
    ])
  })
})

describe('valorDesglosePara (lectura de un ítem del desglose para el gráfico)', () => {
  it('match por clave', () => {
    const desglose = [{ etiqueta: 'Viña del Mar', clave: '5109', valor: '120' }]
    expect(valorDesglosePara(desglose, '5109')).toBe(120)
  })

  it('fallback por etiqueta cuando no hay clave (filas de antes de la plantilla)', () => {
    const desglose = [{ etiqueta: 'Viña del Mar', valor: '120' }]
    expect(valorDesglosePara(desglose, 'Viña del Mar')).toBe(120)
  })

  it('sin match, null', () => {
    expect(valorDesglosePara([], 'algo')).toBeNull()
  })

  it('valor no numérico (ej. "20%"), null — no es un dato de esta serie, no un cero', () => {
    const desglose = [{ etiqueta: 'X', clave: 'x', valor: '20%' }]
    expect(valorDesglosePara(desglose, 'x')).toBeNull()
  })

  it('tolera separador de miles y decimal chileno', () => {
    const desglose = [{ etiqueta: 'X', clave: 'x', valor: '1.234,5' }]
    expect(valorDesglosePara(desglose, 'x')).toBe(1234.5)
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

describe('bloquesMesaEmpleoEnActa', () => {
  // El acta narra la reunión, no el estado permanente de la región. El
  // acumulado regional existe apenas alguien configuró la meta: si mandara ese
  // dato, la sección saldría en TODAS las actas con las mismas cifras y quien
  // la leyera creería que el tema se trató.
  it('sin nada digitado en la sesión, la sección no va al acta', () => {
    expect(bloquesMesaEmpleoEnActa(false, false)).toEqual({ meta: false, subsidios: false, seccion: false })
  })

  // Cada mitad se decide sola: una reunión que solo anotó el avance de la meta
  // no debe imprimir un bloque de subsidios que nadie miró.
  it('imprime solo la mitad que se digitó', () => {
    expect(bloquesMesaEmpleoEnActa(true, false)).toEqual({ meta: true, subsidios: false, seccion: true })
    expect(bloquesMesaEmpleoEnActa(false, true)).toEqual({ meta: false, subsidios: true, seccion: true })
  })

  it('con ambos digitados va la sección completa', () => {
    expect(bloquesMesaEmpleoEnActa(true, true)).toEqual({ meta: true, subsidios: true, seccion: true })
  })

  it('apagar la funcionalidad la saca del acta aunque haya datos', () => {
    expect(bloquesMesaEmpleoEnActa(true, true, false)).toEqual({ meta: false, subsidios: false, seccion: false })
  })
})
