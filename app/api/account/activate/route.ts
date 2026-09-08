/**
 * POST /api/account/activate — PÚBLICA (sin sesión), gateada por código.
 *
 * La usan altas nuevas y recuperaciones: el usuario tiene un código que le entregó
 * el admin y define su clave por primera/única vez. Valida el código (hash +
 * vigencia + intentos), la robustez de la clave (complejidad + HIBP), fija la clave
 * con la Admin API, borra el código y limpia debe_cambiar_clave.
 *
 * Debe estar exceptuada en proxy.ts (usuario sin sesión) — ver la lista de rutas
 * públicas allí.
 *
 * Endurecida el 2026-09-04 (es la única superficie pública que escribe):
 *   - Límite de intentos por IP, además del contador por código.
 *   - Un solo mensaje para "no hay código" y "código incorrecto": los mensajes
 *     distintos permitían averiguar desde fuera qué correos tienen una cuenta en
 *     proceso de alta.
 */

import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { accountActivateSchema } from '@/lib/schemas'
import { hashCode, CODE_MAX_INTENTOS } from '@/lib/accessCode'
import { assertStrongPassword } from '@/lib/passwordPolicy'
import { registrarIntento, ipDeLaPeticion } from '@/lib/rateLimit'

/** Mismo texto para todo fallo de credencial: no revela si el correo existe. */
const ERROR_CREDENCIAL =
  'Correo o código incorrectos. Si no tienes un código vigente, pídele uno a un administrador.'

const MAX_POR_IP = 20
const VENTANA_SEG = 15 * 60

export async function POST(request: Request) {
  const limite = registrarIntento(`activate:${ipDeLaPeticion(request)}`, MAX_POR_IP, VENTANA_SEG)
  if (!limite.permitido) {
    return Response.json(
      { error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' },
      { status: 429, headers: { 'Retry-After': String(limite.reintentarEn) } },
    )
  }

  let raw: unknown
  try { raw = await request.json() }
  catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = accountActivateSchema.safeParse(raw)
  if (!parse.success) {
    return Response.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const email = parse.data.email.trim().toLowerCase()
  const { codigo, password } = parse.data

  const db = getSupabaseAdmin()

  // 1. Buscar el código vigente de ese correo.
  const { data: row } = await db
    .from('codigos_acceso')
    .select('codigo_hash, expira, intentos')
    .eq('email', email)
    .maybeSingle()
  const code = row as { codigo_hash: string; expira: string; intentos: number } | null
  if (!code) {
    return Response.json({ error: ERROR_CREDENCIAL }, { status: 400 })
  }

  // 2. Vigencia e intentos. Mismo mensaje genérico: que el código haya expirado
  //    o que se hayan agotado los intentos también delata que la cuenta existe.
  if (new Date(code.expira).getTime() < Date.now()) {
    return Response.json({ error: ERROR_CREDENCIAL }, { status: 400 })
  }
  if (code.intentos >= CODE_MAX_INTENTOS) {
    return Response.json({ error: ERROR_CREDENCIAL }, { status: 400 })
  }

  // 3. Comparar el código. Si no calza, cuenta el intento y rechaza. No se
  //    informa cuántos intentos quedan (era otra confirmación de que el correo
  //    tiene un código vigente).
  if (hashCode(codigo) !== code.codigo_hash) {
    await db.from('codigos_acceso').update({ intentos: code.intentos + 1 }).eq('email', email)
    return Response.json({ error: ERROR_CREDENCIAL }, { status: 400 })
  }

  // 4. Robustez de la clave. El código sigue vivo si la clave no cumple (el usuario
  //    reintenta con otra clave sin necesitar un código nuevo).
  const problemas = await assertStrongPassword(password)
  if (problemas.length > 0) {
    return Response.json({ error: problemas.join(' '), problemas }, { status: 400 })
  }

  // 5. Resolver el user id por email (user_profiles.email lo tiene) y fijar la clave.
  const { data: prof } = await db.from('user_profiles').select('id').eq('email', email).maybeSingle()
  const userId = (prof as { id: string } | null)?.id
  if (!userId) {
    return Response.json({ error: 'Cuenta no encontrada. Contacta a un administrador.' }, { status: 400 })
  }

  const { error: upErr } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true })
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  // 6. Consumir el código y limpiar el flag de cambio obligatorio.
  await db.from('codigos_acceso').delete().eq('email', email)
  await db.from('user_profiles').update({ debe_cambiar_clave: false, updated_at: new Date().toISOString() }).eq('id', userId)

  return Response.json({ ok: true })
}
