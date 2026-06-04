import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { parseImportWorkbook, buildImportPayload } from '@/lib/importParser'
import { applyImport, recordImportLog } from '@/lib/importApplier'
import type { Iniciativa } from '@/lib/projects'

/**
 * POST /api/proposals/[id]/approve
 *
 * Flow:
 *   1. Verifica que el caller sea admin/editor.
 *   2. Descarga el archivo .xlsx del bucket `import-proposals`.
 *   3. Lo parsea con lib/importParser (misma lógica que el cliente).
 *   4. Aplica updates/inserts con lib/importApplier.applyImport.
 *   5. Registra en `import_log` con source='proposal' + proposal_id.
 *   6. Marca la propuesta como 'approved' (sin errores) o 'applied_with_errors'.
 *   7. Borra el archivo del Storage (la verdad pasa a vivir en BD).
 *
 * Recibe body opcional: { reviewer_note?: string }
 */

const BUCKET = 'import-proposals'

// Tiempo extra: parseo del Excel + loops de update/insert + dual write a log.
// Para propuestas grandes (>50 filas con muchos updates), 120s no alcanza.
// 300s es el techo razonable en plan Pro de Vercel.
export const maxDuration = 300

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  // Solo admin puede aprobar propuestas. Editores pueden editar en línea pero
  // no son gatekeepers de cargas masivas externas.
  if (profile.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const proposalId = Number(id)
  if (isNaN(proposalId)) return Response.json({ error: 'invalid id' }, { status: 400 })

  const body = await request.json().catch(() => ({})) as { reviewer_note?: string }
  const reviewerNote = body.reviewer_note ?? null

  const db = getSupabaseAdmin()

  // 1. Recuperar propuesta pending.
  const { data: prop } = await db
    .from('import_proposals')
    .select('id, file_path, status')
    .eq('id', proposalId)
    .single()
  if (!prop) return Response.json({ error: 'Propuesta no encontrada' }, { status: 404 })
  if (prop.status !== 'pending') {
    return Response.json({ error: `La propuesta ya está en estado "${prop.status}"` }, { status: 409 })
  }

  const startedAt = Date.now()

  // 2. Descargar archivo de Storage.
  const { data: fileData, error: dlErr } = await db.storage
    .from(BUCKET)
    .download(prop.file_path as string)
  if (dlErr || !fileData) {
    return Response.json({ error: `No se pudo leer el archivo: ${dlErr?.message ?? 'desconocido'}` }, { status: 500 })
  }

  // 3. Cargar iniciativas existentes (las necesita el parser para detectar
  //    UPDATE vs INSERT y generar codigo_iniciativa secuencial).
  const existingProjects: Iniciativa[] = []
  const PAGE = 1000
  let offset = 0
  while (true) {
    const { data: page, error: pageErr } = await db
      .from('prioridades_territoriales')
      .select('*')
      .range(offset, offset + PAGE - 1)
    if (pageErr) {
      return Response.json({ error: `BD: ${pageErr.message}` }, { status: 500 })
    }
    if (!page || page.length === 0) break
    existingProjects.push(...(page as unknown as Iniciativa[]))
    if (page.length < PAGE) break
    offset += PAGE
  }

  // 4. Parsear archivo.
  let parsed
  try {
    const buffer = await fileData.arrayBuffer()
    parsed = parseImportWorkbook(buffer, existingProjects)
  } catch (err) {
    return Response.json({ error: `Parseo: ${String(err)}` }, { status: 500 })
  }

  const rowErrors = parsed.rows.filter(r => r.errors.length > 0).flatMap(r => r.errors.map(e => `#${r.n}: ${e}`))
  const allParseErrors = [...parsed.fileErrors, ...rowErrors]

  // 5. Aplicar payload.
  const payload = buildImportPayload(parsed.rows)
  const result = await applyImport(db, profile, payload)

  // 6. Combinar errores de parseo con errores de aplicación.
  const allErrors = [...allParseErrors, ...result.errors]
  const finalStatus = allErrors.length > 0 ? 'applied_with_errors' : 'approved'

  // 7. Escribir log + actualizar propuesta + borrar archivo.
  // Cada paso post-applyImport es best-effort: si falla, los datos ya se
  // aplicaron y queremos retornar éxito al cliente. La reconciliación pasiva
  // en GET /api/proposals corrige el estado de la propuesta si quedó pending.
  try {
    await recordImportLog(
      db,
      profile,
      'proposal',
      { ...result, errors: allErrors },
      Date.now() - startedAt,
      proposalId,
    )
  } catch (err) {
    console.error('[proposals/approve] recordImportLog failed', err)
  }

  try {
    const { error: upErr } = await db
      .from('import_proposals')
      .update({
        status:           finalStatus,
        reviewer_id:      profile.id,
        reviewer_email:   profile.email,
        reviewer_note:    reviewerNote,
        reviewed_at:      new Date().toISOString(),
        applied_inserted: result.inserted,
        applied_updated:  result.updated,
        applied_errors:   allErrors.length > 0 ? allErrors : null,
      })
      .eq('id', proposalId)
    if (upErr) console.error('[proposals/approve] proposal update failed', upErr)
  } catch (err) {
    console.error('[proposals/approve] proposal update threw', err)
  }

  // Borrar archivo (best-effort: no rompe el response si falla).
  await db.storage.from(BUCKET).remove([prop.file_path as string]).catch(err =>
    console.error('[proposals/approve] storage delete failed', err)
  )

  return Response.json({
    ok:       true,
    status:   finalStatus,
    inserted: result.inserted,
    updated:  result.updated,
    errors:   allErrors,
  })
}
