import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

/**
 * DELETE /api/proposals/[id]
 *
 * El proponente puede eliminar su propia propuesta en cualquier momento:
 *   - Si está pending: cancela la solicitud y borra el archivo del Storage
 *     (la cola de revisión queda limpia, el admin no la verá más).
 *   - Si está resuelta (approved / rejected / applied_with_errors): solo borra
 *     la fila — el archivo ya había sido eliminado al resolverse. El audit
 *     permanente vive en `import_log`, no en esta tabla.
 *
 * Admin también puede borrar cualquier propuesta (limpieza manual).
 */

const BUCKET = 'import-proposals'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const proposalId = Number(id)
  if (isNaN(proposalId)) return Response.json({ error: 'invalid id' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: prop } = await db
    .from('import_proposals')
    .select('id, proposer_id, file_path, status')
    .eq('id', proposalId)
    .single()
  if (!prop) return Response.json({ error: 'Propuesta no encontrada' }, { status: 404 })

  // Solo el proponente (descarta su propio banner) o un admin pueden eliminar.
  const isOwner = prop.proposer_id === profile.id
  if (!isOwner && profile.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Si todavía está pending, el archivo sigue en Storage — hay que limpiarlo.
  // Las resueltas ya tienen el archivo borrado por approve/reject.
  if (prop.status === 'pending') {
    await db.storage.from(BUCKET).remove([prop.file_path as string]).catch(err =>
      console.error('[proposals/delete] storage delete failed', err)
    )
  }

  const { error } = await db.from('import_proposals').delete().eq('id', proposalId)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
