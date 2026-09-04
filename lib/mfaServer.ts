/**
 * Helpers de 2FA del lado del servidor (leen la sesión desde las cookies).
 *
 * La lógica PURA de clasificación vive en `lib/mfa.ts` (sin red, testeable y
 * usable también en el proxy). Acá está lo que necesita tocar la sesión real.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { decodeAal } from '@/lib/mfa'

/** Cliente ligado a la cookie de sesión, solo lectura (no re-emite cookies). */
async function clienteDeSesion() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    },
  )
}

/**
 * ¿La sesión actual completó el segundo factor?
 *
 * Fail-closed: ante cualquier problema para leerla, devuelve false. Lo usan las
 * rutas donde el 2FA es el requisito (generar códigos de respaldo), así que
 * "no pude comprobarlo" tiene que significar "no".
 */
export async function sesionEsAal2(): Promise<boolean> {
  try {
    const supabase = await clienteDeSesion()
    const { data: { session } } = await supabase.auth.getSession()
    return decodeAal(session?.access_token) === 'aal2'
  } catch {
    return false
  }
}

/**
 * ¿La sesión tiene un factor TOTP verificado?
 *
 * Sirve para distinguir "todavía no configura el 2FA" de "lo tiene y le falta
 * ingresar el código". Se lee del usuario ya validado, sin llamadas extra.
 */
export async function tieneFactorVerificado(): Promise<boolean> {
  try {
    const supabase = await clienteDeSesion()
    const { data: { user } } = await supabase.auth.getUser()
    return (user?.factors ?? []).some(f => f.status === 'verified')
  } catch {
    return false
  }
}
