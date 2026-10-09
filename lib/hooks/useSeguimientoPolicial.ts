'use client'

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useCapabilities } from '@/lib/context/UserContext'
import { can } from '@/lib/permissions'
import { REGIONS } from '@/lib/regions'
import {
  armarSeries, type MetricaEstandar, type MetricaRegional, type SesionCerrada, type SeriesPolicial, type ValorReportado,
} from '@/lib/seguimientoPolicial'

/**
 * Datos del tablero «Seguimiento» del Comité Policial.
 *
 * Lo ven SOLO quienes operan el Comité Policial, en sus regiones (Manuel,
 * 2026-10-08: son métricas operativas de las policías, no información pública
 * como los oficios del SEIA). Por eso se lee con el cliente del navegador —la
 * RLS de `eje_sesiones` y `sesion_comite_valor` ya entrega solo lo que el
 * usuario puede ver— y acá se acota además por `comite.policial.operar`.
 */

export type DatosPolicial = SeriesPolicial & {
  estandar: MetricaEstandar[]
  /** Solo las sesiones CERRADAS de las regiones permitidas. */
  sesiones: SesionCerrada[]
}

const PAGINA = 1000

type Fila = Record<string, unknown>
type Consulta = { range(a: number, b: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> }

/** Trae todas las filas de a 1.000 (el tope de PostgREST). */
async function todas<T extends Fila>(armar: () => Consulta): Promise<T[]> {
  const out: T[] = []
  for (let a = 0; ; a += PAGINA) {
    const { data, error } = await armar().range(a, a + PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGINA) return out
  }
}

export function useSeguimientoPolicial() {
  const caps = useCapabilities()
  const permitidas = useMemo(() => REGIONS.filter(r => can(caps, 'comite.policial.operar', r.cod)).map(r => r.cod), [caps])
  const [datos, setDatos] = useState<DatosPolicial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clave = permitidas.join(',')

  useEffect(() => {
    if (!clave) return
    const regiones = clave.split(',')
    let cancelado = false
    ;(async () => {
      try {
        const sb = getSupabase()
        const [estandar, metricas, sesiones] = await Promise.all([
          todas<MetricaEstandar & { tipo: string }>(() => sb.from('comite_metrica_estandar')
            .select('id, institucion, nombre, unidad, orden, tipo').eq('activo', true).eq('tipo', 'numerico').order('id')),
          todas<MetricaRegional>(() => sb.from('comite_metrica')
            .select('id, region_cod, institucion, nombre, unidad, tipo, estandar_id').in('region_cod', regiones).order('id')),
          // Solo las cerradas: lo que se cargó en una sesión abierta todavía puede cambiar.
          todas<SesionCerrada>(() => sb.from('eje_sesiones')
            .select('id, region_cod, fecha').eq('instancia', 'eje').eq('estado', 'cerrada').in('region_cod', regiones).order('id')),
        ])
        const ids = sesiones.map(s => s.id)
        const valores: ValorReportado[] = []
        for (let i = 0; i < ids.length; i += 100) {
          valores.push(...await todas<ValorReportado>(() => sb.from('sesion_comite_valor')
            .select('sesion_id, metrica_id, valor_num').in('sesion_id', ids.slice(i, i + 100)).not('valor_num', 'is', null).order('id')))
        }
        if (cancelado) return
        setDatos({ estandar, sesiones, ...armarSeries(estandar, metricas, sesiones, valores) })
        setError(null)
      } catch (err) {
        if (!cancelado) setError((err as Error).message)
      }
    })()
    return () => { cancelado = true }
  }, [clave])

  return { datos, error, cargando: !!clave && !datos && !error, permitidas }
}
