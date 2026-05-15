/**
 * Execute v2 schema migration against Supabase.
 *
 * Usage: npx tsx scripts/run-migration.ts
 *
 * Reads 001_v2_schema.sql and executes it via Supabase REST RPC.
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

async function main() {
  const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '001_v2_schema.sql')
  const sql = readFileSync(sqlPath, 'utf-8')

  // Split into statements (naive split by semicolon, respecting $$ blocks)
  const statements = splitSQL(sql)

  console.log(`Executing ${statements.length} SQL statements...`)

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i].trim()
    if (!stmt || stmt.startsWith('--')) continue

    // Use rpc to execute raw SQL
    const { error } = await sb.rpc('exec_sql', { sql_text: stmt })

    if (error) {
      // If exec_sql doesn't exist, fall back to the REST API
      console.log(`Statement ${i + 1}: Trying direct fetch...`)

      const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ sql_text: stmt }),
      })

      if (!res.ok) {
        // As last resort, try the SQL endpoint
        console.error(`  Statement ${i + 1} failed: ${error.message}`)
        console.error(`  SQL preview: ${stmt.substring(0, 80)}...`)
        // Continue — some statements may fail if tables already exist (IF NOT EXISTS)
      }
    } else {
      console.log(`  ✓ Statement ${i + 1}`)
    }
  }

  // Verify tables were created
  console.log('\nVerifying tables...')
  const tables = [
    'v2_regiones', 'v2_ejes_estrategicos', 'v2_ministerios', 'v2_fuentes',
    'v2_indicadores_catalogo', 'v2_indicadores_valores', 'v2_indicadores_pipeline',
    'v2_indicadores_pipeline_log', 'v2_iniciativas', 'v2_seguridad_semanal',
    'v2_proyectos_inversion', 'v2_minutas_log',
  ]

  for (const table of tables) {
    const { error: err } = await sb.from(table).select('*').limit(0)
    if (err) {
      console.log(`  ✗ ${table} — ${err.message}`)
    } else {
      console.log(`  ✓ ${table}`)
    }
  }

  // Check v2_regiones row count
  const { data: regionCount } = await sb.from('v2_regiones').select('id')
  console.log(`\nv2_regiones: ${regionCount?.length ?? 0} rows (expected 17)`)

  const { data: fuenteCount } = await sb.from('v2_fuentes').select('id')
  console.log(`v2_fuentes: ${fuenteCount?.length ?? 0} rows (expected 16)`)

  const { data: ejeCount } = await sb.from('v2_ejes_estrategicos').select('id')
  console.log(`v2_ejes_estrategicos: ${ejeCount?.length ?? 0} rows (expected 6)`)
}

function splitSQL(sql: string): string[] {
  // Handle $$ delimited blocks (functions)
  const result: string[] = []
  let current = ''
  let inDollarBlock = false

  const lines = sql.split('\n')
  for (const line of lines) {
    // Skip pure comment lines
    if (line.trim().startsWith('--') && !inDollarBlock) {
      current += line + '\n'
      continue
    }

    if (line.includes('$$')) {
      inDollarBlock = !inDollarBlock
      current += line + '\n'
      if (!inDollarBlock && current.trim().endsWith(';')) {
        result.push(current)
        current = ''
      }
      continue
    }

    current += line + '\n'

    if (!inDollarBlock && line.trim().endsWith(';')) {
      result.push(current)
      current = ''
    }
  }

  if (current.trim()) result.push(current)
  return result.filter(s => s.trim() && !s.trim().startsWith('--'))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
