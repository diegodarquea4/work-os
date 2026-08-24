import { describe, it, expect } from 'vitest'
import { sumaHora, edadEnSemanas } from '@/lib/sesiones/helpers'

/**
 * Lógica frágil de la hoja de conducción del Gabinete v2 (mig 074):
 *  - `sumaHora`: la HORA OBJETIVO por punto acumula minutos sobre la hora de
 *    inicio; el bug clásico es el wrap 24h y el input mal formado.
 *  - `edadEnSemanas`: la cara 2 muestra "N.ª semana"; el borde es día 0 (misma
 *    semana) y las fechas futuras/ inválidas.
 */

describe('sumaHora — hora objetivo acumulada', () => {
  it('suma minutos dentro del mismo día', () => {
    expect(sumaHora('15:00', 0)).toBe('15:00')
    expect(sumaHora('15:00', 10)).toBe('15:10')
    expect(sumaHora('15:10', 5)).toBe('15:15')
    expect(sumaHora('09:50', 15)).toBe('10:05')   // cruza la hora
  })

  it('normaliza a "HH:MM" con cero a la izquierda', () => {
    expect(sumaHora('9:05', 0)).toBe('09:05')
    expect(sumaHora('08:00', 60)).toBe('09:00')
  })

  it('envuelve a 24h (pasada la medianoche)', () => {
    expect(sumaHora('23:30', 45)).toBe('00:15')
    expect(sumaHora('23:00', 24 * 60)).toBe('23:00')   // +1 día completo
  })

  it('minutos negativos envuelven positivo (no NaN ni "-1:...")', () => {
    expect(sumaHora('00:10', -20)).toBe('23:50')
  })

  it('input mal formado se devuelve tal cual (no revienta el render)', () => {
    expect(sumaHora('sin hora', 10)).toBe('sin hora')
    expect(sumaHora('', 10)).toBe('')
  })
})

describe('edadEnSemanas — antigüedad del compromiso', () => {
  const ahora = new Date('2026-08-20T12:00:00-04:00')

  it('día 0-6 = "1.ª semana"', () => {
    expect(edadEnSemanas('2026-08-20', ahora)).toBe('1.ª semana')
    expect(edadEnSemanas('2026-08-14', ahora)).toBe('1.ª semana')   // 6 días
  })

  it('7-13 días = "2.ª semana"', () => {
    expect(edadEnSemanas('2026-08-13', ahora)).toBe('2.ª semana')   // 7 días
    expect(edadEnSemanas('2026-08-06', ahora)).toBe('3.ª semana')   // 14 días
  })

  it('null / fecha futura / inválida → null', () => {
    expect(edadEnSemanas(null, ahora)).toBeNull()
    expect(edadEnSemanas('2026-09-01', ahora)).toBeNull()   // futuro
    expect(edadEnSemanas('no-es-fecha', ahora)).toBeNull()
  })
})
