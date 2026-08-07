'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { GabineteTema } from '@/lib/types'

/**
 * "Temas a tratar" PENDIENTES del Gabinete Regional (mig 053): las filas con
 * sesion_id NULL de la región. Alimentan la tarjeta de Preparación, la zona
 * de lectura de la sesión de gabinete y el gate del botón Cronograma.
 * Patrón useCatalogoComite: `enabled` — con false no toca la red.
 *
 * Cache a nivel de módulo (stale-while-revalidate, mismo patrón que
 * useRegionConfig): KanbanView se remonta en cada entrada a Gabinete y sin
 * cache los temas guardados aparecían con delay (la tarjeta arrancaba con
 * filas vacías y los temas "llegaban" después). El setter devuelto escribe
 * también al cache, así las mutaciones del panel no quedan stale al remontar.
 */

const _cache = new Map<string, GabineteTema[]>()

function normalizar(data: unknown[]): GabineteTema[] {
  // subitems es JSONB (mig 054) — normalización defensiva a string[].
  return (data as GabineteTema[]).map(t => ({
    ...t,
    subitems: Array.isArray(t.subitems) ? t.subitems : [],
    fijo: t.fijo ?? false,   // mig 057 (defensivo para filas pre-migración)
  }))
}

export function useTemasGabinete(regionCod: string | null, enabled: boolean) {
  const [temas, setTemasState] = useState<GabineteTema[]>(() => (regionCod && _cache.get(regionCod)) || [])
  const [loading, setLoading]  = useState(enabled && !(regionCod && _cache.has(regionCod)))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !regionCod) return
    let cancelled = false
    async function load() {
      const { data } = await getSupabase()
        .from('gabinete_temas').select('*')
        .eq('region_cod', regionCod!).is('sesion_id', null)
        .order('orden').order('id')
      if (cancelled) return
      const next = normalizar(data ?? [])
      _cache.set(regionCod!, next)
      setTemasState(next)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, enabled, reloadKey])

  // Al cambiar de región, parte del cache de la nueva (o vacío) — evita fuga
  // de temas de otra región mientras revalida.
  useEffect(() => {
    setTemasState((regionCod && _cache.get(regionCod)) || [])
    setLoading(enabled && !(regionCod && _cache.has(regionCod)))
  }, [regionCod]) // eslint-disable-line react-hooks/exhaustive-deps

  // Setter que mantiene el cache en sync con las mutaciones optimistas del
  // panel (INSERT/UPDATE/DELETE via safeWrite).
  const setTemas = useCallback<Dispatch<SetStateAction<GabineteTema[]>>>(action => {
    setTemasState(prev => {
      const next = typeof action === 'function' ? action(prev) : action
      if (regionCod) _cache.set(regionCod, next)
      return next
    })
  }, [regionCod])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  return { temas, setTemas, loading, refresh }
}
