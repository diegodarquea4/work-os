#!/usr/bin/env node
/**
 * Convierte el GeoJSON oficial del Catastro Nacional de Campamentos MINVU
 * (CNC 2026) a JSON bundleado para el cliente. Path típico del input:
 *
 *   ~/Downloads/CNC_2026/CNC_2026.geojson
 *
 * Ventaja sobre el CSV: el GeoJSON viene en UTF-8 limpio (sin mojibake) y
 * trae las geometrías completas con POINT_X/POINT_Y como centroide oficial
 * de cada polígono.
 *
 * Uso:
 *   node scripts/build-catastro-minvu-from-geojson.mjs <input.geojson> [output.json]
 *
 * Default output: public/data/catastro-minvu-2026.json
 *
 * Mapping de propiedades GeoJSON → schema CatastroEntry:
 *   FOLIO       → folio (string sin sufijo numérico)
 *   NOM         → nombre
 *   REG         → region
 *   PROVINCIA   → provincia
 *   COM         → comuna
 *   EST         → estado
 *   ESTRATEGIA  → estrategia
 *   HOGARESCAT  → hogares_catastro (number | null)
 *   HOGARESCEN  → hogares_censo (parseado: "S/I" → null)
 *   SUPERFIC_1  → superficie_ha
 *   PROPIEDADD  → tipo_propiedad
 *   PROPIETARI  → propietario
 *   INGRESO     → catastro_ingreso
 *   POINT_X     → lng
 *   POINT_Y     → lat
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const [, , inputArg, outputArg] = process.argv

if (!inputArg) {
  console.error('Uso: node scripts/build-catastro-minvu-from-geojson.mjs <input.geojson> [output.json]')
  process.exit(1)
}

const input  = resolve(inputArg)
const output = resolve(outputArg ?? 'public/data/catastro-minvu-2026.json')

const raw  = await readFile(input, 'utf-8')
const data = JSON.parse(raw)

if (data?.type !== 'FeatureCollection' || !Array.isArray(data.features)) {
  console.error('El archivo no es un GeoJSON FeatureCollection.')
  process.exit(2)
}

function clean(v) {
  if (v == null) return null
  const s = String(v).trim()
  if (s === '' || s === 'S/I' || s.toLowerCase() === 'null') return null
  return s
}

function toNumOrNull(v) {
  if (v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(',', '.')
  if (s === '' || s === 'S/I') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function toIntOrNull(v) {
  const n = toNumOrNull(v)
  return n === null ? null : Math.round(n)
}

const out = []
let skipped = 0

for (const f of data.features) {
  const p = f?.properties
  if (!p) { skipped++; continue }

  const lat = toNumOrNull(p.POINT_Y)
  const lng = toNumOrNull(p.POINT_X)
  if (lat === null || lng === null) { skipped++; continue }

  // Sanity: Chile continental + islas (extremos aprox).
  if (lat > 0 || lat < -56 || lng > 0 || lng < -110) { skipped++; continue }

  out.push({
    folio:            String(p.FOLIO).replace(/\.0+$/, ''),
    nombre:           clean(p.NOM) ?? '—',
    region:           clean(p.REG) ?? '—',
    provincia:        clean(p.PROVINCIA) ?? '—',
    comuna:           clean(p.COM) ?? '—',
    estado:           clean(p.EST) ?? '—',
    estrategia:       clean(p.ESTRATEGIA) ?? '—',
    hogares_catastro: toIntOrNull(p.HOGARESCAT),
    hogares_censo:    toIntOrNull(p.HOGARESCEN),
    superficie_ha:    toNumOrNull(p.SUPERFIC_1),
    tipo_propiedad:   clean(p.PROPIEDADD),
    propietario:      clean(p.PROPIETARI),
    catastro_ingreso: clean(p.INGRESO) ?? '—',
    lat,
    lng,
  })
}

// ── Sanity ──────────────────────────────────────────────────────────────────

const folioCounts = new Map()
for (const e of out) folioCounts.set(e.folio, (folioCounts.get(e.folio) ?? 0) + 1)
const duplicados = [...folioCounts.entries()].filter(([, n]) => n > 1)

await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(out, null, 0), 'utf-8')

console.log(`✓ Catastro MINVU CNC 2026: ${out.length} entradas → ${output}`)
console.log(`  Saltadas (sin POINT_X/Y o fuera de Chile): ${skipped}`)
if (duplicados.length > 0) {
  console.log(`  Folios duplicados: ${duplicados.length}`)
  if (duplicados.length <= 5) {
    for (const [f, n] of duplicados) console.log(`    ${f}: ${n}×`)
  }
}
console.log(`  Tamaño: ${(JSON.stringify(out).length / 1024).toFixed(1)} KB`)
console.log(`  Regiones cubiertas: ${new Set(out.map(e => e.region)).size}`)
