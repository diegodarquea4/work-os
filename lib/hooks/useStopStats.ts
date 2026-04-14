'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'

export type StopStats = {
  semana_id:            number
  fecha_desde:          string
  fecha_hasta:          string
  controles_total:      number | null
  controles_identidad:  number | null
  controles_vehicular:  number | null
  fiscalizaciones:      number | null
  fiscal_alcohol:       number | null
  incautaciones:        number | null
  incaut_fuego:         number | null
  incaut_blancas:       number | null
  decomisos_semana:     number | null
  allanamientos_semana: number | null
  vehiculos_rec_semana: number | null
  vehiculos_rec_anno:   number | null
  casos_total:          number | null
  casos_ultima_semana:  number | null
  casos_anno_fecha:     number | null
  mayor_registro_1:     string | null
  pct_1:                number | null
  mayor_registro_2:     string | null
  pct_2:                number | null
  mayor_registro_3:     string | null
  pct_3:                number | null
  mayor_registro_4:     string | null
  pct_4:                number | null
  mayor_registro_5:     string | null
  pct_5:                number | null
}

export function useStopStats(regionCod: string): {
  stats: StopStats | null
  loading: boolean
  error: string | null
} {
  const [stats, setStats]     = useState<StopStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setStats(null); return }

    setLoading(true)
    setError(null)

    Promise.resolve(
      getSupabase()
        .from('stop_stats')
        .select('*')
        .eq('region_id', regionId)
        .order('semana_id', { ascending: false })
        .limit(1)
        .maybeSingle()
    ).then(({ data, error: err }) => {
      if (err) { setError(err.message); setStats(null) }
      else setStats(data as StopStats | null)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [regionCod])

  return { stats, loading, error }
}
