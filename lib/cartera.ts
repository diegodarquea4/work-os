/**
 * Orden institucional de carteras (ministerios) tal como se usa en las
 * reuniones de Gabinete Regional con SEREMIs. El DPR conduce la mesa por
 * este orden, no alfabético.
 *
 * Las entradas coinciden con los canónicos de `lib/ministerios.ts` para que
 * `compareCarteras` reciba inputs ya normalizados desde el call-site.
 *
 * Carteras canonicas que NO están en este orden caen alfabéticamente al
 * final — útil para entidades menos frecuentes (Defensa, RREE, Hacienda)
 * y para los buckets (SUBDERE, Municipalidades, Sin asignar).
 */

export const ORDEN_INSTITUCIONAL: readonly string[] = [
  'Ministerio del Interior',
  'Ministerio de Obras Públicas',
  'Ministerio de Vivienda y Urbanismo',
  'Ministerio de Salud',
  'Ministerio de Educación',
  'Ministerio del Trabajo y Previsión Social',
  'Ministerio de Economía, Fomento y Turismo',
  'Ministerio de Agricultura',
  'Ministerio del Medio Ambiente',
  'Ministerio de Transportes y Telecomunicaciones',
  'Ministerio de Bienes Nacionales',
]

const POSICION = new Map(ORDEN_INSTITUCIONAL.map((nombre, i) => [nombre, i]))

/**
 * Comparator para ordenar carteras según el orden institucional fijo.
 * Carteras dentro de `ORDEN_INSTITUCIONAL` van primero en ese orden;
 * carteras fuera de la lista (Defensa, RREE, buckets, etc.) caen al final
 * en orden alfabético.
 *
 * Espera inputs ya normalizados (canónicos de `lib/ministerios.ts`). Si una
 * variante cruda llega acá no va a matchear el orden y va al final — el
 * call-site debe llamar `normalizeMinisterio` antes.
 */
export function compareCarteras(a: string, b: string): number {
  const ia = POSICION.get(a)
  const ib = POSICION.get(b)
  if (ia !== undefined && ib !== undefined) return ia - ib
  if (ia !== undefined) return -1
  if (ib !== undefined) return  1
  return a.localeCompare(b)
}
