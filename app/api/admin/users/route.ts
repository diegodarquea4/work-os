import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

const VALID_ROLES = ['admin', 'editor', 'regional', 'viewer'] as const

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

  const body = await request.json() as {
    email: string
    full_name?: string
    role: string
    region_cods?: string[]
  }
  const { email, full_name, role, region_cods } = body

  // Input validation
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return Response.json({ error: 'Valid email required' }, { status: 400 })
  }
  if (!role || !VALID_ROLES.includes(role as typeof VALID_ROLES[number])) {
    return Response.json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` }, { status: 400 })
  }
  if (region_cods !== undefined && (!Array.isArray(region_cods) || region_cods.some(c => typeof c !== 'string'))) {
    return Response.json({ error: 'region_cods must be an array of strings' }, { status: 400 })
  }

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
