/**
 * GET  /api/desalojos/[n]/poligonos — lista polígonos del caso.
 * POST /api/desalojos/[n]/poligonos — crea uno. Admin-only.
 *
 * Body de POST (zod: `poligonoPostSchema`):
 *   { nombre, color: "#rrggbb", coords: [[lng, lat], ...], descripcion? }
 *
 * `coords` es el ring exterior en formato GeoJSON canónico (lng, lat). Puede
 * venir del drawing tool o del parser WKT — la ruta ya no distingue: el
 * cliente parsea WKT si el usuario lo pegó y manda el array final.
 *
 * `orden` se asigna server-side con `MAX(orden)+1` para evitar race entre
 * dos admins creando polígonos simultáneamente.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { poligonoPostSchema } from '@/lib/schemas'

export async function GET(
  _req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data, error } = await db
    .from('desalojo_poligonos')
    .select('*')
    .eq('prioridad_id', n)
    .order('orden', { ascending: true })
    .order('id',    { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, poligonos: data ?? [] })
}

export async function POST(
  req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'Invalid n' }, { status: 400 })

  let raw: unknown
  try { raw = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parse = poligonoPostSchema.safeParse(raw)
  if (!parse.success) {
    const first = parse.error.issues[0]
    const hint  = first ? `${first.path.join('.') || '(root)'}: ${first.message}` : undefined
    return NextResponse.json(
      { error: 'Solicitud inválida', hint, detalle: parse.error.issues },
      { status: 400 },
    )
  }
  const body = parse.data

  const db = getSupabaseAdmin()

  const { data: maxRow } = await db
    .from('desalojo_poligonos')
    .select('orden')
    .eq('prioridad_id', n)
    .order('orden', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ordenNuevo = (maxRow?.orden ?? 0) + 1

  const { data: poligono, error: insErr } = await db
    .from('desalojo_poligonos')
    .insert({
      prioridad_id: n,
      nombre:       body.nombre,
      color:        body.color,
      coords:       body.coords,
      descripcion:  body.descripcion ?? null,
      orden:        ordenNuevo,
      created_by:   profile.email || null,
    })
    .select('*')
    .single()

  if (insErr || !poligono) {
    return NextResponse.json({ error: insErr?.message ?? 'Insert falló' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, poligono })
}
