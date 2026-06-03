import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

/**
 * GET /api/proposals/[id]/file
 *   Devuelve una signed URL del archivo de la propuesta (válida 5 min).
 *   Acceso: admin/editor (cualquier propuesta) o el proponente (solo la suya).
 *   Si el archivo ya fue borrado (propuesta resuelta), responde 410 Gone.
 */

const BUCKET   = 'import-proposals'
const TTL_SECS = 300

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Acceso: admin (revisa cualquier propuesta) o el proponente (la suya propia).
  // Editores no descargan propuestas — no son los revisores de este flujo.
  const isReviewer = profile.role === 'admin'
  if (!isReviewer && prop.proposer_id !== profile.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Solo se descargan las pending (las resueltas tienen el archivo borrado).
  if (prop.status !== 'pending') {
    return Response.json({
      error: 'Esta propuesta ya fue resuelta — el archivo ya no está disponible.',
    }, { status: 410 })
  }

  const { data, error } = await db.storage
    .from(BUCKET)
    .createSignedUrl(prop.file_path as string, TTL_SECS)
  if (error || !data) {
    return Response.json({ error: error?.message ?? 'No se pudo generar URL' }, { status: 500 })
  }

  return Response.json({ url: data.signedUrl, expires_in: TTL_SECS })
}
