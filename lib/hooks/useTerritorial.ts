'use client'

/**
 * Hook de carga del modo «Autoridades». Baja la data del Panel Territorial UNA sola
 * vez (caché de módulo, patrón de `comunaGeoCache`) y la comparte entre montajes.
 * Solo debe usarse cuando el modo está activo — no lo montes en modo PSG.
 */

import { useEffect, useState } from 'react'
import { loadTerritorial } from '@/lib/territorial/source'
import type { TerritorialData } from '@/lib/territorial/types'

let cache: TerritorialData | null = null
let inflight: Promise<TerritorialData> | null = null

function getTerritorial(): Promise<TerritorialData> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = loadTerritorial()
      .then((data) => { cache = data; inflight = null; return data })
      .catch((err) => { inflight = null; throw err })
  }
  return inflight
}

export interface UseTerritorialResult {
  data: TerritorialData | null
  loading: boolean
  error: string | null
}

export function useTerritorial(active: boolean): UseTerritorialResult {
  const [data, setData] = useState<TerritorialData | null>(cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    // setState solo dentro de callbacks async (nunca síncrono en el effect):
    // getTerritorial() resuelve al instante si ya hay caché.
    let vivo = true
    getTerritorial()
      .then((d) => { if (vivo) setData(d) })
      .catch((err: unknown) => {
        if (vivo) setError(err instanceof Error ? err.message : 'Error cargando datos de autoridades')
      })
    return () => { vivo = false }
  }, [active])

  // `loading` derivado: activo, sin data y sin error todavía.
  const loading = active && !data && !error
  return { data, loading, error }
}
