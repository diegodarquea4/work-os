/**
 * PATCH  /api/desalojos/[n]/planificacion/[id] — actualiza un evento.
 * DELETE /api/desalojos/[n]/planificacion/[id] — soft delete (archivado_at = now()).
 *
 * Ambas admin-only.
 *
 * PATCH body (todos opcionales): { capa_id?, titulo?, descripcion?, fecha_inicio?, fecha_fin? }
 * El server re-valida `fecha_fin >= fecha_inicio` considerando el merge del patch
 * con el estado actual (no solo el body parcial).
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

type PatchableFields = {
  capa_id?:      number | null
  titulo?:       string
  descripcion?:  string | null
  fecha_inicio?: string
  fecha_fin?:    string | null
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ n: string; id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, id: idStr } = await context.params
  const n  = Number(nStr)
  const id = Number(idStr)
  if (!Number.isFinite(n)  || n  <= 0) return NextResponse.json({ error: 'Invalid n' },  { status: 400 })
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const db = getSupabaseAdmin()

  // El evento debe existir, no estar archivado, y pertenecer al caso n.
  const { data: prev, error: readErr } = await db
    .from('desalojo_planificacion')
    .select('*')
    .eq('id', id)
    .is('archivado_at', null)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!prev || prev.prioridad_id !== n) {
    return NextResponse.json({ error: 'Evento no encontrado o no pertenece al caso' }, { status: 404 })
  }

  const patch: PatchableFields = {}
  const errors: string[] = []

  if ('titulo' in body) {
    if (typeof body.titulo !== 'string' || !body.titulo.trim()) {
      errors.push('Título no puede quedar vacío')
    } else {
      patch.titulo = body.titulo.trim()
    }
  }

  if ('descripcion' in body) {
    if (body.descripcion === null || body.descripcion === '') {
      patch.descripcion = null
    } else if (typeof body.descripcion !== 'string') {
      errors.push('descripcion inválida')
    } else {
      patch.descripcion = body.descripcion.trim() || null
    }
  }

  if ('fecha_inicio' in body) {
    if (typeof body.fecha_inicio !== 'string' || !DATE_RE.test(body.fecha_inicio)) {
      errors.push('fecha_inicio inválida (formato YYYY-MM-DD)')
    } else {
      patch.fecha_inicio = body.fecha_inicio
    }
  }

  if ('fecha_fin' in body) {
    if (body.fecha_fin === null || body.fecha_fin === '') {
      patch.fecha_fin = null
    } else if (typeof body.fecha_fin !== 'string' || !DATE_RE.test(body.fecha_fin)) {
      errors.push('fecha_fin inválida (formato YYYY-MM-DD)')
    } else {
      patch.fecha_fin = body.fecha_fin
    }
  }

  if ('capa_id' in body) {
    if (body.capa_id === null || body.capa_id === '') {
      patch.capa_id = null
    } else {
      const v = Number(body.capa_id)
      if (!Number.isFinite(v) || v <= 0) {
        errors.push('capa_id inválido')
      } else {
        const { data: capa } = await db
          .from('desalojo_capas')
          .select('id, prioridad_id')
          .eq('id', v)
          .maybeSingle()
        if (!capa || capa.prioridad_id !== n) {
          errors.push('capa_id no pertenece al caso')
        } else {
          patch.capa_id = v
        }
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Sin cambios' }, { status: 400 })
  }

  // Validar fecha_fin >= fecha_inicio sobre la combinación final (patch + prev).
  const finalInicio = patch.fecha_inicio ?? prev.fecha_inicio
  const finalFin    = 'fecha_fin' in patch ? patch.fecha_fin : prev.fecha_fin
  if (finalFin !== null && finalFin < finalInicio) {
    return NextResponse.json({ error: 'fecha_fin debe ser >= fecha_inicio' }, { status: 400 })
  }

  // Si es un hito (parent_id NOT NULL), las nuevas fechas deben caer dentro
  // del rango del padre — un hito que se sale del padre rompe la semántica
  // de "milestone dentro del evento".
  if (prev.parent_id !== null && ('fecha_inicio' in patch || 'fecha_fin' in patch)) {
    const { data: parent } = await db
      .from('desalojo_planificacion')
      .select('fecha_inicio, fecha_fin')
      .eq('id', prev.parent_id)
      .maybeSingle()
    if (parent) {
      const parentFin = parent.fecha_fin ?? parent.fecha_inicio
      if (finalInicio < parent.fecha_inicio || finalInicio > parentFin) {
        return NextResponse.json({
          error: `fecha_inicio del hito debe estar entre ${parent.fecha_inicio} y ${parentFin}`,
        }, { status: 400 })
      }
      if (finalFin !== null && (finalFin < parent.fecha_inicio || finalFin > parentFin)) {
        return NextResponse.json({
          error: `fecha_fin del hito debe estar entre ${parent.fecha_inicio} y ${parentFin}`,
        }, { status: 400 })
      }
    }
  }

  // Si es un evento top-level (parent_id NULL) y se mueven las fechas, los
  // hitos hijos podrían quedar fuera del nuevo rango. Bloqueamos el patch
  // si eso pasaría — el user debe primero ajustar los hitos.
  if (prev.parent_id === null && ('fecha_inicio' in patch || 'fecha_fin' in patch)) {
    const nuevoFinPadre = finalFin ?? finalInicio
    const { data: hitos } = await db
      .from('desalojo_planificacion')
      .select('id, titulo, fecha_inicio, fecha_fin')
      .eq('parent_id', id)
      .is('archivado_at', null)
    const fueraDeRango = (hitos ?? []).filter(h => {
      const hFin = h.fecha_fin ?? h.fecha_inicio
      return h.fecha_inicio < finalInicio || h.fecha_inicio > nuevoFinPadre
          || hFin            < finalInicio || hFin            > nuevoFinPadre
    })
    if (fueraDeRango.length > 0) {
      return NextResponse.json({
        error: `No se puede mover el rango: ${fueraDeRango.length} hito(s) quedarían fuera. Ajusta primero "${fueraDeRango[0].titulo}".`,
      }, { status: 400 })
    }
  }

  const { data: updated, error: updErr } = await db
    .from('desalojo_planificacion')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Update falló' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, evento: updated })
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ n: string; id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, id: idStr } = await context.params
  const n  = Number(nStr)
  const id = Number(idStr)
  if (!Number.isFinite(n)  || n  <= 0) return NextResponse.json({ error: 'Invalid n' },  { status: 400 })
  if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const db = getSupabaseAdmin()

  const { data: prev } = await db
    .from('desalojo_planificacion')
    .select('id, prioridad_id, archivado_at')
    .eq('id', id)
    .maybeSingle()
  if (!prev || prev.prioridad_id !== n) {
    return NextResponse.json({ error: 'Evento no encontrado o no pertenece al caso' }, { status: 404 })
  }
  if (prev.archivado_at !== null) {
    return NextResponse.json({ ok: true, noop: true })
  }

  const archivadoAt = new Date().toISOString()
  // Soft-delete del evento padre + cascada manual a los hitos. Sin esto,
  // los hitos quedarían huérfanos visibles solo via query directa.
  const { error: delErr } = await db
    .from('desalojo_planificacion')
    .update({ archivado_at: archivadoAt })
    .or(`id.eq.${id},parent_id.eq.${id}`)
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
