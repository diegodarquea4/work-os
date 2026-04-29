'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { RegionMetrics } from '@/lib/types'

export function useAllRegionsMetrics() {
  const [allRegions, setAllRegions] = useState<RegionMetrics[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const { data } = await getSupabase()
          .from('region_metrics')
          .select('*')
          .order('region_nombre', { ascending: true })
        if (cancelled) return
        setAllRegions((data ?? []) as RegionMetrics[])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { allRegions, loading }
}
