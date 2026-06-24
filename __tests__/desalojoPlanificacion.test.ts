import { describe, it, expect } from 'vitest'
import { estadoEventoPlanificacion } from '@/lib/desalojos'

/**
 * Tests del helper `estadoEventoPlanificacion`.
 *
 * El helper compara fechas como strings YYYY-MM-DD para evitar drift de TZ:
 * un browser configurado en UTC daría estados distintos a uno en Chile
 * si usáramos `new Date()`. Confirmamos:
 *   1. Evento puntual hoy → 'en_curso'.
 *   2. Evento puntual ayer → 'hecho'.
 *   3. Evento rango [hoy-3, hoy+3] → 'en_curso'.
 *   4. Rango [ayer-10, ayer-3] → 'hecho'.
 *   5. Rango [mañana, mañana+5] → 'planificado'.
 *   6. Determinismo cuando se pasa hoyISO explícitamente
 *      (no depende de TZ del runtime).
 */

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  const yyyy = date.getFullYear()
  const mm   = String(date.getMonth() + 1).padStart(2, '0')
  const dd   = String(date.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

describe('estadoEventoPlanificacion', () => {
  const HOY = '2026-06-24'

  it('evento puntual hoy → en_curso', () => {
    const e = { fecha_inicio: HOY, fecha_fin: null }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('en_curso')
  })

  it('evento puntual ayer → hecho', () => {
    const e = { fecha_inicio: addDaysISO(HOY, -1), fecha_fin: null }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('hecho')
  })

  it('evento puntual mañana → planificado', () => {
    const e = { fecha_inicio: addDaysISO(HOY, 1), fecha_fin: null }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('planificado')
  })

  it('rango [hoy-3, hoy+3] → en_curso', () => {
    const e = { fecha_inicio: addDaysISO(HOY, -3), fecha_fin: addDaysISO(HOY, 3) }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('en_curso')
  })

  it('rango [ayer-10, ayer-3] (completamente pasado) → hecho', () => {
    const e = { fecha_inicio: addDaysISO(HOY, -10), fecha_fin: addDaysISO(HOY, -3) }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('hecho')
  })

  it('rango [mañana, mañana+5] (completamente futuro) → planificado', () => {
    const e = { fecha_inicio: addDaysISO(HOY, 1), fecha_fin: addDaysISO(HOY, 5) }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('planificado')
  })

  it('rango que termina hoy → en_curso (incluye día completo)', () => {
    const e = { fecha_inicio: addDaysISO(HOY, -5), fecha_fin: HOY }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('en_curso')
  })

  it('rango que empieza hoy → en_curso', () => {
    const e = { fecha_inicio: HOY, fecha_fin: addDaysISO(HOY, 5) }
    expect(estadoEventoPlanificacion(e, HOY)).toBe('en_curso')
  })

  it('comparación de strings: hoyISO 2026-12-31 vs 2027-01-01', () => {
    // Evita el bug donde "31 dic" se compararía mal con "1 ene" por TZ.
    const e = { fecha_inicio: '2027-01-01', fecha_fin: null }
    expect(estadoEventoPlanificacion(e, '2026-12-31')).toBe('planificado')
  })

  it('determinismo: dos llamadas con mismo hoyISO dan mismo resultado', () => {
    const e = { fecha_inicio: '2026-06-20', fecha_fin: '2026-06-25' }
    const a = estadoEventoPlanificacion(e, HOY)
    const b = estadoEventoPlanificacion(e, HOY)
    expect(a).toBe(b)
    expect(a).toBe('en_curso')
  })
})
