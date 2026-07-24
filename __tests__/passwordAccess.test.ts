import { describe, it, expect, vi, afterEach } from 'vitest'
import { createHash } from 'crypto'
import { generateCode, normalizeCode, hashCode, codeExpiry, CODE_TTL_H } from '@/lib/accessCode'
import { passwordChecks, complexityOk, validateComplexity } from '@/lib/passwordRules'
import { assertStrongPassword } from '@/lib/passwordPolicy'

// ── accessCode ────────────────────────────────────────────────────────────────

describe('accessCode', () => {
  it('genera códigos de 10 chars sin caracteres ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode()
      expect(c).toHaveLength(10)
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/) // sin O 0 I 1 l
    }
  })

  it('normalizeCode quita espacios y pasa a mayúsculas', () => {
    expect(normalizeCode('  abc de f ')).toBe('ABCDEF')
  })

  it('hashCode es determinístico e insensible a mayúsculas/espacios', () => {
    expect(hashCode('abcdEF')).toBe(hashCode(' ABCDEF '))
    expect(hashCode('ABCDEF')).toBe(createHash('sha256').update('ABCDEF').digest('hex'))
    expect(hashCode('AAA')).not.toBe(hashCode('BBB'))
  })

  it('codeExpiry cae ~72h después del now dado', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const exp = new Date(codeExpiry(now)).getTime() - now.getTime()
    expect(exp).toBe(CODE_TTL_H * 3600 * 1000)
  })
})

// ── passwordRules ─────────────────────────────────────────────────────────────

describe('passwordRules', () => {
  it('passwordChecks evalúa cada regla', () => {
    expect(passwordChecks('abc')).toEqual({ len: false, upper: false, lower: true, digit: false, symbol: false })
    expect(passwordChecks('Xk9$mQ2wLp7!')).toEqual({ len: true, upper: true, lower: true, digit: true, symbol: true })
  })

  it('complexityOk exige las 5 reglas', () => {
    expect(complexityOk('Xk9$mQ2wLp7!')).toBe(true)
    expect(complexityOk('Password1')).toBe(false)   // sin símbolo
    expect(complexityOk('short1!A')).toBe(true)      // 8 con todo
    expect(complexityOk('Ab1!')).toBe(false)         // muy corta
  })

  it('validateComplexity lista los faltantes', () => {
    const p = validateComplexity('abcdefgh')
    expect(p.some(m => /mayúscula/.test(m))).toBe(true)
    expect(p.some(m => /número/.test(m))).toBe(true)
    expect(p.some(m => /símbolo/.test(m))).toBe(true)
    expect(validateComplexity('Xk9$mQ2wLp7!')).toEqual([])
  })
})

// ── passwordPolicy (HIBP mockeado) ────────────────────────────────────────────

describe('assertStrongPassword', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('corta por complejidad sin llamar a HIBP', async () => {
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const problemas = await assertStrongPassword('debil')
    expect(problemas.length).toBeGreaterThan(0)
    expect(spy).not.toHaveBeenCalled()
  })

  it('rechaza una clave presente en HIBP', async () => {
    const pw = 'Xk9$mQ2wLp7!'
    const sha1 = createHash('sha1').update(pw).digest('hex').toUpperCase()
    const suffix = sha1.slice(5)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `0000000000000000000000000000000000:1\n${suffix}:42\n`,
    }))
    const problemas = await assertStrongPassword(pw)
    expect(problemas.some(m => /filtraciones/.test(m))).toBe(true)
  })

  it('acepta una clave fuerte no filtrada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => `0000000000000000000000000000000000:1\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3\n`,
    }))
    expect(await assertStrongPassword('Xk9$mQ2wLp7!')).toEqual([])
  })

  it('fail-open: si HIBP falla, no bloquea', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    expect(await assertStrongPassword('Xk9$mQ2wLp7!')).toEqual([])
  })
})
