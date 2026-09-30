import { describe, it, expect } from 'vitest'
import { diaChile, esDeHoyEnChile, inicioDelDiaChile } from '@/lib/fechaChile'

/**
 * Las aserciones NO fijan el desfase (−03 / −04): si mañana cambiara la regla
 * del horario de verano, un test que diga «Santiago está 4 horas atrás» se
 * rompe sin que el código esté mal. Se verifican las propiedades que tienen que
 * valer en cualquier caso, y se verifican en las dos mitades del año.
 */
describe('diaChile', () => {
  it('devuelve una fecha ISO corta', () => {
    expect(diaChile(new Date('2026-09-30T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('a media mañana UTC el día chileno es el mismo', () => {
    // Chile va DETRÁS de UTC, así que al mediodía UTC nunca puede ser mañana.
    expect(diaChile(new Date('2026-09-30T12:00:00Z'))).toBe('2026-09-30')
    expect(diaChile(new Date('2026-01-15T12:00:00Z'))).toBe('2026-01-15')
  })

  it('a las 01:00 UTC en Chile todavía es el día anterior', () => {
    // Es el caso que rompía `toISOString().slice(0,10)` al revés: el servidor
    // ya pasó de día y acá no.
    expect(diaChile(new Date('2026-09-30T01:00:00Z'))).toBe('2026-09-29')
    expect(diaChile(new Date('2026-01-15T01:00:00Z'))).toBe('2026-01-14')
  })
})

describe('inicioDelDiaChile', () => {
  for (const instante of ['2026-01-15T18:00:00Z', '2026-07-15T18:00:00Z', '2026-09-30T02:30:00Z']) {
    it(`cae en el mismo día chileno y no en el futuro (${instante})`, () => {
      const d = new Date(instante)
      const inicio = inicioDelDiaChile(d)
      expect(diaChile(inicio)).toBe(diaChile(d))
      expect(inicio.getTime()).toBeLessThanOrEqual(d.getTime())
      // Un día chileno dura 24 horas salvo el domingo del cambio de hora.
      expect(d.getTime() - inicio.getTime()).toBeLessThan(25 * 3_600_000)
    })
  }

  it('un milisegundo antes ya es el día anterior', () => {
    const inicio = inicioDelDiaChile(new Date('2026-09-30T18:00:00Z'))
    const antes = new Date(inicio.getTime() - 1)
    expect(diaChile(antes)).not.toBe(diaChile(inicio))
  })
})

describe('esDeHoyEnChile', () => {
  const ahora = new Date('2026-09-30T18:00:00Z')  // 14:00 o 15:00 en Chile

  it('el mismo día chileno es hoy', () => {
    expect(esDeHoyEnChile('2026-09-30T13:00:00Z', ahora)).toBe(true)
    expect(esDeHoyEnChile(inicioDelDiaChile(ahora).toISOString(), ahora)).toBe(true)
  })

  it('el día anterior no', () => {
    expect(esDeHoyEnChile('2026-09-29T13:00:00Z', ahora)).toBe(false)
  })

  it('las 02:00 UTC del mismo día calendario UTC siguen siendo AYER en Chile', () => {
    // La trampa: mismo '2026-09-30' en el string, distinto día chileno.
    expect(esDeHoyEnChile('2026-09-30T02:00:00Z', ahora)).toBe(false)
  })

  it('nulo o basura es false, no explota', () => {
    expect(esDeHoyEnChile(null, ahora)).toBe(false)
    expect(esDeHoyEnChile(undefined, ahora)).toBe(false)
    expect(esDeHoyEnChile('cuando sea', ahora)).toBe(false)
  })
})
