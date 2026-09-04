/**
 * POST /api/account/mfa/backup-codes — AUTENTICADA, exige sesión con 2FA (aal2).
 *
 * Genera un juego nuevo de códigos de respaldo y devuelve los códigos EN CLARO
 * una sola vez (en la base solo queda el hash). Invalida los anteriores: pedir
 * códigos nuevos deja sin efecto los viejos, que es lo que espera quien cree que
 * los perdió.
 *
 * Exigir aal2 es el punto: si bastara con la sesión, alguien que se apodere de
 * una sesión abierta se generaría un juego de códigos y tendría una llave
 * permanente que sobrevive al cambio de clave. Con aal2 hay que haber pasado
 * por el autenticador.
 */

import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { generarCodigos, hashBackupCode } from '@/lib/mfaBackupCodes'
import { sesionEsAal2 } from '@/lib/mfaServer'

export async function POST() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  if (!(await sesionEsAal2())) {
    return Response.json(
      { error: 'Necesitas completar la verificación en dos pasos para generar códigos de respaldo.' },
      { status: 403 },
    )
  }

  const db = getSupabaseAdmin()

  // Los anteriores dejan de servir.
  await db.from('mfa_backup_codes').delete().eq('user_id', profile.id)

  const codigos = generarCodigos()
  const filas = codigos.map(c => ({ user_id: profile.id, code_hash: hashBackupCode(c) }))

  const { error } = await db.from('mfa_backup_codes').insert(filas)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Única vez que los códigos viajan en claro.
  return Response.json({ codigos })
}
