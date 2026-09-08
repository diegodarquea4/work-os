import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { registrarIntento, ipDeLaPeticion, _resetRateLimit } from '@/lib/rateLimit'

/**
 * Freno de `/api/account/activate`, la única ruta pública sin sesión que
 * escribe (con service-role). Los casos fijan lo frágil: que el cupo
 * efectivamente corte, que cada clave sea independiente (si no, un atacante le
 * quema los intentos a cualquiera) y que la ventana venza.
 */

beforeEach(() => _resetRateLimit())
afterEach(() => vi.useRealTimers())

describe('registrarIntento', () => {
  it('deja pasar hasta el máximo y corta después', () => {
    for (let i = 1; i <= 3; i++) {
      expect(registrarIntento('ip:1.1.1.1', 3, 900).permitido).toBe(true)
    }
    expect(registrarIntento('ip:1.1.1.1', 3, 900).permitido).toBe(false)
  })

  it('cada clave lleva su propio cupo', () => {
    registrarIntento('ip:1.1.1.1', 1, 900)
    expect(registrarIntento('ip:1.1.1.1', 1, 900).permitido).toBe(false)
    // Otra IP no debe verse afectada por la primera.
    expect(registrarIntento('ip:2.2.2.2', 1, 900).permitido).toBe(true)
  })

  it('informa cuántos segundos faltan para reintentar', () => {
    registrarIntento('ip:3.3.3.3', 1, 900)
    const r = registrarIntento('ip:3.3.3.3', 1, 900)
    expect(r.permitido).toBe(false)
    expect(r.reintentarEn).toBeGreaterThan(0)
    expect(r.reintentarEn).toBeLessThanOrEqual(900)
  })

  it('el cupo se libera al vencer la ventana', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'))
    registrarIntento('ip:4.4.4.4', 1, 900)
    expect(registrarIntento('ip:4.4.4.4', 1, 900).permitido).toBe(false)

    vi.setSystemTime(new Date('2026-09-04T12:15:01Z'))
    expect(registrarIntento('ip:4.4.4.4', 1, 900).permitido).toBe(true)
  })
})

describe('ipDeLaPeticion', () => {
  const req = (h: Record<string, string>) => new Request('https://x.cl/api/account/activate', { headers: h })

  it('toma la primera IP de x-forwarded-for (la del cliente)', () => {
    expect(ipDeLaPeticion(req({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18' }))).toBe('203.0.113.7')
  })

  it('cae a x-real-ip y, sin nada, a una clave compartida', () => {
    expect(ipDeLaPeticion(req({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4')
    // Conservador a propósito: sin encabezados todos comparten cupo en vez de
    // quedar cada uno con el suyo (que sería no tener límite).
    expect(ipDeLaPeticion(req({}))).toBe('desconocida')
  })
})
