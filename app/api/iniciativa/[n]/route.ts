import { requireAuth, canWrite } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function DELETE(_request: Request, { params }: { params: Promise<{ n: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { n } = await params
  const id = parseInt(n, 10)
  if (isNaN(id)) return Response.json({ error: 'Invalid id' }, { status: 400 })

  const db = getSupabaseAdmin()

  // Fetch the initiative to check write access by region
  const { data: row, error: fetchError } = await db
    .from('prioridades_territoriales')
    .select('region, cod')
    .eq('n', id)
    .single()

  if (fetchError || !row) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!canWrite(profile, row.region)) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Delete child records first, then the initiative itself. Las tablas de
  // desalojos (migración 017) usan FK lógico (no enforced en SQL) por la misma
  // razón que las otras: `n` no es PK. Hay que limpiarlas explícitamente para
  // no dejar filas huérfanas si se borra una iniciativa etiquetada.
  await db.from('seguimientos').delete().eq('prioridad_id', id)
  await db.from('documentos_prioridad').delete().eq('prioridad_id', id)
  await db.from('semaforo_log').delete().eq('prioridad_id', id)
  await db.from('desalojo_seguimientos').delete().eq('prioridad_id', id)
  await db.from('desalojo_log').delete().eq('prioridad_id', id)
  // v2 (migración 018) + v3 (migración 019): capas + fases + documentos.
  // Storage objects de desalojos-docs no se borran acá — quedan huérfanos
  // para limpieza manual.
  await db.from('desalojo_documentos').delete().eq('prioridad_id', id)
  await db.from('desalojo_fase_estado').delete().eq('prioridad_id', id)
  await db.from('desalojo_capas').delete().eq('prioridad_id', id)
  await db.from('desalojo_detalle').delete().eq('prioridad_id', id)

  const { error } = await db.from('prioridades_territoriales').delete().eq('n', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
