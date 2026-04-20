import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('user_profiles')
    .select('id, email, full_name, role, region_cods, created_at')
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { email, full_name, role, region_cods } = await request.json() as {
    email: string
    full_name?: string
    role: string
    region_cods?: string[]
  }

  if (!email || !role) return Response.json({ error: 'email and role are required' }, { status: 400 })

  const db = getSupabaseAdmin()

  const { data: inviteData, error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    data: { full_name: full_name ?? '' },
  })

  if (inviteError) return Response.json({ error: inviteError.message }, { status: 400 })

  const userId = inviteData.user.id

  const { error: profileError } = await db.from('user_profiles').insert({
    id: userId,
    email,
    full_name: full_name ?? null,
    role,
    region_cods: role === 'regional' ? (region_cods ?? []) : [],
  })

  if (profileError) {
    await db.auth.admin.deleteUser(userId)
    return Response.json({ error: profileError.message }, { status: 500 })
  }

  return Response.json({ id: userId, email, role, region_cods: region_cods ?? [] })
}
