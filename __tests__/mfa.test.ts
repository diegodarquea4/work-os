import { describe, it, expect } from 'vitest'
import { mfaState, decodeAal } from '@/lib/mfa'

// Construye un JWT de mentira (header.payload.sig) con el payload dado. La firma
// no importa: decodeAal no la verifica (el token ya lo validó getUser()).
function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.firma-irrelevante`
}

describe('mfaState', () => {
  it('aal2 tiene acceso pleno, con o sin factor listado', () => {
    expect(mfaState('aal2', true)).toBe('aal2')
    expect(mfaState('aal2', false)).toBe('aal2')
  })

  it('aal1 con factor verificado debe completar el challenge', () => {
    expect(mfaState('aal1', true)).toBe('needs-challenge')
  })

  it('aal1 sin factor debe enrolarse', () => {
    expect(mfaState('aal1', false)).toBe('needs-enroll')
  })

  it('fail-closed: aal desconocido/nulo se trata como aal1', () => {
    expect(mfaState(null, true)).toBe('needs-challenge')
    expect(mfaState(null, false)).toBe('needs-enroll')
    expect(mfaState('aal0', true)).toBe('needs-challenge')
  })
})

describe('decodeAal', () => {
  it('extrae el claim aal de un JWT válido', () => {
    expect(decodeAal(fakeJwt({ aal: 'aal2', email: 'a@b.cl' }))).toBe('aal2')
    expect(decodeAal(fakeJwt({ aal: 'aal1' }))).toBe('aal1')
  })

  it('devuelve null si el claim aal no está o no es string', () => {
    expect(decodeAal(fakeJwt({ email: 'a@b.cl' }))).toBeNull()
    expect(decodeAal(fakeJwt({ aal: 2 }))).toBeNull()
  })

  it('devuelve null ante token ausente o malformado', () => {
    expect(decodeAal(null)).toBeNull()
    expect(decodeAal(undefined)).toBeNull()
    expect(decodeAal('')).toBeNull()
    expect(decodeAal('no-es-un-jwt')).toBeNull()
    expect(decodeAal('header.payload-no-base64-válido!!.sig')).toBeNull()
  })
})
