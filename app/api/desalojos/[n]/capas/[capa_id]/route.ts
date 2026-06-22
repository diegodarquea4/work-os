/**
 * GET    /api/desalojos/[n]/capas/[capa_id] — devuelve la capa.
 * PATCH  /api/desalojos/[n]/capas/[capa_id] — actualiza campos + loggea cambios.
 * DELETE /api/desalojos/[n]/capas/[capa_id] — soft-delete (archiva: activa=FALSE).
 *
 * Todas admin-only.
 *
 * v3: las cols sem_juridico/seguridad/social/financiamiento y paso0_estado se
 * movieron a desalojo_fase_estado (ver /fases/[fase] route). El PATCH de capa
 * acepta:
 *   - Catastro (viviendas, hogares, personas, NNA, AM, embarazadas, discapacidad, migrantes).
 *   - Físicos del polígono (superficie, propietario, sitios).
 *   - Campos estructurados que llenan los checklists (instrumento, fecha,
 *     contingente, costo, fuente, financiamiento_asegurado, etc.).
 *   - Identidad de capa (nombre, orden, activa).
 *   - Tipología (con tipologia_asignada_at automático).
 *   - fase_actual con validación dura PR → F1 vía canAdvanceFase.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { canAdvanceFase } from '@/lib/desalojos'
import type {
  DesalojoCapa,
  DesalojoFase,
  DesalojoFaseEstado,
  DesalojoResponsable,
  DesalojoResponsables,
  DesalojoTipologia,
} from '@/lib/types'

const FASES_ALL = new Set<DesalojoFase>(['pr', 'f1', 'f2', 'f3', 'f4', 'f5', 'cerrado'])
const TIPOLOGIAS = new Set<DesalojoTipologia>(['A', 'B', 'C', 'D'])

const TEXT_FIELDS = new Set([
  'nombre', 'tipologia_nota',
  'propietario',
  'instrumento', 'via_juridica', 'notas_juridico',
  'contingente', 'notas_seguridad',
  'notas_social',
  'fuente', 'notas_financiamiento',
  'folio_minvu',
])
const DATE_FIELDS = new Set(['fecha_instrumento', 'fecha_tentativa_operativo'])
const INT_FIELDS  = new Set([
  'orden', 'sitios_total', 'sitios_desocupados',
  'viviendas', 'hogares', 'personas', 'nna',
  'adultos_mayores', 'embarazadas', 'personas_discapacidad',
  'migrantes_regular', 'migrantes_irregular',
])
const NUM_FIELDS  = new Set(['superficie_ha', 'costo_demolicion_mm'])
// Numéricos con signo (lat/lng) — Chile está en hemisferio sur, lat es negativa.
const SIGNED_NUM_FIELDS = new Set(['lat', 'lng'])
const BOOL_FIELDS = new Set(['activa', 'plan_operativo_listo', 'albergue_validado', 'financiamiento_asegurado'])

type AnyVal = string | number | boolean | null

function coerce(field: string, raw: unknown): { ok: true; value: AnyVal } | { ok: false; error: string } {
  if (raw === null || raw === '') return { ok: true, value: null }
  if (BOOL_FIELDS.has(field)) {
    if (typeof raw !== 'boolean') return { ok: false, error: `${field} debe ser boolean` }
    return { ok: true, value: raw }
  }
  if (INT_FIELDS.has(field)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: `${field} debe ser entero ≥ 0` }
    }
    return { ok: true, value: n }
  }
  if (NUM_FIELDS.has(field)) {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${field} debe ser número ≥ 0` }
    }
    return { ok: true, value: n }
  }
  if (SIGNED_NUM_FIELDS.has(field)) {
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'))
    if (!Number.isFinite(n)) return { ok: false, error: `${field} debe ser número` }
    if (field === 'lat' && (n < -90  || n > 90))  return { ok: false, error: 'lat fuera de rango [-90, 90]' }
    if (field === 'lng' && (n < -180 || n > 180)) return { ok: false, error: 'lng fuera de rango [-180, 180]' }
    return { ok: true, value: n }
  }
  if (DATE_FIELDS.has(field)) {
    if (typeof raw !== 'string') return { ok: false, error: `${field} debe ser string ISO YYYY-MM-DD` }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { ok: false, error: `${field} formato inválido (YYYY-MM-DD)` }
    return { ok: true, value: raw }
  }
  if (TEXT_FIELDS.has(field)) {
    if (typeof raw !== 'string') return { ok: false, error: `${field} debe ser string` }
    if (field === 'nombre') {
      const v = raw.trim()
      if (!v) return { ok: false, error: 'nombre vacío' }
      return { ok: true, value: v.slice(0, 200) }
    }
    return { ok: true, value: raw.trim() || null }
  }
  return { ok: false, error: `Campo desconocido: ${field}` }
}

async function loadCapa(
  db:     ReturnType<typeof getSupabaseAdmin>,
  n:      number,
  capaId: number,
): Promise<{ data: DesalojoCapa | null; error: string | null }> {
  const { data, error } = await db
    .from('desalojo_capas')
    .select('*')
    .eq('id', capaId)
    .maybeSingle()
  if (error)                              return { data: null, error: error.message }
  if (!data)                              return { data: null, error: `Capa #${capaId} no encontrada` }
  if (data.prioridad_id !== n)            return { data: null, error: 'Capa no pertenece al caso' }
  return { data: data as DesalojoCapa, error: null }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ n: string; capa_id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, capa_id: cStr } = await context.params
  const n      = Number(nStr)
  const capaId = Number(cStr)
  if (!Number.isFinite(n)      || n      <= 0) return NextResponse.json({ error: 'Invalid n' },       { status: 400 })
  if (!Number.isFinite(capaId) || capaId <= 0) return NextResponse.json({ error: 'Invalid capa_id' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: capa, error } = await loadCapa(db, n, capaId)
  if (error || !capa) return NextResponse.json({ error: error ?? 'No encontrado' }, { status: error?.startsWith('Capa #') ? 404 : 500 })
  return NextResponse.json({ capa })
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ n: string; capa_id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, capa_id: cStr } = await context.params
  const n      = Number(nStr)
  const capaId = Number(cStr)
  if (!Number.isFinite(n)      || n      <= 0) return NextResponse.json({ error: 'Invalid n' },       { status: 400 })
  if (!Number.isFinite(capaId) || capaId <= 0) return NextResponse.json({ error: 'Invalid capa_id' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const db = getSupabaseAdmin()
  const { data: prev, error: readErr } = await loadCapa(db, n, capaId)
  if (readErr || !prev) {
    return NextResponse.json({ error: readErr ?? 'Capa no encontrada' }, { status: readErr?.startsWith('Capa #') ? 404 : 500 })
  }

  const patch: Record<string, AnyVal> = {}
  const errors: string[] = []

  for (const [key, raw] of Object.entries(body)) {
    if (key === 'tipologia' || key === 'fase_actual') continue
    if (!TEXT_FIELDS.has(key) && !DATE_FIELDS.has(key) && !INT_FIELDS.has(key) &&
        !NUM_FIELDS.has(key)  && !SIGNED_NUM_FIELDS.has(key) && !BOOL_FIELDS.has(key)) {
      continue
    }
    const r = coerce(key, raw)
    if (!r.ok) errors.push(r.error)
    else       patch[key] = r.value
  }

  // ── Tipología ─────────────────────────────────────────────────────────
  if ('tipologia' in body) {
    const raw = body.tipologia
    if (raw !== null && (typeof raw !== 'string' || !TIPOLOGIAS.has(raw as DesalojoTipologia))) {
      errors.push('tipologia debe ser A|B|C|D o null')
    } else {
      const nueva = (raw as DesalojoTipologia | null) ?? null
      patch.tipologia = nueva
      if (nueva !== prev.tipologia) {
        patch.tipologia_asignada_at = nueva === null ? null : new Date().toISOString()
      }
    }
  }

  // ── Responsables: shallow merge por rol_key ───────────────────────────
  // El cliente manda `responsables_patch: { [rol_key]: { ... } | null }`.
  // null elimina el rol del JSONB; objeto completo lo agrega/reemplaza.
  // Huérfanos por cambio de tipología NO se borran acá — solo el cliente
  // puede pedirlo explícitamente.
  if ('responsables_patch' in body) {
    const raw = body.responsables_patch
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push('responsables_patch debe ser un objeto')
    } else {
      const merged: DesalojoResponsables = { ...(prev.responsables ?? {}) }
      const patchObj = raw as Record<string, unknown>
      let invalid = false
      for (const [rolKey, value] of Object.entries(patchObj)) {
        if (typeof rolKey !== 'string' || !/^[a-z0-9_]+$/.test(rolKey)) {
          errors.push(`rol_key inválido: ${rolKey}`)
          invalid = true
          continue
        }
        if (value === null) {
          delete merged[rolKey]
          continue
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`responsable ${rolKey} debe ser objeto o null`)
          invalid = true
          continue
        }
        const v = value as Record<string, unknown>
        const nombre = typeof v.nombre === 'string' ? v.nombre.trim() : ''
        if (!nombre) {
          errors.push(`responsable ${rolKey}: nombre requerido`)
          invalid = true
          continue
        }
        const resp: DesalojoResponsable = {
          nombre,
          institucion: typeof v.institucion === 'string' && v.institucion.trim() ? v.institucion.trim() : null,
          email:       typeof v.email       === 'string' && v.email.trim()       ? v.email.trim()       : null,
          telefono:    typeof v.telefono    === 'string' && v.telefono.trim()    ? v.telefono.trim()    : null,
          notas:       typeof v.notas       === 'string' && v.notas.trim()       ? v.notas.trim()       : null,
        }
        merged[rolKey] = resp
      }
      if (!invalid) {
        // Almacenamos el objeto completo (no diff): merge ya fue resuelto arriba.
        // Lo guardamos en patch con casting porque la columna es JSONB.
        ;(patch as Record<string, unknown>).responsables = merged
      }
    }
  }

  // ── Fase: avance con bloqueo PR → F1, con soft-override por justificación ──
  // Política (decisión 2026-06-22): el avance PR → F1 ya no es bloqueante duro.
  // Si faltan ítems, el server devuelve `requires_justification: true` con los
  // motivos. El cliente abre un modal pidiendo una justificación obligatoria; si
  // se reintenta el PATCH con `justificacion_avance: '<texto>'`, el avance se
  // ejecuta y se loggea como `fase_actual_override` en el audit log.
  let overrideJustificacion: string | null = null
  if ('justificacion_avance' in body) {
    const raw = body.justificacion_avance
    if (raw !== null && raw !== undefined && raw !== '') {
      if (typeof raw !== 'string') {
        errors.push('justificacion_avance debe ser string')
      } else {
        const trimmed = raw.trim()
        if (trimmed.length < 10) {
          errors.push('justificacion_avance debe tener al menos 10 caracteres')
        } else {
          overrideJustificacion = trimmed.slice(0, 1000)
        }
      }
    }
  }

  let advanceMissingReasons: string[] | null = null
  if ('fase_actual' in body) {
    const raw = body.fase_actual
    if (typeof raw !== 'string' || !FASES_ALL.has(raw as DesalojoFase)) {
      errors.push('fase_actual inválida')
    } else {
      const nueva = raw as DesalojoFase
      if (nueva !== prev.fase_actual) {
        if (prev.fase_actual === 'pr' && nueva === 'f1') {
          const [{ data: fasesEstado }, { data: docs }] = await Promise.all([
            db.from('desalojo_fase_estado').select('*').eq('capa_id', capaId),
            db.from('desalojo_documentos').select('capa_id, fase, item_key').eq('capa_id', capaId).eq('fase', 'pr'),
          ])
          const check = canAdvanceFase(
            prev,
            (fasesEstado ?? []) as DesalojoFaseEstado[],
            nueva,
            (docs ?? []) as Array<{ capa_id: number | null; fase: 'pr' | 'f1' | 'f2' | 'f3' | 'f4' | 'f5' | null; item_key: string | null }>,
          )
          if (!check.ok) {
            if (!overrideJustificacion) {
              return NextResponse.json(
                {
                  error:                   'Avance requiere justificación',
                  reasons:                 check.reasons,
                  requires_justification:  true,
                },
                { status: 400 },
              )
            }
            advanceMissingReasons = check.reasons
          }
        }
        patch.fase_actual = nueva
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 })
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Sin campos válidos para actualizar' }, { status: 400 })
  }

  const { data: updated, error: updErr } = await db
    .from('desalojo_capas')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', capaId)
    .select('*')
    .single()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Update falló' }, { status: 500 })
  }

  // Audit log: una fila por campo cambiado (skip los que quedaron igual).
  const logRows: Array<Record<string, unknown>> = []
  for (const [campo, valorNuevo] of Object.entries(patch)) {
    const anterior = (prev as Record<string, unknown>)[campo]
    // JSONB: serializa para comparar y persistir como texto en el log.
    if (campo === 'responsables') {
      const antStr = JSON.stringify(anterior ?? {})
      const newStr = JSON.stringify(valorNuevo ?? {})
      if (antStr === newStr) continue
      logRows.push({
        prioridad_id:   n,
        capa_id:        capaId,
        fase:           null,
        campo,
        valor_anterior: antStr,
        valor_nuevo:    newStr,
        cambiado_por:   profile.email || null,
      })
      continue
    }
    if (anterior === valorNuevo) continue
    logRows.push({
      prioridad_id:   n,
      capa_id:        capaId,
      fase:           null,    // cambio a nivel capa, no fase
      campo,
      valor_anterior: anterior !== null && anterior !== undefined ? String(anterior) : null,
      valor_nuevo:    valorNuevo === null ? '' : String(valorNuevo),
      cambiado_por:   profile.email || null,
    })
  }
  if (logRows.length > 0) {
    const { error: logErr } = await db.from('desalojo_log').insert(logRows)
    if (logErr) console.error('[desalojos.capa.patch] log insert falló:', logErr)
  }

  // Audit extra cuando el avance se hizo con justificación (soft-override).
  if (overrideJustificacion && advanceMissingReasons && patch.fase_actual) {
    const payload = JSON.stringify({
      destino:         patch.fase_actual,
      justificacion:   overrideJustificacion,
      items_faltantes: advanceMissingReasons,
    })
    const { error: ovErr } = await db.from('desalojo_log').insert({
      prioridad_id:   n,
      capa_id:        capaId,
      fase:           prev.fase_actual === 'pr' ? 'pr' : null,
      campo:          'fase_actual_override',
      valor_anterior: prev.fase_actual,
      valor_nuevo:    payload,
      cambiado_por:   profile.email || null,
    })
    if (ovErr) console.error('[desalojos.capa.patch] override log insert falló:', ovErr)
  }

  return NextResponse.json({ ok: true, capa: updated })
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ n: string; capa_id: string }> },
) {
  const profile = await requireAuth()
  if (!profile)                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (profile.role !== 'admin')  return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const { n: nStr, capa_id: cStr } = await context.params
  const n      = Number(nStr)
  const capaId = Number(cStr)
  if (!Number.isFinite(n)      || n      <= 0) return NextResponse.json({ error: 'Invalid n' },       { status: 400 })
  if (!Number.isFinite(capaId) || capaId <= 0) return NextResponse.json({ error: 'Invalid capa_id' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: prev, error: readErr } = await loadCapa(db, n, capaId)
  if (readErr || !prev) {
    return NextResponse.json({ error: readErr ?? 'Capa no encontrada' }, { status: readErr?.startsWith('Capa #') ? 404 : 500 })
  }
  if (!prev.activa) {
    return NextResponse.json({ ok: true, capa: prev, noop: true })
  }

  const { data: updated, error: updErr } = await db
    .from('desalojo_capas')
    .update({ activa: false, updated_at: new Date().toISOString() })
    .eq('id', capaId)
    .select('*')
    .single()
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? 'Archivado falló' }, { status: 500 })
  }

  await db.from('desalojo_log').insert({
    prioridad_id:   n,
    capa_id:        capaId,
    fase:           null,
    campo:          'activa',
    valor_anterior: 'true',
    valor_nuevo:    'false',
    cambiado_por:   profile.email || null,
  })

  return NextResponse.json({ ok: true, capa: updated })
}
