/**
 * DELETE /api/desalojos/[n]/documentos/[doc_id] — borra el documento (fila + Storage).
 * Admin-only.
 *
 * Si el remove de Storage falla pero la fila se borra, loggea sin rollback —
 * el archivo queda huérfano y se puede limpiar con un job manual. Es preferible
 * a dejar la fila apuntando a un archivo eliminado.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ n: string; doc_id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, doc_id: dStr } = await context.params
  const n     = Number(nStr)
  const docId = Number(dStr)
  if (!Number.isFinite(n)     || n     <= 0) return NextResponse.json({ error: 'Invalid n' },      { status: 400 })
  if (!Number.isFinite(docId) || docId <= 0) return NextResponse.json({ error: 'Invalid doc_id' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: doc, error: readErr } = await db
    .from('desalojo_documentos')
    .select('*')
    .eq('id', docId)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!doc)    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 })
  if (doc.prioridad_id !== n) {
    return NextResponse.json({ error: 'Documento no pertenece al caso' }, { status: 400 })
  }

  // Borrar fila primero (audit conserva el rastro vía desalojo_log abajo).
  const { error: delErr } = await db.from('desalojo_documentos').delete().eq('id', docId)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { error: stErr } = await db.storage.from('desalojos-docs').remove([doc.url])
  if (stErr) console.error('[desalojos.documento.delete] Storage remove falló:', stErr)

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        doc.capa_id,
    campo:          doc.dimension ? `documento.${doc.dimension}.eliminado` : 'documento.eliminado',
    valor_anterior: doc.nombre,
    valor_nuevo:    '',
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true })
}
