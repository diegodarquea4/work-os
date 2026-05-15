/**
 * Region name matcher — normalizes Chilean region names to INE_CODE numbers.
 *
 * Government Excel files use inconsistent naming:
 *   "Región de Tarapacá", "Tarapacá", "I Región", "01", "Tarapaca", "TARAPACA"
 *
 * This module normalizes all variants to the numeric INE code (1-16, 0=NAC).
 */

import { REGIONS, INE_CODE } from './regions'

// Build lookup tables once
const NAME_MAP = new Map<string, number>()

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/^region\s+(de\s+)?/i, '')               // strip "Región de "
    .replace(/\s+/g, ' ')
    .trim()
}

// Populate from REGIONS array
for (const r of REGIONS) {
  const id = INE_CODE[r.cod]
  if (id === undefined) continue

  NAME_MAP.set(normalize(r.nombre), id)
  NAME_MAP.set(normalize(r.cod), id)
  NAME_MAP.set(String(id), id)
  NAME_MAP.set(String(id).padStart(2, '0'), id)
}

// Extra aliases for common variants
const ALIASES: [string, number][] = [
  ['arica', 15],
  ['arica y parinacota', 15],
  ['tarapaca', 1],
  ['antofagasta', 2],
  ['atacama', 3],
  ['coquimbo', 4],
  ['valparaiso', 5],
  ['ohiggins', 6],
  ["o'higgins", 6],
  ['lib. gral. bernardo ohiggins', 6],
  ['libertador', 6],
  ['maule', 7],
  ['nuble', 16],
  ['biobio', 8],
  ['bio-bio', 8],
  ['araucania', 9],
  ['la araucania', 9],
  ['los rios', 14],
  ['los lagos', 10],
  ['aysen', 11],
  ['aisen', 11],
  ['magallanes', 12],
  ['magallanes y antartica', 12],
  ['magallanes y de la antartica', 12],
  ['metropolitana', 13],
  ['rm', 13],
  ['santiago', 13],
  ['metropolitana de santiago', 13],
  ['nacional', 0],
  ['total pais', 0],
  ['total', 0],
  ['pais', 0],
]

for (const [alias, id] of ALIASES) {
  NAME_MAP.set(normalize(alias), id)
}

// Roman numeral mapping
const ROMAN: Record<string, number> = {
  'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7,
  'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12, 'xiii': 13,
  'xiv': 14, 'xv': 15, 'xvi': 16,
}

// Map roman to INE (I→1, but XV→15 Arica)
const ROMAN_TO_INE: Record<string, number> = {
  'xv': 15, 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6,
  'vii': 7, 'viii': 8, 'ix': 9, 'x': 10, 'xi': 11, 'xii': 12,
  'xiii': 13, 'xiv': 14, 'xvi': 16,
}

/**
 * Match a region name string to an INE_CODE number.
 * Returns null if no match found.
 */
export function matchRegionName(raw: string): number | null {
  const input = normalize(raw)
  if (!input) return null

  // Direct lookup
  const direct = NAME_MAP.get(input)
  if (direct !== undefined) return direct

  // Try stripping "region" prefix variations
  const stripped = input
    .replace(/^(i{1,3}|iv|v|vi{0,3}|ix|x{1,3}i{0,2}v?)\s+region$/i, '$1')
    .replace(/^region\s+/i, '')
    .trim()

  const stripped2 = NAME_MAP.get(stripped)
  if (stripped2 !== undefined) return stripped2

  // Try Roman numeral
  const roman = ROMAN_TO_INE[input] ?? ROMAN_TO_INE[stripped]
  if (roman !== undefined) return roman

  // Numeric string
  const num = parseInt(input)
  if (!isNaN(num) && num >= 0 && num <= 16) return num

  // Fuzzy: check if any key is a substring
  for (const [key, id] of NAME_MAP.entries()) {
    if (input.includes(key) || key.includes(input)) return id
  }

  return null
}
