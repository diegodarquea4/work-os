/**
 * Autorización de LECTURA de desalojos por región.
 *
 * Las rutas /api/desalojos/* usan service-role (getSupabaseAdmin), que bypassa
 * RLS — así que el control de acceso vive acá, en la capa API. Regla:
 *   - admin           → lee todo (y edita: las rutas de escritura siguen admin-only).
 *   - regional        → lee SOLO los desalojos de sus region_cods (solo-lectura).
 *   - viewer nacional → lee todo, solo-lectura (sin region_cods = sin filtro, igual
 *                       que ve el resto del panel).
 *   - viewer filtrado → lee SOLO los de sus region_cods, solo-lectura.
 *   - resto (editor)  → sin acceso.
 *
 * Un desalojo se enlaza por prioridad_id = prioridades_territoriales.n; la
 * región es prioridades_territoriales.cod.
 */

import type { UserProfile } from './apiAuth'
import type { getSupabaseAdmin } from './supabaseServer'

type Db = ReturnType<typeof getSupabaseAdmin>

/** cod de región de un desalojo (via prioridad n), o null si la prioridad no existe. */
export async function desalojoRegionCod(db: Db, n: number): Promise<string | null> {
  const { data } = await db
    .from('prioridades_territoriales')
    .select('cod')
    .eq('n', n)
    .maybeSingle()
  return (data as { cod: string } | null)?.cod ?? null
}

/**
 * ¿Puede este perfil LEER el desalojo n?
 *   admin → sí; viewer nacional (sin region_cods) → sí; regional / viewer
 *   filtrado → sí si el caso es de su región; editor → no.
 */
export async function canReadDesalojo(profile: UserProfile, db: Db, n: number): Promise<boolean> {
  if (profile.role === 'admin') return true
  // viewer nacional (sin region_cods) ve todo, solo-lectura.
  if (profile.role === 'viewer' && profile.region_cods.length === 0) return true
  if (profile.role === 'regional' || profile.role === 'viewer') {
    const cod = await desalojoRegionCod(db, n)
    return !!cod && profile.region_cods.includes(cod)
  }
  return false
}

/**
 * Mapa n → cod para un conjunto de prioridades (batch, una query). Lo usa el
 * listado para scopear los casos a la región del regional.
 */
export async function regionCodByPrioridad(db: Db, ns: number[]): Promise<Map<number, string>> {
  const out = new Map<number, string>()
  if (ns.length === 0) return out
  const { data } = await db
    .from('prioridades_territoriales')
    .select('n, cod')
    .in('n', ns)
  for (const row of (data ?? []) as { n: number; cod: string }[]) {
    if (row.cod) out.set(row.n, row.cod)
  }
  return out
}
