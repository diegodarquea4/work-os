'use client'

import { useMemo, useState } from 'react'
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
 * La sesión recorre la cartera proyecto por proyecto, así que esa es la
 * unidad de lectura: qué proyecto tiene algo sin responder, de qué se trata, y
 * qué organismos lo deben. Dentro de cada uno se abre por organismo porque ese
 * es el sujeto del reclamo — un proyecto no responde, responde la DGA.
 *
 * El ALTA del compromiso no vive acá sino en la zona 4, precargada por
 * organismo: un compromiso cubre al organismo en toda la región, no solo en
 * este proyecto, y ofrecerlo dentro de la tarjeta de un proyecto haría parecer
 * que es del proyecto. Acá solo se muestra quién ya le hace seguimiento.
 *
 * No cambia el estado de ningún oficio: lo manda el SEIA y la importación
 * siguiente lo trae.
 */

export type CompromisoAbierto = Pick<
  SesionCompromiso,
  'id' | 'oaeca_objetivo' | 'estado' | 'responsable_institucion' | 'responsable_nombre' | 'plazo'
>

type Props = {
  /** Ya filtrados al tramo que este bloque muestra (vencidos o por vencer). */
  oficios: OficioSeguimiento[]
  /** Compromisos con organismo de esta región — para mostrar quién hace seguimiento. */
  compromisos: CompromisoAbierto[]
  hoy: string
  titulo: string
  subtitulo: string
  onAbrirProyecto: (id: number) => void
}

export default function OficiosSeguimientoBloque({
  oficios, compromisos, hoy, titulo, subtitulo, onAbrirProyecto,
}: Props) {
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
        <h5 className="text-[10px] font-semibold text-gray-500">{titulo}</h5>
        <span className="text-[10px] text-gray-400">{subtitulo}</span>
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
  // Abiertos por defecto: lo que hay que leer en la sesión es el detalle, no
  // la lista de nombres. Se pueden cerrar cuando el proyecto ya se trató.
  const [abierto, setAbierto] = useState(true)
  const urgente = g.vencidos > 0

  // De qué se trata: «Solicitud de Adenda». Casi siempre es uno solo para todo
  // el proyecto —un documento del SEA va a varios organismos a la vez—, así
  // que va en el encabezado; si hay más de uno, cada fila lleva el suyo.
  const tipos = useMemo(() => {
    const s = new Set<string>()
    for (const o of g.oficios) if (o.tipo_oficio) s.add(o.tipo_oficio)
    return [...s]
  }, [g.oficios])

  return (
    <div className={`rounded-lg border ${urgente ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
      <div className="px-3 py-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* El proyecto abre su ficha interna. Si no está en la cartera queda
              como texto: no hay ficha, y mandar al SEIA sería ofrecer la
              salida del panel justo donde falta cargarlo adentro. */}
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

          {tipos.length === 1 && (
            <p className="text-xs text-slate-600 mt-0.5">{tipos[0]}</p>
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

        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          aria-expanded={abierto}
          aria-label={abierto ? 'Contraer proyecto' : 'Expandir proyecto'}
          className="flex-shrink-0 p-1 -m-1 rounded hover:bg-white/60"
        >
          <ChevronPlegado abierto={abierto} />
        </button>
      </div>

      {abierto && (
        <div className="border-t border-white/60 divide-y divide-white/60">
          {g.organismos.map(org => (
            <OrganismoFila
              key={org.clave}
              org={org}
              hoy={hoy}
              mostrarTipo={tipos.length > 1}
              compromiso={comprometidos.get(org.clave) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrganismoFila({ org, hoy, mostrarTipo, compromiso }: {
  org: OrganismoDelProyecto
  hoy: string
  mostrarTipo: boolean
  compromiso: CompromisoAbierto | null
}) {
  return (
    <div className="px-3 py-2">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-700 leading-snug">{org.nombre}</p>
          {compromiso && (
            <p className="text-[10px] text-slate-500 mt-0.5">
              <span className="font-semibold text-violet-800">Seguimiento:</span>{' '}
              {compromiso.responsable_nombre ?? compromiso.responsable_institucion}
              {compromiso.plazo && <span className="text-gray-400"> · al {fmt(compromiso.plazo)}</span>}
            </p>
          )}
        </div>
        {!compromiso && <span className="flex-shrink-0 text-[10px] text-gray-400">sin seguimiento</span>}
      </div>

      <div className="mt-1 space-y-0.5">
        {org.oficios.map(o => (
          <FilaOficio key={o.id} o={o} hoy={hoy} mostrarTipo={mostrarTipo} />
        ))}
      </div>
    </div>
  )
}

function FilaOficio({ o, hoy, mostrarTipo }: {
  o: OficioSeguimiento
  hoy: string
  mostrarTipo: boolean
}) {
  const d = o.fecha_limite ? diasHasta(o.fecha_limite, hoy) : null
  const vencido = d != null && d < 0

  // Escrito completo y no «4d»: esto se lee en voz alta en una reunión.
  const plazo = d == null ? 'sin plazo'
    : vencido ? `${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'} de atraso`
    : d === 0 ? 'vence hoy'
    : `vence en ${d} día${d === 1 ? '' : 's'}`

  return (
    <div className="flex items-baseline gap-2 flex-wrap text-[11px]">
      {/* La fecha primero: es el dato duro que se cita. Los días son la
          lectura de esa fecha, no su reemplazo. */}
      <span className="tabular-nums text-slate-600">
        {o.fecha_limite ? fmt(o.fecha_limite) : '—'}
      </span>
      <span className={`font-bold ${vencido ? 'text-red-700' : 'text-amber-700'}`}>{plazo}</span>
      {mostrarTipo && o.tipo_oficio && (
        <span className="text-gray-500">· {o.tipo_oficio}</span>
      )}
      {o.url_oficio && (
        <a
          href={o.url_oficio}
          target="_blank"
          rel="noreferrer"
          className="text-violet-700 hover:text-violet-900 hover:underline font-medium"
        >
          Ver oficio →
        </a>
      )}
    </div>
  )
}

/**
 * El chevron de plegado del panel: mismo trazo y misma rotación que
 * CollapsibleSection —abierto apunta abajo, cerrado a la izquierda—, para que
 * plegar se vea igual en todas partes.
 */
export function ChevronPlegado({ abierto }: { abierto: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform ${abierto ? 'rotate-90' : '-rotate-90'}`}
      viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
    >
      <path d="M5 2l5 5-5 5"/>
    </svg>
  )
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
