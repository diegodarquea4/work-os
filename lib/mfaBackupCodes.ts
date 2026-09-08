/**
 * Códigos de respaldo del 2FA — generación y hash.
 *
 * Reusa el alfabeto y el generador de `lib/accessCode.ts` (10 caracteres, sin
 * los ambiguos O/0/I/1/l, con `randomInt`), así que un código de respaldo tiene
 * la misma entropía que uno de activación (~49 bits). En la base solo queda el
 * hash SHA-256; el código en claro se muestra una única vez.
 */

import { createHash } from 'crypto'
import { generateCode, normalizeCode } from '@/lib/accessCode'

/** Cuántos códigos se entregan por juego. */
export const CANTIDAD_CODIGOS = 8

/** Hash que se persiste y compara. Normaliza para tolerar minúsculas/espacios. */
export function hashBackupCode(code: string): string {
  return createHash('sha256').update(normalizeCode(code)).digest('hex')
}

/** Un juego nuevo de códigos en claro. */
export function generarCodigos(cantidad: number = CANTIDAD_CODIGOS): string[] {
  return Array.from({ length: cantidad }, () => generateCode())
}
