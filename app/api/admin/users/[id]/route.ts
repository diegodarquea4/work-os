import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { role, region_cods, full_name } = await request.json() as {
    role?: string
    region_cods?: string[]
    full_name?: string
  }

  const db = getSupabaseAdmin()
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (role !== undefined) {
    patch.role = role
    // Clear regions when switching away from regional
    if (role !== 'regional') patch.region_cods = []
  }
  if (region_cods !== undefined) patch.region_cods = region_cods
  if (full_name !== undefined) patch.full_name = full_name

  const { error } = await db.from('user_profiles').update(patch).eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (id === profile.id) return Response.json({ error: 'Cannot delete your own account' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { error } = await db.auth.admin.deleteUser(id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ ok: true })
}
