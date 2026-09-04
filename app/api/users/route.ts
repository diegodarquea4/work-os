import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { requireAuth, isRegionRestricted } from '@/lib/apiAuth'

// GET /api/users — lista de usuarios para popular el selector de "responsable"
// en el modal de iniciativa. Viewer y seremi NO deben enumerar el padrón.
//
// Con ?region=<cod>, acota la lista a los usuarios "de esa región" (regional/
// viewer con region_cods que incluye el cod) más los transversales admin/
// editor (region_cods no aplica para ellos). Lo usa el selector de
// "Responsable" del tab Planificación de tareas.
//
// Scope (auditoría 2026-09-04): la ruta usa service-role y devolvía el padrón
// NACIONAL completo — correo y nombre de los 57 usuarios — a cualquier rol que
// no fuera viewer, incluido el seremi, que existe justamente para ver una sola
// región y un solo ministerio. Ahora un perfil acotado por región solo ve a
// quienes comparten alguna de sus regiones (más los transversales, que sí son
// asignables como responsables en cualquier parte).
export async function GET(req: Request) {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role === 'viewer' || profile.role === 'seremi') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const region = new URL(req.url).searchParams.get('region')

  const acotado = isRegionRestricted(profile)
  if (acotado && region && !profile.region_cods.includes(region)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const db = getSupabaseAdmin()
  // `listUsers` pagina (50 por página por default) — hay que recorrer todas
  // las páginas o el padrón se corta silenciosamente pasado ese umbral.
  const users: { email?: string; user_metadata?: { full_name?: string } }[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    users.push(...data.users)
    if (data.users.length < 1000) break
  }

  const list = users
    .map(u => ({ email: u.email ?? '', name: u.user_metadata?.full_name ?? u.email ?? '' }))
    .filter(u => u.email)

  // Sin `region` y sin acotar (admin/editor): padrón completo, como siempre.
  if (!region && !acotado) {
    return NextResponse.json(list.sort((a, b) => a.email.localeCompare(b.email)))
  }

  // Regiones contra las que se filtra: la pedida, o todas las del perfil acotado.
  const regionesVisibles = region ? [region] : profile.region_cods

  const { data: profiles } = await db.from('user_profiles').select('email, role, region_cods')
  const byEmail = new Map((profiles ?? []).map(p => [p.email, p as { role: string; region_cods: string[] }]))

  const filtered = list.filter(u => {
    const p = byEmail.get(u.email)
    if (!p) return false
    if (p.role === 'admin' || p.role === 'editor') return true
    return (p.region_cods ?? []).some(c => regionesVisibles.includes(c))
  })

  return NextResponse.json(filtered.sort((a, b) => a.email.localeCompare(b.email)))
}
