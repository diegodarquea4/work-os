'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { RegionConfig } from '@/lib/types'

/**
 * Configuración por región (`region_config`, mig 046) — hoy el flag y nombre
 * del Gabinete Regional. SELECT es any-auth (es configuración: la UI necesita
 * saber si el módulo está habilitado incluso para decidir no mostrarlo), así
 * que este hook NO necesita gate por rol.
 *
 * `config === null` = sin fila o región sin flag = gabinete no habilitado
 * (habilitar el piloto es un INSERT, no deploy).
 *
 * Estado keyed por región (derivado, sin setState síncrono en el effect):
 * al cambiar de región la config de la anterior no se filtra a la nueva.
 */
export function useRegionConfig(regionCod: string | null | undefined): {
  config: RegionConfig | null
  loading: boolean
  refresh: () => void
} {
  const [result, setResult] = useState<{ region: string; config: RegionConfig | null } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!regionCod) return
    let cancelled = false
    getSupabase()
      .from('region_config')
      .select('*')
      .eq('region_cod', regionCod)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('[useRegionConfig] query error:', error)
          setResult({ region: regionCod, config: null })
          return
        }
        setResult({ region: regionCod, config: (data ?? null) as RegionConfig | null })
      })
    return () => { cancelled = true }
  }, [regionCod, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  const fresh = result != null && result.region === regionCod
  return {
    config: fresh ? result!.config : null,
    loading: !!regionCod && !fresh,
    refresh,
  }
}
