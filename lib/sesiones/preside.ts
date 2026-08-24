import type { getSupabaseAdmin } from '@/lib/supabaseServer'
import type { EjeSesion } from '@/lib/types'

/**
 * Resolución de «Preside» del acta (mig 077).
 *
 * Regla: se prefiere la persona marcada `preside` en la nómina del alcance
 * (región + instancia [+ eje para 'eje']); si no hay ninguna marcada, se cae al
 * derivado por email de siempre (closed_by_email ?? created_by_email; en preview
 * el email de quien mira). El índice único uq_sesion_nomina_preside garantiza
 * ≤1 preside activo por alcance → maybeSingle es seguro.
 */

type Db = ReturnType<typeof getSupabaseAdmin>
export type PresideOpts = { preview: boolean; currentUserEmail?: string | null }
export type PresideHit = { nombre: string; cargo: string | null }

/** Etiqueta del preside: "Nombre · Cargo" o solo "Nombre". */
export function presideLabel(nombre: string, cargo: string | null): string {
  const n = nombre.trim()
  const c = (cargo ?? '').trim()
  return c ? `${n} · ${c}` : n
}

/** Derivado histórico por email — el comportamiento previo a mig 077. */
export function presideFallback(
  sesion: Pick<EjeSesion, 'created_by_email' | 'closed_by_email'>,
  opts: PresideOpts,
): string | null {
  return opts.preview
    ? (opts.currentUserEmail ?? sesion.created_by_email)
    : (sesion.closed_by_email ?? sesion.created_by_email)
}

/** Precedencia pura: fila de nómina marcada preside > fallback por email. */
export function presideResuelto(hit: PresideHit | null, fallback: string | null): string | null {
  if (hit && hit.nombre.trim()) return presideLabel(hit.nombre, hit.cargo)
  return fallback
}

/**
 * Resuelve «Preside» consultando la nómina del alcance. Pensado para entrar en
 * el `Promise.all` de cada generador de acta (sin round-trip extra).
 */
export async function resolvePreside(db: Db, sesion: EjeSesion, opts: PresideOpts): Promise<string | null> {
  let q = db.from('sesion_nomina').select('nombre, cargo')
    .eq('region_cod', sesion.region_cod)
    .eq('instancia', sesion.instancia)
    .eq('preside', true)
    .eq('activo', true)
  q = sesion.eje_id != null ? q.eq('eje_id', sesion.eje_id) : q.is('eje_id', null)
  const { data } = await q.limit(1).maybeSingle()
  return presideResuelto((data as PresideHit | null) ?? null, presideFallback(sesion, opts))
}
