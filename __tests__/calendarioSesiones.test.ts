import { describe, it, expect } from 'vitest'
import {
  estadoAgenda, fechasRecurrentes, describirFrecuencia, medirCalendario, fechaCorta,
} from '@/lib/sesiones/calendario'

const HOY = '2026-10-01'

describe('estado de una sesión', () => {
  it('una programada vencida es no realizada; la de hoy sigue programada', () => {
    expect(estadoAgenda({ estado: 'programada', fecha: '2026-09-30' }, HOY)).toBe('noRealizada')
    expect(estadoAgenda({ estado: 'programada', fecha: HOY }, HOY)).toBe('programada')
  })
  it('un borrador es abierta aunque su fecha haya pasado', () => {
    expect(estadoAgenda({ estado: 'borrador', fecha: '2026-08-13' }, HOY)).toBe('abierta')
    expect(estadoAgenda({ estado: 'cerrada', fecha: '2026-09-28' }, HOY)).toBe('realizada')
  })
})

describe('fechas recurrentes', () => {
  it('semanal y cada 2 semanas desde la fecha elegida', () => {
    expect(fechasRecurrentes('2026-10-05', '2026-10-26', 'semanal')).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'])
    expect(fechasRecurrentes('2026-10-05', '2026-10-26', 'quincenal')).toEqual(['2026-10-05', '2026-10-19'])
  })
  it('mensual mantiene el n-ésimo día de la semana, también cruzando el año', () => {
    // 13-oct-2026 es el 2º martes.
    expect(fechasRecurrentes('2026-10-13', '2027-01-31', 'mensual')).toEqual(['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12'])
    expect(describirFrecuencia('2026-10-13', 'mensual')).toBe('Cada mes, el 2º martes')
  })
  it('un quinto día de la semana pasa a ser «el último»', () => {
    // 29-oct-2026 es el 5º jueves.
    expect(fechasRecurrentes('2026-10-29', '2026-12-31', 'mensual')).toEqual(['2026-10-29', '2026-11-26', '2026-12-31'])
    expect(describirFrecuencia('2026-10-29', 'mensual')).toBe('Cada mes, el último jueves')
  })
  it('sin rango válido no hay fechas', () => {
    expect(fechasRecurrentes('2026-10-13', '2026-10-01', 'semanal')).toEqual([])
  })
})

describe('medición', () => {
  const s = (estado: 'programada' | 'borrador' | 'cerrada' | 'anulada', fecha: string, agenda: 'ordinaria' | 'extraordinaria' | null = 'ordinaria') =>
    ({ estado, fecha, agenda })
  it('el cumplimiento cuenta solo ordinarias vencidas; extraordinarias y previas no entran', () => {
    const m = medirCalendario([
      s('cerrada', '2026-09-14'), s('programada', '2026-09-21'), s('borrador', '2026-09-28'),
      s('cerrada', '2026-09-30', 'extraordinaria'), s('cerrada', '2026-08-01', null),
      s('anulada', '2026-09-07'), s('programada', '2026-10-13'),
    ], HOY)
    expect(m.programadasVencidas).toBe(3)
    expect(m.realizadasATiempo).toBe(1)
    expect(m.noRealizadas).toBe(1)
    expect(m.iniciadas).toBe(4)
    expect(m.terminadas).toBe(3)
    expect(m.abiertas).toBe(1)
  })
  it('el rango acota todo', () => {
    const m = medirCalendario([s('cerrada', '2026-09-14'), s('cerrada', '2026-08-14')], HOY, { desde: '2026-09-01', hasta: '2026-09-30' })
    expect(m.terminadas).toBe(1)
    expect(medirCalendario([], HOY).cumplimiento).toBeNull()
  })
})

it('fecha corta', () => { expect(fechaCorta('2026-10-13')).toBe('mar 13-oct') })
