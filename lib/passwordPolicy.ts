/**
 * Política de contraseñas, validada en el SERVIDOR.
 *
 * Las claves se fijan con la Admin API de Supabase (updateUserById), que NO pasa
 * por la validación nativa del proyecto — por eso la política se aplica acá, en las
 * rutas que fijan claves (activación, cambio propio).
 *
 * Dos capas:
 *   1. Complejidad: mínimo 8, con mayúscula, minúscula, número y símbolo.
 *   2. HaveIBeenPwned por k-anonymity: se envía SOLO el prefijo de 5 chars del
 *      hash SHA-1; nunca la clave. Fail-open: si el servicio no responde, no bloquea.
 */

import { createHash } from 'crypto'
import { validateComplexity } from './passwordRules'

export { validateComplexity } from './passwordRules'
export { PASSWORD_MIN_LEN } from './passwordRules'

/**
 * ¿La clave aparece en filtraciones conocidas (HaveIBeenPwned)? k-anonymity:
 * se envía solo el prefijo del SHA-1 (5 chars) y se busca el sufijo en la respuesta.
 * Fail-open: cualquier error de red/servicio devuelve `false` (no bloquea el flujo).
 */
export async function isPwned(pw: string): Promise<boolean> {
  try {
    const sha1 = createHash('sha1').update(pw).digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'Add-Padding': 'true' },
      // No queremos que un HIBP lento cuelgue el request de fijar la clave.
      signal: AbortSignal.timeout(3500),
    })
    if (!res.ok) return false
    const body = await res.text()
    // Cada línea: "SUFFIX:count". Presente con count>0 → filtrada.
    for (const line of body.split('\n')) {
      const [suf, countStr] = line.trim().split(':')
      if (suf === suffix && Number(countStr) > 0) return true
    }
    return false
  } catch {
    return false // fail-open
  }
}

/**
 * Valida una clave nueva por completo. Devuelve la lista de problemas (vacía = OK).
 * Corta temprano si falla la complejidad (no gasta la llamada a HIBP).
 */
export async function assertStrongPassword(pw: string): Promise<string[]> {
  const problemas = validateComplexity(pw)
  if (problemas.length > 0) return problemas
  if (await isPwned(pw)) {
    return ['Esta clave aparece en filtraciones de datos conocidas. Elige una distinta.']
  }
  return []
}
