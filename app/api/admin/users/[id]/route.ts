import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { adminUsersPatchSchema } from '@/lib/schemas'
import { generateCode, hashCode, codeExpiry } from '@/lib/accessCode'
import { randomBytes } from 'crypto'

/**
 * Cierra todas las sesiones activas de un usuario (best-effort) vía el endpoint
 * admin de GoTrue. No es crítico: recuperación ya bloquea la clave anterior y
 * forzar-cambio ya deja el flag; esto solo hace que el efecto sea inmediato. Si el
 * endpoint no existe/falla, se ignora (el flag/clave aplican igual en el próximo
 * request).
 */
async function revokeSessionsBestEffort(userId: string): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return
    await fetch(`${url}/auth/v1/admin/users/${userId}/logout`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
  } catch { /* best-effort */ }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const parse = adminUsersPatchSchema.safeParse(await request.json())
  if (!parse.success) {
    return Response.json(
      { error: 'Solicitud invalida', detalle: parse.error.issues },
      { status: 400 },
    )
  }
  const { role, region_cods, full_name, recuperar, forzar_cambio } = parse.data

  const db = getSupabaseAdmin()

  // ── Recuperación: emite código nuevo, BLOQUEA la clave anterior (fija una
  //    aleatoria imposible) y cierra sesiones. El usuario solo entra con el código. ──
  if (recuperar) {
    const { data: prof } = await db.from('user_profiles').select('email').eq('id', id).single()
    const email = (prof as { email: string } | null)?.email
    if (!email) return Response.json({ error: 'Usuario no encontrado' }, { status: 404 })

    const { error: upErr } = await db.auth.admin.updateUserById(id, {
      password: randomBytes(24).toString('base64'),
      email_confirm: true,
    })
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
    await revokeSessionsBestEffort(id)

    const codigo = generateCode()
    const { error: cErr } = await db.from('codigos_acceso').upsert({
      email,
      codigo_hash: hashCode(codigo),
      expira:      codeExpiry(new Date()),
      intentos:    0,
      created_at:  new Date().toISOString(),
    })
    if (cErr) return Response.json({ error: cErr.message }, { status: 500 })
    return Response.json({ ok: true, codigo })
  }

  // ── Forzar cambio: marca el flag y cierra sesiones. El usuario entra con su
  //    clave actual una vez y el overlay lo obliga a crear una nueva. Sin código. ──
  if (forzar_cambio) {
    const { error } = await db
      .from('user_profiles')
      .update({ debe_cambiar_clave: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) return Response.json({ error: error.message }, { status: 500 })
    await revokeSessionsBestEffort(id)
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

  // Email para limpiar codigos_acceso (llave por email) — se lee ANTES de que
  // cleanup_user_references borre la fila de user_profiles.
  const { data: prof } = await db.from('user_profiles').select('email').eq('id', id).single()
  const emailDeUsuario = (prof as { email: string } | null)?.email ?? null

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

  // 3. Borrar cualquier código de acceso pendiente de ese email (best-effort).
  if (emailDeUsuario) {
    await db.from('codigos_acceso').delete().eq('email', emailDeUsuario)
  }

  return Response.json({ ok: true })
}
