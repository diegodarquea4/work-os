#!/usr/bin/env node
/**
 * Genera el SNAPSHOT del modo «Autoridades» a partir del Supabase externo de
 * Francisca Barros (SUBDERE). Baja las 9 tablas de datos (crudas, sin geometría)
 * + las fotos de gobernadores y las escribe como JSON en `territorial-data/`
 * (FUERA de `public/`: se sirven gateados por /api/territorial/[asset], que exige
 * la capacidad `mapa.autoridades`).
 *
 * En runtime, `lib/territorial/source.ts` los pide a esa ruta (un fetch por sesión,
 * cacheado en módulo) en vez de paginar la Supabase de Francisca (~55 requests).
 * Resultado: carga ~1-2s y CERO dependencia de Francisca en producción.
 *
 * Se corre a mano cuando Francisca actualiza datos (o desde un cron), y se commitea
 * la salida:
 *   node scripts/snapshot-territorial.mjs
 * (lee NEXT_PUBLIC_TERRITORIAL_SUPABASE_URL / _ANON de .env.local o del entorno —
 *  esas vars son SOLO para este script, no para el runtime.)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
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

// Selects explícitos (NUNCA geometria). Deben coincidir con lib/territorial/source.ts.
const SELECT = {
  regiones: 'codigo_region,nombre,n_comunas',
  comunas: 'codigo_comuna,nombre,codigo_region,region,poblacion,tamano',
  alcaldes: 'id,codigo_comuna,anio,nombre,partido,pct,votos,reelecto,lado_cerrado,lado_abierto,voto_obligatorio,total_validos,contrincantes,tope_reeleccion,puede_repostular_2028,confianza_dato',
  gobernadores: 'id,codigo_region,anio,nombre,partido,lista,pct,votos,lado_cerrado,lado_abierto,voto_obligatorio,contrincantes,puede_repostular_proxima,confianza_dato',
  gobernador_resultado_comunal: 'id,codigo_comuna,codigo_region,anio,gano,vuelta_usada,ganador_comuna,pct_gobernador_en_comuna,votos_gobernador_en_comuna_verif',
  diputados_candidatos: 'id,codigo_comuna,anio,nombre,partido,votos,electo,distrito',
  senadores_candidatos: 'id,codigo_comuna,anio,nombre,partido,votos,electo,circunscripcion',
  congreso_reeleccion: 'id,cargo,territorio,nombre,periodos_consecutivos,puede_repostular,confianza_dato',
  delegados_presidenciales: 'id,codigo_region,presidente,nombre,partido,cargo,periodo_especifico',
}
const ORDER = {
  regiones: 'codigo_region', comunas: 'codigo_comuna', alcaldes: 'id', gobernadores: 'id',
  gobernador_resultado_comunal: 'id', diputados_candidatos: 'id', senadores_candidatos: 'id',
  congreso_reeleccion: 'id', delegados_presidenciales: 'id',
}

async function fetchAll(tabla, select, order) {
  const tam = 1000
  let desde = 0
  let todos = []
  for (;;) {
    const { data, error } = await supabase.from(tabla).select(select).order(order, { ascending: true }).range(desde, desde + tam - 1)
    if (error) throw new Error(`Error cargando ${tabla}: ${error.message}`)
    todos = todos.concat(data)
    if (data.length < tam) break
    desde += tam
  }
  return todos
}

function kb(obj) { return Math.round(JSON.stringify(obj).length / 1024) }

const tablas = Object.keys(SELECT)
console.log('Bajando tablas de Francisca…')
const raw = {}
for (const t of tablas) {
  raw[t] = await fetchAll(t, SELECT[t], ORDER[t])
  console.log(`  ${t.padEnd(30)} ${String(raw[t].length).padStart(6)} filas · ${kb(raw[t])} KB`)
}

console.log('Bajando fotos de gobernadores…')
const fotos = await fetchAll('fotos_gobernador', 'codigo_region,anio,foto_base64', 'codigo_region')
console.log(`  fotos_gobernador ${String(fotos.length).padStart(6)} filas · ${kb(fotos)} KB`)

// Guardrail: la MISMA foto en regiones DISTINTAS casi siempre es un error de dato
// (placeholder o foto equivocada). Repetir 2021↔2024 dentro de una región es normal
// (gobernador reelecto) y NO se avisa.
const fotoRegiones = new Map() // hash → Set(codigo_region)
for (const f of fotos) {
  if (!f.foto_base64) continue
  const h = createHash('md5').update(f.foto_base64).digest('hex')
  if (!fotoRegiones.has(h)) fotoRegiones.set(h, new Set())
  fotoRegiones.get(h).add(String(f.codigo_region))
}
const fotosCompartidas = [...fotoRegiones.values()].filter((s) => s.size > 1)
if (fotosCompartidas.length) {
  console.warn(`  ⚠ ${fotosCompartidas.length} foto(s) compartidas entre regiones distintas (revisar con Francisca):`)
  fotosCompartidas.forEach((s) => console.warn(`     regiones ${[...s].join(', ')}`))
} else {
  console.log('  ✓ ninguna foto se comparte entre regiones distintas.')
}

const outDir = new URL('../territorial-data/', import.meta.url)
mkdirSync(outDir, { recursive: true })
writeFileSync(new URL('snapshot.json', outDir), JSON.stringify(raw))
writeFileSync(new URL('fotos.json', outDir), JSON.stringify(fotos))

console.log('')
console.log(`✓ territorial-data/snapshot.json  (${kb(raw)} KB sin comprimir)`)
console.log(`✓ territorial-data/fotos.json     (${kb(fotos)} KB sin comprimir)`)
console.log('Commitear territorial-data/*.json. Se sirven gateados por /api/territorial/[asset].')
