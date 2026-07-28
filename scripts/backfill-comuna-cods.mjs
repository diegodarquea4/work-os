// Genera el SQL del backfill one-shot de comuna_cods/alcance_regional desde
// docs/drilldown-comunal/comuna_matching_full.csv (análisis validado contra la
// base productiva completa, 2026-07-28). NO ejecuta nada: emite archivos .sql
// por batch para correrlos vía MCP execute_sql y revisar antes.
//
//   node scripts/backfill-comuna-cods.mjs <dir-salida>
//
// Un UPDATE por grupo (cod, valor_original), con dollar-quoting (sin escaping
// manual) y btrim en ambos lados (tolera espacios de borde CSV↔BD). Idempotente:
// re-ejecutar produce el mismo estado. Las filas con comuna vacía van en un
// UPDATE global final (alcance_regional = true).

import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(import.meta.dirname, '..')
const CSV = path.join(ROOT, 'docs', 'drilldown-comunal', 'comuna_matching_full.csv')
const outDir = process.argv[2]
if (!outDir) {
  console.error('uso: node scripts/backfill-comuna-cods.mjs <dir-salida>')
  process.exit(1)
}
fs.mkdirSync(outDir, { recursive: true })

// ── Mini parser CSV (comillas, comas y saltos de línea internos) ─────────────
function parseCsv(text) {
  const rows = []
  let row = [], field = '', inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') { row.push(field); field = '' }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (ch !== '\r') field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const [header, ...rows] = parseCsv(fs.readFileSync(CSV, 'utf-8'))
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]))
for (const req of ['region', 'valor_original', 'n_iniciativas', 'categoria', 'comunas_matcheadas(cut)']) {
  if (!(req in col)) throw new Error(`columna faltante en CSV: ${req}`)
}

const TAG = '$csvq$'
const statements = []
let totalEsperado = 0

for (const r of rows) {
  if (r.length < 5 || !r[col.region]) continue
  const region = r[col.region].trim()
  const valor = r[col.valor_original]
  const n = parseInt(r[col.n_iniciativas], 10) || 0
  const categoria = r[col.categoria].trim()
  const matcheadas = r[col['comunas_matcheadas(cut)']]

  if (valor.includes(TAG)) throw new Error(`valor contiene el tag de dollar-quote: ${valor}`)

  // "Nombre:CUT; Nombre:CUT" → [CUT, ...] (dedup, orden de aparición)
  const cuts = [...new Set(
    matcheadas.split(';').map(p => p.trim()).filter(Boolean)
      .map(p => parseInt(p.slice(p.lastIndexOf(':') + 1), 10))
      .filter(Number.isFinite),
  )]

  const alcance = categoria === 'bucket_regional'
  const arr = cuts.length ? `'{${cuts.join(',')}}'::int[]` : `'{}'::int[]`

  statements.push(
    `-- ${categoria} · esperado ${n} fila(s)\n` +
    `UPDATE prioridades_territoriales SET comuna_cods = ${arr}, alcance_regional = ${alcance}\n` +
    ` WHERE cod = '${region}' AND btrim(coalesce(comuna,'')) = btrim(${TAG}${valor}${TAG});`,
  )
  totalEsperado += n
}

// Comuna vacía → alcance regional (el CSV solo trae valores no vacíos).
statements.push(
  `-- campo vacío → bucket "Sin comuna"\n` +
  `UPDATE prioridades_territoriales SET comuna_cods = '{}'::int[], alcance_regional = true\n` +
  ` WHERE btrim(coalesce(comuna,'')) = '';`,
)

const BATCH = 100
let nBatches = 0
for (let i = 0; i < statements.length; i += BATCH) {
  nBatches++
  const file = path.join(outDir, `backfill-batch-${String(nBatches).padStart(2, '0')}.sql`)
  fs.writeFileSync(file, statements.slice(i, i + BATCH).join('\n') + '\n')
}
console.log(`${statements.length} statements (${totalEsperado} iniciativas esperadas con valor) → ${nBatches} batches en ${outDir}`)
