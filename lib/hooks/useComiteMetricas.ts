'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'
import type { ComiteMetrica, ComiteInstitucionCatalogo, ComiteMetricaEstandar } from '@/lib/types'
import type { PuntoSerie } from './useSesionesEje'

export type InstitucionComite = { key: string; label: string }

/**
 * Hooks del reporte por institución del Comité Policial (mig 048).
 * Igual que useSesionesEje: reciben `enabled` — con false no tocan la red
 * (las tablas cuelgan del gate sesionesOn del comité).
 */

/** Catálogo activo de métricas por institución de la región. */
export function useCatalogoComite(regionCod: string, enabled: boolean) {
  const [catalogo, setCatalogo] = useState<ComiteMetrica[]>([])
  const [loading, setLoading]   = useState(enabled)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      const { data } = await getSupabase()
        .from('comite_metrica').select('*')
        .eq('region_cod', regionCod).eq('activo', true).order('orden')
      if (cancelled) return
      setCatalogo((data ?? []) as ComiteMetrica[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, enabled, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  return { catalogo, loading, refresh }
}

/**
 * Instituciones que reportan del Comité Policial de la región (mig 078).
 * Catálogo por región; con catálogo vacío cae a las 4 base (COMITE_INSTITUCIONES),
 * así una región sin sembrar sigue viendo Carabineros/PDI/Armada/Gendarmería.
 * Devuelve además las filas crudas (para editar/soft-delete en el modal).
 */
export function useInstitucionesComite(regionCod: string, enabled: boolean) {
  const [rows, setRows] = useState<ComiteInstitucionCatalogo[]>([])
  const [loading, setLoading] = useState(enabled)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      const { data } = await getSupabase()
        .from('comite_institucion').select('*')
        .eq('region_cod', regionCod).eq('activo', true).order('orden')
      if (cancelled) return
      setRows((data ?? []) as ComiteInstitucionCatalogo[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, enabled, reloadKey])

  const instituciones: InstitucionComite[] = rows.length > 0
    ? rows.map(r => ({ key: r.clave, label: r.nombre }))
    : COMITE_INSTITUCIONES.map(i => ({ key: i.key, label: i.label }))

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  return { instituciones, rows, loading, refresh }
}

/**
 * Catálogo NACIONAL de métricas estándar (comite_metrica_estandar, mig 079).
 * Admin lo define; cualquier autenticado lo lee (para el modal de adopción y
 * el editor). `soloActivas=false` trae también las inactivas (editor admin).
 */
export function useEstandaresComite(enabled: boolean, soloActivas = true) {
  const [estandares, setEstandares] = useState<ComiteMetricaEstandar[]>([])
  const [loading, setLoading]       = useState(enabled)
  const [reloadKey, setReloadKey]   = useState(0)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      let q = getSupabase().from('comite_metrica_estandar').select('*')
      if (soloActivas) q = q.eq('activo', true)
      const { data } = await q.order('institucion').order('orden')
      if (cancelled) return
      setEstandares((data ?? []) as ComiteMetricaEstandar[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [enabled, soloActivas, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  return { estandares, loading, refresh }
}

/**
 * Series WoW de TODAS las métricas del comité en una sola query: valores de
 * sesiones CERRADAS del (región, eje), agrupados por métrica y ordenados por
 * fecha. Alimenta el Δ y el sparkline del general del comité (nunca desde un
 * acumulado — la serie es la verdad, igual que useSerieValores del pulso).
 */
export function useSeriesComite(regionCod: string, ejeId: number, enabled: boolean, reloadKey = 0) {
  const [series, setSeries] = useState<Map<number, PuntoSerie[]>>(new Map())

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      const { data } = await getSupabase()
        .from('sesion_comite_valor')
        .select('valor_num, metrica_id, eje_sesiones!inner(fecha, estado, region_cod, eje_id)')
        .eq('eje_sesiones.estado', 'cerrada')
        .eq('eje_sesiones.region_cod', regionCod)
        .eq('eje_sesiones.eje_id', ejeId)
      if (cancelled) return
      const map = new Map<number, PuntoSerie[]>()
      for (const r of (data ?? []) as unknown as { valor_num: number | null; metrica_id: number; eje_sesiones: { fecha: string } }[]) {
        if (r.valor_num == null) continue
        const arr = map.get(r.metrica_id) ?? []
        arr.push({ fecha: r.eje_sesiones.fecha, valor: Number(r.valor_num) })
        map.set(r.metrica_id, arr)
      }
      for (const arr of map.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha))
      setSeries(map)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, ejeId, enabled, reloadKey])

  return series
}
