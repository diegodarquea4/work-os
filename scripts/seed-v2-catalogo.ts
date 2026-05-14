/**
 * Seed v2 indicator catalog from CSV.
 *
 * Usage: npx tsx scripts/seed-v2-catalogo.ts
 *
 * Prerequisites:
 *   - v2 schema created (001_v2_schema.sql executed)
 *   - v2_fuentes already populated (by the migration SQL)
 *   - CSV reviewed and approved by Diego
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const sb = createClient(url, key)

// ── Parse CSV ──────────────────────────────────────────────────────────────

function parseCSV(raw: string): Record<string, string>[] {
  const lines = raw.trim().split('\n')
  const headers = lines[0].split(',')
  return lines.slice(1).map(line => {
    const values = line.split(',')
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim() })
    return row
  })
}

async function main() {
  const csvPath = resolve(__dirname, '..', 'data', 'v2_indicadores_catalogo.csv')
  const raw = readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(raw)

  console.log(`Parsed ${rows.length} indicators from CSV`)

  // ── Load fuentes lookup ────────────────────────────────────────────────
  const { data: fuentes } = await sb.from('v2_fuentes').select('id, codigo')
  const fuenteMap = new Map<string, number>()
  for (const f of fuentes ?? []) fuenteMap.set(f.codigo, f.id)
  console.log(`Loaded ${fuenteMap.size} fuentes`)

  // ── Build catalog rows ─────────────────────────────────────────────────
  const catalogRows = rows.map((r, i) => ({
    codigo: r.codigo,
    nombre: r.nombre,
    categoria: r.categoria,
    subcategoria: r.subcategoria || null,
    unidad: r.unidad,
    fuente_id: fuenteMap.get(r.fuente_codigo) ?? null,
    frecuencia_esperada: r.frecuencia_esperada || 'anual',
    lower_is_better: r.lower_is_better === 'true',
    comparable_temporalmente: r.comparable_temporalmente !== 'false',
    nivel_criticidad: r.nivel_criticidad || 'complementario',
    aparece_en_ejecutiva: r.aparece_en_ejecutiva === 'true',
    aparece_en_kit_viaje: r.aparece_en_kit_viaje === 'true',
    aparece_en_ficha: r.aparece_en_ficha === 'true',
    orden_presentacion: i + 1,
    notas: r.notas || null,
  }))

  // ── Upsert in batches ──────────────────────────────────────────────────
  const BATCH = 50
  let inserted = 0
  for (let i = 0; i < catalogRows.length; i += BATCH) {
    const batch = catalogRows.slice(i, i + BATCH)
    const { error } = await sb
      .from('v2_indicadores_catalogo')
      .upsert(batch, { onConflict: 'codigo' })

    if (error) {
      console.error(`Error at batch ${i}:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
  }

  console.log(`Seeded ${inserted} indicators into v2_indicadores_catalogo`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
