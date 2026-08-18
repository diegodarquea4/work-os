/**
 * Helpers de servidor para mantener `user_capabilities` en sync con el rol base.
 * Solo para rutas API (reciben el cliente service-role). La lógica de qué
 * capacidades corresponden a un perfil vive en `capabilitiesForProfile`
 * (lib/permissions.ts) — fuente única compartida con /api/me y el backfill.
 *
 * Se usan en el alta de usuario (sembrar) y en el cambio de rol/regiones
 * (re-sembrar solo si el usuario no tiene permisos personalizados). El botón
 * "Sincronizar permisos base" (backfill) queda como red de seguridad, no como
 * paso obligatorio.
 */
import type { getSupabaseAdmin } from '@/lib/supabaseServer'
import type { UserProfile } from '@/lib/apiAuth'
import { capabilitiesForProfile } from '@/lib/permissions'

type AdminDb = ReturnType<typeof getSupabaseAdmin>
type RoleScope = Pick<UserProfile, 'role' | 'region_cods'>

/** Claves `${key}|${region}` del espejo de un perfil — para comparar conjuntos. */
function mirrorKeys(profile: RoleScope): Set<string> {
  return new Set(
    capabilitiesForProfile({ role: profile.role, region_cods: profile.region_cods ?? [] })
      .map(c => `${c.key}|${c.region}`),
  )
}

/**
 * Reemplaza TODAS las capacidades del usuario por el espejo de `profile`
 * (delete-all + insert). Misma lógica que el backfill, para un solo usuario.
 */
export async function seedCapabilitiesMirror(
  db: AdminDb, userId: string, profile: RoleScope,
): Promise<{ error: string | null }> {
  const rows = capabilitiesForProfile({ role: profile.role, region_cods: profile.region_cods ?? [] })
    .map(c => ({ user_id: userId, capability_key: c.key, region_cod: c.region }))

  const { error: delErr } = await db.from('user_capabilities').delete().eq('user_id', userId)
  if (delErr) return { error: delErr.message }
  if (rows.length > 0) {
    const { error: insErr } = await db.from('user_capabilities').insert(rows)
    if (insErr) return { error: insErr.message }
  }
  return { error: null }
}

/**
 * ¿Las capacidades actuales del usuario son EXACTAMENTE el espejo de `profile`?
 * true → nadie las personalizó desde el editor → seguro re-sembrar en un cambio
 * de rol/regiones. false (incluye vacío o error) → hay ediciones o incertidumbre:
 * NO pisar. El editor de permisos es la fuente de verdad de ese usuario.
 */
export async function capsMatchMirror(
  db: AdminDb, userId: string, profile: RoleScope,
): Promise<boolean> {
  const { data, error } = await db
    .from('user_capabilities')
    .select('capability_key, region_cod')
    .eq('user_id', userId)
  if (error) return false
  const current = new Set((data ?? []).map(r => `${r.capability_key}|${r.region_cod}`))
  const mirror = mirrorKeys(profile)
  if (current.size !== mirror.size) return false
  for (const k of mirror) if (!current.has(k)) return false
  return true
}
