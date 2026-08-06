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
 * Cache a nivel de módulo (stale-while-revalidate): la primera respuesta por
 * región queda en `_cache` y los montajes siguientes la devuelven síncrono
 * (loading=false desde el primer render) mientras el fetch revalida por
 * detrás. Sin esto, Gabinete → Preparación montaba la tarjeta "Temas a
 * tratar" con un delay visible respecto de En Foco en CADA entrada
 * (KanbanView se remonta al cambiar de vista). `prefetchRegionConfigs()`
 * calienta el cache completo al arrancar la app — 16 filas — y deja
 * `_allLoaded`: con eso un miss de cache significa "sin fila" (null), no
 * "aún no sé".
 */

const _cache = new Map<string, RegionConfig | null>()
let _allLoaded = false
let _prefetching = false

export async function prefetchRegionConfigs(): Promise<void> {
  if (_allLoaded || _prefetching) return
  _prefetching = true
  try {
    const { data, error } = await getSupabase().from('region_config').select('*')
    if (error || !data) return
    for (const row of data as RegionConfig[]) _cache.set(row.region_cod, row)
    _allLoaded = true
  } finally {
    _prefetching = false
  }
}

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
        const config = (data ?? null) as RegionConfig | null
        _cache.set(regionCod, config)
        setResult({ region: regionCod, config })
      })
    return () => { cancelled = true }
  }, [regionCod, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  const fresh = result != null && result.region === regionCod
  const hasCache = !!regionCod && (_cache.has(regionCod) || _allLoaded)
  return {
    config: fresh ? result!.config : (hasCache ? _cache.get(regionCod!) ?? null : null),
    loading: !!regionCod && !fresh && !hasCache,
    refresh,
  }
}
