import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS } from '@/lib/regions'

export type UserRole = 'admin' | 'editor' | 'regional' | 'viewer'

export type UserProfile = {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  region_cods: string[]  // cods assigned when role === 'regional' (can be multiple)
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
    .select('id, email, full_name, role, region_cods')
    .eq('id', user.id)
    .single()

  if (!row) {
    return { id: user.id, email: user.email ?? '', full_name: null, role: 'viewer', region_cods: [] }
  }

  return { ...row, region_cods: row.region_cods ?? [] } as UserProfile
}

/**
 * Returns true if the profile has write access to the given region.
 * regionNombre can be either a region nombre (e.g. "Biobío") or a cod (e.g. "VIII").
 */
export function canWrite(profile: UserProfile, regionNombre?: string): boolean {
  if (profile.role === 'admin' || profile.role === 'editor') return true
  if (profile.role === 'regional' && regionNombre) {
    if (profile.region_cods.includes(regionNombre)) return true
    const r = REGIONS.find(r => r.nombre === regionNombre)
    return r ? profile.region_cods.includes(r.cod) : false
  }
  return false
}
