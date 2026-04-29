'use client'

import { useState, useEffect } from 'react'
import { getSupabaseColega } from '@/lib/supabaseColega'
import { REGIONS } from '@/lib/regions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type EmpleoPoint = {
  periodo: string         // YYYY-MM
  tasa: number | null     // % desocupación
  ocupados: number | null // miles de personas
}

export type EmpleoRegionSummary = {
  nombre_region: string
  cod: string | null      // mapped work-os cod
  tasa: number | null
  ocupados: number | null
  periodo: string
}

// Map nombre_region from colega DB → work-os cod
const NOMBRE_TO_COD: Record<string, string> = Object.fromEntries(
  REGIONS.map(r => [r.nombre, r.cod])
)

// ── Hook: time series for one region ─────────────────────────────────────────

export function useColegaEmpleoRegion(regionCod: string) {
  const [series, setSeries] = useState<EmpleoPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!regionCod) return
    const region = REGIONS.find(r => r.cod === regionCod)
    if (!region) { setLoading(false); return }

    let cancelled = false
    async function load() {
      try {
        const { data } = await getSupabaseColega()
          .from('registros_bce_empleo')
          .select('periodo,indicador,valor')
          .eq('nombre_region', region!.nombre)
          .order('periodo', { ascending: true })
          .limit(500)

        if (cancelled) return
        if (!data?.length) { setLoading(false); return }

        type Row = { periodo: string; indicador: string; valor: number }
        const map = new Map<string, EmpleoPoint>()
        for (const r of data as Row[]) {
          const p = r.periodo
          if (!map.has(p)) map.set(p, { periodo: p, tasa: null, ocupados: null })
          const pt = map.get(p)!
          if (r.indicador === 'Tasa de desocupación') pt.tasa = r.valor
          else if (r.indicador === 'Ocupados') pt.ocupados = r.valor
        }
        setSeries([...map.values()].sort((a, b) => a.periodo.localeCompare(b.periodo)))
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [regionCod])

  return { series, loading }
}

// ── Hook: latest snapshot for all available regions (ranking) ─────────────────

export function useColegaEmpleoAll() {
  const [rows, setRows]       = useState<EmpleoRegionSummary[]>([])
  const [periodo, setPeriodo] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabaseColega()
        type PeriodoRow = { periodo: string }
        const { data: latestArr } = await sb
          .from('registros_bce_empleo')
          .select('periodo')
          .order('periodo', { ascending: false })
          .limit(1)

        if (cancelled) return
        if (!latestArr?.length) { setLoading(false); return }
        const latestPeriod = (latestArr[0] as PeriodoRow).periodo
        setPeriodo(latestPeriod)

        const { data } = await sb
          .from('registros_bce_empleo')
          .select('nombre_region,indicador,valor')
          .eq('periodo', latestPeriod)

        if (cancelled) return
        if (!data) { setLoading(false); return }

        type AllRow = { nombre_region: string; indicador: string; valor: number }
        const map = new Map<string, { tasa: number | null; ocupados: number | null }>()
        for (const r of data as AllRow[]) {
          const nr = r.nombre_region
          if (!map.has(nr)) map.set(nr, { tasa: null, ocupados: null })
          const pt = map.get(nr)!
          if (r.indicador === 'Tasa de desocupación') pt.tasa = r.valor
          else if (r.indicador === 'Ocupados') pt.ocupados = r.valor
        }

        const result: EmpleoRegionSummary[] = [...map.entries()].map(([nombre, v]) => ({
          nombre_region: nombre,
          cod: NOMBRE_TO_COD[nombre] ?? null,
          periodo: latestPeriod,
          ...v,
        }))
        setRows(result.sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0)))
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { rows, periodo, loading }
}
