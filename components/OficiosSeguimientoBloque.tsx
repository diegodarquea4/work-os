'use client'

import { useMemo } from 'react'
import { diasHasta } from '@/lib/oficiosSeia'
import {
  agruparPorProyecto,
  claveOaeca,
  type GrupoProyecto,
  type OficioSeguimiento,
  type OrganismoDelProyecto,
} from '@/lib/oficiosSeguimiento'
import type { SesionCompromiso } from '@/lib/types'

/**
 * Los oficios pendientes del SEIA en la sesión, por PROYECTO.
 *
 * Es la vista de lectura: la sesión recorre la cartera proyecto por proyecto,
 * y este bloque dice cuáles tienen algo sin responder y quién lo debe. Dentro
 * de cada proyecto se abre por organismo porque ese es el sujeto del reclamo —
 * un proyecto no responde, responde la DGA.
 *
 * El ALTA del compromiso no vive acá sino en la zona 4, precargada por
 * organismo: un compromiso cubre al organismo en toda la región, no solo en
 * este proyecto, y ofrecerlo dentro de una tarjeta de proyecto haría parecer
 * que es del proyecto. Acá solo se muestra quién ya lo persigue.
 *
 * No cambia el estado de ningún oficio: lo manda el SEIA y la importación
 * siguiente lo trae.
 */

export type CompromisoAbierto = Pick<
  SesionCompromiso,
  'id' | 'oaeca_objetivo' | 'estado' | 'responsable_institucion' | 'responsable_nombre' | 'plazo'
>

type Props = {
  oficios: OficioSeguimiento[]
  /** Compromisos con organismo de esta región — para mostrar quién persigue. */
  compromisos: CompromisoAbierto[]
  hoy: string
  onAbrirProyecto: (id: number) => void
}

export default function OficiosSeguimientoBloque({ oficios, compromisos, hoy, onAbrirProyecto }: Props) {
  const grupos = useMemo(() => agruparPorProyecto(oficios, hoy), [oficios, hoy])

  const comprometidos = useMemo(() => {
    const m = new Map<string, CompromisoAbierto>()
    for (const c of compromisos) {
      if (!c.oaeca_objetivo || c.estado === 'cumplido') continue
      m.set(claveOaeca(c.oaeca_objetivo), c)
    }
    return m
  }, [compromisos])

  if (grupos.length === 0) return null

  const totalOficios = grupos.reduce((n, g) => n + g.oficios.length, 0)

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h5 className="text-[10px] font-semibold text-gray-500">Pendientes en el SEIA</h5>
        <span className="text-[10px] text-gray-400">vencidos y por vencer</span>
        <span className="text-xs text-gray-400 ml-auto tabular-nums">
          {grupos.length} proyecto{grupos.length === 1 ? '' : 's'} · {totalOficios} oficio{totalOficios === 1 ? '' : 's'}
        </span>
      </div>

      <div className="space-y-1.5">
        {grupos.map(g => (
          <ProyectoCard
            key={g.clave}
            g={g}
            hoy={hoy}
            comprometidos={comprometidos}
            onAbrirProyecto={onAbrirProyecto}
          />
        ))}
      </div>
    </div>
  )
}

function ProyectoCard({ g, hoy, comprometidos, onAbrirProyecto }: {
  g: GrupoProyecto
  hoy: string
  comprometidos: Map<string, CompromisoAbierto>
  onAbrirProyecto: (id: number) => void
}) {
  const urgente = g.vencidos > 0

  return (
    <div className={`rounded-lg border ${urgente ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
      <div className="px-3 py-2">
        {/* El proyecto abre su ficha interna. Si no está en la cartera queda
            como texto: no hay ficha, y mandar al SEIA sería ofrecer la salida
            del panel justo donde falta cargarlo adentro. */}
        {g.proyectoId != null ? (
          <button
            type="button"
            onClick={() => onAbrirProyecto(g.proyectoId!)}
            className="text-sm text-slate-800 font-medium text-left leading-snug hover:underline hover:text-violet-800"
          >
            {g.nombre}
          </button>
        ) : (
          <p className="text-sm text-slate-800 font-medium leading-snug">{g.nombre}</p>
        )}
        <p className="text-[11px] text-gray-500 mt-0.5">
          {g.vencidos > 0 && (
            <span className="text-red-700 font-semibold">
              {g.vencidos} vencido{g.vencidos === 1 ? '' : 's'}
            </span>
          )}
          {g.vencidos > 0 && g.porVencer > 0 && <span className="text-gray-300"> · </span>}
          {g.porVencer > 0 && <span className="text-amber-700 font-semibold">{g.porVencer} por vencer</span>}
          <span className="text-gray-300"> · </span>
          {g.organismos.length} organismo{g.organismos.length === 1 ? '' : 's'}
          {g.proyectoId == null && <span className="text-gray-400"> · no está en la cartera</span>}
        </p>
      </div>

      <div className="border-t border-white/60 divide-y divide-white/60">
        {g.organismos.map(org => (
          <OrganismoFila
            key={org.clave}
            org={org}
            hoy={hoy}
            compromiso={comprometidos.get(org.clave) ?? null}
          />
        ))}
      </div>
    </div>
  )
}

function OrganismoFila({ org, hoy, compromiso }: {
  org: OrganismoDelProyecto
  hoy: string
  compromiso: CompromisoAbierto | null
}) {
  return (
    <div className="px-3 py-2 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-700 leading-snug">{org.nombre}</p>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
          {org.oficios.map(o => {
            const d = o.fecha_limite ? diasHasta(o.fecha_limite, hoy) : null
            const venc = d != null && d < 0
            return (
              <span
                key={o.id}
                className={`text-[10px] font-bold tabular-nums ${venc ? 'text-red-700' : 'text-amber-700'}`}
                title={o.fecha_limite ?? 'sin plazo'}
              >
                {d == null ? 'sin plazo' : venc ? `${Math.abs(d)}d atraso` : `${d}d`}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        {compromiso ? (
          <p className="text-[10px] text-slate-600 leading-snug max-w-[170px]">
            <span className="font-semibold text-violet-800">Lo persigue</span>{' '}
            {compromiso.responsable_nombre ?? compromiso.responsable_institucion}
            {compromiso.plazo && <span className="text-gray-400"> · {fmt(compromiso.plazo)}</span>}
          </p>
        ) : (
          // Lo dice, y dice dónde se arregla: el alta vive en la zona 4.
          <span className="text-[10px] text-gray-400">sin responsable</span>
        )}
      </div>
    </div>
  )
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
