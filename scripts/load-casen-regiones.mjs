#!/usr/bin/env node
/**
 * Carga casen_regiones.json (CASEN 2024 por región) a la tabla Supabase
 * `casen_regiones`, que hoy está vacía porque el script de migración
 * original (migrate_to_supabase.py::migrate_casen) tiene un bug de parsing:
 * itera las claves top-level del JSON en vez de entrar a `raw.datos`.
 *
 * Una fila por región con anno=2024, `datos` = objeto con las categorías
 * necesarias para la minuta "Contexto Regional" (pobreza, ingresos,
 * previsión de salud, atención médica, AUGE-GES). No incluye una fila
 * "Nacional" — el JSON fuente no la trae.
 *
 * Uso:
 *   node scripts/load-casen-regiones.mjs <ruta-a-casen_regiones.json>
 */

import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

const [, , inputArg] = process.argv
if (!inputArg) {
  console.error('Uso: node scripts/load-casen-regiones.mjs <ruta-a-casen_regiones.json>')
  process.exit(1)
}

function leerEnvLocal() {
  const vars = {}
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf-8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/)
      if (m) vars[m[1]] = m[2].trim()
    }
  } catch { /* no .env.local */ }
  return vars
}

const env = { ...leerEnvLocal(), ...process.env }
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (.env.local)')
  process.exit(1)
}

// Categorías CASEN que necesita el assembler del Kit de Viaje. Se guarda el
// objeto completo (todas las categorías del año 2024) por región — mismo
// shape que espera fetchCasenData() en lib/kitDeViaje/metricasData.ts.
const CATEGORIAS_2024 = [
  'pobreza_ingresos', 'pobreza_severa', 'multi_incidencia',
  'ingresos', 'composicion_ing', 'previsional',
  'atencion_medica', 'prob_atencion', 'auge_ges',
]

function extraerAnno2024(contenidoRegion) {
  const datos = {}
  for (const cat of CATEGORIAS_2024) {
    const bloque = contenidoRegion[cat]
    if (!bloque) continue
    if (cat === 'multi_incidencia') {
      // multi_incidencia no está anidado por año (valores únicos ya son 2024)
      datos[cat] = bloque
      continue
    }
    const porAnno = {}
    for (const [subcat, serieAnual] of Object.entries(bloque)) {
      if (serieAnual && typeof serieAnual === 'object' && '2024' in serieAnual) {
        porAnno[subcat] = serieAnual['2024']
      }
    }
    if (Object.keys(porAnno).length > 0) datos[cat] = porAnno
  }
  return datos
}

async function main() {
  const raw = JSON.parse(await readFile(inputArg, 'utf-8'))
  if (!raw.datos || typeof raw.datos !== 'object') {
    console.error('El JSON no tiene una clave "datos" con las regiones — ¿es el archivo correcto?')
    process.exit(1)
  }

  const rows = Object.entries(raw.datos).map(([region, contenido]) => ({
    region,
    anno: 2024,
    datos: extraerAnno2024(contenido),
  }))

  console.log(`Preparadas ${rows.length} filas (una por región, anno=2024).`)

  const res = await fetch(`${SUPABASE_URL}/rest/v1/casen_regiones`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }

  console.log(`✓ ${rows.length} filas insertadas/actualizadas en casen_regiones.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
