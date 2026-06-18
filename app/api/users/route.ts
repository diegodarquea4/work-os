import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

// GET /api/users — lista de usuarios para popular el selector de "responsable"
// en el modal de iniciativa. Restringido a roles que efectivamente editan
// iniciativas (admin/editor/regional). Viewer NO debe enumerar el padron.
export async function GET() {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { data: { users }, error } = await getSupabaseAdmin().auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(
    users
      .map(u => ({ email: u.email ?? '', name: u.user_metadata?.full_name ?? u.email ?? '' }))
      .filter(u => u.email)
      .sort((a, b) => a.email.localeCompare(b.email))
  )
}
