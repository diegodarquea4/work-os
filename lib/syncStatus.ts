import { getSupabaseAdmin } from './supabaseServer'

type SyncResult = {
  status:        'ok' | 'partial' | 'error'
  durationMs:    number
  rows:          number
  errors?:       string[]
  notes?:        string
}

/**
 * Persiste el resultado de un sync en `sync_status` (1 fila por nombre,
 * upsert). Lo usan los handlers de SEIA, MOP (y futuro otros) al final
 * de su run para que `MAX(synced_at)` en la tabla de datos ya no sea
 * el único termómetro.
 *
 * Defensivo: si la escritura falla, lo loguea pero NO throw — un fallo
 * de telemetría no debe abortar la response del sync. El payload original
 * sigue siendo la fuente de verdad para Vercel logs.
 */
export async function recordSyncStatus(name: string, result: SyncResult): Promise<void> {
  const errorCount = result.errors?.length ?? 0
  const sample = errorCount > 0
    ? JSON.stringify(result.errors!.slice(0, 3))
    : null

  const { error } = await getSupabaseAdmin()
    .from('sync_status')
    .upsert({
      name,
      last_run_at:       new Date().toISOString(),
      last_status:       result.status,
      last_duration_ms:  result.durationMs,
      last_rows:         result.rows,
      last_error_count:  errorCount,
      last_error_sample: sample,
      notes:             result.notes ?? null,
    }, { onConflict: 'name' })

  if (error) {
    console.error(`[sync-status] No se pudo persistir status de '${name}':`, error.message)
  }
}
