import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json() as {
    role?: string
    region_cods?: string[]
    full_name?: string
    reset_password?: boolean
  }
  const { role, region_cods, full_name, reset_password } = body

  const db = getSupabaseAdmin()

  // Reset password + confirm email for existing unconfirmed users
  if (reset_password) {
    const { error: authError } = await db.auth.admin.updateUserById(id, {
      password: 'DCI2026',
      email_confirm: true,
    })
    if (authError) return Response.json({ error: authError.message }, { status: 500 })
    return Response.json({ ok: true })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (role !== undefined) {
    patch.role = role
    // Clear regions when switching to a role that doesn't use region filtering
    if (role !== 'regional' && role !== 'viewer') patch.region_cods = []
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
  if (id === profile.id) return Response.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 })

  const db = getSupabaseAdmin()

  // 1. Limpiar las FKs hacia auth.users que bloquean el delete:
  //    - storage.objects.owner (archivos subidos por el usuario)
  //    - public.user_profiles.id
  //
  //    storage.objects no se puede tocar vía REST porque el schema 'storage'
  //    no está expuesto, así que delegamos a la función SECURITY DEFINER
  //    public.cleanup_user_references (ver supabase/migrations/004).
  //
  //    Si la función no existe (migración no corrida), fallback a borrar
  //    solo el perfil para mantener compatibilidad.
  const { error: cleanupError } = await db.rpc('cleanup_user_references', {
    target_user_id: id,
  })

  if (cleanupError) {
    const fnNotFound = cleanupError.message?.toLowerCase().includes('function') ||
                       cleanupError.code === 'PGRST202'
    if (fnNotFound) {
      console.warn('[admin/users DELETE] cleanup_user_references no existe, fallback', { id })
      const { error: profileError } = await db.from('user_profiles').delete().eq('id', id)
      if (profileError) {
        console.error('[admin/users DELETE] profile fallback error', { id, error: profileError })
        return Response.json(
          { error: `No se pudo eliminar el perfil: ${profileError.message}` },
          { status: 500 },
        )
      }
    } else {
      console.error('[admin/users DELETE] cleanup error', { id, error: cleanupError })
      return Response.json(
        { error: `Error limpiando referencias: ${cleanupError.message}` },
        { status: 500 },
      )
    }
  }

  // 2. Borrar la identidad en auth.users
  const { error: authError } = await db.auth.admin.deleteUser(id)
  if (authError) {
    console.error('[admin/users DELETE] auth error', { id, error: authError })
    return Response.json(
      { error: `Perfil limpiado pero falló la baja de auth: ${authError.message}` },
      { status: 500 },
    )
  }

  return Response.json({ ok: true })
}
