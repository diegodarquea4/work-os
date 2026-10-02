'use client'

import { useCallback, useEffect, useState } from 'react'
import { diaChile } from '@/lib/fechaChile'
import { INE_INVERSE } from '@/lib/regions'
import type { OficioFila, Sesion, CarteraAlta } from '@/lib/seguimientoSeia'
import * as seguimiento from '@/lib/seguimientoSeia'

/**
 * Lo que necesita el tablero «Seguimiento de la inversión en el SEIA».
 *
 * Viene de GET /api/oficios-seia/tablero y no del cliente de Supabase: el
 * tablero lo ven todos y de todas las regiones (es información pública), pero
 * las tablas de origen tienen RLS por región. La ruta entrega solo las
 * columnas que se dibujan; ver su encabezado.
 */

export type ProyectoCarteraFila = {
  id: number
  region_cod: string
  created_at: string
  nombre: string
  priorizado: boolean
  inversion_monto: number | null
  inversion_moneda: string | null
  mano_obra_directa: number | null
  mano_obra_indirecta: number | null
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
  /** Solo las sesiones cerradas: una abierta o en borrador no cuenta. */
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
   * pendiente MENOS al día; sin pendientes, el de su última corrida completa. El scraper re-estampa `importado_at` en cada
   * pendiente que vuelve a ver, así que el mínimo dice hasta cuándo está al día
   * TODO lo que se muestra.
   */
  actualizado: Record<string, string>
  /**
   * Regiones que el botón puede refrescar: las que el cron recorre y no están
   * al día hoy.
   */
  refrescables: Set<string>
  /**
   * Regiones que el tablero puede medir: el cron las recorre porque tienen
   * oficios, proyectos de la cartera con expediente o algo en calificación.
   * Una medible sin oficios está en cero, no sin datos.
   */
  medibles: Set<string>
}

type FilaSeia = {
  id: string; region_id: number | null; nombre: string; titular: string | null; tipo: string | null
  comuna_nombre: string | null; via_ingreso: string | null; inversion: number | null
  fecha_presentacion: string | null; url_ficha: string | null
}

/** Los nombres del SEIA a veces llegan con las comillas escapadas: `\"Los Avellanos\"`. */
const limpiar = (s: string | null) => s?.replace(/\\"/g, '"') ?? null

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

type Crudo = {
  hoy: string
  oficios: OficioFila[]
  sesiones: { region_cod: string; fecha: string }[]
  cartera: ProyectoCarteraFila[]
  enCalificacion: FilaSeia[]
  otrasFichas: FilaSeia[]
  /** Día de la última corrida completa del scraper: '*' = nacional, o por región. */
  corridas?: Record<string, string>
}

/** Arma lo derivado. Separado del fetch para que se lea de corrido. */
function armar(c: Crudo): DatosSeguimientoSeia {
  const { hoy, oficios, cartera } = c

  const catalogo = new Map<string, ProyectoSeia>()
  for (const p of [...c.enCalificacion, ...c.otrasFichas]) catalogo.set(p.id.replace(/^seia_/, ''), aProyecto(p))
  const inversionPorExpediente = new Map<string, number>()
  for (const [e, p] of catalogo) if (p.inversion != null) inversionPorExpediente.set(e, p.inversion)

  const actualizado: Record<string, string> = {}
  for (const o of oficios) {
    if (!o.importado_at || o.estado !== 'pendiente') continue
    const d = diaChile(new Date(o.importado_at))
    if (!actualizado[o.region_cod] || d < actualizado[o.region_cod]) actualizado[o.region_cod] = d
  }

  const medibles = new Set<string>(oficios.map(o => o.region_cod))
  for (const p of cartera) if (expedienteDeCartera(p)) medibles.add(p.region_cod)
  for (const p of c.enCalificacion) {
    const r = p.region_id != null ? INE_INVERSE[p.region_id] : undefined
    if (r && r !== 'NAC') medibles.add(r)
  }

  // Una región sin oficios pendientes no tiene oficio que le dé fecha: vale la
  // de la última corrida completa que la recorrió (la suya o la nacional).
  for (const r of medibles) {
    if (actualizado[r]) continue
    const d = seguimiento.fechaSinPendientes(c.corridas, r)
    if (d) actualizado[r] = d
  }

  return {
    hoy,
    oficios,
    sesiones: c.sesiones.map(s => ({ region: s.region_cod, fecha: s.fecha })),
    cartera,
    carteraAltas: cartera.map(p => ({ region: p.region_cod, creado: diaChile(new Date(p.created_at)) })),
    enCalificacion: c.enCalificacion.map(aProyecto),
    catalogo,
    inversionPorExpediente,
    actualizado,
    refrescables: new Set([...medibles].filter(r => !actualizado[r] || actualizado[r] < hoy)),
    medibles,
  }
}

export function useSeguimientoSeia() {
  const [datos, setDatos] = useState<DatosSeguimientoSeia | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelado = false
    ;(async () => {
      try {
        const res = await fetch('/api/oficios-seia/tablero', { cache: 'no-store' })
        const texto = await res.text()
        let json: Crudo & { error?: string; detalle?: string }
        try {
          json = JSON.parse(texto)
        } catch {
          // Sesión vencida: el proxy devuelve la página de login, no JSON.
          throw new Error('Tu sesión venció. Recarga la página y vuelve a entrar.')
        }
        if (!res.ok) throw new Error(json.detalle ?? json.error ?? `HTTP ${res.status}`)
        if (cancelado) return
        setDatos(armar(json))
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
