/**
 * Capacidades por usuario (Fase 1 capas de usuarios). Solo admin.
 *
 *   GET  → capacidades actuales del usuario. Si la tabla no tiene filas para él
 *          (aún sin backfill / concesión), devuelve el ESPEJO de su rol para que
 *          el editor muestre el acceso vigente. `source` indica de dónde salió.
 *   PUT  → reemplaza TODAS las capacidades del usuario por las enviadas
 *          (delete-all + insert). Body: { capabilities: [{ key, region }] }.
 */
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { ALL_CAPABILITY_KEYS, capabilitiesForProfile, type CapabilityKey } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireCan(profile, 'usuarios.gestionar'))) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = getSupabaseAdmin()

  const { data: rows, error } = await db
    .from('user_capabilities')
    .select('capability_key, region_cod')
    .eq('user_id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  if (rows && rows.length > 0) {
    return Response.json({
      source: 'table',
      capabilities: rows.map(r => ({ key: r.capability_key, region: r.region_cod })),
    })
  }

  // Fallback: espejo del rol (el acceso efectivo de hoy) para que el editor no
  // arranque vacío antes del backfill.
  const { data: prof } = await db
    .from('user_profiles')
    .select('role, region_cods')
    .eq('id', id)
    .single()
  if (!prof) return Response.json({ source: 'none', capabilities: [] })
  return Response.json({
    source: 'preset',
    capabilities: capabilitiesForProfile({ role: prof.role, region_cods: prof.region_cods ?? [] }),
  })
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const profile = await requireAuth()
  if (!profile) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireCan(profile, 'usuarios.gestionar'))) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  let body: unknown
  try { body = await request.json() }
  catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const caps = (body as { capabilities?: unknown }).capabilities
  if (!Array.isArray(caps)) {
    return Response.json({ error: 'capabilities debe ser un arreglo' }, { status: 400 })
  }

  const validKeys = new Set<string>(ALL_CAPABILITY_KEYS)
  // Dedup por (key, region) — el PK de user_capabilities lo exige.
  const seen = new Set<string>()
  const rows: { user_id: string; capability_key: CapabilityKey; region_cod: string }[] = []
  for (const c of caps) {
    const key = (c as { key?: unknown }).key
    const region = (c as { region?: unknown }).region
    if (typeof key !== 'string' || typeof region !== 'string') {
      return Response.json({ error: 'Cada capacidad necesita { key, region }' }, { status: 400 })
    }
    if (!validKeys.has(key)) {
      return Response.json({ error: `Capacidad desconocida: ${key}` }, { status: 400 })
    }
    const dedup = `${key}|${region}`
    if (seen.has(dedup)) continue
    seen.add(dedup)
    rows.push({ user_id: id, capability_key: key as CapabilityKey, region_cod: region })
  }

  const db = getSupabaseAdmin()
  const { error: delErr } = await db.from('user_capabilities').delete().eq('user_id', id)
  if (delErr) return Response.json({ error: delErr.message }, { status: 500 })

  if (rows.length > 0) {
    const { error: insErr } = await db.from('user_capabilities').insert(rows)
    if (insErr) return Response.json({ error: insErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, filas: rows.length })
}
