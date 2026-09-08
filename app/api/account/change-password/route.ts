/**
 * POST /api/account/change-password — AUTENTICADA.
 *
 * La usan el cambio de clave voluntario y el overlay de cambio obligatorio.
 * Exige la CLAVE ACTUAL, valida robustez de la nueva (complejidad + HIBP), la
 * fija y limpia debe_cambiar_clave.
 *
 * Por qué pide la clave actual (auditoría 2026-09-04): antes bastaba con tener
 * la cookie de sesión. Es decir, un robo de sesión (equipo abierto, cookie
 * filtrada) se convertía en toma de cuenta PERMANENTE: el atacante cambiaba la
 * clave y el dueño quedaba fuera. Pedir la clave actual corta esa cadena.
 *
 * De paso desaparece la verificación "distinta de la actual" que se hacía
 * intentando un login con la clave NUEVA y era fail-open (cualquier error de red
 * dejaba pasar una clave repetida): ahora se comparan los dos textos.
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
  const { claveActual, password } = parse.data

  if (password === claveActual) {
    return Response.json({ error: 'La clave nueva debe ser distinta de la actual.' }, { status: 400 })
  }

  // Reautenticación: se prueba la clave ACTUAL en un cliente anónimo desechable
  // (sin persistir sesión, para no tocar la del usuario). Fail-CLOSED — si no
  // valida, no se cambia nada.
  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error: signInErr } = await anon.auth.signInWithPassword({
    email: profile.email, password: claveActual,
  })
  if (signInErr) {
    return Response.json({ error: 'La clave actual no es correcta.' }, { status: 400 })
  }

  const problemas = await assertStrongPassword(password)
  if (problemas.length > 0) {
    return Response.json({ error: problemas.join(' '), problemas }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { error: upErr } = await db.auth.admin.updateUserById(profile.id, { password })
  if (upErr) return Response.json({ error: upErr.message }, { status: 500 })

  await db.from('user_profiles').update({ debe_cambiar_clave: false, updated_at: new Date().toISOString() }).eq('id', profile.id)

  return Response.json({ ok: true })
}
