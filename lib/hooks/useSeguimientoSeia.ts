'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { diaChile } from '@/lib/fechaChile'
import { INE_INVERSE } from '@/lib/regions'
import type { OficioFila, Sesion, CarteraAlta } from '@/lib/seguimientoSeia'

/**
 * Lo que necesita el tablero «Seguimiento de la inversión en el SEIA».
 *
 * Todo con el cliente del navegador: la RLS decide qué regiones ve cada uno
 * (admin y editor, las 16; quien opera el Comité Económico, las suyas). El
 * tablero no filtra por permisos por su cuenta — si filtrara, podría mostrar
 * menos de lo que la base deja ver, o prometer más.
 */

export type ProyectoCarteraFila = {
  id: number
  region_cod: string
  created_at: string
  nombre: string
  plazo: string | null
  priorizado: boolean
  seremi_lider: string | null
  inversion_monto: number | null
  inversion_moneda: string | null
  mano_obra_directa: number | null
  mano_obra_indirecta: number | null
  estado_actual: string | null
  riesgo: boolean
  seia_expediente_id: number | null
  origen_id: string | null
}

export type ProyectoSeia = {
  id: string
  region: string
  nombre: string
  titular: string | null
  tipo: string | null
  comuna: string | null
  via: string | null
  inversion: number | null
  ingreso: string | null
  url: string | null
}

export type DatosSeguimientoSeia = {
  hoy: string
  oficios: OficioFila[]
  sesiones: Sesion[]
  cartera: ProyectoCarteraFila[]
  carteraAltas: CarteraAlta[]
  /** En calificación en el SEIA, por región. */
  enCalificacion: ProyectoSeia[]
  /** Ficha del SEIA por número de expediente (en calificación, de la cartera y de oficios). */
  catalogo: Map<string, ProyectoSeia>
  /** Inversión (USD) de cada expediente con oficios, para las tarjetas. */
  inversionPorExpediente: Map<string, number>
  /**
   * Por región, el día (Chile) en que se revisó por última vez el oficio
   * pendiente MENOS al día. El scraper re-estampa `importado_at` en cada
   * pendiente que vuelve a ver, así que el mínimo dice hasta cuándo está al día
   * TODO lo que se muestra. Con el máximo, refrescar solo los priorizados
   * haría ver al día una región cuyo resto lleva días sin revisarse.
   */
  actualizado: Record<string, string>
  /**
   * Regiones que el botón puede refrescar: el botón por región recorre solo
   * los proyectos PRIORIZADOS de la cartera, así que una región sin
   * priorizados vinculados al SEIA no tiene nada que refrescar a mano (la
   * pone al día el cron nacional). Con priorizados, se puede si alguno de sus
   * oficios no se revisó hoy, o si todavía no tienen ninguno guardado.
   */
  refrescables: Set<string>
  /**
   * Regiones que el tablero puede medir: tienen oficios guardados o algún
   * proyecto de la cartera vinculado a un expediente del SEIA (que es lo que
   * recorre el scraper). Una vinculada sin oficios está en cero, no sin datos.
   */
  medibles: Set<string>
}

const PAGINA = 1000

/** Trae todas las filas de una consulta, de a 1.000 (el tope de PostgREST). */
async function todas<T>(armar: (desde: number, hasta: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGINA) return out
  }
}

/** Los nombres del SEIA a veces llegan con las comillas escapadas: `\"Los Avellanos\"`. */
const limpiar = (s: string | null) => s?.replace(/\\"/g, '"') ?? null

const COLUMNAS_SEIA = 'id, region_id, nombre, titular, tipo, comuna_nombre, via_ingreso, inversion, fecha_presentacion, url_ficha'
type FilaSeia = { id: string; region_id: number | null; nombre: string; titular: string | null; tipo: string | null; comuna_nombre: string | null; via_ingreso: string | null; inversion: number | null; fecha_presentacion: string | null; url_ficha: string | null }
const aProyecto = (p: FilaSeia): ProyectoSeia => ({
  id: p.id, region: (p.region_id != null ? INE_INVERSE[p.region_id] : null) ?? 'INTER',
  nombre: limpiar(p.nombre) ?? 'Proyecto sin nombre', titular: p.titular, tipo: p.tipo,
  comuna: p.comuna_nombre, via: p.via_ingreso, inversion: p.inversion, ingreso: p.fecha_presentacion, url: p.url_ficha,
})

/** El expediente del SEIA de un proyecto de la cartera, o null si se cargó a mano. */
export function expedienteDeCartera(c: Pick<ProyectoCarteraFila, 'seia_expediente_id' | 'origen_id'>): string | null {
  if (c.seia_expediente_id != null) return String(c.seia_expediente_id)
  return c.origen_id?.startsWith('seia_') ? c.origen_id.slice(5) : null
}

export function useSeguimientoSeia() {
  const [datos, setDatos] = useState<DatosSeguimientoSeia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelado = false
    const sb = getSupabase()
    ;(async () => {
      try {
        const [oficios, sesiones, cartera, seia] = await Promise.all([
          todas<OficioFila>((a, b) => sb.from('sesion_oficios_tratados')
            .select('id, id_expediente, nombre_proyecto, ministerio, oaeca_sea, oaeca_nombre, tipo_oficio, fecha_limite, fecha_oficio, url_oficio, url_proyecto, region_cod, proyecto_privado_id, estado, estado_updated_at, importado_at')
            .eq('automatico', true).order('id').range(a, b)),
          todas<{ region_cod: string; fecha: string | null }>((a, b) => sb.from('eje_sesiones')
            .select('region_cod, fecha').eq('instancia', 'inversion').order('id').range(a, b)),
          todas<ProyectoCarteraFila>((a, b) => sb.from('comite_economico_proyecto')
            .select('id, region_cod, created_at, nombre, plazo, priorizado, seremi_lider, inversion_monto, inversion_moneda, mano_obra_directa, mano_obra_indirecta, estado_actual, riesgo, seia_expediente_id, origen_id')
            .order('nombre').range(a, b)),
          todas<FilaSeia>((a, b) => sb.from('v2_proyectos_inversion')
            .select(COLUMNAS_SEIA)
            .eq('sistema_origen', 'seia').eq('estado', 'En Calificación').order('id').range(a, b)),
        ])

        // La ficha del SEIA de cada expediente que el tablero nombra: los en
        // calificación ya vinieron; faltan los de la cartera y los de oficios
        // que están en otro estado (aprobados, recién resueltos). De a 100
        // para no pasarse del largo de URL.
        const catalogo = new Map<string, ProyectoSeia>()
        for (const p of seia) catalogo.set(p.id.replace(/^seia_/, ''), aProyecto(p))
        const faltan = [...new Set([
          ...oficios.map(o => o.id_expediente != null ? String(o.id_expediente) : null),
          ...cartera.map(expedienteDeCartera),
        ])].filter((e): e is string => e != null && !catalogo.has(e))
        for (let i = 0; i < faltan.length; i += 100) {
          const { data, error } = await sb.from('v2_proyectos_inversion').select(COLUMNAS_SEIA)
            .in('id', faltan.slice(i, i + 100).map(e => `seia_${e}`))
          if (error) throw new Error(error.message)
          for (const p of (data ?? []) as unknown as FilaSeia[]) catalogo.set(p.id.replace(/^seia_/, ''), aProyecto(p))
        }
        const inversionPorExpediente = new Map<string, number>()
        for (const [e, p] of catalogo) if (p.inversion != null) inversionPorExpediente.set(e, p.inversion)

        const hoy = diaChile()
        const actualizado: Record<string, string> = {}
        for (const o of oficios) {
          if (!o.importado_at || o.estado !== 'pendiente') continue
          const d = diaChile(new Date(o.importado_at))
          if (!actualizado[o.region_cod] || d < actualizado[o.region_cod]) actualizado[o.region_cod] = d
        }

        const priorizados = new Map<number, string>() // id de cartera → región
        for (const c of cartera) if (c.priorizado && expedienteDeCartera(c)) priorizados.set(c.id, c.region_cod)
        const refrescables = new Set<string>()
        const conOficioPriorizado = new Set<string>()
        for (const o of oficios) {
          if (o.estado !== 'pendiente' || o.proyecto_privado_id == null || !priorizados.has(o.proyecto_privado_id)) continue
          conOficioPriorizado.add(o.region_cod)
          if (!o.importado_at || diaChile(new Date(o.importado_at)) < hoy) refrescables.add(o.region_cod)
        }
        for (const r of priorizados.values()) if (!conOficioPriorizado.has(r)) refrescables.add(r)

        // Medible = el cron la recorre: tiene oficios, proyectos de la cartera
        // con expediente o algo en calificación en el SEIA.
        const medibles = new Set<string>(oficios.map(o => o.region_cod))
        for (const c of cartera) if (expedienteDeCartera(c)) medibles.add(c.region_cod)
        for (const p of seia) {
          const r = p.region_id != null ? INE_INVERSE[p.region_id] : undefined
          if (r && r !== 'NAC') medibles.add(r)
        }

        if (cancelado) return
        setDatos({
          hoy,
          oficios,
          sesiones: sesiones.filter(s => s.fecha).map(s => ({ region: s.region_cod, fecha: s.fecha! })),
          cartera,
          carteraAltas: cartera.map(c => ({ region: c.region_cod, creado: diaChile(new Date(c.created_at)) })),
          enCalificacion: seia.map(aProyecto),
          catalogo,
          inversionPorExpediente,
          actualizado,
          refrescables,
          medibles,
        })
        setError(null)
      } catch (err) {
        if (!cancelado) setError((err as Error).message)
      }
    })()
    return () => { cancelado = true }
  }, [version])

  const recargar = useCallback(() => setVersion(v => v + 1), [])
  return { datos, error, cargando: !datos && !error, recargar }
}
