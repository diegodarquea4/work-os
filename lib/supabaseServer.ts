/**
 * Server-only Supabase clients.
 *
 * ⚠️  NEVER import this file in client components or hooks.
 *     Only use in API routes (app/api/**), Server Components y server actions.
 */
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Service-role client — BYPASSA la RLS por completo. Solo API/crons. */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}

/**
 * Cliente de LECTURA para Server Components / SSR, ligado a la sesión del usuario
 * vía cookies (anon key). A diferencia de getSupabaseAdmin, RESPETA la RLS con el
 * JWT del usuario → el load del SSR queda scopeado por región (Fase 3). Solo
 * lectura: no persiste cookies (setAll no-op). Mismo patrón que requireAuth
 * (lib/apiAuth.ts). El middleware (proxy.ts) garantiza que haya sesión antes de /.
 */
export async function getSupabaseServerRead() {
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
