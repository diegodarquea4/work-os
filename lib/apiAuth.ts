import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export type UserRole = 'admin' | 'editor' | 'regional' | 'viewer'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  region_cods: string[]  // cods assigned when role === 'regional' (can be multiple)
  /** true → el usuario debe crear una clave nueva antes de usar el panel (mig 042). */
  debe_cambiar_clave: boolean
}

/**
 * Validates the session from cookies and returns the caller's UserProfile.
 * Returns null if not authenticated or if the session has expired.
 */
export async function requireAuth(): Promise<UserProfile | null> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const db = getSupabaseAdmin()
  const { data: row } = await db
    .from('user_profiles')
    .select('id, email, full_name, role, region_cods, debe_cambiar_clave')
    .eq('id', user.id)
    .single()

  if (!row) {
    return { id: user.id, email: user.email ?? '', full_name: null, role: 'viewer', region_cods: [], debe_cambiar_clave: false }
  }

  return { ...row, region_cods: row.region_cods ?? [], debe_cambiar_clave: row.debe_cambiar_clave ?? false } as UserProfile
}

/**
 * Returns true if the profile has write access to the given region.
 * Solo admin/editor pueden mutar datos in-app. Regional y viewer son solo
 * lectura — los regionales canalizan cualquier cambio vía propuesta
 * (POST /api/proposals) que un admin revisa y aplica.
 *
 * El parámetro `regionNombre` se mantiene por compatibilidad con call sites
 * y future-proofing (si más adelante volvemos a granular por región).
 */
export function canWrite(profile: UserProfile, _regionNombre?: string): boolean {
  return profile.role === 'admin' || profile.role === 'editor'
}
