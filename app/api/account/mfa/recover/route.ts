/**
 * POST /api/account/mfa/recover — perdí el teléfono.
 *
 * La usa alguien que YA pasó su contraseña (sesión aal1) y tiene un factor
 * configurado, pero no puede generar el código de 6 dígitos. Canjea uno de sus
 * códigos de respaldo: se consume, se borran sus factores y la sesión queda
 * utilizable — con la política de adopción pidiéndole configurar el 2FA otra vez.
 *
 * Es deliberadamente lo mismo que hace un administrador al "Resetear 2FA", pero
 * sin depender de que haya un administrador disponible.
 *
 * Se cierran TODAS las sesiones, incluida la del navegador que canjeó el código:
 * si el teléfono se perdió (o lo robaron), cualquier sesión abierta en otra
 * parte es sospechosa. El usuario vuelve a /login, entra solo con su clave —ya
 * no tiene factor— y la política de adopción le pide configurarlo de nuevo.
 */

import { timingSafeEqual } from 'crypto'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { registrarIntento } from '@/lib/rateLimit'
import { hashBackupCode } from '@/lib/mfaBackupCodes'

/** Tope de canjes por usuario y hora: los códigos son cortos y de un solo uso. */
const MAX_INTENTOS = 5
const VENTANA_SEG  = 3600

const ERROR_CODIGO = 'Código de respaldo inválido o ya utilizado.'

function igualEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const limite = registrarIntento(`mfa-recover:${profile.id}`, MAX_INTENTOS, VENTANA_SEG)
  if (!limite.permitido) {
    return Response.json(
      { error: 'Demasiados intentos. Espera un momento e inténtalo de nuevo.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEn) } },
    )
  }

  let raw: unknown
  try { raw = await request.json() }
  catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const codigo = (raw as { codigo?: unknown })?.codigo
  if (typeof codigo !== 'string' || codigo.trim().length === 0) {
    return Response.json({ error: ERROR_CODIGO }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const objetivo = hashBackupCode(codigo)

  const { data: filas } = await db
    .from('mfa_backup_codes')
    .select('id, code_hash')
    .eq('user_id', profile.id)
    .is('used_at', null)

  const match = (filas ?? []).find(f => igualEnTiempoConstante(f.code_hash as string, objetivo))
  if (!match) return Response.json({ error: ERROR_CODIGO }, { status: 400 })

  // Consumir el código ANTES de borrar los factores: si algo falla después, el
  // código igual quedó gastado (mejor eso que dejarlo reutilizable).
  const { data: consumido } = await db
    .from('mfa_backup_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', match.id)
    .is('used_at', null)     // carrera: si otro request lo consumió, no devuelve fila
    .select('id')

  if (!consumido || consumido.length === 0) {
    return Response.json({ error: ERROR_CODIGO }, { status: 400 })
  }

  // Borrar todos los factores → la cuenta vuelve a "sin 2FA configurado".
  const { data: factores } = await db.auth.admin.mfa.listFactors({ userId: profile.id })
  for (const f of factores?.factors ?? []) {
    await db.auth.admin.mfa.deleteFactor({ id: f.id, userId: profile.id })
  }

  // Cerrar TODAS las sesiones (best-effort, igual que en la gestión de claves).
  // Incluye la actual: el cliente redirige a /login tras recibir la respuesta.
  try {
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users/${profile.id}/logout`, {
      method: 'POST',
      headers: {
        apikey:        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    })
  } catch { /* no es crítico: los factores ya se borraron */ }

  const restantes = (filas ?? []).length - 1
  return Response.json({ ok: true, codigos_restantes: restantes, reautenticar: true })
}
