'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'
import type { SeiaProject } from '@/lib/types'

export function useSeiaProjects(
  regionCod: string,
  limit = 20,
): { proyectos: SeiaProject[]; total: number; loading: boolean; error: string | null } {
  const [proyectos, setProyectos] = useState<SeiaProject[]>([])
  const [total, setTotal]         = useState(0)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)

  useEffect(() => {
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setProyectos([]); setTotal(0); return }

    setLoading(true)
    setError(null)

    const sb = getSupabase()

    Promise.all([
      sb.from('seia_projects')
        .select('*')
        .eq('region_id', regionId)
        .order('fecha_presentacion', { ascending: false })
        .limit(limit),
      sb.from('seia_projects')
        .select('id', { count: 'exact', head: true })
        .eq('region_id', regionId),
    ]).then(([{ data, error: err }, { count }]) => {
      if (err) {
        setError(err.message)
        setProyectos([])
      } else {
        setProyectos((data ?? []) as SeiaProject[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [regionCod, limit])

  return { proyectos, total, loading, error }
}
