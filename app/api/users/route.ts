import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { requireAuth } from '@/lib/apiAuth'

// GET /api/users — lista de usuarios para popular el selector de "responsable"
// en el modal de iniciativa. Restringido a roles que efectivamente editan
// iniciativas (admin/editor/regional). Viewer NO debe enumerar el padron.
//
// Con ?region=<cod>, acota la lista a los usuarios "de esa región" (regional/
// viewer con region_cods que incluye el cod) más los transversales admin/
// editor (region_cods no aplica para ellos). Lo usa el selector de
// "Responsable" del tab Planificación de tareas — el selector de Responsable
// de la iniciativa misma sigue llamando sin `region` (padrón completo).
export async function GET(req: Request) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'viewer') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const region = new URL(req.url).searchParams.get('region')

  const db = getSupabaseAdmin()
  const { data: { users }, error } = await db.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const list = users
    .map(u => ({ email: u.email ?? '', name: u.user_metadata?.full_name ?? u.email ?? '' }))
    .filter(u => u.email)

  if (!region) {
    return NextResponse.json(list.sort((a, b) => a.email.localeCompare(b.email)))
  }

  const { data: profiles } = await db.from('user_profiles').select('email, role, region_cods')
  const byEmail = new Map((profiles ?? []).map(p => [p.email, p as { role: string; region_cods: string[] }]))

  const filtered = list.filter(u => {
    const p = byEmail.get(u.email)
    if (!p) return false
    if (p.role === 'admin' || p.role === 'editor') return true
    return (p.region_cods ?? []).includes(region)
  })

  return NextResponse.json(filtered.sort((a, b) => a.email.localeCompare(b.email)))
}
