import type { SupabaseClient } from '@supabase/supabase-js'
import type { EjeSesion } from '@/lib/types'
import { actaStoragePath } from './helpers'

/**
 * Sube el PDF del acta al bucket privado comite-docs y guarda acta_path en
 * la sesión. Compartido por los builders de comité y gabinete.
 *
 * Path vía actaStoragePath(): el primer segmento es SIEMPRE region_cod (las
 * policies de storage.objects filtran por foldername[1] — mig 044).
 * upsert:true para que el reintento no falle si el upload original quedó
 * huérfano (subió pero no alcanzó a guardar acta_path).
 */

export const ACTA_BUCKET = 'comite-docs'

export async function subirActa(
  db: SupabaseClient,
  sesion: Pick<EjeSesion, 'id' | 'region_cod' | 'instancia' | 'fecha'>,
  buffer: Buffer,
): Promise<string> {
  const path = actaStoragePath(sesion)
  const { error: upErr } = await db.storage.from(ACTA_BUCKET).upload(path, buffer, {
    contentType: 'application/pdf',
    upsert: true,
  })
  if (upErr) throw new Error(`Upload del acta falló: ${upErr.message}`)

  const { data: updData, error: updErr } = await db
    .from('eje_sesiones').update({ acta_path: path }).eq('id', sesion.id).select('id')
  if (updErr || !updData?.length) {
    // No dejar el archivo huérfano si la fila no se pudo actualizar.
    await db.storage.from(ACTA_BUCKET).remove([path]).catch(() => {})
    throw new Error(`No se pudo guardar acta_path: ${updErr?.message ?? '0 filas'}`)
  }
  return path
}
