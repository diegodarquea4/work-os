'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

export type PibRow = {
  nombre_region: string | null
  periodo: string
  valor_corregido: number | null
  indicador_limpio: string
  unidad_limpia: string
  series_id: string
}

export const PIB_UNIDAD_ENC = 'miles de millones de pesos encadenados'
export const PIB_UNIDAD_NOM = 'miles de millones de pesos corrientes (base 2018)'

// Parse DD-MM-YYYY or YYYY-MM-DD → { year, month, sortKey }
export function parsePeriodo(p: string): { year: string; month: number; sortKey: string } {
  const parts = p.split('-')
  if (parts.length !== 3) return { year: '?', month: 0, sortKey: p }
  if (parts[0].length === 4) {
    // ISO: YYYY-MM-DD
    return { year: parts[0], month: parseInt(parts[1]), sortKey: p }
  }
  // Chilean BCCh format: DD-MM-YYYY
  return { year: parts[2], month: parseInt(parts[1]), sortKey: `${parts[2]}-${parts[1]}-${parts[0]}` }
}

export function periodoLabel(p: string, freq: 'anual' | 'trimestral'): string {
  const { year, month } = parsePeriodo(p)
  if (freq === 'anual') return year
  const q = Math.ceil(month / 3)
  return `T${q}.${year}`
}

/** Fetches all PIB rows for a given region name (as stored in registros_bce.nombre_region). */
export function useMetricasPibRegion(regionNombre: string | null) {
  const [rows, setRows] = useState<PibRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!regionNombre) { setRows([]); return }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const sb = getSupabase()
        const all: PibRow[] = []
        let offset = 0
        const pageSize = 1000
        while (true) {
          const { data, error } = await sb
            .from('registros_bce')
            .select('nombre_region,periodo,valor_corregido,indicador_limpio,unidad_limpia,series_id')
            .eq('nombre_region', regionNombre)
            // Orden determinístico: una región tiene ~2.500-3.600 filas en
            // registros_bce → esta query pagina. Sin ORDER BY estable, .range()
            // puede saltar/duplicar filas entre páginas → sectores/evolución del
            // panel mal. Mismo patrón que fetchAllPibRows (server).
            .order('series_id', { ascending: true })
            .order('periodo', { ascending: true })
            .range(offset, offset + pageSize - 1)
          if (cancelled) return
          if (error || !data?.length) break
          all.push(...(data as PibRow[]))
          if (data.length < pageSize) break
          offset += pageSize
        }
        if (!cancelled) setRows(all)
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [regionNombre])

  return { rows, loading }
}

export type PibNacionalData = {
  años:           string[]
  regiones:       string[]
  valores:        Record<string, Record<string, number | null>>  // [region][year] — encadenado (real)
  extrarregional: Record<string, number | null>                  // [year] — encadenado (real)
  valoresNom:     Record<string, Record<string, number | null>>  // [region][year] — nominal (corrientes)
}

/** Carga PIB anual (encadenado real + nominal corriente) para TODAS las regiones × TODOS los años disponibles.
 *  También incluye fila Extrarregional si existe (solo serie encadenada). */
export function useMetricasPibNacional() {
  const [data, setData]       = useState<PibNacionalData>({ años: [], regiones: [], valores: {}, extrarregional: {}, valoresNom: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb  = getSupabase()
        const all: PibRow[] = []
        let offset = 0
        while (true) {
          const { data: rows, error } = await sb
            .from('registros_bce')
            .select('nombre_region,periodo,valor_corregido,series_id,indicador_limpio,unidad_limpia')
            .in('unidad_limpia', [PIB_UNIDAD_ENC, PIB_UNIDAD_NOM])
            .in('indicador_limpio', ['PIB', 'Extrarregional'])
            // Orden determinístico: PIB total de las 16 regiones ya supera 1000
            // filas (más aún con ambas unidades enc+nom) → esta query pagina. Sin
            // ORDER BY estable, .range() puede saltar/duplicar filas entre páginas
            // (PostgREST no garantiza orden sin ORDER BY) → total nacional/ranking/%
            // mal. Mismo patrón que fetchAllPibRows (server) y fetchAllEmpleoRows.
            .order('series_id', { ascending: true })
            .order('periodo', { ascending: true })
            .range(offset, offset + 999)
          if (cancelled) return
          if (error || !rows?.length) break
          all.push(...(rows as PibRow[]))
          if (rows.length < 1000) break
          offset += 1000
        }
        if (cancelled) return

        const annual = all.filter(r => r.series_id?.endsWith('A') && r.valor_corregido != null)
        const añoSet = new Set<string>()
        const regSet = new Set<string>()
        const valores:        Record<string, Record<string, number | null>> = {}
        const valoresNom:     Record<string, Record<string, number | null>> = {}
        const extrarregional: Record<string, number | null> = {}

        for (const r of annual) {
          const { year } = parsePeriodo(r.periodo)
          añoSet.add(year)
          const target = r.unidad_limpia === PIB_UNIDAD_NOM ? valoresNom : valores
          if (r.nombre_region) {
            regSet.add(r.nombre_region)
            if (!target[r.nombre_region]) target[r.nombre_region] = {}
            target[r.nombre_region][year] = r.valor_corregido
          } else if (r.indicador_limpio === 'Extrarregional' && r.unidad_limpia === PIB_UNIDAD_ENC) {
            extrarregional[year] = r.valor_corregido
          }
        }

        if (!cancelled) setData({ años: [...añoSet].sort(), regiones: [...regSet], valores, extrarregional, valoresNom })
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { ...data, loading }
}

/** Fetches the latest annual PIB (encadenado) per region — for the overview summary card. */
export function useMetricasPibResumen() {
  const [data, setData] = useState<{ region: string; pib: number; year: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabase()
        const all: PibRow[] = []
        let offset = 0
        while (true) {
          const { data: rows, error } = await sb
            .from('registros_bce')
            .select('nombre_region,periodo,valor_corregido,series_id')
            .eq('indicador_limpio', 'PIB')
            .eq('unidad_limpia', PIB_UNIDAD_ENC)
            .not('nombre_region', 'is', null)
            .range(offset, offset + 999)
          if (cancelled) return
          if (error || !rows?.length) break
          all.push(...(rows as PibRow[]))
          if (rows.length < 1000) break
          offset += 1000
        }
        if (cancelled) return

        // Keep only annual series ending in 'A'
        const annual = all.filter(r => r.series_id?.endsWith('A') && r.valor_corregido !== null)

        // For each region, find the latest year
        const byRegion: Record<string, { pib: number; sortKey: string; year: string }> = {}
        for (const r of annual) {
          const { year, sortKey } = parsePeriodo(r.periodo)
          if (!byRegion[r.nombre_region!] || sortKey > byRegion[r.nombre_region!].sortKey) {
            byRegion[r.nombre_region!] = { pib: r.valor_corregido!, sortKey, year }
          }
        }
        if (!cancelled) {
          setData(Object.entries(byRegion).map(([region, v]) => ({ region, pib: v.pib, year: v.year })))
        }
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}
