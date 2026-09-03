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

import { LISTA_CANONICA, normalizeMinisterio, type MinisterioCanon } from './ministerios'

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

// ── Catálogo de carteras del Gabinete Regional (mig 074 · Gabinete v2) ────────
//
// El acta real del Gabinete NO reporta solo por SEREMIs: también hablan actores
// que NO están en LISTA_CANONICA (la autoridad que preside, su jefatura, la
// delegación provincial, la unidad regional de SUBDERE). El "catálogo canónico
// de 22" que asumía el spec no existía; hay 3 listas SEREMI hand-synced
// (ministerios / ministeriosCanon / ORDEN_INSTITUCIONAL) y ninguna cubre estos
// actores. Este catálogo = las SEREMIs (canónicos de LISTA_CANONICA, sin los
// buckets) + los actores no-SEREMI, con un normalizador que reutiliza
// normalizeMinisterio y agrega las formas cortas ("Salud", "Economía") y de
// gabinete ("DPP del Ranco", "Jefatura de Gabinete DPR") que aparecen en actas.
//
// PARA REVISIÓN DE DIEGO: confirmar la lista ACTORES_GABINETE_NO_SEREMI.
//
// En BD `institucion` sigue TEXT libre (074); esto es la capa app/zod que PR-2
// usará para el selector y la validación. El normalizador es pass-through: si
// no reconoce el input, devuelve el texto tal cual (no se pierde data).

// Buckets de LISTA_CANONICA que NO son carteras que reportan en el gabinete.
const BUCKETS_NO_CARTERA: ReadonlySet<string> = new Set(['SUBDERE', 'Municipalidades', 'Sin asignar'])

// Actores del gabinete que no son SEREMIs (no están en LISTA_CANONICA).
export const ACTORES_GABINETE_NO_SEREMI: readonly string[] = [
  'Delegada Presidencial Regional',
  'Jefatura de Gabinete',
  'Delegación Presidencial Provincial',
  'SUBDERE',
]

// SEREMIs = LISTA_CANONICA sin los buckets. Exportada: es también el catálogo
// de ministerios asignables al rol `seremi` en Usuarios → Permisos (mig 087).
export const SEREMIS_CANONICAS: readonly MinisterioCanon[] =
  LISTA_CANONICA.filter((m): m is MinisterioCanon => !BUCKETS_NO_CARTERA.has(m))

// Catálogo completo del gabinete: SEREMIs + actores no-SEREMI.
export const CARTERAS_GABINETE: readonly string[] = [...SEREMIS_CANONICAS, ...ACTORES_GABINETE_NO_SEREMI]

// Responsable colectivo: se usa como institución "sentinel" tanto en las
// carteras de un punto de pauta como en el responsable de un compromiso.
export const TODAS_CARTERAS = 'Todas las carteras'

const CARTERAS_GABINETE_SET: ReadonlySet<string> = new Set(CARTERAS_GABINETE)

function stripCart(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}

// Alias → canónico del catálogo de gabinete (claves ya "stripped").
const GABINETE_ALIAS = new Map<string, string>()
for (const c of CARTERAS_GABINETE) GABINETE_ALIAS.set(stripCart(c), c)
// Formas cortas de las SEREMIs: quitar el prefijo "Ministerio (de|del|de la|…)".
for (const m of SEREMIS_CANONICAS) {
  const corto = m.replace(/^Ministerio (de las |de la |de los |del |de |)/, '').trim()
  GABINETE_ALIAS.set(stripCart(corto), m)
  GABINETE_ALIAS.set(stripCart(`SEREMI de ${corto}`), m)
  GABINETE_ALIAS.set(stripCart(`SEREMI ${corto}`), m)
}
// Formas cortas ambiguas (el nombre corto no es el trailing del canónico) y
// abreviaturas de los actores no-SEREMI.
const GABINETE_ALIAS_EXTRA: Array<[readonly string[], string]> = [
  [['Economía', 'Economia'], 'Ministerio de Economía, Fomento y Turismo'],
  [['Transportes', 'Transporte'], 'Ministerio de Transportes y Telecomunicaciones'],
  [['Vivienda'], 'Ministerio de Vivienda y Urbanismo'],
  [['Trabajo'], 'Ministerio del Trabajo y Previsión Social'],
  [['Cultura', 'Culturas'], 'Ministerio de las Culturas, las Artes y el Patrimonio'],
  [['Mujer'], 'Ministerio de la Mujer y la Equidad de Género'],
  [['Ciencia', 'Ciencias'], 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación'],
  [['Desarrollo Social'], 'Ministerio de Desarrollo Social y Familia'],
  [['Justicia'], 'Ministerio de Justicia y Derechos Humanos'],
  [['Delegado Presidencial Regional', 'DPR', 'Delegada', 'Delegado'], 'Delegada Presidencial Regional'],
  [['Jefe de Gabinete', 'Jefa de Gabinete', 'Jefatura de Gabinete DPR', 'Gabinete DPR'], 'Jefatura de Gabinete'],
  [['DPP', 'Delegado Presidencial Provincial', 'Delegación Provincial'], 'Delegación Presidencial Provincial'],
  [['SUBDERE Regional', 'Subsecretaría de Desarrollo Regional', 'Subsecretaria de Desarrollo Regional'], 'SUBDERE'],
]
for (const [aliases, canon] of GABINETE_ALIAS_EXTRA) {
  for (const a of aliases) GABINETE_ALIAS.set(stripCart(a), canon)
}

/**
 * Normaliza un nombre crudo de cartera/actor del gabinete al canónico del
 * catálogo. Pass-through: si no reconoce, devuelve el trim sin tocar.
 */
export function normalizeCarteraGabinete(raw: string | null | undefined): string {
  if (raw == null) return ''
  const trimmed = raw.trim()
  if (!trimmed) return ''
  const stripped = stripCart(trimmed)

  const hit = GABINETE_ALIAS.get(stripped)
  if (hit) return hit

  // Actores con sufijo variable (provincia, "DPR", etc.).
  if (stripped.startsWith('dpp') || stripped.startsWith('delegacion presidencial provincial') || stripped.startsWith('delegacion provincial'))
    return 'Delegación Presidencial Provincial'
  if (stripped.startsWith('jefatura de gabinete') || stripped.startsWith('jefe de gabinete') || stripped.startsWith('jefa de gabinete'))
    return 'Jefatura de Gabinete'
  if (stripped.startsWith('delegad') && stripped.includes('regional'))
    return 'Delegada Presidencial Regional'

  // Reusar el normalizador de ministerios (maneja "Ministerio de X", "Min. X").
  const min = normalizeMinisterio(trimmed)
  if ((SEREMIS_CANONICAS as readonly string[]).includes(min)) return min
  if (min === 'SUBDERE') return 'SUBDERE'

  return trimmed
}

/** True si el valor (crudo) normaliza a una cartera del catálogo de gabinete. */
export function isCarteraGabinete(raw: string | null | undefined): boolean {
  return CARTERAS_GABINETE_SET.has(normalizeCarteraGabinete(raw))
}
