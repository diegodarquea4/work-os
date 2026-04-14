'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'

export type PibSector = {
  sector: string   // cleaned label, e.g. "Minería"
  value: number    // miles de millones de pesos
  period: string   // ISO date of the observation
}

export function usePibSectorial(regionCod: string): {
  data: PibSector[]
  latestPeriod: string | null
  loading: boolean
  error: string | null
} {
  const [data, setData]       = useState<PibSector[]>([])
  const [latestPeriod, setLatestPeriod] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setData([]); return }

    setLoading(true)
    setError(null)

    Promise.resolve(
      getSupabase()
        .from('regional_metrics')
        .select('metric_name, period, value')
        .eq('region_id', regionId)
        .like('metric_name', 'pib_sector_%')
        .order('period', { ascending: false })
        .limit(200)
    ).then(({ data: rows, error: err }) => {
      if (err) {
        setError(err.message)
        setData([])
        setLoading(false)
        return
      }

      if (!rows || rows.length === 0) {
        setData([])
        setLoading(false)
        return
      }

      // Get the most recent period that has data
      const latest = rows[0].period as string
      setLatestPeriod(latest)

      // Filter to latest period only, convert metric_name → sector label
      const latestRows = rows.filter(r => r.period === latest)
      setData(
        latestRows.map(r => ({
          sector: sectorLabel(r.metric_name as string),
          value:  Number(r.value),
          period: r.period as string,
        })).sort((a, b) => b.value - a.value)
      )
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [regionCod])

  return { data, latestPeriod, loading, error }
}

/** Convert metric_name slug to display label */
function sectorLabel(metricName: string): string {
  const slug = metricName.replace('pib_sector_', '')
  const MAP: Record<string, string> = {
    mineria:              'Minería',
    construccion:         'Construcción',
    comercio:             'Comercio',
    manufactura:          'Manufactura',
    servicios:            'Servicios',
    servicios_financieros: 'Serv. Financieros',
    servicios_personales: 'Serv. Personales',
    administracion:       'Adm. Pública',
    agropecuario:         'Agropecuario',
    pesca:                'Pesca',
    electricidad:         'Electricidad/Gas',
    restaurantes:         'Restaurantes/Hoteles',
    total:                'PIB Total',
  }
  return MAP[slug] ?? slug.charAt(0).toUpperCase() + slug.slice(1)
}
