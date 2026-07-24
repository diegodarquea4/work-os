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
 */

import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { accountActivateSchema } from '@/lib/schemas'
import { hashCode, CODE_MAX_INTENTOS } from '@/lib/accessCode'
import { assertStrongPassword } from '@/lib/passwordPolicy'

export async function POST(request: Request) {
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
    return Response.json({ error: 'No hay un código activo para ese correo. Pídele uno a un administrador.' }, { status: 400 })
  }

  // 2. Vigencia e intentos.
  if (new Date(code.expira).getTime() < Date.now()) {
    return Response.json({ error: 'El código expiró. Pídele uno nuevo a un administrador.' }, { status: 400 })
  }
  if (code.intentos >= CODE_MAX_INTENTOS) {
    return Response.json({ error: 'Demasiados intentos fallidos con este código. Pídele uno nuevo a un administrador.' }, { status: 400 })
  }

  // 3. Comparar el código. Si no calza, cuenta el intento y rechaza.
  if (hashCode(codigo) !== code.codigo_hash) {
    await db.from('codigos_acceso').update({ intentos: code.intentos + 1 }).eq('email', email)
    const restantes = CODE_MAX_INTENTOS - (code.intentos + 1)
    return Response.json({
      error: `Código incorrecto.${restantes > 0 ? ` Te quedan ${restantes} intento(s).` : ' Se agotaron los intentos; pide un código nuevo.'}`,
    }, { status: 400 })
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
