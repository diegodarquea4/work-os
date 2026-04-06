/**
 * Server-only Supabase client using the service role key.
 * Bypasses Row Level Security entirely.
 *
 * ⚠️  NEVER import this file in client components or hooks.
 *     Only use in API routes (app/api/**) and server actions.
 */
import { createClient } from '@supabase/supabase-js'

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }
  return createClient(url, key)
}
