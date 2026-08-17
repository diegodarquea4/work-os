/**
 * Backfill idempotente de `user_capabilities` (Fase 0 capas de usuarios).
 *
 * Puebla la tabla con las capacidades ESPEJO de cada usuario según su rol ×
 * regiones (misma lógica que /api/me, una sola fuente: `capabilitiesForProfile`).
 * Idempotente: inserta lo que falta, no pisa concesiones manuales existentes
 * (Fase 1). Correrlo antes de que la Fase 2 apunte la RLS a current_user_can().
 *
 * Solo admin. POST sin body.
 */
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { capabilitiesForProfile } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function POST() {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return Response.json({ error: 'Sin permiso' }, { status: 403 })

  const db = getSupabaseAdmin()
  const { data: users, error } = await db
    .from('user_profiles')
    .select('id, role, region_cods')
  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Solo sembramos usuarios SIN permisos aún — no pisamos concesiones ya
  // personalizadas desde el editor (si un admin revocó algo, no se lo re-agregamos).
  const { data: existing } = await db.from('user_capabilities').select('user_id')
  const yaTiene = new Set((existing ?? []).map(r => r.user_id))
  const pendientes = (users ?? []).filter(u => !yaTiene.has(u.id))

  const rows = pendientes.flatMap(u =>
    capabilitiesForProfile({ role: u.role, region_cods: u.region_cods ?? [] }).map(c => ({
      user_id:        u.id,
      capability_key: c.key,
      region_cod:     c.region,
    })),
  )

  if (rows.length > 0) {
    const { error: upErr } = await db
      .from('user_capabilities')
      .upsert(rows, { onConflict: 'user_id,capability_key,region_cod', ignoreDuplicates: true })
    if (upErr) return Response.json({ error: upErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, sembrados: pendientes.length, ya_tenian: yaTiene.size, filas: rows.length })
}
