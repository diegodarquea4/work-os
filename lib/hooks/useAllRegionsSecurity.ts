'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { REGIONS, INE_CODE } from '@/lib/regions'
import type { SecurityWeekly } from '@/lib/types'

// Reverse map: region_id → region_cod
const INE_INVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(INE_CODE).map(([cod, id]) => [id, cod])
)

export type RegionSecuritySnapshot = SecurityWeekly & { region_cod: string; region_nombre: string }

export function useAllRegionsSecurity(): {
  data: RegionSecuritySnapshot[]
  loading: boolean
} {
  const [data, setData]       = useState<RegionSecuritySnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const { data: rows } = await getSupabase()
          .from('security_weekly')
          .select('*')
          .order('fecha_hasta', { ascending: false })
          .limit(200)

        // Deduplicate: keep first (latest) row per region_id
        const byRegion = new Map<number, SecurityWeekly>()
        for (const r of (rows ?? []) as SecurityWeekly[]) {
          if (!byRegion.has(r.region_id)) byRegion.set(r.region_id, r)
        }

        // Map to RegionSecuritySnapshot in REGIONS order
        const result: RegionSecuritySnapshot[] = []
        for (const region of REGIONS) {
          const regionId = INE_CODE[region.cod]
          if (regionId === undefined) continue
          const row = byRegion.get(regionId)
          if (row) {
            result.push({ ...row, region_cod: region.cod, region_nombre: region.nombre })
          }
        }

        // Also include regions not in REGIONS array (by INE_INVERSE fallback)
        byRegion.forEach((row, rid) => {
          const cod = INE_INVERSE[rid]
          if (cod && !result.find(r => r.region_cod === cod)) {
            const reg = REGIONS.find(r => r.cod === cod)
            result.push({ ...row, region_cod: cod, region_nombre: reg?.nombre ?? cod })
          }
        })

        setData(result)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return { data, loading }
}
