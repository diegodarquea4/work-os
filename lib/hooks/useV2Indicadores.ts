'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { V2IndicadorUltimo, V2IndicadorValor } from '@/lib/types'
import { INE_CODE } from '@/lib/regions'

type V2IndicadoresResult = {
  /** Latest value per indicator for the selected region */
  ultimos: V2IndicadorUltimo[]
  /** Latest value per indicator for national (region_id=0) */
  nacionalUltimos: V2IndicadorUltimo[]
  /** Latest values for ALL regions (for ranking) */
  allRegionsUltimos: V2IndicadorUltimo[]
  /** Time-series for selected metrics in the region */
  series: Record<string, V2IndicadorValor[]>
  loading: boolean
}

/**
 * Unified hook for v2 indicator data.
 * Replaces useRegionIndicadores + useAllRegionsMetrics.
 *
 * @param regionCod - Region code (e.g. 'XIV', 'RM')
 * @param seriesCodigos - Optional list of indicator codes to fetch time-series for
 */
export function useV2Indicadores(
  regionCod: string | undefined,
  seriesCodigos: string[] = [],
): V2IndicadoresResult {
  const [ultimos, setUltimos] = useState<V2IndicadorUltimo[]>([])
  const [nacionalUltimos, setNacionalUltimos] = useState<V2IndicadorUltimo[]>([])
  const [allRegionsUltimos, setAllRegionsUltimos] = useState<V2IndicadorUltimo[]>([])
  const [series, setSeries] = useState<Record<string, V2IndicadorValor[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!regionCod) return

    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) return

    let cancelled = false
    setLoading(true)

    const sb = getSupabase()

    const fetches = Promise.all([
      // 1. Latest values for this region
      sb.from('v2_indicadores_ultimo').select('*').eq('region_id', regionId),
      // 2. Latest national values
      sb.from('v2_indicadores_ultimo').select('*').eq('region_id', 0),
      // 3. All regions (for ranking)
      sb.from('v2_indicadores_ultimo').select('*').gt('region_id', 0),
      // 4. Time-series for requested indicators
      ...(seriesCodigos.length > 0
        ? [sb.from('v2_indicadores_valores')
            .select('*')
            .eq('region_id', regionId)
            .in('codigo_indicador', seriesCodigos)
            .order('periodo', { ascending: true })
            .limit(200)]
        : []),
    ])

    fetches.then((results) => {
      if (cancelled) return

      const [regionRes, nacRes, allRes, ...seriesRes] = results

      setUltimos((regionRes.data ?? []) as V2IndicadorUltimo[])
      setNacionalUltimos((nacRes.data ?? []) as V2IndicadorUltimo[])
      setAllRegionsUltimos((allRes.data ?? []) as V2IndicadorUltimo[])

      if (seriesRes.length > 0 && seriesRes[0].data) {
        const grouped: Record<string, V2IndicadorValor[]> = {}
        for (const row of seriesRes[0].data as V2IndicadorValor[]) {
          if (!grouped[row.codigo_indicador]) grouped[row.codigo_indicador] = []
          grouped[row.codigo_indicador].push(row)
        }
        setSeries(grouped)
      }

      setLoading(false)
    })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCod, seriesCodigos.join(',')])

  return { ultimos, nacionalUltimos, allRegionsUltimos, series, loading }
}
