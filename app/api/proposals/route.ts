import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

/**
 * POST /api/proposals
 *   Multipart upload del archivo .xlsx + metadata (regions_claim, proposer_note).
 *   Sube el archivo al bucket `import-proposals` y crea la fila pending en BD.
 *   Acceso: cualquier usuario autenticado (regional / admin / editor / viewer).
 *
 * GET  /api/proposals
 *   Lista las propuestas visibles para el caller:
 *     - regional/viewer → solo las suyas (auth.uid() = proposer_id)
 *     - admin/editor    → todas
 *   Default: muestra pending arriba, luego histórico ordenado por fecha desc.
 *   Query param `?status=pending|approved|rejected|applied_with_errors` filtra.
 */

const BUCKET = 'import-proposals'
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls (legacy)
]

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return Response.json({ error: 'No file provided' }, { status: 400 })
  if (file.size === 0) return Response.json({ error: 'Archivo vacío' }, { status: 400 })
  // Algunos browsers no detectan correctamente el mime; aceptamos por nombre también.
  const looksXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
  if (!looksXlsx && !ACCEPTED_MIME.includes(file.type)) {
    return Response.json({ error: 'El archivo debe ser .xlsx' }, { status: 400 })
  }

  const proposerNote = (formData.get('proposer_note') as string | null) ?? null
  const regionsClaimRaw = (formData.get('regions_claim') as string | null) ?? null
  const regionsClaim: string[] = regionsClaimRaw
    ? regionsClaimRaw.split(',').map(s => s.trim()).filter(Boolean)
    : []
  // Toda propuesta queda linkeada a al menos una región — viene del contexto
  // de Mi Región (la región activa donde el usuario apretó "Proponer").
  // Sin región no hay forma de mostrar el estado de vuelta al proponente
  // ni que el admin sepa qué scope toca el Excel.
  if (regionsClaim.length === 0) {
    return Response.json({ error: 'Falta indicar la región de la propuesta.' }, { status: 400 })
  }

  const db = getSupabaseAdmin()

  // Path: {userId}/{timestamp}-{filename-saneado}
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const path = `${profile.id}/${Date.now()}-${safeName}`
  const arrayBuffer = await file.arrayBuffer()

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(path, arrayBuffer, {
      contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: false,
    })
  if (uploadErr) {
    return Response.json({ error: `Storage: ${uploadErr.message}` }, { status: 500 })
  }

  const { data, error: dbErr } = await db
    .from('import_proposals')
    .insert({
      proposer_id:    profile.id,
      proposer_email: profile.email,
      file_path:      path,
      file_name:      file.name,
      regions_claim:  regionsClaim,
      proposer_note:  proposerNote,
      status:         'pending',
    })
    .select()
    .single()

  if (dbErr) {
    // Rollback del archivo si la fila no se creó.
    await db.storage.from(BUCKET).remove([path]).catch(() => {})
    return Response.json({ error: dbErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, proposal: data })
}

export async function GET(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const statusFilter = url.searchParams.get('status')

  const db = getSupabaseAdmin()

  // ── Reconciliación pasiva ────────────────────────────────────────────────
  // Si una propuesta quedó en 'pending' pero existe una entrada en
  // import_log con su proposal_id, es señal de que applyImport terminó pero
  // el UPDATE de la propuesta falló (timeout, network, etc). Auto-corregimos
  // su estado antes de devolverla.
  //
  // Solo lo hace admin/editor; los regionales nunca disparan reconciliación.
  if (profile.role === 'admin' || profile.role === 'editor') {
    const { data: pendings } = await db
      .from('import_proposals')
      .select('id')
      .eq('status', 'pending')
    const pendingIds = (pendings ?? []).map(p => p.id)
    if (pendingIds.length > 0) {
      const { data: logs } = await db
        .from('import_log')
        .select('proposal_id, inserted_count, updated_count, error_count, errors, applied_by_id, applied_by_email')
        .in('proposal_id', pendingIds)
      for (const log of (logs ?? [])) {
        if (log.proposal_id == null) continue
        const had_errors = (log.error_count ?? 0) > 0
        await db
          .from('import_proposals')
          .update({
            status:           had_errors ? 'applied_with_errors' : 'approved',
            reviewer_id:      log.applied_by_id ?? profile.id,
            reviewer_email:   log.applied_by_email ?? profile.email,
            reviewed_at:      new Date().toISOString(),
            applied_inserted: log.inserted_count ?? 0,
            applied_updated:  log.updated_count ?? 0,
            applied_errors:   had_errors ? log.errors : null,
            reviewer_note:    'Reconciliado automáticamente desde import_log',
          })
          .eq('id', log.proposal_id)
          .eq('status', 'pending')   // protección concurrencia
      }
    }
  }

  let query = db
    .from('import_proposals')
    .select('id, created_at, proposer_id, proposer_email, file_name, regions_claim, proposer_note, status, reviewer_email, reviewer_note, reviewed_at, applied_inserted, applied_updated, applied_errors')
    .order('created_at', { ascending: false })

  // Regional/viewer solo ven sus propias propuestas.
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    query = query.eq('proposer_id', profile.id)
  }

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json(data ?? [])
}
