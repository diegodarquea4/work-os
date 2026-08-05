'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { GabineteTema } from '@/lib/types'

/**
 * "Temas a tratar" PENDIENTES del Gabinete Regional (mig 053): las filas con
 * sesion_id NULL de la región. Alimentan la tarjeta de Preparación, la zona
 * de lectura de la sesión de gabinete y el gate del botón Cronograma.
 * Patrón useCatalogoComite: `enabled` — con false no toca la red.
 */
export function useTemasGabinete(regionCod: string | null, enabled: boolean) {
  const [temas, setTemas]   = useState<GabineteTema[]>([])
  const [loading, setLoading] = useState(enabled)
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
      // subitems es JSONB (mig 054) — normalización defensiva a string[].
      setTemas(((data ?? []) as GabineteTema[]).map(t => ({
        ...t,
        subitems: Array.isArray(t.subitems) ? t.subitems : [],
      })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, enabled, reloadKey])

  // Al cambiar de región, descarta la lista anterior (evita fuga de temas de
  // otra región mientras carga la nueva).
  useEffect(() => { setTemas([]); setLoading(enabled) }, [regionCod]) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  return { temas, setTemas, loading, refresh }
}
