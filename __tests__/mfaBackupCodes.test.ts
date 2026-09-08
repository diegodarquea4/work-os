import { describe, it, expect } from 'vitest'
import { generarCodigos, hashBackupCode, CANTIDAD_CODIGOS } from '@/lib/mfaBackupCodes'

/**
 * Los códigos de respaldo son la salida de emergencia del 2FA: si fallan, la
 * persona queda dependiendo de que un administrador esté disponible. Y como en
 * la base solo vive el hash, el hash es lo único que puede validarlos.
 */

describe('generarCodigos', () => {
  it('entrega la cantidad esperada, todos distintos', () => {
    const codigos = generarCodigos()
    expect(codigos).toHaveLength(CANTIDAD_CODIGOS)
    expect(new Set(codigos).size).toBe(CANTIDAD_CODIGOS)
  })

  it('usa el alfabeto sin caracteres ambiguos', () => {
    // Se leen de un papel o de un .txt: confundir O con 0 o I con 1 sería
    // gastar un código de un solo uso por un error de lectura.
    for (const c of generarCodigos(20)) {
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/)
    }
  })

  it('dos juegos consecutivos no se repiten', () => {
    const a = generarCodigos()
    const b = generarCodigos()
    expect(a.some(c => b.includes(c))).toBe(false)
  })
})

describe('hashBackupCode', () => {
  it('es estable para el mismo código', () => {
    expect(hashBackupCode('ABCD234567')).toBe(hashBackupCode('ABCD234567'))
  })

  it('tolera minúsculas y espacios al tipearlo', () => {
    const esperado = hashBackupCode('ABCD234567')
    expect(hashBackupCode('abcd234567')).toBe(esperado)
    expect(hashBackupCode(' ABCD 234567 ')).toBe(esperado)
  })

  it('códigos distintos dan hashes distintos', () => {
    expect(hashBackupCode('ABCD234567')).not.toBe(hashBackupCode('ABCD234568'))
  })

  it('no devuelve el código en claro (es un SHA-256 hex)', () => {
    const h = hashBackupCode('ABCD234567')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain('ABCD')
  })
})
