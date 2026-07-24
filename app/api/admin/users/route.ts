import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { adminUsersPostSchema } from '@/lib/schemas'
import { generateCode, hashCode, codeExpiry } from '@/lib/accessCode'

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

  // Alta SIN clave y sin correo: email_confirm=true evita el mail de invitación,
  // y al no pasar `password` la cuenta queda sin clave hasta que el usuario la
  // define en la activación con el código. createUser falla si el correo ya existe.
  const { data: createData, error: createError } = await db.auth.admin.createUser({
    email,
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

  // Código de un solo uso: se guarda solo el hash. Se devuelve en claro UNA vez
  // para que el admin lo entregue por un canal de confianza (no hay envío de correo).
  const codigo = generateCode()
  const { error: codeError } = await db.from('codigos_acceso').upsert({
    email,
    codigo_hash: hashCode(codigo),
    expira:      codeExpiry(new Date()),
    intentos:    0,
    created_at:  new Date().toISOString(),
  })
  if (codeError) {
    // La cuenta quedó creada pero sin código; el admin puede reintentar con "Recuperación".
    return Response.json({ error: `Usuario creado pero no se pudo generar el código: ${codeError.message}` }, { status: 500 })
  }

  return Response.json({ id: userId, email, role, region_cods: region_cods ?? [], codigo })
}
