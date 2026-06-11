/**
 * GET   /api/desalojos/[n]/capas/[capa_id]/fases/[fase] — devuelve el estado de la fase.
 * PATCH /api/desalojos/[n]/capas/[capa_id]/fases/[fase] — actualiza semáforo,
 *       checklist (merge parcial) y notas. Todo admin-only.
 *
 * Body PATCH acepta cualquier subset de:
 *   - semaforo:         'verde' | 'ambar' | 'rojo' | 'gris'
 *   - notas:            string | null
 *   - checklist_patch:  { [item_key]: { done: bool, fecha: 'YYYY-MM-DD' | null } }
 *
 * Reglas:
 *   - Si el semáforo pasa a verde, server llena completed_at + completed_by.
 *   - checklist_patch se hace shallow merge contra el estado actual. Solo se
 *     aceptan keys que existan en CHECKLIST_FASE[tipologia][fase] — items
 *     huérfanos (de tipologías anteriores) se preservan pero no se renderizan.
 *   - Cada cambio se loggea en desalojo_log con la col `fase`.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { checklistItems } from '@/lib/desalojos'
import type {
  DesalojoChecklistEstado,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  SemaforoDimension,
} from '@/lib/types'

const SEMAFORO_VALUES = new Set<SemaforoDimension>(['verde', 'ambar', 'rojo', 'gris'])
const FASES_VALID     = new Set<DesalojoFaseConSemaforo>(['pr', 'f1', 'f2', 'f3', 'f4', 'f5'])

async function loadCapaYFase(
  db:     ReturnType<typeof getSupabaseAdmin>,
  n:      number,
  capaId: number,
  fase:   DesalojoFaseConSemaforo,
): Promise<{ capa: { tipologia: string | null } | null; estado: DesalojoFaseEstado | null; error: string | null }> {
  const { data: capa, error: capaErr } = await db
    .from('desalojo_capas')
    .select('id, prioridad_id, tipologia')
    .eq('id', capaId)
    .maybeSingle()
  if (capaErr) return { capa: null, estado: null, error: capaErr.message }
  if (!capa || capa.prioridad_id !== n) {
    return { capa: null, estado: null, error: 'Capa no pertenece al caso' }
  }

  const { data: estado, error: estErr } = await db
    .from('desalojo_fase_estado')
    .select('*')
    .eq('capa_id', capaId)
    .eq('fase', fase)
    .maybeSingle()
  if (estErr) return { capa, estado: null, error: estErr.message }

  return { capa: { tipologia: capa.tipologia }, estado: (estado ?? null) as DesalojoFaseEstado | null, error: null }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ n: string; capa_id: string; fase: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, capa_id: cStr, fase: fStr } = await context.params
  const n      = Number(nStr)
  const capaId = Number(cStr)
  if (!Number.isFinite(n)      || n      <= 0) return NextResponse.json({ error: 'Invalid n' },       { status: 400 })
  if (!Number.isFinite(capaId) || capaId <= 0) return NextResponse.json({ error: 'Invalid capa_id' }, { status: 400 })
  if (!FASES_VALID.has(fStr as DesalojoFaseConSemaforo)) {
    return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
  }
  const fase = fStr as DesalojoFaseConSemaforo

  const db = getSupabaseAdmin()
  const { estado, error } = await loadCapaYFase(db, n, capaId, fase)
  if (error)  return NextResponse.json({ error }, { status: error === 'Capa no pertenece al caso' ? 400 : 500 })
  if (!estado) return NextResponse.json({ error: 'Fila de fase no encontrada' }, { status: 404 })
  return NextResponse.json({ estado })
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ n: string; capa_id: string; fase: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, capa_id: cStr, fase: fStr } = await context.params
  const n      = Number(nStr)
  const capaId = Number(cStr)
  if (!Number.isFinite(n)      || n      <= 0) return NextResponse.json({ error: 'Invalid n' },       { status: 400 })
  if (!Number.isFinite(capaId) || capaId <= 0) return NextResponse.json({ error: 'Invalid capa_id' }, { status: 400 })
  if (!FASES_VALID.has(fStr as DesalojoFaseConSemaforo)) {
    return NextResponse.json({ error: 'Fase inválida' }, { status: 400 })
  }
  const fase = fStr as DesalojoFaseConSemaforo

  let body: { semaforo?: unknown; notas?: unknown; checklist_patch?: unknown }
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const db = getSupabaseAdmin()
  const { capa, estado: prev, error: loadErr } = await loadCapaYFase(db, n, capaId, fase)
  if (loadErr || !prev || !capa) {
    return NextResponse.json({ error: loadErr ?? 'No encontrado' }, { status: loadErr === 'Capa no pertenece al caso' ? 400 : 500 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const errors: string[]    = []
  const logRows: Array<Record<string, unknown>> = []

  // ── semáforo ──────────────────────────────────────────────────────────
  if ('semaforo' in body) {
    const raw = body.semaforo
    if (typeof raw !== 'string' || !SEMAFORO_VALUES.has(raw as SemaforoDimension)) {
      errors.push('semaforo debe ser verde|ambar|rojo|gris')
    } else if (raw !== prev.semaforo) {
      update.semaforo = raw
      // Si pasa a verde, sellar completed_at/by. Si sale de verde, limpiar.
      if (raw === 'verde') {
        update.completed_at = new Date().toISOString()
        update.completed_by = profile.email || null
      } else if (prev.semaforo === 'verde') {
        update.completed_at = null
        update.completed_by = null
      }
      logRows.push({
        prioridad_id: n, capa_id: capaId, fase, campo: 'semaforo',
        valor_anterior: prev.semaforo, valor_nuevo: raw, cambiado_por: profile.email || null,
      })
    }
  }

  // ── notas ─────────────────────────────────────────────────────────────
  if ('notas' in body) {
    const raw = body.notas
    if (raw !== null && typeof raw !== 'string') {
      errors.push('notas debe ser string o null')
    } else {
      const nuevo = raw === null ? null : (raw.trim() || null)
      if (nuevo !== prev.notas) {
        update.notas = nuevo
        logRows.push({
          prioridad_id: n, capa_id: capaId, fase, campo: 'notas',
          valor_anterior: prev.notas, valor_nuevo: nuevo ?? '', cambiado_por: profile.email || null,
        })
      }
    }
  }

  // ── checklist (merge parcial; solo keys vigentes) ─────────────────────
  let mergedChecklist: DesalojoChecklistEstado | null = null
  if ('checklist_patch' in body) {
    const raw = body.checklist_patch
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('checklist_patch debe ser objeto')
    } else {
      const items = checklistItems(capa.tipologia as 'A' | 'B' | 'C' | 'D' | null, fase)
      const keysVigentes = new Set(items.map(i => i.key))
      const cleanPatch: DesalojoChecklistEstado = {}
      for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
        if (!keysVigentes.has(k)) continue
        if (!v || typeof v !== 'object')                          { errors.push(`checklist.${k} inválido`); continue }
        const node = v as { done?: unknown; fecha?: unknown }
        if (typeof node.done !== 'boolean')                       { errors.push(`checklist.${k}.done debe ser boolean`); continue }
        const fecha = node.fecha == null ? null : String(node.fecha)
        if (fecha !== null && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) { errors.push(`checklist.${k}.fecha inválida`); continue }
        cleanPatch[k] = { done: node.done, fecha }
      }
      mergedChecklist = { ...(prev.checklist_estado ?? {}), ...cleanPatch }

      for (const [k, v] of Object.entries(cleanPatch)) {
        const prevItem = prev.checklist_estado?.[k]
        if (!prevItem || prevItem.done !== v.done) {
          logRows.push({
            prioridad_id: n, capa_id: capaId, fase,
            campo: `checklist.${k}.done`,
            valor_anterior: prevItem ? String(prevItem.done) : null,
            valor_nuevo: String(v.done),
            cambiado_por: profile.email || null,
          })
        }
        if (!prevItem || (prevItem.fecha ?? null) !== (v.fecha ?? null)) {
          logRows.push({
            prioridad_id: n, capa_id: capaId, fase,
            campo: `checklist.${k}.fecha`,
            valor_anterior: prevItem?.fecha ?? null,
            valor_nuevo: v.fecha ?? '',
            cambiado_por: profile.email || null,
          })
        }
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }
  if (Object.keys(update).length === 1 && !mergedChecklist) {
    // Solo updated_at, sin cambios reales.
    return NextResponse.json({ ok: true, estado: prev, noop: true })
  }
  if (mergedChecklist) update.checklist_estado = mergedChecklist

  const { data: updated, error: updErr } = await db
    .from('desalojo_fase_estado')
    .update(update)
    .eq('id', prev.id)
    .select('*')
    .single()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Update falló' }, { status: 500 })
  }

  if (logRows.length > 0) {
    const { error: logErr } = await db.from('desalojo_log').insert(logRows)
    if (logErr) console.error('[desalojos.fase.patch] log insert falló:', logErr)
  }

  return NextResponse.json({ ok: true, estado: updated })
}
