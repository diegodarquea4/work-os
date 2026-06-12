import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { adminUsersPostSchema } from '@/lib/schemas'

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const db = getSupabaseAdmin()
  const { data: profiles, error: profileError } = await db
    .from('user_profiles')
    .select('id, email, full_name, role, region_cods, created_at')
    .order('created_at', { ascending: true })

  if (profileError) return Response.json({ error: profileError.message }, { status: 500 })

  // last_sign_in_at vive en auth.users. Lo leemos vía la Admin API y
  // mergeamos por id. perPage=1000 cubre la base actual; si crece más
  // allá, sumar paginación. Si falla, degradamos a null sin romper la
  // respuesta — la columna mostrará "Nunca" en UI.
  const { data: authData, error: authError } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (authError) {
    console.error('[admin/users] auth.admin.listUsers error:', authError.message ?? authError)
  }

  const signInById = new Map<string, string | null>()
  if (!authError && authData?.users) {
    for (const u of authData.users) signInById.set(u.id, u.last_sign_in_at ?? null)
  }

  const enriched = (profiles ?? []).map(p => ({
    ...p,
    last_sign_in_at: signInById.get(p.id) ?? null,
  }))

  return Response.json(enriched)
}

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = adminUsersPostSchema.safeParse(rawBody)
  if (!parse.success) {
    return Response.json(
      { error: 'Solicitud inválida', detalle: parse.error.issues },
      { status: 400 },
    )
  }
  const { email, full_name, role, region_cods } = parse.data

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
