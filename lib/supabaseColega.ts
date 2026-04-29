import { createClient } from '@supabase/supabase-js'

const URL  = process.env.NEXT_PUBLIC_SUPABASE_COLEGA_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_COLEGA_ANON!

let _client: ReturnType<typeof createClient> | null = null

export function getSupabaseColega() {
  if (!_client) _client = createClient(URL, ANON)
  return _client
}
