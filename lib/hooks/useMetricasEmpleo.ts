'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

export type EmpleoRow = {
  nombre_region: string
  periodo: string
  indicador: string
  valor: number | null
}

// Estructura por región, idéntica a EMP.datos[region] del dashboard original
export type EmpleoRegionData = {
  periodos:    string[]
  tasa:        (number | null)[]
  tasa_tm:     (number | null)[]  // INE: Σ desoc[i-2..i] / Σ ft[i-2..i] * 100
  ocupados:    (number | null)[]
  ft:          (number | null)[]  // ocupados / (1 - tasa/100)
  desocupados: (number | null)[]  // ft - ocupados
}

export type EmpleoTodas = {
  periodos: string[]
  datos: Record<string, EmpleoRegionData>  // incluye '__NACIONAL__'
}

// ── Fórmulas verbatim de generar_dashboard.py ────────────────

function _calcFT(ocu: number | null, tasa: number | null): number | null {
  if (ocu == null || tasa == null || tasa >= 100 || tasa < 0) return null
  return parseFloat((ocu / (1 - tasa / 100)).toFixed(1))
}

function _calcDesoc(ft: number | null, ocu: number | null): number | null {
  if (ft == null || ocu == null) return null
  return parseFloat((ft - ocu).toFixed(1))
}

// tasa_tm[i] = Σ desoc[i-2..i] / Σ ft[i-2..i] * 100  (i < 2 → null)
function _tasaTmAt(desoc: (number | null)[], ft: (number | null)[], i: number): number | null {
  if (i < 2) return null
  const ds = [desoc[i - 2], desoc[i - 1], desoc[i]]
  const fs = [ft[i - 2], ft[i - 1], ft[i]]
  if (ds.some(v => v == null) || fs.some(v => v == null)) return null
  const sft = (fs as number[]).reduce((a, b) => a + b, 0)
  if (!sft) return null
  return parseFloat(((ds as number[]).reduce((a, b) => a + b, 0) / sft * 100).toFixed(2))
}

function _buildRegionData(periodos: string[], tasa: (number | null)[], ocupados: (number | null)[]): EmpleoRegionData {
  const ft         = tasa.map((t, i) => _calcFT(ocupados[i], t))
  const desocupados = ft.map((f, i) => _calcDesoc(f, ocupados[i]))
  const tasa_tm    = Array.from({ length: periodos.length }, (_, i) => _tasaTmAt(desocupados, ft, i))
  return { periodos, tasa, tasa_tm, ocupados, ft, desocupados }
}

/** Carga TODOS los datos de empleo, incluyendo __NACIONAL__ con fórmulas INE verbatim. */
export function useMetricasEmpleoTodas() {
  const [data, setData]     = useState<EmpleoTodas>({ periodos: [], datos: {} })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb  = getSupabase()
        const all: EmpleoRow[] = []
        let offset = 0
        while (true) {
          const { data: rows, error } = await sb
            .from('registros_bce_empleo')
            .select('nombre_region,periodo,indicador,valor')
            .order('periodo', { ascending: true })
            .range(offset, offset + 999)
          if (cancelled) return
          if (error || !rows?.length) break
          all.push(...(rows as EmpleoRow[]))
          if (rows.length < 1000) break
          offset += 1000
        }
        if (cancelled) return

        // Períodos únicos ordenados
        const periodSet = new Set<string>()
        all.forEach(r => periodSet.add(r.periodo))
        const periodos = [...periodSet].sort()

        // region → periodo → { tasa, ocu }
        const regionMap: Record<string, Record<string, { tasa?: number | null; ocu?: number | null }>> = {}
        for (const r of all) {
          if (!regionMap[r.nombre_region]) regionMap[r.nombre_region] = {}
          if (!regionMap[r.nombre_region][r.periodo]) regionMap[r.nombre_region][r.periodo] = {}
          if (r.indicador === 'Tasa de desocupación') regionMap[r.nombre_region][r.periodo].tasa = r.valor
          if (r.indicador === 'Ocupados')             regionMap[r.nombre_region][r.periodo].ocu  = r.valor
        }

        // Armar datos por región alineados al array global de períodos
        const datos: EmpleoTodas['datos'] = {}
        for (const [reg, periMap] of Object.entries(regionMap)) {
          const tasa    = periodos.map(p => periMap[p]?.tasa ?? null)
          const ocupados = periodos.map(p => periMap[p]?.ocu ?? null)
          datos[reg] = _buildRegionData(periodos, tasa, ocupados)
        }

        // __NACIONAL__: suma ocupados y ft por período → tasa ponderada = desoc/ft
        const nacOcu: (number | null)[] = periodos.map((_, pi) => {
          let sum = 0; let any = false
          for (const d of Object.values(datos)) {
            const v = d.ocupados[pi]; if (v != null) { sum += v; any = true }
          }
          return any ? parseFloat(sum.toFixed(1)) : null
        })
        const nacFT: (number | null)[] = periodos.map((_, pi) => {
          let sum = 0; let any = false
          for (const d of Object.values(datos)) {
            const v = d.ft[pi]; if (v != null) { sum += v; any = true }
          }
          return any ? parseFloat(sum.toFixed(1)) : null
        })
        const nacDesoc: (number | null)[] = nacFT.map((f, i) => _calcDesoc(f, nacOcu[i]))
        const nacTasa: (number | null)[]  = nacDesoc.map((d, i) => {
          const f = nacFT[i]
          if (d == null || f == null || f === 0) return null
          return parseFloat((d / f * 100).toFixed(2))
        })
        const nacTasaTm: (number | null)[] = Array.from(
          { length: periodos.length }, (_, i) => _tasaTmAt(nacDesoc, nacFT, i)
        )
        datos['__NACIONAL__'] = {
          periodos, tasa: nacTasa, tasa_tm: nacTasaTm,
          ocupados: nacOcu, ft: nacFT, desocupados: nacDesoc,
        }

        if (!cancelled) setData({ periodos, datos })
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { ...data, loading }
}

// Tipo para serie por región (también incluye campos derivados)
export type EmpleoSerie = {
  periodo:     string
  tasa:        number | null
  tasa_tm:     number | null
  ocupados:    number | null
  ft:          number | null
  desocupados: number | null
}

/** Carga serie de tiempo para UNA región (para uso puntual). */
export function useMetricasEmpleoRegion(regionNombre: string | null) {
  const [serie, setSerie]   = useState<EmpleoSerie[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!regionNombre) { setSerie([]); return }
    let cancelled = false
    setLoading(true)
    async function load() {
      try {
        const sb = getSupabase()
        const { data, error } = await sb
          .from('registros_bce_empleo')
          .select('nombre_region,periodo,indicador,valor')
          .eq('nombre_region', regionNombre)
          .order('periodo', { ascending: true })
        if (cancelled) return
        if (!error && data) {
          const rows = data as EmpleoRow[]
          const periMap: Record<string, { tasa?: number | null; ocu?: number | null }> = {}
          for (const r of rows) {
            if (!periMap[r.periodo]) periMap[r.periodo] = {}
            if (r.indicador === 'Tasa de desocupación') periMap[r.periodo].tasa = r.valor
            if (r.indicador === 'Ocupados')             periMap[r.periodo].ocu  = r.valor
          }
          const sorted    = Object.entries(periMap).sort(([a], [b]) => a.localeCompare(b))
          const tasas     = sorted.map(([, v]) => v.tasa    ?? null)
          const ocupados  = sorted.map(([, v]) => v.ocu     ?? null)
          const fts       = tasas.map((t, i) => _calcFT(ocupados[i], t))
          const desocs    = fts.map((f, i) => _calcDesoc(f, ocupados[i]))
          const tasa_tms  = Array.from({ length: sorted.length }, (_, i) => _tasaTmAt(desocs, fts, i))
          setSerie(sorted.map(([periodo], i) => ({
            periodo, tasa: tasas[i], tasa_tm: tasa_tms[i],
            ocupados: ocupados[i], ft: fts[i], desocupados: desocs[i],
          })))
        }
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [regionNombre])

  return { serie, loading }
}

/** Último período por región (para cards de resumen). */
export function useMetricasEmpleoResumen() {
  const [data, setData]       = useState<Record<string, { tasa: number | null; ocupados: number | null; periodo: string }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabase()
        const { data: latestRow } = await sb
          .from('registros_bce_empleo')
          .select('periodo')
          .order('periodo', { ascending: false })
          .limit(1)
        if (cancelled || !latestRow?.length) { setLoading(false); return }
        const latestPeriod = (latestRow[0] as { periodo: string }).periodo
        const { data: rows } = await sb
          .from('registros_bce_empleo')
          .select('nombre_region,indicador,valor')
          .eq('periodo', latestPeriod)
        if (cancelled) return
        const result: Record<string, { tasa: number | null; ocupados: number | null; periodo: string }> = {}
        for (const row of (rows ?? []) as EmpleoRow[]) {
          if (!result[row.nombre_region]) result[row.nombre_region] = { tasa: null, ocupados: null, periodo: latestPeriod }
          if (row.indicador === 'Tasa de desocupación') result[row.nombre_region].tasa     = row.valor
          if (row.indicador === 'Ocupados')             result[row.nombre_region].ocupados = row.valor
        }
        if (!cancelled) setData(result)
      } catch { /* silent */ } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { data, loading }
}
