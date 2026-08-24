import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

// GET /api/tags — universo de etiquetas ya usadas en TODAS las iniciativas del
// panel (todas las regiones), para sugerir mientras se escribe una nueva y
// evitar duplicados por variantes de tipeo. Usa el cliente admin porque la
// lectura de `prioridades_territoriales` está RLS-scopeada por región (mig
// 072) — un editor regional no debe quedar limitado a las etiquetas de su
// propia región al momento de reusar una ya existente en otra.
export async function GET() {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = getSupabaseAdmin()
  // `select` sin `.range()` viene topado a 1000 filas por PostgREST — con
  // ~6.800 iniciativas en el panel eso corta el universo a la mitad. Se pagina
  // hasta agotar las filas, igual que /api/users con listUsers.
  const set = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from('prioridades_territoriales')
      .select('tags')
      .range(from, from + pageSize - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      for (const t of (row.tags ?? []) as string[]) set.add(t)
    }
    if (!data || data.length < pageSize) break
  }
  return NextResponse.json(Array.from(set).sort((a, b) => a.localeCompare(b, 'es')))
}
