'use client'

import { useState, useEffect } from 'react'
import { getSupabaseColega } from '@/lib/supabaseColega'
import { INE_CODE } from '@/lib/regions'

// ── Types ─────────────────────────────────────────────────────────────────────

export type LeystopRow = {
  id: number
  id_semana: number
  id_region: number
  nombre_region: string
  semana: string
  fecha_desde_iso: string
  fecha_hasta_iso: string
  anno: number
  tasa_registro: number | null
  casos_total: number | null
  casos_anno_fecha: number | null
  casos_anno_fecha_anterior: number | null
  var_anno_fecha: number | null
  var_ultima_semana: number | null
  var_28dias: number | null
  casos_ultima_semana: number | null
  casos_28dias: number | null
  mayor_registro_1: string | null; n_1: number | null
  mayor_registro_2: string | null; n_2: number | null
  mayor_registro_3: string | null; n_3: number | null
  mayor_registro_4: string | null; n_4: number | null
  mayor_registro_5: string | null; n_5: number | null
  controles: number | null
  controles_identidad: number | null
  controles_vehicular: number | null
  fiscalizaciones: number | null
  fiscal_alcohol: number | null
  fiscal_bancaria: number | null
  incautaciones: number | null
  incaut_fuego: number | null
  incaut_blancas: number | null
  allanamientos_anno: number | null
  vehiculos_recuperados_anno: number | null
  decomisos_anno: number | null
}

// ── Hook: latest semana for all regions (for rankings) ────────────────────────

export function useColegaSeguridadAll() {
  const [rows, setRows]       = useState<LeystopRow[]>([])
  const [semana, setSemana]   = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabaseColega()
        type SemanaRow = { id_semana: number }
        const { data: latest } = await sb
          .from('registros_leystop')
          .select('id_semana')
          .order('id_semana', { ascending: false })
          .limit(1)

        if (cancelled) return
        if (!latest?.length) { setLoading(false); return }
        const maxSemana = (latest[0] as SemanaRow).id_semana

        const { data } = await sb
          .from('registros_leystop')
          .select('*')
          .eq('id_semana', maxSemana)
          .order('id_region')

        if (cancelled) return
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = (data as any[]).map(r => ({
            ...r,
            n_1: r.pct_1, n_2: r.pct_2, n_3: r.pct_3, n_4: r.pct_4, n_5: r.pct_5,
          })) as LeystopRow[]
          setRows(mapped)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setSemana((data as any[])[0]?.semana ?? '')
        }
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return { rows, semana, loading }
}

// ── Hook: history for one region (for evolution chart) ───────────────────────

export function useColegaSeguridadRegion(regionCod: string) {
  const [history, setHistory] = useState<LeystopRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!regionCod) return
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setLoading(false); return }

    let cancelled = false
    async function load() {
      try {
        const { data } = await getSupabaseColega()
          .from('registros_leystop')
          .select('*')
          .eq('id_region', regionId)
          .order('id_semana', { ascending: true })
          .limit(52)

        if (cancelled) return
        if (data) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setHistory((data as any[]).map(r => ({
            ...r,
            n_1: r.pct_1, n_2: r.pct_2, n_3: r.pct_3, n_4: r.pct_4, n_5: r.pct_5,
          })) as LeystopRow[])
        }
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [regionCod])

  return { history, loading }
}
