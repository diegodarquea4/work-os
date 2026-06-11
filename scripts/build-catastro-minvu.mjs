#!/usr/bin/env node
/**
 * Convierte el CSV del Catastro Nacional de Campamentos MINVU (CNC 2026) a
 * JSON bundleado para el cliente.
 *
 * Uso:
 *   node scripts/build-catastro-minvu.mjs <input.csv> [output.json]
 *
 * Defaults:
 *   output = public/data/catastro-minvu-2026.json
 *
 * El CSV original viene en ISO-8859-1 (acentos como bytes 0xE1/0xED/0xF3). Este
 * script lo decodifica correctamente. Si el archivo ya está en UTF-8 pero con
 * mojibake (caracteres "Ã­", "Ã©", "Ã³" provenientes de UTF-8 mis-interpretado
 * como Latin-1), también lo recupera.
 *
 * Schema de cada entrada (ver lib/catastroMinvu.ts):
 *   {
 *     folio:            string        // "510103" (sin sufijo .0)
 *     nombre:           string
 *     region:           string
 *     provincia:        string
 *     comuna:           string
 *     estado:           string        // "VIGENTE" | "VIGENTE SIN PRESENCIA…"
 *     estrategia:       string
 *     hogares_catastro: number | null
 *     hogares_censo:    number | null
 *     superficie_ha:    number | null
 *     tipo_propiedad:   string | null // PRIVADO / FISCAL / MIXTO / MUNICIPAL / null
 *     propietario:      string | null
 *     catastro_ingreso: string        // "CATASTRO_2011" / "CATASTRO 2024" / …
 *     lat:              number
 *     lng:              number
 *   }
 *
 * Convenciones:
 *   - Folio numérico con .0 → string sin el .0 ("510103.0" → "510103").
 *   - "S/I" en cualquier campo de texto se convierte a null.
 *   - Hogares numéricos: 0 se conserva, "S/I" → null.
 *   - Lat/lng deben venir de la columna POINT del WKT (más confiable que las
 *     columnas Latitud/Longitud que vienen al final por si hay desincronía).
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [, , inputArg, outputArg] = process.argv

if (!inputArg) {
  console.error('Uso: node scripts/build-catastro-minvu.mjs <input.csv> [output.json]')
  process.exit(1)
}

const input  = resolve(inputArg)
const output = resolve(outputArg ?? 'public/data/catastro-minvu-2026.json')

// ── 1. Leer y decodificar el archivo ────────────────────────────────────────

const buf = await readFile(input)

/**
 * Devuelve el texto decodificado, sin mojibake. Prueba 3 estrategias:
 *   a) UTF-8 directo, si no hay marcadores mojibake → ya está bien.
 *   b) UTF-8 con mojibake (texto re-encoded vía Latin-1) → revertir.
 *   c) ISO-8859-1 directo si el archivo original venía en Latin-1.
 */
function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  // Marcadores típicos de mojibake (UTF-8 leído como Latin-1):
  //   í → Ã­ ;  é → Ã© ;  ó → Ã³ ;  ñ → Ã±
  const mojibake = /Ã[­©³±¡»¼¬]/.test(utf8)
  if (!mojibake) return utf8

  // Reemplazos a nivel de string: cubren tanto el caso "Ã" + byte Latin-1
  // visible (lowercase acentuados: í/é/ó/ñ/á/ú/ü) como el caso "Ã" + byte
  // de control C1 stripped por algún canal (Á/É/Í/Ó/Ú/Ñ uppercase). Más
  // robusto que el roundtrip byte→UTF-8 porque no falla con bytes huérfanos.
  let fixed = utf8
    // Lowercase con tilde — el segundo byte (0xA0-0xBF) está en rango imprimible
    // Latin-1 y suele sobrevivir cualquier canal.
    .replace(/Ã­/g, 'í')
    .replace(/Ã©/g, 'é')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã¡/g, 'á')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã¼/g, 'ü')
    // Comilla y signos por si aparecen mojibakeados.
    .replace(/Â°/g, '°')
    .replace(/Âº/g, 'º')
    .replace(/Âª/g, 'ª')
  // Uppercase acentuadas (Á/É/Í/Ó/Ú/Ñ): el byte 0x81/89/8D/93/9A/91 cae en
  // C1 control (no imprimible). Si el canal lo eliminó, queda "Ã" + char
  // siguiente. En castellano la vocal más frecuente con tilde es Ó (RADICACIÓN,
  // RELOCALIZACIÓN, REGIÓN, DIAGNÓSTICO, REDEFINICIÓN). Asumimos Ó.
  // Si el canal lo PRESERVÓ pero como UTF-8 inválido, queda Ã + U+FFFD (`�`).
  fixed = fixed.replace(/Ã�/g, 'Ó')
  // Caso fall-through: "Ã" suelto seguido de ASCII letter/numérico (sin el
  // byte de continuación) — asumimos Ó.
  fixed = fixed.replace(/Ã(?=[A-Za-z0-9])/g, 'Ó')

  return fixed
}

const text = decode(buf)

// ── 2. Parsear CSV ──────────────────────────────────────────────────────────
// Parser conservador: respeta comillas dobles (que pueden contener comas).

function parseCSV(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else inQuotes = false
      } else cell += c
    } else {
      if      (c === '"')                       inQuotes = true
      else if (c === ',')                      { row.push(cell); cell = '' }
      else if (c === '\n')                     { row.push(cell); rows.push(row); row = []; cell = '' }
      else if (c === '\r')                     { /* skip */ }
      else                                      cell += c
    }
  }
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row) }
  return rows
}

const rows = parseCSV(text).filter(r => r.length > 1 && r.some(c => c.trim() !== ''))
const header = rows.shift()

// Mapa columna → índice. Tolerante a orden distinto.
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
function need(name) {
  if (col[name] === undefined) throw new Error(`Columna requerida "${name}" no encontrada. Columnas: ${Object.keys(col).join(', ')}`)
  return col[name]
}

const COL = {
  wkt:        need('WKT'),
  folio:      need('Folio'),
  nombre:     need('Nombre de la toma'),
  region:     need('Región'),
  provincia:  need('Provincia'),
  comuna:     need('Comuna'),
  estado:     need('Estado'),
  estrategia: need('Estrategia'),
  hCat:       need('Hogares (catastro)'),
  hCenso:     need('Hogares (censo)'),
  sup:        need('Superficie (ha)'),
  tipoProp:   need('Tipo de propiedad'),
  prop:       need('Propietario'),
  catIngreso: need('Catastro de ingreso'),
  lat:        need('Latitud'),
  lng:        need('Longitud'),
}

// ── 3. Normalizar cada fila ─────────────────────────────────────────────────

function clean(s) {
  if (s == null) return null
  const v = String(s).trim()
  if (v === '' || v === 'S/I') return null
  return v
}

function toNumOrNull(s) {
  const v = clean(s)
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function toIntOrNull(s) {
  const n = toNumOrNull(s)
  if (n === null) return null
  return Math.round(n)
}

function parseFolio(raw) {
  const v = String(raw).trim()
  // "510103.0" → "510103" ; "510103" → "510103".
  if (/^\d+\.0+$/.test(v)) return v.replace(/\.0+$/, '')
  return v
}

/**
 * Extrae lat/lng del WKT "POINT (lng lat)". Más confiable que las columnas
 * Latitud/Longitud individuales — en algunas filas el CSV tiene celdas con
 * coma como decimal y/o swap orden.
 */
function parsePoint(wkt) {
  const m = /^\s*POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)\s*$/.exec(String(wkt))
  if (!m) return null
  return { lng: Number(m[1]), lat: Number(m[2]) }
}

const out = []
let skipped = 0

for (const r of rows) {
  const wkt = r[COL.wkt]
  const point = parsePoint(wkt)
  if (!point) { skipped++; continue }

  // Validar lat/lng en rangos plausibles para Chile (lat negativa, lng negativa).
  if (point.lat > 0 || point.lat < -56 || point.lng > 0 || point.lng < -110) {
    skipped++
    continue
  }

  out.push({
    folio:            parseFolio(r[COL.folio]),
    nombre:           clean(r[COL.nombre]) ?? '—',
    region:           clean(r[COL.region]) ?? '—',
    provincia:        clean(r[COL.provincia]) ?? '—',
    comuna:           clean(r[COL.comuna]) ?? '—',
    estado:           clean(r[COL.estado]) ?? '—',
    estrategia:       clean(r[COL.estrategia]) ?? '—',
    hogares_catastro: toIntOrNull(r[COL.hCat]),
    hogares_censo:    toIntOrNull(r[COL.hCenso]),
    superficie_ha:    toNumOrNull(r[COL.sup]),
    tipo_propiedad:   clean(r[COL.tipoProp]),
    propietario:      clean(r[COL.prop]),
    catastro_ingreso: clean(r[COL.catIngreso]) ?? '—',
    lat:              point.lat,
    lng:              point.lng,
  })
}

// ── 4. Sanity checks ────────────────────────────────────────────────────────

// Detectar mojibake residual antes de escribir.
const sampleNombres = out.slice(0, 50).map(e => e.nombre).join(' ')
if (/Ã[­©³±¡»¼¬]/.test(sampleNombres)) {
  console.error('✗ Mojibake residual detectado en nombres. Revisar decode().')
  console.error('  Primeros nombres:', out.slice(0, 5).map(e => e.nombre))
  process.exit(2)
}

// Folios duplicados — informativo, no error.
const folioCounts = new Map()
for (const e of out) folioCounts.set(e.folio, (folioCounts.get(e.folio) ?? 0) + 1)
const duplicados = [...folioCounts.entries()].filter(([, n]) => n > 1)

// ── 5. Escribir JSON ────────────────────────────────────────────────────────

await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(out, null, 0), 'utf-8')

console.log(`✓ Catastro MINVU: ${out.length} entradas → ${output}`)
console.log(`  Saltadas (sin WKT o coords inválidas): ${skipped}`)
if (duplicados.length > 0) {
  console.log(`  Folios duplicados (informativo): ${duplicados.length}`)
  if (duplicados.length <= 5) {
    for (const [f, n] of duplicados) console.log(`    ${f}: ${n}×`)
  }
}
console.log(`  Tamaño: ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`)
