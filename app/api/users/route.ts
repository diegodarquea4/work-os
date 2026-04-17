import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

export async function GET() {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { users }, error } = await getSupabaseAdmin().auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    users
      .map(u => ({ email: u.email ?? '', name: u.user_metadata?.full_name ?? u.email ?? '' }))
      .filter(u => u.email)
      .sort((a, b) => a.email.localeCompare(b.email))
  )
}
