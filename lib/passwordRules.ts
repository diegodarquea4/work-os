/**
 * Reglas de complejidad de clave — PURO, sin dependencias de Node (crypto).
 * Seguro de importar tanto en cliente (checklist en vivo) como en servidor
 * (lib/passwordPolicy.ts lo reusa y le suma el chequeo HIBP).
 */

export const PASSWORD_MIN_LEN = 8

export type PasswordChecks = {
  len: boolean; upper: boolean; lower: boolean; digit: boolean; symbol: boolean
}

export function passwordChecks(pw: string): PasswordChecks {
  return {
    len:    pw.length >= PASSWORD_MIN_LEN,
    upper:  /[A-Z]/.test(pw),
    lower:  /[a-z]/.test(pw),
    digit:  /[0-9]/.test(pw),
    symbol: /[^A-Za-z0-9]/.test(pw),
  }
}

/** Etiquetas para el checklist en vivo (mismo orden que se muestra). */
export const PASSWORD_RULE_LABELS: { key: keyof PasswordChecks; label: string }[] = [
  { key: 'len',    label: `Al menos ${PASSWORD_MIN_LEN} caracteres` },
  { key: 'upper',  label: 'Una mayúscula' },
  { key: 'lower',  label: 'Una minúscula' },
  { key: 'digit',  label: 'Un número' },
  { key: 'symbol', label: 'Un símbolo (!@#$%…)' },
]

/** ¿Cumple todas las reglas de complejidad? */
export function complexityOk(pw: string): boolean {
  return Object.values(passwordChecks(pw)).every(Boolean)
}

/** Lista de reglas incumplidas, como mensajes (vacía = cumple). */
export function validateComplexity(pw: string): string[] {
  const c = passwordChecks(pw)
  const problemas: string[] = []
  if (!c.len)    problemas.push(`Debe tener al menos ${PASSWORD_MIN_LEN} caracteres.`)
  if (!c.upper)  problemas.push('Debe incluir una mayúscula.')
  if (!c.lower)  problemas.push('Debe incluir una minúscula.')
  if (!c.digit)  problemas.push('Debe incluir un número.')
  if (!c.symbol) problemas.push('Debe incluir un símbolo (ej: !@#$%).')
  return problemas
}
