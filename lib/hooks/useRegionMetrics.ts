'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'
import type { MetricSeries, RegionalMetric } from '@/lib/types'

export function useRegionMetrics(
  regionCod: string,
  metricNames: string[],
): { data: MetricSeries[]; loading: boolean; error: string | null } {
  const [data, setData]       = useState<MetricSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  // Stable dep — avoids re-render when caller passes an inline array literal
  const metricKey = metricNames.join('|')

  useEffect(() => {
    const regionId = INE_CODE[regionCod]
    if (!regionId || metricNames.length === 0) {
      setData([])
      return
    }

    setLoading(true)
    setError(null)

    Promise.resolve(
      getSupabase()
        .from('regional_metrics')
        .select('metric_name, period, value')
        .eq('region_id', regionId)
        .in('metric_name', metricNames)
        .order('period', { ascending: true })
    ).then(({ data: rows, error: err }) => {
      if (err) {
        setError(err.message)
        setData([])
      } else {
        const map: Record<string, { period: string; value: number }[]> = {}
        for (const row of (rows ?? []) as Pick<RegionalMetric, 'metric_name' | 'period' | 'value'>[]) {
          if (!map[row.metric_name]) map[row.metric_name] = []
          map[row.metric_name].push({ period: row.period, value: Number(row.value) })
        }
        setData(
          metricNames
            .filter(n => map[n] && map[n].length > 0)
            .map(n => ({ metric_name: n, data: map[n] }))
        )
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCod, metricKey])

  return { data, loading, error }
}
