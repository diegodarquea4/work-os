import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  if (!await requireAuth()) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates, inserts } = await request.json() as {
    updates: Array<{ n: number; patch: Record<string, unknown> }>
    inserts: Array<Record<string, unknown>>
  }

  const db = getSupabaseAdmin()
  const errors: string[] = []
  let updated = 0
  let inserted = 0

  for (const { n, patch } of updates) {
    const { error } = await db
      .from('prioridades_territoriales')
      .update(patch)
      .eq('n', n)
    if (error) errors.push(`#${n}: ${error.message}`)
    else updated++
  }

  if (inserts.length > 0) {
    const { data: maxRow } = await db
      .from('prioridades_territoriales')
      .select('n')
      .order('n', { ascending: false })
      .limit(1)
    const baseN = (maxRow?.[0]?.n as number | undefined) ?? 0

    for (let i = 0; i < inserts.length; i++) {
      const { error } = await db
        .from('prioridades_territoriales')
        .insert({ ...inserts[i], n: baseN + i + 1 })
      if (error) errors.push(`"${inserts[i].nombre}": ${error.message}`)
      else inserted++
    }
  }

  return Response.json({ inserted, updated, errors })
}
