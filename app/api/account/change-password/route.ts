/**
 * POST /api/account/change-password — AUTENTICADA.
 *
 * La usan el cambio de clave voluntario y el overlay de cambio obligatorio. Valida
 * robustez (complejidad + HIBP) y que la clave nueva sea DISTINTA de la actual
 * (probando un login con la clave nueva: si funciona, es la misma → rechazar). Fija
 * la clave y limpia debe_cambiar_clave.
 */

import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { accountChangePasswordSchema } from '@/lib/schemas'
import { assertStrongPassword } from '@/lib/passwordPolicy'

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let raw: unknown
  try { raw = await request.json() }
  catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = accountChangePasswordSchema.safeParse(raw)
  if (!parse.success) {
    return Response.json({ error: 'Solicitud inválida', detalle: parse.error.issues }, { status: 400 })
  }
  const { password } = parse.data

  const problemas = await assertStrongPassword(password)
  if (problemas.length > 0) {
    return Response.json({ error: problemas.join(' '), problemas }, { status: 400 })
  }

  // "Distinta de la actual": intentamos loguear con la clave nueva en un cliente
  // anónimo desechable (sin persistir sesión). Si el login FUNCIONA, la clave nueva
  // es igual a la actual → rechazar. Cualquier error se trata como "es distinta"
  // (fail-open: no bloqueamos un cambio legítimo por un error transitorio).
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInErr } = await anon.auth.signInWithPassword({ email: profile.email, password })
  if (!signInErr) {
    return Response.json({ error: 'La clave nueva debe ser distinta de la actual.' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { error: upErr } = await db.auth.admin.updateUserById(profile.id, { password })
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  await db.from('user_profiles').update({ debe_cambiar_clave: false, updated_at: new Date().toISOString() }).eq('id', profile.id)

  return Response.json({ ok: true })
}
