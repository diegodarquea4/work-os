/**
 * PATCH /api/desalojos/[n]/toggle — marca/desmarca una iniciativa como caso
 * de la Mesa Interministerial de Desalojos. Admin-only.
 *
 * ¿Por qué API en vez de getSupabase().update() directo desde la UI?
 * La columna `es_desalojo` vive en `prioridades_territoriales`, cuya policy
 * de UPDATE es `authenticated_write` (cualquier autenticado puede mutar).
 * PostgreSQL no soporta column-level RLS sin migración aparte, así que la
 * única forma de restringir el toggle a admin es validarlo server-side
 * acá y mutar con la service role.
 *
 * Side-effects al marcar TRUE (v3):
 *   - INSERT en `desalojo_detalle` con defaults (solo prioridad_id + updated_at
 *     y resumen_narrativo NULL). ON CONFLICT DO NOTHING — si la fila ya existía
 *     (re-marcar tras desetiquetar), se respeta el contexto previo.
 *   - INSERT en `desalojo_capas` la capa 1 'Polígono único' con defaults.
 *     Solo si no existe ya alguna capa para ese prioridad_id — re-etiquetar
 *     conserva las capas previas (incluyendo las archivadas).
 *   - INSERT en `desalojo_fase_estado` 6 filas (PR, F1, F2, F3, F4, F5) para
 *     la capa 1 con semáforo en gris. Solo si no existían ya.
 *   - INSERT en `desalojo_log` con campo='es_desalojo' (capa_id/fase NULL).
 *
 * Al marcar FALSE: NO se borran detalle ni capas ni fases. Re-marcar trae
 * todo de vuelta intacto. Reset total queda como operación manual en SQL.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

export async function PATCH(
  req: Request,
  context: { params: Promise<{ n: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')          return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr } = await context.params
  const n = Number(nStr)
  if (!Number.isFinite(n) || n <= 0)     return NextResponse.json({ error: 'Invalid n' },    { status: 400 })

  let body: { es_desalojo?: unknown }
  try { body = await req.json() }
  catch                                  { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (typeof body.es_desalojo !== 'boolean') {
    return NextResponse.json({ error: 'es_desalojo must be boolean' }, { status: 400 })
  }
  const next = body.es_desalojo

  const db = getSupabaseAdmin()

  // Leer estado actual para audit log y para detectar no-op.
  const { data: prev, error: readErr } = await db
    .from('prioridades_territoriales')
    .select('n, es_desalojo')
    .eq('n', n)
    .single()
  if (readErr || !prev) {
    return NextResponse.json({ error: `Iniciativa #${n} no encontrada` }, { status: 404 })
  }
  if (prev.es_desalojo === next) {
    return NextResponse.json({ ok: true, es_desalojo: next, noop: true })
  }

  // Actualizar la marca.
  const { error: updErr } = await db
    .from('prioridades_territoriales')
    .update({ es_desalojo: next })
    .eq('n', n)
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Side-effects al marcar TRUE: garantizar fila en `desalojo_detalle` (1:1
  // con la iniciativa) y la capa 1 'Polígono único' si no hay capas previas.
  // Los errores acá NO se rollback — el toggle es la operación principal y la
  // ficha puede repararse desde la UI si algo quedó incompleto.
  if (next === true) {
    const { error: detalleErr } = await db
      .from('desalojo_detalle')
      .upsert({ prioridad_id: n }, { onConflict: 'prioridad_id', ignoreDuplicates: true })
    if (detalleErr) console.error('[desalojos.toggle] insert detalle falló:', detalleErr)

    // Capa 1 solo si no existe ninguna capa (incluso archivada) — re-etiquetar
    // tras un desetiquetado conserva todas las capas previas.
    const { data: capasExistentes, error: countErr } = await db
      .from('desalojo_capas')
      .select('id')
      .eq('prioridad_id', n)
    if (countErr) {
      console.error('[desalojos.toggle] count capas falló:', countErr)
    } else if ((capasExistentes?.length ?? 0) === 0) {
      const { data: capa1, error: capaErr } = await db
        .from('desalojo_capas')
        .insert({ prioridad_id: n, nombre: 'Polígono único', orden: 0 })
        .select('id')
        .single()
      if (capaErr || !capa1) {
        console.error('[desalojos.toggle] insert capa 1 falló:', capaErr)
      } else {
        // Inicializar las 6 filas de fase para la capa 1.
        const fases: ('pr' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5')[] = ['pr', 'f1', 'f2', 'f3', 'f4', 'f5']
        const { error: faseErr } = await db
          .from('desalojo_fase_estado')
          .insert(fases.map(f => ({
            prioridad_id: n,
            capa_id:      capa1.id,
            fase:         f,
          })))
        if (faseErr) console.error('[desalojos.toggle] insert fases capa 1 falló:', faseErr)
      }
    }
  }

  // Audit log del toggle (capa_id/fase NULL — es del caso, no de capa).
  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        null,
    fase:           null,
    campo:          'es_desalojo',
    valor_anterior: String(prev.es_desalojo ?? false),
    valor_nuevo:    String(next),
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, es_desalojo: next })
}
