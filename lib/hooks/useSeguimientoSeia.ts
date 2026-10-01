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
  /** Inversión (USD) de cada expediente con oficios, para las tarjetas. */
  inversionPorExpediente: Map<string, number>
  /** Día chileno de la última actualización de cada región con oficios. */
  actualizado: Record<string, string>
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
          todas<{ id: string; region_id: number | null; nombre: string; titular: string | null; tipo: string | null; comuna_nombre: string | null; via_ingreso: string | null; inversion: number | null; fecha_presentacion: string | null; url_ficha: string | null }>((a, b) => sb.from('v2_proyectos_inversion')
            .select('id, region_id, nombre, titular, tipo, comuna_nombre, via_ingreso, inversion, fecha_presentacion, url_ficha')
            .eq('sistema_origen', 'seia').eq('estado', 'En Calificación').order('id').range(a, b)),
        ])

        // La inversión de los expedientes con oficios que no estén en
        // calificación (pocos: los que se resolvieron hace poco).
        const inversionPorExpediente = new Map<string, number>()
        for (const p of seia) if (p.inversion != null) inversionPorExpediente.set(p.id.replace(/^seia_/, ''), p.inversion)
        const faltan = [...new Set(oficios.map(o => String(o.id_expediente)))].filter(e => e !== 'null' && !inversionPorExpediente.has(e))
        if (faltan.length) {
          const { data } = await sb.from('v2_proyectos_inversion').select('id, inversion').in('id', faltan.map(e => `seia_${e}`))
          for (const p of (data ?? []) as { id: string; inversion: number | null }[]) {
            if (p.inversion != null) inversionPorExpediente.set(p.id.replace(/^seia_/, ''), p.inversion)
          }
        }

        const actualizado: Record<string, string> = {}
        for (const o of oficios) {
          if (!o.importado_at) continue
          const d = diaChile(new Date(o.importado_at))
          if (!actualizado[o.region_cod] || d > actualizado[o.region_cod]) actualizado[o.region_cod] = d
        }

        const medibles = new Set<string>(Object.keys(actualizado))
        for (const c of cartera) {
          if (c.seia_expediente_id != null || c.origen_id?.startsWith('seia_')) medibles.add(c.region_cod)
        }

        if (cancelado) return
        setDatos({
          hoy: diaChile(),
          oficios,
          sesiones: sesiones.filter(s => s.fecha).map(s => ({ region: s.region_cod, fecha: s.fecha! })),
          cartera,
          carteraAltas: cartera.map(c => ({ region: c.region_cod, creado: diaChile(new Date(c.created_at)) })),
          enCalificacion: seia.map(p => ({
            id: p.id, region: (p.region_id != null ? INE_INVERSE[p.region_id] : null) ?? 'INTER',
            nombre: limpiar(p.nombre) ?? 'Proyecto sin nombre', titular: p.titular, tipo: p.tipo,
            comuna: p.comuna_nombre, via: p.via_ingreso, inversion: p.inversion, ingreso: p.fecha_presentacion, url: p.url_ficha,
          })),
          inversionPorExpediente,
          actualizado,
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
