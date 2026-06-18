/**
 * Wrapper de observabilidad para handlers de sync.
 *
 * Cubre el hallazgo 6.7 de la auditoría: SEIA estuvo 53 días caído sin
 * que nadie se enterara. Hoy sólo seia-sync y mop-sync persisten resultado
 * en sync_status; el resto es fire-and-forget.
 *
 * Este wrapper se aplica a TODOS los syncs sin tocar su lógica interna:
 *
 *   // Antes:
 *   return runSync()
 *
 *   // Después:
 *   return withSyncStatus('ine', runSync)
 *
 * Lo que hace:
 *   1. Ejecuta runSync() midiendo duración.
 *   2. Si lanza, captura el error y devuelve 500.
 *   3. Después de obtener la Response, la clona para leer el body y
 *      derivar { status, rows, errors }.
 *   4. Llama recordSyncStatus(name, ...) en background. Si falla, sólo
 *      log a consola (no afecta la response al cron/usuario).
 *   5. Devuelve la Response original SIN MODIFICAR.
 *
 * Inferencias sobre el body:
 *   - body.ok === false → 'error'.
 *   - HTTP >= 400       → 'error'.
 *   - errors.length > 0 → 'partial'.
 *   - resto             → 'ok'.
 *   - rows ← upserted | rows | upserted_total | 0.
 *   - notes ← note | notes.
 *
 * Estos campos cubren los formatos de respuesta que ya usan los syncs
 * vigentes (seia, mop, ine, stop, etc.). Si un sync nuevo devuelve un
 * shape distinto, sync_status anotará rows=0 status=ok, lo cual es OK
 * (igual queda el last_run_at fresco).
 *
 * Etapa 3 de la consolidación backend.
 */

import { recordSyncStatus } from './syncStatus'

export async function withSyncStatus(
  name: string,
  runSync: () => Promise<Response>,
): Promise<Response> {
  const startedAt = Date.now()
  let response: Response

  try {
    response = await runSync()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[withSyncStatus] ${name}: handler lanzó excepción`, err)
    response = Response.json(
      { ok: false, error: msg, sync: name },
      { status: 500 },
    )
  }

  // Persistir status — await acotado por timeout. Pre-O-04 era fire-and-forget
  // (`void ... catch`), pero en Vercel la función puede congelarse tras Response
  // y perder la escritura (síntoma SEIA mayo 2026). Awaitearlo sin techo
  // hacía que un Supabase lento bloqueara el cron completo: cubrimos los dos
  // riesgos con un race de 5s — durabilidad cuando Supabase responde, no
  // bloqueo cuando no.
  try {
    await Promise.race([
      persistFromResponse(name, startedAt, response),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('timeout 5s persistFromResponse')), 5000),
      ),
    ])
  } catch (e) {
    console.warn(`[withSyncStatus] ${name}: no pude persistir sync_status:`, e)
  }

  return response
}

async function persistFromResponse(
  name: string,
  startedAt: number,
  response: Response,
): Promise<void> {
  // Clonar para no consumir el body original.
  let body: Record<string, unknown> | null = null
  try {
    body = await response.clone().json()
  } catch {
    // Body no es JSON o no se pudo leer — seguimos con body = null.
  }

  const httpStatus = response.status
  const ok = (body as { ok?: boolean } | null)?.ok
  const errors = (body as { errors?: unknown } | null)?.errors as
    | string[]
    | undefined
  const errCount = Array.isArray(errors) ? errors.length : 0

  const status: 'ok' | 'partial' | 'error' =
    httpStatus >= 400 || ok === false
      ? 'error'
      : errCount > 0
        ? 'partial'
        : 'ok'

  // Heurística para extraer rows. Los syncs vigentes usan estos nombres.
  const b = body as
    | {
        upserted?: number
        rows?: number
        upserted_total?: number
        new_semanas?: number
        note?: string
        notes?: string
      }
    | null
  const rows =
    b?.upserted ??
    b?.rows ??
    b?.upserted_total ??
    b?.new_semanas ??
    0

  await recordSyncStatus(name, {
    status,
    durationMs: Date.now() - startedAt,
    rows,
    errors: errCount > 0 ? errors : undefined,
    notes: b?.note ?? b?.notes,
  })
}
