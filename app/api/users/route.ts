import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET() {
  const { data: { users }, error } = await getSupabaseAdmin().auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    users
      .map(u => ({ email: u.email ?? '', name: u.user_metadata?.full_name ?? u.email ?? '' }))
      .filter(u => u.email)
      .sort((a, b) => a.email.localeCompare(b.email))
  )
}
