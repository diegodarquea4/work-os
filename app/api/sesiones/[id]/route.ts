import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { sesionIdSchema } from '@/lib/schemas'

/**
 * DELETE /api/sesiones/[id] — borra una sesión del historial (registro + acta).
 *
 * SOLO ADMIN. Borrar es destructivo e irreversible, así que el gate real vive
 * acá (server-side): la ruta usa service-role (getSupabaseAdmin), que además
 * pasa el trigger de inmutabilidad de sesión cerrada por el guard
 * `auth.uid() IS NULL` (mismo mecanismo que /cerrar). RLS no gatea esto.
 *
 * Limpieza de referencias:
 *  - Tablas hijas con ON DELETE CASCADE (asistencia, valores, reporte por
 *    institución, iniciativas, temas archivados, meta/subsidio empleo) se
 *    borran solas al eliminar la fila de eje_sesiones.
 *  - Las que viven ENTRE sesiones y NO cascadan (sesion_compromisos,
 *    sesion_oficios_tratados) se resuelven antes: se BORRA lo originado en esta
 *    sesión (`sesion_origen_id`) y se DESVINCULA (NULL) lo que esta sesión solo
 *    selló/escaló (`cerrado_en_sesion_id`, `escalado_en_sesion_id`,
 *    `resuelto_en_sesion_id`), para no arrastrar registros de otras sesiones.
 *
 * OJO (por diseño, no revierte): los efectos del cierre sobre indicadores
 * acumulados (metricas_eje suma/pulso, region_meta_empleo, region_subsidio_empleo)
 * NO se des-aplican. Borrar corrige el historial, no des-suma métricas — está
 * pensado para limpiar sesiones erróneas o de prueba.
 */

export const maxDuration = 60
const BUCKET = 'comite-docs'

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireCan(profile, 'comite.borrar_sesion'))) {
    return NextResponse.json({ error: 'Solo un administrador puede borrar actas' }, { status: 403 })
  }

  const { id } = await params
  const parse = sesionIdSchema.safeParse(id)
  if (!parse.success) {
    return NextResponse.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const sesionId = parse.data

  const db = getSupabaseAdmin()

  const { data: sesionRow } = await db
    .from('eje_sesiones').select('id, acta_path').eq('id', sesionId).maybeSingle()
  if (!sesionRow) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  const sesion = sesionRow as { id: number; acta_path: string | null }

  // ── Referencias entre-sesiones (sin CASCADE) — desvincular lo sellado/escalado,
  //    borrar lo originado. En orden: NULLs antes de los deletes por origen. ────
  const cleanup = [
    db.from('sesion_compromisos').update({ cerrado_en_sesion_id: null }).eq('cerrado_en_sesion_id', sesionId),
    db.from('sesion_compromisos').update({ escalado_en_sesion_id: null }).eq('escalado_en_sesion_id', sesionId),
    db.from('sesion_compromisos').delete().eq('sesion_origen_id', sesionId),
    db.from('sesion_oficios_tratados').update({ resuelto_en_sesion_id: null }).eq('resuelto_en_sesion_id', sesionId),
    db.from('sesion_oficios_tratados').delete().eq('sesion_origen_id', sesionId),
  ]
  for (const op of cleanup) {
    const { error } = await op
    if (error) {
      console.error('[sesiones DELETE] fallo limpiando referencias entre-sesiones', { sesionId, error })
      return NextResponse.json({ error: `No se pudo borrar la sesión: ${error.message}` }, { status: 500 })
    }
  }

  // ── Acta PDF del bucket privado (huérfano inocuo si falla) ───────────────────
  if (sesion.acta_path) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove([sesion.acta_path])
    if (rmErr) console.error('[sesiones DELETE] no se pudo borrar el acta del storage', { sesionId, rmErr })
  }

  // ── La sesión (la cascada limpia el resto de las hijas) ──────────────────────
  const { error: delErr } = await db.from('eje_sesiones').delete().eq('id', sesionId)
  if (delErr) {
    return NextResponse.json({ error: `No se pudo borrar la sesión: ${delErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
