/**
 * Catálogo de comunas (CUT oficial) + matcher texto-libre → CUT.
 *
 * La llave es SIEMPRE el CUT (código único territorial), nunca el nombre.
 * El catálogo se genera desde los 16 geojson de public/comunas/ (la misma
 * fuente que dibuja el mapa — cero riesgo de divergencia catálogo↔mapa) con
 * `node scripts/generate-comunas-cut.mjs`.
 *
 * El pipeline del matcher replica el del análisis contra la base productiva
 * completa (docs/drilldown-comunal/reporte-matching-comunas.md, 704 valores
 * únicos resueltos): normalizar → ¿alcance regional? → alias → split →
 * greedy por ventana → variantes de guión → fuzzy. Dos fixes propios sobre
 * ese análisis: el token completo se prueba ANTES de partir por guión
 * ("Llay-llay" no se rompe) y el catálogo nacional actúa de fallback para
 * comunas de otra región (cobertura cross-región, p. ej. mineras).
 *
 * Todo puro y sin IO — corre igual en browser (preview del import) y en
 * server (approve de propuestas).
 */

import catalogoJson from '@/data/comunas-cut.json'
import { INE_CODE } from '@/lib/regions'

export type ComunaInfo = { cut: number; nombre: string; regionIne: number }

export const COMUNAS: readonly ComunaInfo[] = catalogoJson as ComunaInfo[]

export type ComunaMatchResult = {
  cods: number[]
  alcanceRegional: boolean
  noMatcheados: string[]
}

// ── Normalización ────────────────────────────────────────────────────────────

/**
 * lowercase → sin diacríticos (NFD; también convierte ñ→n) → '¿'→'n' (encoding
 * roto clásico de ñ en los Excel regionales) → sin puntos/apóstrofes → espacios
 * colapsados. NO toca guiones (los maneja el matcher con variantes).
 */
export function normalizeComunaText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/¿/g, 'n')
    .replace(/[.'´’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Índices ──────────────────────────────────────────────────────────────────

const porRegion = new Map<number, Map<string, number>>()
const nacional = new Map<string, number[]>()
const nombrePorCut = new Map<number, string>()

for (const c of COMUNAS) {
  const norm = normalizeComunaText(c.nombre)
  if (!porRegion.has(c.regionIne)) porRegion.set(c.regionIne, new Map())
  porRegion.get(c.regionIne)!.set(norm, c.cut)
  const arr = nacional.get(norm) ?? []
  arr.push(c.cut)
  nacional.set(norm, arr)
  nombrePorCut.set(c.cut, c.nombre)
}

export function comunasDeRegion(regionCod: string): ComunaInfo[] {
  const ine = INE_CODE[regionCod]
  if (ine === undefined) return []
  return COMUNAS.filter(c => c.regionIne === ine)
}

export function comunaNombre(cut: number): string | null {
  return nombrePorCut.get(cut) ?? null
}

// ── Alias (docs/drilldown-comunal/alias_aplicados.csv + localidades del
//    reporte). Claves normalizadas; valores = nombre oficial del catálogo. ───

const ALIAS = new Map<string, string>([
  ['la calera', 'Calera'],
  ['llay llay', 'Llaillay'],
  ['llayllay', 'Llaillay'],
  ['trehuaco', 'Treguaco'],
  ['pedro a cerda', 'Pedro Aguirre Cerda'],
  ['marchihue', 'Marchigüe'],
  ['san vicente de tagua tagua', 'San Vicente'],
  ['montepatria', 'Monte Patria'],
  ['peumanque', 'Pumanque'],
  ['san francisco de mostazal', 'Mostazal'],
  ['quinta tilcoco', 'Quinta de Tilcoco'],
  ['chimborongo', 'Chimbarongo'],
  ['ohiggins', "O'Higgins"],
  ['antartica', 'Cabo de Hornos'],
  ['antofgagasta', 'Antofagasta'],
  ['lican ray', 'Villarrica'],
  ['barnechea', 'Lo Barnechea'],
  ['con con', 'Concón'],
  ['sta baarbara', 'Santa Bárbara'],
  ['liquine', 'Panguipulli'],
  ['san jose de la mariquina', 'Mariquina'],
  ['chilan', 'Chillán'],
  ['dichato', 'Tomé'],
  ['cabras', 'Las Cabras'],
  ['treguaco - region del nuble', 'Treguaco'],
  ['trehuaco - region del nuble', 'Treguaco'],
])

// ── Alcance regional ─────────────────────────────────────────────────────────
// Set exacto = los 45 valores reales con categoría bucket_regional del análisis
// (normalizados). El regex atrapa variantes futuras del mismo espíritu. Ninguna
// comuna real contiene estas palabras — verificado contra el catálogo.

const REGIONAL_EXACT = new Set<string>([
  '16 comunas de la region (cobertura territorial amplia)',
  '21 comunas de nuble',
  'alcance regional',
  'alcance regional (en todas las comunas de la region a excepcion de antofagasta, mejillones y taltal)',
  'alcance regional (en todas las comunas de la region a excepcion de mejillones y taltal)',
  'biobio;nuble',
  'chiloe',
  'cobertura regional',
  'cobertura regional: comunas del biobio informadas en correo de nivel central',
  'comuna',
  'comunas rurales',
  'comunas rurales rm',
  'distintas zonas extremas',
  'diversas comunas de nuble, dependera de la demanda municipal',
  'gran santiago',
  'intercomunal',
  'metropolitana',
  'por definir con autoridad regional',
  'por definir con red de activacion cultural regional',
  'prov del ranco',
  'prov valdivia',
  'provincia biobio',
  'provincia concepcion',
  'provincia de arauco',
  'provincia de santiago',
  'provincial',
  'region biobio',
  'region de antofagasta',
  'region del biobio',
  'region del biobio, a traves de red omil y plataformas territoriales',
  'region del biobio, segun requerimientos empresariales levantados',
  'region metropolitana de santiago',
  'regional',
  'regional (21 comunas de nuble)',
  'regional (nuble y biobio)',
  'regional, 21 comunas',
  'sin informacion',
  'sin informacion comunal consolidada;cobertura proyectada regional',
  'tierra del fuego',
  'toda la region',
  'todas',
  'todas las comunas de la region de los rios',
  'ultima esperanza',
  'varias',
  'zona de rezago cordillerana',
])

const REGIONAL_RE =
  /(^(regional|todas?|varias|provincial|intercomunal)$)|regio?n\b|provincia|por definir|sin informacion|todas las comunas|comunas de|comunas rurales/

function esAlcanceRegional(norm: string): boolean {
  return REGIONAL_EXACT.has(norm) || REGIONAL_RE.test(norm)
}

// ── Fuzzy (Levenshtein acotado) ──────────────────────────────────────────────

function levenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (curr[j] < rowMin) rowMin = curr[j]
    }
    if (rowMin > max) return max + 1
    prev = curr
  }
  return prev[b.length]
}

// ── Matcher ──────────────────────────────────────────────────────────────────

/** Busca un texto YA normalizado como comuna. Regional primero, nacional como
 *  fallback (solo si el nombre es único a nivel país). Sin fuzzy acá. */
function lookupExacto(norm: string, regionIne: number | undefined): number | null {
  if (regionIne !== undefined) {
    const cut = porRegion.get(regionIne)?.get(norm)
    if (cut !== undefined) return cut
  }
  const alias = ALIAS.get(norm)
  if (alias !== undefined) return lookupExacto(normalizeComunaText(alias), regionIne)
  const nac = nacional.get(norm)
  if (nac && nac.length === 1) return nac[0]
  return null
}

/** Variantes de guión: el token completo YA se probó — acá "llay-llay" se
 *  intenta como "llay llay" y "llayllay" antes de darlo por perdido. */
function lookupConGuiones(norm: string, regionIne: number | undefined): number | null {
  const directo = lookupExacto(norm, regionIne)
  if (directo !== null) return directo
  if (norm.includes('-')) {
    return (
      lookupExacto(norm.replace(/-/g, ' ').replace(/\s+/g, ' ').trim(), regionIne) ??
      lookupExacto(norm.replace(/-/g, ''), regionIne)
    )
  }
  return null
}

function lookupFuzzy(norm: string, regionIne: number | undefined): number | null {
  if (regionIne === undefined || norm.length < 5) return null
  const max = norm.length >= 7 ? 2 : 1
  let best: { cut: number; d: number } | null = null
  let empate = false
  for (const [nombre, cut] of porRegion.get(regionIne) ?? []) {
    const d = levenshtein(norm, nombre, max)
    if (d <= max) {
      if (best === null || d < best.d) { best = { cut, d }; empate = false }
      else if (d === best.d && cut !== best.cut) empate = true
    }
  }
  return best !== null && !empate ? best.cut : null
}

/** Greedy por ventana para listas separadas solo por espacios ("San Felipe
 *  Catemu Panquehue…"): ventana más larga primero (≤4 palabras), avanza al
 *  matchear; las palabras que quedan sueltas se reportan como no matcheadas. */
function greedyPorVentana(
  norm: string,
  regionIne: number | undefined,
): { cods: number[]; sobras: string[] } {
  const palabras = norm.split(' ')
  const cods: number[] = []
  const sobras: string[] = []
  let i = 0
  while (i < palabras.length) {
    let matched = false
    for (let w = Math.min(4, palabras.length - i); w >= 1; w--) {
      const ventana = palabras.slice(i, i + w).join(' ')
      const cut = lookupConGuiones(ventana, regionIne) ?? (w === 1 ? lookupFuzzy(ventana, regionIne) : null)
      if (cut !== null) {
        cods.push(cut)
        i += w
        matched = true
        break
      }
    }
    if (!matched) {
      sobras.push(palabras[i])
      i++
    }
  }
  return { cods, sobras }
}

/**
 * Resuelve el texto libre del campo `comuna` a CUTs oficiales.
 *
 * - Texto vacío o de alcance regional → { cods: [], alcanceRegional: true }.
 * - Multi-comuna (separadores `;`, `·`, `,`, `/`, " y ") → un CUT por parte.
 * - Partes irresolubles → `noMatcheados` (el importador las convierte en
 *   error de fila: una comuna mal escrita NUNCA entra silenciosa).
 */
export function matchComunas(texto: string, regionCod: string): ComunaMatchResult {
  const regionIne: number | undefined = INE_CODE[regionCod]
  const norm = normalizeComunaText(texto)

  if (norm === '') return { cods: [], alcanceRegional: true, noMatcheados: [] }

  // String completo como comuna (antes del check regional: "Metropolitana"
  // no es comuna, pero si algún día lo fuera, la comuna gana).
  const entero = lookupConGuiones(norm, regionIne)
  if (entero !== null) return { cods: [entero], alcanceRegional: false, noMatcheados: [] }

  if (esAlcanceRegional(norm)) return { cods: [], alcanceRegional: true, noMatcheados: [] }

  // Multi-comuna: separadores explícitos primero.
  const partes = norm
    .split(/[;·,/]|\s+y\s+/)
    .map(p => p.trim())
    .filter(Boolean)

  const cods: number[] = []
  const noMatcheados: string[] = []

  for (const parte of partes) {
    const cut = lookupConGuiones(parte, regionIne) ?? lookupFuzzy(parte, regionIne)
    if (cut !== null) {
      cods.push(cut)
      continue
    }
    if (parte.includes(' ')) {
      // Lista separada solo por espacios (o parte con basura al final).
      const { cods: sub, sobras } = greedyPorVentana(parte, regionIne)
      if (sub.length > 0) {
        cods.push(...sub)
        if (sobras.length > 0) noMatcheados.push(sobras.join(' '))
        continue
      }
    }
    noMatcheados.push(parte)
  }

  // Dedup preservando orden de aparición.
  const unicos = Array.from(new Set(cods))
  return { cods: unicos, alcanceRegional: false, noMatcheados }
}
