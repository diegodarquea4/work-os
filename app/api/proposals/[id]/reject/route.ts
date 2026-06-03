import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

/**
 * POST /api/proposals/[id]/reject
 *
 * Marca la propuesta como rejected con un reviewer_note obligatorio (no se
 * rechaza nada en silencio — el delegado merece saber por qué).
 * Borra el archivo del Storage (la propuesta queda en BD solo como audit).
 *
 * Body: { reviewer_note: string }
 */

const BUCKET = 'import-proposals'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Solo admin gestiona propuestas (aprobar / rechazar).
  if (profile.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const proposalId = Number(id)
  if (isNaN(proposalId)) return Response.json({ error: 'invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({})) as { reviewer_note?: string }
  const reviewerNote = (body.reviewer_note ?? '').trim()
  if (!reviewerNote) {
    return Response.json({ error: 'Se requiere una nota explicando el rechazo.' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  const { data: prop } = await db
    .from('import_proposals')
    .select('id, file_path, status')
    .eq('id', proposalId)
    .single()
  if (!prop) return Response.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (prop.status !== 'pending') {
    return Response.json({ error: `La propuesta ya está en estado "${prop.status}"` }, { status: 409 })
  }

  await db
    .from('import_proposals')
    .update({
      status:         'rejected',
      reviewer_id:    profile.id,
      reviewer_email: profile.email,
      reviewer_note:  reviewerNote,
      reviewed_at:    new Date().toISOString(),
    })
    .eq('id', proposalId)

  await db.storage.from(BUCKET).remove([prop.file_path as string]).catch(err =>
    console.error('[proposals/reject] storage delete failed', err)
  )

  return Response.json({ ok: true, status: 'rejected' })
}
