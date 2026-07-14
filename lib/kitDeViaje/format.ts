/**
 * Formateadores compartidos entre assembler y renderers. Locale es-CL:
 * separador de miles = punto, decimal = coma.
 *
 * Todos los formatters ignoran null/undefined y retornan `null` — el caller
 * decide si omitir el bullet o mostrar '—'. Esta política mantiene el
 * assembler libre de la decisión de "qué hacer con datos faltantes"; la
 * política vive en un solo lugar (assembler: omitir).
 */

const NBSP = ' '

/** "37 068 km²" — número entero con separador de miles + sufijo opcional. */
export function fmtInt(n: number | null | undefined, suffix?: string): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const s = Math.round(n).toLocaleString('es-CL')
  return suffix ? `${s}${NBSP}${suffix}` : s
}

/** "12,4%" — porcentaje con 1 decimal por default. */
export function fmtPct(n: number | null | undefined, decimals = 1): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const s = n.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${s}%`
}

/** "1.516.000 hab" — atajo para población. */
export function fmtHab(n: number | null | undefined): string | null {
  return fmtInt(n, 'hab')
}

/** "37.068 km²" — atajo para superficie. */
export function fmtKm2(n: number | null | undefined): string | null {
  return fmtInt(n, 'km²')
}

/** Formato monetario en MM$ (millones de pesos). "MM$ 42.500". */
export function fmtMillones(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const s = Math.round(n).toLocaleString('es-CL')
  return `MM$${NBSP}${s}`
}

/** "12,4 años" — para escolaridad promedio, promedio de edad, etc. */
export function fmtAnios(n: number | null | undefined, decimals = 1): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const s = n.toLocaleString('es-CL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${s}${NBSP}años`
}

/** "3,2 hab/km²" — densidad poblacional. */
export function fmtDensidad(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null
  const s = n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return `${s}${NBSP}hab/km²`
}

/** "$7,55 billones" — PIB regional. Input en MM$ (miles de millones, registros_bce). */
export function fmtBillonesPesos(mmValor: number | null | undefined): string | null {
  if (mmValor == null || !Number.isFinite(mmValor)) return null
  const s = (mmValor / 1000).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `$${s}${NBSP}billones`
}

/** "$1.247 mil" — ingreso monetario del hogar (CASEN, input en pesos). */
export function fmtMilesPesos(pesos: number | null | undefined): string | null {
  if (pesos == null || !Number.isFinite(pesos)) return null
  const s = Math.round(pesos / 1000).toLocaleString('es-CL')
  return `$${s}${NBSP}mil`
}
