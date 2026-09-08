/**
 * Catálogo canónico de Ministerios + buckets (Municipalidades, SUBDERE,
 * Sin asignar) para el filtro Ministerio del Dashboard.
 *
 * La columna `ministerio` de `prioridades_territoriales` es TEXT libre con
 * `;` como separador para iniciativas multi-ministerio (canonización del
 * commit 0f076e1). En 6833 filas hay ~141 valores distintos en raw: variantes
 * de tildes, abreviaturas (MINVU, Min. X), plurales (Transporte vs
 * Transportes), y entidades no-ministeriales (SUBDERE, Municipalidades).
 *
 * Este módulo es display-layer: la BD sigue tal cual. Si producto agrega o
 * renombra un ministerio, hay que tocar este archivo.
 *
 * "Ministerio del Interior" y "Ministerio de Seguridad Pública" son ministerios
 * SEPARADOS (reestructura 2023 — Seguridad Pública es su propia cartera). Antes
 * este módulo colapsaba todo Seguridad en Interior, lo que inflaba el filtro de
 * Interior en el Dashboard; corregido 2026-08. El nombre histórico combinado
 * "Ministerio del Interior y Seguridad Pública" se cuenta como Interior
 * (decisión de producto: esas iniciativas quedan bajo Interior). Esto deja el
 * filtro consistente con lib/ministeriosCanon.ts (import/editor), que ya los
 * trataba por separado.
 */

export const LISTA_CANONICA = [
  'Ministerio de Agricultura',
  'Ministerio de Bienes Nacionales',
  'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'Ministerio de Defensa Nacional',
  'Ministerio de Desarrollo Social y Familia',
  'Ministerio de Economía, Fomento y Turismo',
  'Ministerio de Educación',
  'Ministerio de Energía',
  'Ministerio de Hacienda',
  'Ministerio de Justicia y Derechos Humanos',
  'Ministerio de la Mujer y la Equidad de Género',
  'Ministerio de las Culturas, las Artes y el Patrimonio',
  'Ministerio de Minería',
  'Ministerio de Obras Públicas',
  'Ministerio de Relaciones Exteriores',
  'Ministerio de Salud',
  'Ministerio de Seguridad Pública',
  'Ministerio de Transportes y Telecomunicaciones',
  'Ministerio de Vivienda y Urbanismo',
  'Ministerio del Deporte',
  'Ministerio del Interior',
  'Ministerio del Medio Ambiente',
  'Ministerio del Trabajo y Previsión Social',
  'Ministerio Secretaría General de Gobierno',
  'Ministerio Secretaría General de la Presidencia',
  'SUBDERE',
  'Municipalidades',
  'Sin asignar',
] as const

export type MinisterioCanon = (typeof LISTA_CANONICA)[number]

function strip(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()
}

const ALIAS: Record<string, MinisterioCanon> = {}

for (const canon of LISTA_CANONICA) ALIAS[strip(canon)] = canon

const RAW_ALIASES: Array<[readonly string[], MinisterioCanon]> = [
  [['Ministerio de Transporte y Telecomunicaciones'], 'Ministerio de Transportes y Telecomunicaciones'],
  [['Ministerio de la Mujer y Equidad de Género', 'Ministerio de la Mujer y Equidad de Genero'], 'Ministerio de la Mujer y la Equidad de Género'],
  [['Ministerio de Medio Ambiente'], 'Ministerio del Medio Ambiente'],
  [['Ministerio de Ciencias, Tecnología, Conocimiento e Innovación', 'Ministerio de Ciencias, Tecnologia, Conocimiento e Innovacion'], 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación'],
  [['Ministerio Economia, Fomento y Turismo', 'Ministerio Economía, Fomento y Turismo'], 'Ministerio de Economía, Fomento y Turismo'],

  [['MINVU'], 'Ministerio de Vivienda y Urbanismo'],
  [['MOP'], 'Ministerio de Obras Públicas'],
  [['MINSAL'], 'Ministerio de Salud'],
  [['MINEDUC'], 'Ministerio de Educación'],
  [['MIDESO', 'MDS', 'MDSF'], 'Ministerio de Desarrollo Social y Familia'],
  [['SEGEGOB'], 'Ministerio Secretaría General de Gobierno'],
  [['SEGPRES'], 'Ministerio Secretaría General de la Presidencia'],

  // Interior y Seguridad Pública SEPARADOS. El nombre histórico combinado
  // cuenta como Interior (decisión de producto 2026-08). "Ministerio de
  // Interior" (sin la "l") es un typo frecuente en la data.
  [[
    'Ministerio del Interior y Seguridad Pública',
    'Ministerio de Interior',
    'MININT',
    'Min. Interior',
  ], 'Ministerio del Interior'],

  // Seguridad Pública (su canon se auto-registra desde LISTA_CANONICA; acá
  // solo las variantes históricas / abreviaturas).
  [[
    'Ministerio de Seguridad y Orden Público',
    'Ministerio de Seguridad y Órden Público',
    'Min. Seguridad',
  ], 'Ministerio de Seguridad Pública'],

  [['Min. Salud'], 'Ministerio de Salud'],
  [['Min. Educación', 'Min. Educacion'], 'Ministerio de Educación'],
  [['Min. Obras Públicas', 'Min. Obras Publicas'], 'Ministerio de Obras Públicas'],
  [['Min. Vivienda'], 'Ministerio de Vivienda y Urbanismo'],
  [['Min. Agricultura'], 'Ministerio de Agricultura'],
  [['Min. Energía', 'Min. Energia'], 'Ministerio de Energía'],
  [['Min. Trabajo'], 'Ministerio del Trabajo y Previsión Social'],
  [['Min. Transporte', 'Min. Transportes'], 'Ministerio de Transportes y Telecomunicaciones'],
  [['Min. Medio Ambiente'], 'Ministerio del Medio Ambiente'],
  [['Min. Justicia'], 'Ministerio de Justicia y Derechos Humanos'],
  [['Min. Minería', 'Min. Mineria'], 'Ministerio de Minería'],
  [['Min. Defensa'], 'Ministerio de Defensa Nacional'],
  [['Min. Cultura', 'Min. Culturas'], 'Ministerio de las Culturas, las Artes y el Patrimonio'],
  [['Min. Deporte'], 'Ministerio del Deporte'],
  [['Min. Economía', 'Min. Economia'], 'Ministerio de Economía, Fomento y Turismo'],
  [['Min. Hacienda'], 'Ministerio de Hacienda'],
  [['Min. Bienes Nacionales'], 'Ministerio de Bienes Nacionales'],
  [['Min. Desarrollo Social'], 'Ministerio de Desarrollo Social y Familia'],
  [['Min. Mujer'], 'Ministerio de la Mujer y la Equidad de Género'],
  [['Min. Relaciones Exteriores', 'Min. RREE'], 'Ministerio de Relaciones Exteriores'],
  [['Min. Ciencia', 'Min. Ciencias'], 'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación'],

  [['Subsecretaría de Desarrollo Regional', 'Subsecretaria de Desarrollo Regional'], 'SUBDERE'],
]

for (const [aliases, canon] of RAW_ALIASES) {
  for (const a of aliases) ALIAS[strip(a)] = canon
}

/**
 * Normaliza un nombre crudo de ministerio al canon (entrada de LISTA_CANONICA).
 *
 * Reglas en orden:
 *  1. null / '' → 'Sin asignar'.
 *  2. Lookup directo (canónicos y alias declarados, sin acentos/casing).
 *  3. "Municipalidad de X" → bucket 'Municipalidades'.
 *  4. 'Pendiente' o texto >100 chars (basura) → 'Sin asignar'.
 *  5. Pass-through: devuelve el trim sin tocar (no se pierde data).
 */
export function normalizeMinisterio(raw: string | null | undefined): string {
  if (raw == null) return 'Sin asignar'
  const trimmed = raw.trim()
  if (!trimmed) return 'Sin asignar'

  const stripped = strip(trimmed)

  const hit = ALIAS[stripped]
  if (hit) return hit

  if (stripped.startsWith('municipalidad de ')) return 'Municipalidades'
  if (stripped === 'pendiente') return 'Sin asignar'
  if (trimmed.length > 100) return 'Sin asignar'

  return trimmed
}

/**
 * Splits un valor de la columna `ministerio` que puede ser:
 *   - "Ministerio X" (single)
 *   - "Ministerio X;Ministerio Y" (canónico)
 *   - "Ministerio X, Ministerio Y" (legacy, ~2 filas en prod)
 *
 * Devuelve array sin normalizar — el call-site decide aplicar
 * `normalizeMinisterio` después.
 */
export function splitMinisterio(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw
    .split(/\s*;\s*|\s*,\s*(?=Ministerio)/)
    .map(s => s.trim())
    .filter(Boolean)
}

/** Nombre histórico del ministerio ANTES de dividirse en Interior y Seguridad
 *  Pública. Las 519 iniciativas que lo llevan están mal categorizadas (decisión
 *  Diego 2026-09-03): NO son cartera de ningún SEREMI hasta recategorizarlas.
 *  Se excluye explícitamente porque `normalizeMinisterio` lo colapsa a
 *  'Ministerio del Interior' (regla compartida con el filtro del Dashboard, que
 *  no se toca) — y la RLS de la mig 087 tampoco lo hace calzar. */
const MINISTERIO_COMBINADO_HISTORICO = 'ministerio del interior y seguridad publica'

/**
 * ¿La iniciativa cae dentro de la cartera de un SEREMI? (rol `seremi`, mig 087)
 *
 * El campo `ministerio` de una iniciativa es multi-valor (';'), así que basta con
 * que el ministerio del SEREMI esté ENTRE los de la iniciativa: el SEREMI de MOP
 * ve una iniciativa "Ministerio de Vivienda y Urbanismo;Ministerio de Obras
 * Públicas". Ambos lados se normalizan, de modo que las variantes sin tilde o
 * abreviadas ("Ministerio de Obras Publicas", "Min. Obras Publicas") también
 * calzan.
 *
 * Fail-closed: un SEREMI sin ministerio asignado no ve nada, y 'Sin asignar'
 * nunca actúa de comodín. Espeja `current_user_sees_ministerio()` de la BD, que
 * es la barrera dura; esto es el filtro de UI.
 */
export function ministerioCalza(
  ministerioSeremi: string | null | undefined,
  ministerioIniciativa: string | null | undefined,
): boolean {
  const raw = (ministerioSeremi ?? '').trim()
  if (!raw) return false
  if (strip(raw) === MINISTERIO_COMBINADO_HISTORICO) return false
  const clave = normalizeMinisterio(raw)
  if (clave === 'Sin asignar') return false
  return splitMinisterio(ministerioIniciativa).some(parte =>
    strip(parte) !== MINISTERIO_COMBINADO_HISTORICO && normalizeMinisterio(parte) === clave,
  )
}
