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

  // Create user directly (no email invite) — auto-confirmed with default password
  const { data: createData, error: createError } = await db.auth.admin.createUser({
    email,
    password: 'DCI2026',
    email_confirm: true,
    user_metadata: { full_name: full_name ?? '' },
  })

  if (createError) return Response.json({ error: createError.message }, { status: 400 })

  const userId = createData.user.id

  const { error: profileError } = await db.from('user_profiles').insert({
    id: userId,
    email,
    full_name: full_name ?? null,
    role,
    region_cods: (role === 'regional' || role === 'viewer') ? (region_cods ?? []) : [],
  })

  if (profileError) {
    await db.auth.admin.deleteUser(userId)
    return Response.json({ error: profileError.message }, { status: 500 })
  }

  return Response.json({ id: userId, email, role, region_cods: region_cods ?? [] })
}
