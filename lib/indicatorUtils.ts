import type { RegionMetrics } from './types'

/**
 * Rank a region among all 16 by a numeric field.
 * @param ascending — true = lowest value gets rank 1 (good for unemployment, crime)
 *                     false = highest value gets rank 1 (good for PIB, investment)
 */
export function rankOf(
  allRegions: RegionMetrics[],
  regionCod: string,
  field: keyof RegionMetrics,
  ascending = false,
): string | null {
  const valid = allRegions.filter(r => r[field] != null)
  if (valid.length === 0) return null
  const sorted = [...valid].sort((a, b) => {
    const av = Number(a[field])
    const bv = Number(b[field])
    return ascending ? av - bv : bv - av
  })
  const idx = sorted.findIndex(r => r.region_cod === regionCod)
  if (idx === -1) return null
  return `${idx + 1}°/${valid.length}`
}

/** Simple arithmetic mean of a numeric field across all regions (ignoring nulls). */
export function nationalAvg(
  allRegions: RegionMetrics[],
  field: keyof RegionMetrics,
): number | null {
  const vals = allRegions.map(r => r[field]).filter((v): v is number => v != null && typeof v === 'number')
  if (vals.length === 0) return null
  return vals.reduce((s, v) => s + v, 0) / vals.length
}

/**
 * Build a comparison label: "Nac: 7,2% · +1,3 pp"
 * @param lowerIsBetter — true for unemployment/crime (being below national = good)
 */
export function deltaLabel(
  value: number | null,
  national: number | null,
  lowerIsBetter = false,
): { text: string; isGood: boolean } | null {
  if (value == null || national == null) return null
  const delta = value - national
  const sign = delta > 0 ? '+' : ''
  const text = `Nac: ${national.toFixed(1)}% · ${sign}${delta.toFixed(1)} pp`
  const isGood = lowerIsBetter ? delta < 0 : delta > 0
  return { text, isGood }
}

/** Per-capita figure: value / (population / 1_000_000) → MM per million inhabitants. */
export function perCapita(value: number | null | undefined, population: number | null | undefined): number | null {
  if (value == null || population == null || population === 0) return null
  return value / (population / 1_000_000)
}
