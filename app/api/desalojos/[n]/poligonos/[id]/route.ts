/**
 * PATCH  /api/desalojos/[n]/poligonos/[id] — actualiza polígono. Admin-only.
 * DELETE /api/desalojos/[n]/poligonos/[id] — borra polígono. Admin-only.
 *
 * PATCH body (zod: `poligonoPatchSchema`): cualquier subset de
 *   { nombre, color, coords, descripcion }.
 *
 * Verifica que el polígono pertenezca al caso `n` antes de escribir/borrar,
 * para que un caller malicioso no pueda tocar polígonos de otro caso.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { poligonoPatchSchema } from '@/lib/schemas'

type Params = { params: Promise<{ n: string; id: string }> }

async function assertPoligonoInCase(
  db: ReturnType<typeof getSupabaseAdmin>,
  nStr: string,
  idStr: string,
): Promise<{ ok: true; n: number; id: number } | { ok: false; res: Response }> {
  const n  = Number(nStr)
  const id = Number(idStr)
  if (!Number.isFinite(n)  || n  <= 0) return { ok: false, res: NextResponse.json({ error: 'Invalid n' },  { status: 400 }) }
  if (!Number.isFinite(id) || id <= 0) return { ok: false, res: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

  const { data, error } = await db
    .from('desalojo_poligonos')
    .select('id, prioridad_id')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, res: NextResponse.json({ error: error.message }, { status: 500 }) }
  if (!data)  return { ok: false, res: NextResponse.json({ error: 'Polígono no encontrado' }, { status: 404 }) }
  if (data.prioridad_id !== n) {
    return { ok: false, res: NextResponse.json({ error: 'Polígono no pertenece al caso' }, { status: 400 }) }
  }
  return { ok: true, n, id }
}

export async function PATCH(req: Request, context: Params) {
  const profile = await requireAuth()
  if (!profile)                 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, id: idStr } = await context.params
  const db = getSupabaseAdmin()
  const check = await assertPoligonoInCase(db, nStr, idStr)
  if (!check.ok) return check.res

  let raw: unknown
  try { raw = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const parse = poligonoPatchSchema.safeParse(raw)
  if (!parse.success) {
    const first = parse.error.issues[0]
    const hint  = first ? `${first.path.join('.') || '(root)'}: ${first.message}` : undefined
    return NextResponse.json(
      { error: 'Solicitud inválida', hint, detalle: parse.error.issues },
      { status: 400 },
    )
  }

  const patch = parse.data
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  }

  const { data: poligono, error: updErr } = await db
    .from('desalojo_poligonos')
    .update({
      ...(patch.nombre      !== undefined ? { nombre:      patch.nombre      } : {}),
      ...(patch.color       !== undefined ? { color:       patch.color       } : {}),
      ...(patch.coords      !== undefined ? { coords:      patch.coords      } : {}),
      ...(patch.descripcion !== undefined ? { descripcion: patch.descripcion } : {}),
    })
    .eq('id', check.id)
    .select('*')
    .single()
  if (updErr || !poligono) {
    return NextResponse.json({ error: updErr?.message ?? 'Update falló' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, poligono })
}

export async function DELETE(_req: Request, context: Params) {
  const profile = await requireAuth()
  if (!profile)                 return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, id: idStr } = await context.params
  const db = getSupabaseAdmin()
  const check = await assertPoligonoInCase(db, nStr, idStr)
  if (!check.ok) return check.res

  const { error: delErr } = await db
    .from('desalojo_poligonos')
    .delete()
    .eq('id', check.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
