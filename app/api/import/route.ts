import { requireAuth, canWrite } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { updates, inserts } = await request.json() as {
    updates: Array<{ n: number; patch: Record<string, unknown> }>
    inserts: Array<Record<string, unknown>>
  }

  const db = getSupabaseAdmin()
  const errors: string[] = []
  let updated = 0
  let inserted = 0

  for (const { n, patch } of updates) {
    // For regional users, verify the row belongs to their region
    if (profile.role === 'regional') {
      const { data: row } = await db
        .from('prioridades_territoriales')
        .select('region')
        .eq('n', n)
        .single()
      if (!row || !canWrite(profile, row.region as string)) {
        errors.push(`#${n}: sin permiso para editar esta región`)
        continue
      }
    }
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

    // Filter by permission first, assign sequential n
    const allowed: Record<string, unknown>[] = []
    for (let i = 0; i < inserts.length; i++) {
      const regionNombre = inserts[i].region as string | undefined
      if (!canWrite(profile, regionNombre)) {
        errors.push(`"${inserts[i].nombre}": sin permiso para insertar en esta región`)
      } else {
        allowed.push({ ...inserts[i], n: baseN + allowed.length + 1 })
      }
    }

    // Bulk insert in batches of 200 to avoid Vercel timeout
    const BATCH = 200
    for (let i = 0; i < allowed.length; i += BATCH) {
      const batch = allowed.slice(i, i + BATCH)
      const { error } = await db.from('prioridades_territoriales').insert(batch)
      if (error) {
        errors.push(`Batch ${Math.floor(i / BATCH) + 1}: ${error.message}`)
      } else {
        inserted += batch.length
      }
    }
  }

  return Response.json({ inserted, updated, errors })
}
