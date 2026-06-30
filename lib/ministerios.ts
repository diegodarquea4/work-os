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
 * Variantes de "Seguridad Pública" se colapsan a "Ministerio del Interior"
 * (guideline de producto — el panel no menciona "Seguridad Pública").
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

  [[
    'Ministerio del Interior y Seguridad Pública',
    'Ministerio de Seguridad Pública',
    'Ministerio de Seguridad y Orden Público',
    'Ministerio de Seguridad y Órden Público',
    'MININT',
    'Min. Interior',
  ], 'Ministerio del Interior'],

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
