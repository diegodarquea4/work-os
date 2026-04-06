'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { INE_CODE } from '@/lib/regions'
import type { MopProject } from '@/lib/types'

export function useMopProjects(
  regionCod: string,
  limit = 20,
): { proyectos: MopProject[]; total: number; loading: boolean; error: string | null } {
  const [proyectos, setProyectos] = useState<MopProject[]>([])
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
      sb.from('mop_projects')
        .select('*')
        .eq('region_id', regionId)
        .order('nombre', { ascending: true })
        .limit(limit),
      sb.from('mop_projects')
        .select('cod_p', { count: 'exact', head: true })
        .eq('region_id', regionId),
    ]).then(([{ data, error: err }, { count }]) => {
      if (err) {
        setError(err.message)
        setProyectos([])
      } else {
        setProyectos((data ?? []) as MopProject[])
        setTotal(count ?? 0)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [regionCod, limit])

  return { proyectos, total, loading, error }
}
