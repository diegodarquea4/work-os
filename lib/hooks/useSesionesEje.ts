'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { esCompromisoAbierto } from '@/lib/sesiones/helpers'

/**
 * Hooks de datos del módulo Sesiones (Comité Policial).
 *
 * ⚠️ Ambos reciben `enabled`: las tablas sesion_* tienen RLS restrictiva
 * (viewer SIN acceso) — el consumidor NUNCA debe dispararlos si el módulo
 * no es visible (`sesionesOn`). Con enabled=false no se toca la red.
 */

export type SesionesResumen = {
  compromisosAbiertos: number
  // Fecha (YYYY-MM-DD) de la última sesión CERRADA. null = nunca ha habido.
  ultimaSesionFecha: string | null
  // id del borrador vivo de este (región, eje) si existe — "Nueva sesión"
  // lo reabre (el UNIQUE parcial de la mig 044 garantiza a lo más uno).
  borradorId: number | null
}

export function useSesionesResumen(regionCod: string, ejeId: number, enabled: boolean) {
  const [resumen, setResumen] = useState<SesionesResumen>({
    compromisosAbiertos: 0,
    ultimaSesionFecha: null,
    borradorId: null,
  })
  const [loading, setLoading] = useState(enabled)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    const sb = getSupabase()
    const [compRes, cerradaRes, borradorRes] = await Promise.all([
      sb.from('sesion_compromisos')
        .select('id, estado')
        .eq('region_cod', regionCod)
        .eq('eje_id', ejeId),
      sb.from('eje_sesiones')
        .select('fecha')
        .eq('region_cod', regionCod)
        .eq('eje_id', ejeId)
        .eq('estado', 'cerrada')
        .order('fecha', { ascending: false })
        .limit(1),
      sb.from('eje_sesiones')
        .select('id')
        .eq('region_cod', regionCod)
        .eq('eje_id', ejeId)
        .eq('estado', 'borrador')
        .limit(1),
    ])
    setResumen({
      compromisosAbiertos: (compRes.data ?? []).filter(c => esCompromisoAbierto(c as { estado: 'pendiente' | 'en_curso' | 'cumplido' })).length,
      ultimaSesionFecha:   cerradaRes.data?.[0]?.fecha ?? null,
      borradorId:          borradorRes.data?.[0]?.id ?? null,
    })
    setLoading(false)
  }, [regionCod, ejeId, enabled])

  useEffect(() => { refresh() }, [refresh])

  return { resumen, loading, refresh }
}

/**
 * Igual que useSesionesResumen pero para comités sin eje (Comité Seguimiento
 * de la Inversión) — filtra por `instancia` en vez de `eje_id`. El hook de
 * Policial no se toca: sigue exactamente igual.
 */
export function useSesionesResumenComite(regionCod: string, instancia: 'inversion', enabled: boolean) {
  const [resumen, setResumen] = useState<SesionesResumen>({
    compromisosAbiertos: 0,
    ultimaSesionFecha: null,
    borradorId: null,
  })
  const [loading, setLoading] = useState(enabled)

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    const sb = getSupabase()
    const [compRes, cerradaRes, borradorRes] = await Promise.all([
      sb.from('sesion_compromisos')
        .select('id, estado')
        .eq('region_cod', regionCod)
        .eq('instancia', instancia),
      sb.from('eje_sesiones')
        .select('fecha')
        .eq('region_cod', regionCod)
        .eq('instancia', instancia)
        .eq('estado', 'cerrada')
        .order('fecha', { ascending: false })
        .limit(1),
      sb.from('eje_sesiones')
        .select('id')
        .eq('region_cod', regionCod)
        .eq('instancia', instancia)
        .eq('estado', 'borrador')
        .limit(1),
    ])
    setResumen({
      compromisosAbiertos: (compRes.data ?? []).filter(c => esCompromisoAbierto(c as { estado: 'pendiente' | 'en_curso' | 'cumplido' })).length,
      ultimaSesionFecha:   cerradaRes.data?.[0]?.fecha ?? null,
      borradorId:          borradorRes.data?.[0]?.id ?? null,
    })
    setLoading(false)
  }, [regionCod, instancia, enabled])

  useEffect(() => { refresh() }, [refresh])

  return { resumen, loading, refresh }
}

export type PuntoSerie = { fecha: string; valor: number }

/**
 * Serie histórica de una métrica desde sesion_valores (solo sesiones
 * CERRADAS), orden cronológico. Alimenta el sparkline y el Δ de las cards
 * pulso — NUNCA leer la serie desde valor_actual (regla 6 del spec).
 */
export function useSerieValores(metricaId: number, enabled: boolean) {
  const [serie, setSerie] = useState<PuntoSerie[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    async function load() {
      const { data } = await getSupabase()
        .from('sesion_valores')
        .select('valor, eje_sesiones!inner(fecha, estado)')
        .eq('metrica_id', metricaId)
        .eq('eje_sesiones.estado', 'cerrada')
      if (cancelled) return
      const puntos = ((data ?? []) as unknown as { valor: number; eje_sesiones: { fecha: string } }[])
        .map(r => ({ fecha: r.eje_sesiones.fecha, valor: Number(r.valor) }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
      setSerie(puntos)
    }
    load()
    return () => { cancelled = true }
  }, [metricaId, enabled])

  return serie
}
