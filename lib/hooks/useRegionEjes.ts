'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { RegionEje } from '@/lib/types'

/**
 * Hook para leer el catálogo de ejes de una región (`region_ejes`).
 *
 * Devuelve el array ordenado por `numero` ascendente. `refresh()` re-fetcha
 * después de cambios admin desde `RegionEjesPanel`.
 *
 * Si `regionCod` viene vacío (sin región activa), devuelve array vacío sin
 * tocar la red.
 */
export function useRegionEjes(regionCod: string | null | undefined): {
  ejes: RegionEje[]
  loading: boolean
  refresh: () => Promise<void>
} {
  const [ejes, setEjes]       = useState<RegionEje[]>([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!regionCod) {
      setEjes([])
      return
    }
    setLoading(true)
    const { data } = await getSupabase()
      .from('region_ejes')
      .select('*')
      .eq('region_cod', regionCod)
      .order('numero', { ascending: true })
    setEjes((data ?? []) as RegionEje[])
    setLoading(false)
  }, [regionCod])

  useEffect(() => { load() }, [load])

  return { ejes, loading, refresh: load }
}
