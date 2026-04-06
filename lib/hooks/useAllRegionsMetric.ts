'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { REGIONS, INE_CODE } from '@/lib/regions'
import type { Region } from '@/lib/regions'

export type RegionSeries = {
  region: Region
  data: { period: string; value: number }[]
}

// Reverse map: region_id (number) → Region
const REGION_BY_ID: Record<number, Region> = Object.fromEntries(
  REGIONS.map(r => [INE_CODE[r.cod], r])
)

export function useAllRegionsMetric(metricName: string): {
  data: RegionSeries[]
  loading: boolean
  error: string | null
} {
  const [data, setData]       = useState<RegionSeries[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!metricName) return
    setLoading(true)
    setError(null)

    Promise.resolve(
      getSupabase()
        .from('regional_metrics')
        .select('region_id, period, value')
        .eq('metric_name', metricName)
        .gt('region_id', 0)           // exclude national (region_id = 0)
        .order('region_id', { ascending: true })
        .order('period',    { ascending: true })
    ).then(({ data: rows, error: err }) => {
      if (err) {
        setError(err.message)
        setData([])
      } else {
        const map: Record<number, { period: string; value: number }[]> = {}
        for (const row of rows ?? []) {
          const rid = row.region_id as number
          if (!map[rid]) map[rid] = []
          map[rid].push({ period: row.period as string, value: Number(row.value) })
        }
        setData(
          Object.entries(map)
            .map(([rid, pts]) => ({ region: REGION_BY_ID[Number(rid)], data: pts }))
            .filter(s => s.region != null)
            // preserve REGIONS display order
            .sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region))
        )
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [metricName])

  return { data, loading, error }
}
