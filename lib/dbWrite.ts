/**
 * Helpers defensivos para escrituras desde el cliente Supabase.
 *
 * Cubre el bug-pattern documentado el 29-may-2026: cuando una política RLS
 * bloquea una mutación, Supabase devuelve HTTP 200 con `data: []` en vez de
 * un error explícito. Sin chequear `data.length` el componente cree éxito y
 * el estado local diverge del servidor. Esta familia de bugs fue la causa
 * raíz del incidente "el flag en_foco no persiste pero la UI muestra éxito".
 *
 * Tres helpers:
 *   - safeWrite(builder, ctx)      → UPDATE / INSERT estrictos. Exige data.length ≥ 1.
 *   - safeDelete(builder, ctx)     → DELETE idempotente. Acepta data.length === 0
 *                                    pero propaga errores explícitos.
 *   - safeAuditWrite(builder, ctx) → audit logs (semaforo_log, desalojo_log).
 *                                    No bloquea la operación principal; solo
 *                                    warning si falla.
 *
 * El call-site captura el throw, revierte cualquier optimistic update local,
 * y usa el mecanismo de feedback EXISTENTE del componente (window.alert /
 * estado de error). No introducimos UX nueva — eso queda fuera de alcance
 * de la consolidación.
 *
 * Etapa 1 de la consolidación backend.
 */

/**
 * Forma estructural mínima del builder de @supabase/postgrest-js. Después
 * de `.from().update/insert/delete().eq()` el tipo concreto es complejo y
 * no se exporta limpio; capturamos solo lo que necesitamos: que tenga un
 * método `.select(...)` que devuelva `{ data, error }`.
 */
export type PostMutationBuilder = {
  select(columns?: string): PromiseLike<{
    data: unknown[] | null
    error: { message: string; code?: string } | null
  }>
}

/**
 * Error tipado para que el call-site pueda distinguir errores de dbWrite
 * vs otros (network, lógica de negocio, etc.). Ningún consumer actual
 * necesita ramificar — pero el tipado deja la puerta abierta.
 */
export class DbWriteError extends Error {
  constructor(
    message: string,
    public readonly ctx: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'DbWriteError'
  }
}

/**
 * Strict: la mutación DEBE afectar al menos 1 fila. UPDATE/INSERT con
 * permisos y un WHERE que matchee siempre devuelven ≥ 1 fila. Si devuelve
 * 0, es uno de estos casos:
 *   - RLS bloqueó la operación (silenciosamente con HTTP 200).
 *   - El WHERE no matcheó (registro eliminado por otro usuario, n inválido).
 *
 * Cualquiera de los dos es un error que el usuario debe ver. Lanza
 * DbWriteError con mensaje legible para mostrar via window.alert.
 *
 * @param builder Builder ya construido con .from().update/insert().eq()
 * @param ctx     String corto descriptivo para logs (ej: "pct_avance n=42")
 * @returns Las filas afectadas (puede usarse para confirmar o ignorar)
 */
export async function safeWrite(
  builder: PostMutationBuilder,
  ctx: string,
): Promise<unknown[]> {
  const { data, error } = await builder.select('*')
  if (error) {
    console.error(`[dbWrite] ${ctx}: error de DB`, error)
    throw new DbWriteError(`No se pudo guardar: ${error.message}`, ctx, error)
  }
  if (!data || data.length === 0) {
    console.error(`[dbWrite] ${ctx}: 0 filas afectadas (probable RLS o WHERE sin match)`)
    throw new DbWriteError(
      'No se pudo guardar: la operación no afectó filas. Probablemente no tienes permiso o el registro fue eliminado.',
      ctx,
    )
  }
  return data
}

/**
 * Lenient para DELETE: si la fila ya no existe es OK (idempotencia — borrar
 * algo que ya no está no es un error). Solo propaga errores explícitos
 * (network, sintaxis SQL, etc.).
 *
 * Nota: para detectar RLS bloqueando DELETE, no se puede usar data.length
 * porque también vale 0 cuando la fila ya estaba borrada. Si el bloqueo
 * por permisos es importante de detectar en este flujo, usar safeWrite.
 */
export async function safeDelete(
  builder: PostMutationBuilder,
  ctx: string,
): Promise<void> {
  const { error } = await builder.select('*')
  if (error) {
    console.error(`[dbWrite] ${ctx}: error en DELETE`, error)
    throw new DbWriteError(`No se pudo eliminar: ${error.message}`, ctx, error)
  }
}

/**
 * Para audit logs (semaforo_log, desalojo_log): NO bloquea la operación
 * principal. Si RLS o lo que sea impide persistir el log, solo warning a
 * consola. La mutación de negocio ya ocurrió; perder telemetría es
 * preferible a romperle al usuario una operación que sí fue exitosa.
 */
export async function safeAuditWrite(
  builder: PostMutationBuilder,
  ctx: string,
): Promise<void> {
  try {
    const { data, error } = await builder.select('id')
    if (error) {
      console.warn(`[dbWrite/audit] ${ctx}: error al persistir log`, error)
      return
    }
    if (!data || data.length === 0) {
      console.warn(`[dbWrite/audit] ${ctx}: log no persistido (probable RLS)`)
    }
  } catch (err) {
    console.warn(`[dbWrite/audit] ${ctx}: excepción inesperada`, err)
  }
}
