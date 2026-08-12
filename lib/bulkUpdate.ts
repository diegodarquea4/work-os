import { getSupabase } from '@/lib/supabase'
import { safeAuditWrite } from '@/lib/dbWrite'
import type { Iniciativa } from '@/lib/projects'

/**
 * Edición masiva de iniciativas desde el cliente (barra de acción del Dashboard).
 *
 * Reusa el MISMO camino de escritura que la ficha uno-a-uno — no hay ruta API ni
 * tabla nueva. El trigger `prioridades_check_update` (mig 023+027) sigue siendo
 * el guardia por rol/columna: si un regional intenta un campo definicional el
 * UPDATE levanta SQLSTATE 42501 y se propaga como throw. La llave de escritura es
 * `id` (PK estable), nunca `n` (que NO es UNIQUE) — ver lib/projects.ts.
 */

/** Tamaño de lote del UPDATE masivo. Igual que INSERT_BATCH_SIZE del import: un
 *  `.in('id', [...])` con cientos de valores es una sola query, pero troceamos
 *  para no armar filtros gigantes y acotar el impacto de un fallo puntual. */
const CHUNK = 200

export type BulkUpdateResult = {
  /** Filas realmente afectadas por el UPDATE. */
  ok: number
  /** Pedidas − afectadas: filas que RLS bloqueó en silencio (HTTP 200) o que ya
   *  no existían. Alimenta el aviso "N sin cambios por permisos". */
  sinCambio: number
}

/**
 * Aplica `patch` a todas las `targets` de una vez. Cuenta las filas afectadas
 * (`data.length`) por lote para detectar bloqueos silenciosos de RLS (Supabase
 * devuelve 200 con menos filas de las pedidas). Un `error` de cualquier lote
 * (p. ej. el trigger de rol) aborta y se relanza para que el call-site lo
 * muestre y mantenga la selección.
 *
 * Auditoría: si el patch cambia `estado_semaforo`, inserta en `semaforo_log`
 * (best-effort, no bloqueante) una fila por target cuyo valor previo difería —
 * preservando el trail que hoy escribe la ficha. Los otros campos del núcleo
 * (etapa/capa/responsable/en_foco) no se auditan hoy, así que el masivo tampoco.
 */
export async function applyBulkUpdate(
  targets: Iniciativa[],
  patch: Partial<Iniciativa>,
  email: string | null,
): Promise<BulkUpdateResult> {
  const sb = getSupabase()
  let ok = 0

  for (let i = 0; i < targets.length; i += CHUNK) {
    const ids = targets.slice(i, i + CHUNK).map(t => t.id)
    const { data, error } = await sb
      .from('prioridades_territoriales')
      .update(patch)
      .in('id', ids)
      .select('id')
    if (error) {
      // 42501 = el trigger de rol rechazó la columna; cualquier error aborta.
      throw new Error(`No se pudo aplicar el cambio masivo: ${error.message}`)
    }
    ok += data?.length ?? 0
  }

  // Auditoría de semáforo (best-effort). Solo si el patch toca estado_semaforo.
  if (patch.estado_semaforo !== undefined) {
    const nuevo = patch.estado_semaforo
    const rows = targets
      .filter(t => t.estado_semaforo !== nuevo)
      .map(t => ({
        prioridad_id:   t.n,   // FK lógica de semaforo_log sigue apuntando a n
        campo:          'semaforo',
        valor_anterior: t.estado_semaforo,
        valor_nuevo:    nuevo,
        cambiado_por:   email,
      }))
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      await safeAuditWrite(
        sb.from('semaforo_log').insert(slice),
        `semaforo_log masivo (${slice.length} filas)`,
      )
    }
  }

  return { ok, sinCambio: targets.length - ok }
}
