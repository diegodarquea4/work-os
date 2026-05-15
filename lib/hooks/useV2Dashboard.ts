'use client'

import { useMemo } from 'react'
import { useV2Indicadores } from './useV2Indicadores'
import { useV2Catalogo } from './useV2Catalogo'
import type { V2IndicadorUltimo, V2IndicadorValor, V2Indicador } from '@/lib/types'

/** Computed context for a single indicator value */
export type IndicadorContext = {
  codigo: string
  nombre: string
  valor: number | null
  periodo: string | null
  unidad: string
  calidad: string
  /** Days since last data load */
  edadDias: number | null
  /** National average (region_id=0) */
  nacional: number | null
  /** Ranking among 16 regions (1 = best given lower_is_better) */
  ranking: string | null
  /** Delta vs national: "+1.3 pp" or "-0.5 pp" */
  delta: string | null
  /** Is the delta favorable? */
  deltaGood: boolean | null
  /** Source name from catalog */
  fuente: string | null
  /** Is the data considered stale? (age > 2x expected frequency) */
  stale: boolean
  /** Full catalog entry */
  catalogo: V2Indicador | null
  /** lower_is_better flag from catalog */
  lowerIsBetter: boolean
}

/** Computed sparkline data */
export type SparkSerie = {
  codigo: string
  data: { periodo: string; valor: number }[]
}

/** All dashboard data for a region, pre-computed */
export type V2DashboardData = {
  /** Per-indicator context, keyed by codigo */
  indicadores: Map<string, IndicadorContext>
  /** Sparkline series */
  series: Map<string, SparkSerie>
  /** Indicators grouped by category */
  porCategoria: Map<string, IndicadorContext[]>
  /** Raw ultimo values for all regions (for ranking tables) */
  allRegionsUltimos: V2IndicadorUltimo[]
  /** Loading state */
  loading: boolean
}

// Frequency → expected days between updates
const FREQ_DAYS: Record<string, number> = {
  semanal: 7, mensual: 30, trimestral: 90, semestral: 180,
  anual: 365, bianual: 730, censal: 1825,
}

/**
 * Master hook for the indicators dashboard.
 * Fetches all v2 data for a region and pre-computes context (ranking, delta, quality, age).
 */
export function useV2Dashboard(
  regionCod: string | undefined,
  seriesCodigos: string[] = [],
): V2DashboardData {
  const { ultimos, nacionalUltimos, allRegionsUltimos, series: rawSeries, loading: indLoading } =
    useV2Indicadores(regionCod, seriesCodigos)
  const { catalogo, byCodigo, loading: catLoading } = useV2Catalogo()

  const loading = indLoading || catLoading

  // Build national lookup
  const nacMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const n of nacionalUltimos) {
      if (n.valor !== null) m.set(n.codigo_indicador, n.valor)
    }
    return m
  }, [nacionalUltimos])

  // Build ranking per indicator: codigo → sorted list of { region_id, valor }
  const rankings = useMemo(() => {
    const groups = new Map<string, { region_id: number; valor: number }[]>()
    for (const r of allRegionsUltimos) {
      if (r.valor === null) continue
      if (!groups.has(r.codigo_indicador)) groups.set(r.codigo_indicador, [])
      groups.get(r.codigo_indicador)!.push({ region_id: r.region_id, valor: r.valor })
    }
    return groups
  }, [allRegionsUltimos])

  // Compute per-indicator context
  const indicadores = useMemo(() => {
    const map = new Map<string, IndicadorContext>()
    if (loading) return map

    const regionId = ultimos.length > 0 ? ultimos[0].region_id : null

    for (const u of ultimos) {
      const cat = byCodigo.get(u.codigo_indicador) ?? null
      const nacional = nacMap.get(u.codigo_indicador) ?? null
      const lowerIsBetter = cat?.lower_is_better ?? false

      // Ranking
      let ranking: string | null = null
      const group = rankings.get(u.codigo_indicador)
      if (group && regionId !== null) {
        const sorted = [...group].sort((a, b) =>
          lowerIsBetter ? a.valor - b.valor : b.valor - a.valor
        )
        const idx = sorted.findIndex(r => r.region_id === regionId)
        if (idx !== -1) ranking = `${idx + 1}°/${sorted.length}`
      }

      // Delta vs national
      let delta: string | null = null
      let deltaGood: boolean | null = null
      if (u.valor !== null && nacional !== null) {
        const diff = Number(u.valor) - Number(nacional)
        const unit = cat?.unidad === '%' ? ' pp' : ''
        const sign = diff > 0 ? '+' : ''
        const formatted = diff.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        delta = `${sign}${formatted}${unit}`
        deltaGood = lowerIsBetter ? diff < 0 : diff > 0
      }

      // Age in days
      let edadDias: number | null = null
      if (u.fecha_carga_sistema) {
        edadDias = Math.floor((Date.now() - new Date(u.fecha_carga_sistema).getTime()) / 86400000)
      }

      // Stale check
      const expectedDays = FREQ_DAYS[cat?.frecuencia_esperada ?? ''] ?? 365
      const stale = edadDias !== null ? edadDias > expectedDays * 2 : false

      map.set(u.codigo_indicador, {
        codigo: u.codigo_indicador,
        nombre: cat?.nombre ?? u.codigo_indicador,
        valor: u.valor !== null ? Number(u.valor) : null,
        periodo: u.periodo,
        unidad: cat?.unidad ?? '',
        calidad: u.calidad,
        edadDias,
        nacional: nacional !== null ? Number(nacional) : null,
        ranking,
        delta,
        deltaGood,
        fuente: cat?.fuente?.nombre ?? null,
        stale,
        catalogo: cat,
        lowerIsBetter,
      })
    }

    // Add entries for catalog items with no data (to show "Sin dato")
    for (const c of catalogo) {
      if (!map.has(c.codigo)) {
        map.set(c.codigo, {
          codigo: c.codigo,
          nombre: c.nombre,
          valor: null,
          periodo: null,
          unidad: c.unidad,
          calidad: 'verificado',
          edadDias: null,
          nacional: nacMap.get(c.codigo) ?? null,
          ranking: null,
          delta: null,
          deltaGood: null,
          fuente: c.fuente?.nombre ?? null,
          stale: false,
          catalogo: c,
          lowerIsBetter: c.lower_is_better,
        })
      }
    }

    return map
  }, [ultimos, nacMap, rankings, catalogo, byCodigo, loading])

  // Group by category
  const porCategoria = useMemo(() => {
    const groups = new Map<string, IndicadorContext[]>()
    for (const [, ctx] of indicadores) {
      const cat = ctx.catalogo?.categoria ?? 'Otro'
      if (!groups.has(cat)) groups.set(cat, [])
      groups.get(cat)!.push(ctx)
    }
    return groups
  }, [indicadores])

  // Format sparkline series
  const series = useMemo(() => {
    const map = new Map<string, SparkSerie>()
    for (const [codigo, vals] of Object.entries(rawSeries)) {
      map.set(codigo, {
        codigo,
        data: vals
          .filter(v => v.valor !== null)
          .map(v => ({ periodo: v.periodo, valor: Number(v.valor) })),
      })
    }
    return map
  }, [rawSeries])

  return { indicadores, series, porCategoria, allRegionsUltimos, loading }
}
