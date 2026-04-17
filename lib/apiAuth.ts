import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Returns true if the incoming request has a valid Supabase session.
 * Use in API route handlers to reject unauthenticated callers.
 *
 * Usage:
 *   if (!await requireAuth()) return Response.json({ error: 'Unauthorized' }, { status: 401 })
 */
export async function requireAuth(): Promise<boolean> {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {}, // read-only in route handlers
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user !== null
}
