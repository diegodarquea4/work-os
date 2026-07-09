'use client'

import { useState, useEffect } from 'react'
import { getSupabaseColega } from '@/lib/supabaseColega'
import { INE_CODE } from '@/lib/regions'

export type DelitosRow = {
  id: number
  id_semana: number
  id_region: number
  nombre_region: string
  nombre_delito: string
  es_dmcs: boolean
  ultima_semana_ant: number | null
  ultima_semana: number | null
  dias28_ant: number | null
  dias28: number | null
  anno_fecha_ant: number | null
  anno_fecha: number | null
  umbral: string | null
  anno: number
  semana: string
  fecha_desde_iso: string
  fecha_hasta_iso: string
}

// Nombres exactos del sistema LeyStop
export const DMCS_LISTA = [
  'HOMICIDIOS Y FEMICIDIOS',
  'VIOLACIONES Y DELITOS SEXUALES',
  'LESIONES GRAVES',
  'LESIONES MENOS GRAVES',
  'LESIONES LEVES',
  'ROBOS CON VIOLENCIA E INTIMIDACIÓN',
  'ROBOS POR SORPRESA',
  'ROBOS EN LUGARES HABITADOS Y NO HABITADOS',
  'ROBOS DE VEHÍCULOS Y SUS ACCESORIOS',
  'OTROS ROBOS CON FUERZA EN LAS COSAS',
  'HURTOS',
]

// Paleta rojo oscura sobria — degradado de granate a rosa viejo con variantes teja/vino
export const DMCS_COLORES = [
  'rgba(80,   7,   7, .90)',  // granate muy oscuro
  'rgba(69,  10,  10, .90)',  // granate oscuro
  'rgba(127,  29,  29, .88)', // red-900
  'rgba(153,  27,  27, .86)', // red-800
  'rgba(185,  28,  28, .84)', // red-700
  'rgba(220,  38,  38, .82)', // red-600
  'rgba(239,  68,  68, .80)', // red-500
  'rgba(120,  53,  15, .82)', // teja / ámbar oscuro
  'rgba(146,  64,  14, .80)', // teja claro
  'rgba(101,  20,  20, .85)', // vino
  'rgba(190,  18,  60, .82)', // rosa carmesí
]

// Hook: todos los delitos de una semana (o la última disponible)
export function useColegaDelitosAll(id_semana?: number) {
  const [rows, setRows]       = useState<DelitosRow[]>([])
  const [semana, setSemana]   = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const sb = getSupabaseColega()
        let targetSemana = id_semana

        if (targetSemana === undefined) {
          const { data: latest } = await sb
            .from('registros_leystop_delitos')
            .select('id_semana')
            .order('id_semana', { ascending: false })
            .limit(1)
          if (cancelled) return
          if (!latest?.length) { setLoading(false); return }
          targetSemana = (latest[0] as { id_semana: number }).id_semana
        }

        const { data } = await sb
          .from('registros_leystop_delitos')
          .select('*')
          .eq('id_semana', targetSemana)
          .order('id_region')
          .order('nombre_delito')

        if (cancelled) return
        if (data) {
          setRows(data as unknown as DelitosRow[])
          setSemana((data as unknown as DelitosRow[])[0]?.semana ?? '')
        }
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id_semana])

  return { rows, semana, loading }
}

// Hook: historial semanal para una región (evolución DMCS)
export function useColegaDelitosRegion(regionCod: string) {
  const [rows, setRows]       = useState<DelitosRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!regionCod) return
    const regionId = INE_CODE[regionCod]
    if (regionId === undefined) { setLoading(false); return }

    let cancelled = false
    async function load() {
      try {
        const { data } = await getSupabaseColega()
          .from('registros_leystop_delitos')
          .select('*')
          .eq('id_region', regionId)
          .order('id_semana', { ascending: true })
          .limit(2000)

        if (cancelled) return
        if (data) setRows(data as unknown as DelitosRow[])
        setLoading(false)
      } catch {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [regionCod])

  return { rows, loading }
}
