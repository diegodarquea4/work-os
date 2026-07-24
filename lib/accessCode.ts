/**
 * Códigos de acceso de un solo uso para activación / recuperación de cuentas.
 *
 * El admin genera un código, se lo entrega al usuario por un canal de confianza
 * (no hay envío de correo), y el usuario lo usa una vez para definir su clave. En
 * la BD (`codigos_acceso`) se guarda SOLO el hash SHA-256 — nunca el código en
 * claro. Ver `app/api/account/activate/route.ts` para la validación.
 */

import { createHash, randomInt } from 'crypto'

/** Alfabeto sin caracteres ambiguos (sin O, 0, I, 1, l). */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 10

/** Vigencia y tope de intentos del código. */
export const CODE_TTL_H = 72
export const CODE_MAX_INTENTOS = 8

/** Genera un código de 10 caracteres criptográficamente aleatorio. */
export function generateCode(): string {
  let out = ''
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(0, ALPHABET.length)]
  }
  return out
}

/**
 * Normaliza la entrada del usuario: quita espacios y pasa a mayúsculas, para que
 * un código tipeado en minúsculas o con espacios sobrantes valide igual.
 */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase()
}

/** Hash SHA-256 en hex del código (lo que se persiste y compara). */
export function hashCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('hex')
}

/** Timestamp ISO de expiración a partir de ahora (CODE_TTL_H horas). */
export function codeExpiry(now: Date): string {
  return new Date(now.getTime() + CODE_TTL_H * 3600 * 1000).toISOString()
}
