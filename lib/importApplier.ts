/**
 * Lógica de aplicación de imports masivos sobre `prioridades_territoriales`.
 *
 * Extraída para que `/api/import` (flow directo del Dashboard) y
 * `/api/proposals/[id]/approve` (flow de propuesta aprobada) ejecuten
 * exactamente el mismo loop sin duplicación.
 *
 * Aplica check de permisos por región (`canWrite`) antes de cada operación
 * y bulk-inserta en lotes de 200 para no agotar el timeout de Vercel.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canWrite, type UserProfile } from './apiAuth'

const INSERT_BATCH_SIZE = 200

export type ImportPayload = {
  updates: Array<{ n: number; patch: Record<string, unknown> }>
  inserts: Array<Record<string, unknown>>
}

export type ApplyResult = {
  inserted:        number
  updated:         number
  errors:          string[]
  regions_touched: string[]
}

/**
 * Aplica el payload contra `prioridades_territoriales`.
 *
 * Best-effort: si algunas filas fallan, las demás siguen. Los errores quedan
 * acumulados en `errors[]` con mensajes interpretables.
 *
 * El caller decide si esto es source='direct' o source='proposal' al escribir
 * el `import_log` con el resultado.
 */
export async function applyImport(
  db: SupabaseClient,
  profile: UserProfile,
  payload: ImportPayload,
): Promise<ApplyResult> {
  const errors: string[] = []
  const regionsTouched = new Set<string>()
  let updated = 0
  let inserted = 0

  // ── UPDATES ────────────────────────────────────────────────────────────────
  for (const { n, patch } of payload.updates) {
    // Para regional: verificamos que la fila pertenezca a una región autorizada.
    if (profile.role === 'regional') {
      const { data: row } = await db
        .from('prioridades_territoriales')
        .select('region')
        .eq('n', n)
        .single()
      if (!row || !canWrite(profile, row.region as string)) {
        errors.push(`#${n}: sin permiso para editar esta región`)
        continue
      }
      regionsTouched.add(row.region as string)
    } else {
      // admin/editor: recuperamos la región solo para el log.
      const { data: row } = await db
        .from('prioridades_territoriales')
        .select('region')
        .eq('n', n)
        .single()
      if (row?.region) regionsTouched.add(row.region as string)
    }

    const { error } = await db
      .from('prioridades_territoriales')
      .update(patch)
      .eq('n', n)
    if (error) errors.push(`#${n}: ${error.message}`)
    else updated++
  }

  // ── INSERTS ────────────────────────────────────────────────────────────────
  if (payload.inserts.length > 0) {
    // Filtramos por permiso antes de armar los batches.
    const allowed: Record<string, unknown>[] = []
    for (const row of payload.inserts) {
      const regionNombre = row.region as string | undefined
      if (!canWrite(profile, regionNombre)) {
        errors.push(`"${row.nombre}": sin permiso para insertar en esta región`)
      } else {
        allowed.push(row)
        if (regionNombre) regionsTouched.add(regionNombre)
      }
    }

    for (let i = 0; i < allowed.length; i += INSERT_BATCH_SIZE) {
      const batch = allowed.slice(i, i + INSERT_BATCH_SIZE)
      const { error } = await db.from('prioridades_territoriales').insert(batch)
      if (error) {
        errors.push(`Batch ${Math.floor(i / INSERT_BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        inserted += batch.length
      }
    }
  }

  return {
    inserted,
    updated,
    errors,
    regions_touched: Array.from(regionsTouched),
  }
}

/**
 * Escribe el resumen de la aplicación a `import_log` con best-effort:
 * si el insert falla, lo logueamos a console y seguimos. La idea es que el
 * resumen del response al cliente no se rompa por un problema de auditoría.
 */
export async function recordImportLog(
  db: SupabaseClient,
  profile: UserProfile,
  source: 'direct' | 'proposal',
  result: ApplyResult,
  durationMs: number,
  proposalId?: number,
): Promise<void> {
  try {
    await db.from('import_log').insert({
      applied_by_id:    profile.id,
      applied_by_email: profile.email,
      source,
      proposal_id:      proposalId ?? null,
      inserted_count:   result.inserted,
      updated_count:    result.updated,
      error_count:      result.errors.length,
      errors:           result.errors.length > 0 ? result.errors : null,
      regions_touched:  result.regions_touched,
      duration_ms:      durationMs,
    })
  } catch (logErr) {
    console.error('[recordImportLog] failed (non-blocking)', logErr)
  }
}
