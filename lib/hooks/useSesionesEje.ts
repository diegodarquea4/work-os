'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { esCompromisoAbierto } from '@/lib/sesiones/helpers'

/**
 * Hooks de datos del módulo Sesiones (comités mig 044 + gabinete mig 046).
 *
 * ⚠️ Todos reciben `enabled`: las tablas sesion_* tienen RLS restrictiva
 * (viewer SIN acceso) — el consumidor NUNCA debe dispararlos si el módulo
 * no es visible (`sesionesOn` / `gabineteOn`). Con enabled=false no se toca
 * la red.
 */

// Instancia cuyo resumen se pide: un comité (eje concreto) o una instancia
// sin eje (gabinete regional, Comité Económico, Comité de Infraestructura).
// Refleja el CHECK de la mig 046/057 en el sistema de tipos.
export type SesionesFiltro =
  | { instancia: 'eje'; ejeId: number }
  | { instancia: 'gabinete' }
  | { instancia: 'inversion' }
  | { instancia: 'politico' }
  | { instancia: 'infraestructura' }

export type SesionesResumen = {
  compromisosAbiertos: number
  // Solo gabinete: trabas de comités escaladas y aún abiertas. 0 en comités.
  trabasEscaladas: number
  // Fecha (YYYY-MM-DD) de la última sesión CERRADA. null = nunca ha habido.
  ultimaSesionFecha: string | null
  // id del borrador vivo de esta (región, instancia[, eje]) si existe —
  // "Nueva sesión" lo reabre (UNIQUE parcial de la mig 046: a lo más uno).
  borradorId: number | null
}

const RESUMEN_VACIO: SesionesResumen = {
  compromisosAbiertos: 0,
  trabasEscaladas: 0,
  ultimaSesionFecha: null,
  borradorId: null,
}

export function useSesionesResumen(regionCod: string, filtro: SesionesFiltro, enabled: boolean) {
  const [resumen, setResumen] = useState<SesionesResumen>(RESUMEN_VACIO)
  const [loading, setLoading] = useState(enabled)

  // Dependencias primitivas (filtro llega como literal en los call-sites —
  // un objeto nuevo por render no debe relanzar el fetch).
  const instancia = filtro.instancia
  const ejeId = filtro.instancia === 'eje' ? filtro.ejeId : null

  const refresh = useCallback(async () => {
    if (!enabled) return
    setLoading(true)
    const sb = getSupabase()
    // Filtro por instancia: comité = eje_id (⇒ instancia='eje' por el CHECK
    // de la mig 046); gabinete e inversión = instancia sin eje. Columna/valor
    // dinámicos para no duplicar cada query en tres ramas.
    const [colInst, valInst]: [string, string | number] =
      instancia === 'eje' ? ['eje_id', ejeId!] : ['instancia', instancia]
    const [compRes, cerradaRes, borradorRes, escaladasRes] = await Promise.all([
      sb.from('sesion_compromisos')
        .select('id, estado')
        .eq('region_cod', regionCod)
        .eq(colInst, valInst),
      sb.from('eje_sesiones')
        .select('fecha')
        .eq('region_cod', regionCod)
        .eq(colInst, valInst)
        .eq('estado', 'cerrada')
        .order('fecha', { ascending: false })
        .limit(1),
      sb.from('eje_sesiones')
        .select('id')
        .eq('region_cod', regionCod)
        .eq(colInst, valInst)
        .eq('estado', 'borrador')
        .limit(1),
      // Trabas escaladas abiertas — solo tiene sentido para el gabinete.
      instancia === 'gabinete'
        ? sb.from('sesion_compromisos')
            .select('id')
            .eq('region_cod', regionCod)
            .eq('escalado_a_gabinete', true)
            .in('estado', ['pendiente', 'en_curso'])
        : Promise.resolve({ data: [] as { id: number }[] }),
    ])
    setResumen({
      compromisosAbiertos: (compRes.data ?? []).filter(c => esCompromisoAbierto(c as { estado: 'pendiente' | 'en_curso' | 'cumplido' })).length,
      trabasEscaladas:     (escaladasRes.data ?? []).length,
      ultimaSesionFecha:   cerradaRes.data?.[0]?.fecha ?? null,
      borradorId:          borradorRes.data?.[0]?.id ?? null,
    })
    setLoading(false)
  }, [regionCod, instancia, ejeId, enabled])

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
