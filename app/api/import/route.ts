import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { applyImport, recordImportLog, type ImportPayload } from '@/lib/importApplier'

/**
 * POST /api/import — import directo desde el modal de NationalDashboard.
 *
 * Recibe payload JSON ya parseado (el .xlsx se parsea en cliente con
 * lib/importParser). Aplica updates + inserts y registra el resumen en
 * `import_log` con source='direct'.
 *
 * El flow alternativo (propuesta → admin aprueba) vive en
 * /api/proposals/[id]/approve y reusa los mismos helpers.
 */
export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Import directo es solo para admin. Editores pueden editar en línea pero no
  // hacer cargas masivas — para regionales/viewers existe el flow de propuesta.
  if (profile.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const payload = await request.json() as ImportPayload
  const db      = getSupabaseAdmin()
  const startedAt = Date.now()

  const result = await applyImport(db, profile, payload)

  await recordImportLog(db, profile, 'direct', result, Date.now() - startedAt)

  return Response.json({
    inserted: result.inserted,
    updated:  result.updated,
    errors:   result.errors,
  })
}
