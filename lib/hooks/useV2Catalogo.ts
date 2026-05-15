'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { V2Indicador } from '@/lib/types'

type V2CatalogoResult = {
  catalogo: V2Indicador[]
  /** Lookup by codigo for O(1) access */
  byCodigo: Map<string, V2Indicador>
  loading: boolean
}

/**
 * Loads the full indicator catalog with source metadata.
 * Cached per session — the catalog rarely changes.
 */
export function useV2Catalogo(): V2CatalogoResult {
  const [catalogo, setCatalogo] = useState<V2Indicador[]>([])
  const [byCodigo, setByCodigo] = useState<Map<string, V2Indicador>>(new Map())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    getSupabase()
      .from('v2_indicadores_catalogo')
      .select('*, fuente:v2_fuentes(*)')
      .order('categoria')
      .order('orden_presentacion', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.error('v2 catalogo error:', error.message)
          setLoading(false)
          return
        }

        const items = (data ?? []) as V2Indicador[]
        setCatalogo(items)

        const map = new Map<string, V2Indicador>()
        for (const item of items) map.set(item.codigo, item)
        setByCodigo(map)

        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { catalogo, byCodigo, loading }
}
