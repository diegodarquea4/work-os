'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'
import type { MetricSeries, RegionalMetric, RegionMetrics } from '@/lib/types'

export const INDICADOR_METRICS = ['tasa_desocupacion', 'pib_regional'] as const

export function useRegionIndicadores(regionCod: string) {
  const [timeSeries,     setTimeSeries]     = useState<MetricSeries[]>([])
  const [nationalSeries, setNationalSeries] = useState<MetricSeries[]>([])
  const [metrics,        setMetrics]        = useState<RegionMetrics | null>(null)
  const [loading,        setLoading]        = useState(true)

  useEffect(() => {
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setLoading(false); return }

    setLoading(true)
    const sb = getSupabase()
    const names = [...INDICADOR_METRICS]
    // National PIB is stored as 'pib_nacional' (not 'pib_regional') — include it
    const nationalNames = [...names, 'pib_nacional']

    Promise.all([
      // Regional time series
      sb.from('regional_metrics')
        .select('metric_name, period, value')
        .eq('region_id', regionId)
        .in('metric_name', names)
        .order('period', { ascending: true }),

      // National time series (region_id = 0 = NAC)
      sb.from('regional_metrics')
        .select('metric_name, period, value')
        .eq('region_id', 0)
        .in('metric_name', nationalNames)
        .order('period', { ascending: true }),

      // Region metrics (census + economic snapshot)
      sb.from('region_metrics')
        .select('*')
        .eq('region_cod', regionCod)
        .maybeSingle(),
    ]).then(([tsRes, natRes, metRes]) => {
      setTimeSeries(toSeries(tsRes.data as RawRow[] | null, names))
      setNationalSeries(toSeries(natRes.data as RawRow[] | null, names))
      setMetrics((metRes.data ?? null) as RegionMetrics | null)
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCod])

  return { timeSeries, nationalSeries, metrics, loading }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RawRow = Pick<RegionalMetric, 'metric_name' | 'period' | 'value'>

function toSeries(rows: RawRow[] | null, order: readonly string[]): MetricSeries[] {
  const map: Record<string, { period: string; value: number }[]> = {}
  for (const row of rows ?? []) {
    if (!map[row.metric_name]) map[row.metric_name] = []
    map[row.metric_name].push({ period: row.period, value: Number(row.value) })
  }
  return order
    .filter(n => map[n]?.length)
    .map(n => ({ metric_name: n, data: map[n] }))
}
