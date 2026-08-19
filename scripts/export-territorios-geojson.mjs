#!/usr/bin/env node
/**
 * Exporta las geometrías de distritos y circunscripciones del Panel Territorial
 * SUBDERE (Supabase externo de Francisca Barros) a archivos GeoJSON en
 * `territorial-data/` (FUERA de `public/`: se sirven gateados por
 * /api/territorial/[asset]), para que el modo «Autoridades» del Mapa las dibuje
 * con Leaflet sin bajar geometría en runtime.
 *
 * Normaliza la propiedad identificadora a `territorio` (las tablas la traen como
 * `distrito` / `circunscripcion`), que es la llave con la que el modo Autoridades
 * matchea contra los datos de congreso (DIPUTADOS/SENADORES.porTerritorioAnio).
 *
 * Se corre UNA vez y se commitean los geojson resultantes.
 *
 * Uso:
 *   node scripts/export-territorios-geojson.mjs
 * (lee NEXT_PUBLIC_TERRITORIAL_SUPABASE_URL / _ANON de .env.local o del entorno)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function leerEnvLocal() {
  const vars = {}
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) vars[m[1]] = m[2].trim()
    }
  } catch { /* no .env.local */ }
  return vars
}

const env = { ...leerEnvLocal(), ...process.env }
const SUPA_URL = env.NEXT_PUBLIC_TERRITORIAL_SUPABASE_URL
const SUPA_ANON = env.NEXT_PUBLIC_TERRITORIAL_SUPABASE_ANON

if (!SUPA_URL || !SUPA_ANON) {
  console.error('Faltan NEXT_PUBLIC_TERRITORIAL_SUPABASE_URL / _ANON (en .env.local o entorno).')
  process.exit(1)
}

const supabase = createClient(SUPA_URL, SUPA_ANON, { auth: { persistSession: false } })

/** Baja todas las filas de una tabla (paginación 1000). */
async function fetchAll(tabla, columnaOrden) {
  const tam = 1000
  let desde = 0
  let todos = []
  for (;;) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .order(columnaOrden, { ascending: true })
      .range(desde, desde + tam - 1)
    if (error) throw new Error(`Error cargando ${tabla}: ${error.message}`)
    todos = todos.concat(data)
    if (data.length < tam) break
    desde += tam
  }
  return todos
}

async function exportar(tabla, campoId, salida) {
  const rows = await fetchAll(tabla, campoId)
  const features = rows
    .filter((r) => r.geometria)
    .map((r) => ({
      type: 'Feature',
      properties: { territorio: r[campoId], n_comunas: r.n_comunas ?? null },
      geometry: r.geometria,
    }))
  const fc = { type: 'FeatureCollection', features }
  const ruta = new URL(`../territorial-data/${salida}`, import.meta.url)
  writeFileSync(ruta, JSON.stringify(fc))
  console.log(`✓ ${salida}: ${features.length} features (de ${rows.length} filas)`)
}

await exportar('distritos', 'distrito', 'distritos.geojson')
await exportar('circunscripciones', 'circunscripcion', 'circunscripciones.geojson')
console.log('Listo. Commitear territorial-data/distritos.geojson y territorial-data/circunscripciones.geojson.')
