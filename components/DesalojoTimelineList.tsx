'use client'

import { useRef, useState } from 'react'
import type { DesalojoCapa, DesalojoPlanificacion } from '@/lib/types'
import DesalojoTimelineCard from './DesalojoTimelineCard'
import DesalojoTimelineEditor from './DesalojoTimelineEditor'

/**
 * Timeline vertical de eventos de planificación. Línea con círculos a la
 * izquierda, cards de evento a la derecha. Botón "+ Agregar evento" al final
 * abre el editor inline.
 *
 * Expone refs por evento para que el Gantt pueda scrollear y flashear la
 * card correspondiente al hacer click en su barra.
 */

export type TimelineFlashRef = {
  flashEvento: (id: number) => void
}

type Props = {
  eventos:        DesalojoPlanificacion[]      // SOLO eventos top-level (parent_id === null)
  hitosByParent:  Map<number, DesalojoPlanificacion[]>  // hitos agrupados por parent_id
  capas:          DesalojoCapa[]               // todas las capas del caso (activas + archivadas para badge)
  onCreate:       (input: {
    capa_id?:     number | null
    parent_id?:   number | null
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
  onPatch:        (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:       (id: number) => Promise<void>
  /** ID del evento a flashear (lo setea el Gantt al hacer click). */
  flashId?:       number | null
  /** ID del evento en foco del Gantt (highlight visual en su card). */
  focusedEventId?: number | null
  /** Callback al apretar el botón Foco — el padre setea el id en su estado. */
  onSelectFocus?: (id: number | null) => void
  /** Salta al mapa enfocando esta Etapa. */
  onVerEnMapa?: (etapaId: number) => void
  /** Conteo de polígonos por Etapa, para el badge "N en mapa". */
  polyCountByEtapa?: Map<number, number>
  /** Granularidad de fecha de la vista ('dia' | 'semana'). */
  granularidad?: 'dia' | 'semana'
  /** Solo lectura: oculta el editor de crear evento y los controles de las cards. */
  readOnly?: boolean
}

export default function DesalojoTimelineList({
  eventos, hitosByParent, capas, onCreate, onPatch, onDelete, flashId,
  focusedEventId, onSelectFocus, onVerEnMapa, polyCountByEtapa, granularidad = 'dia',
  readOnly = false,
}: Props) {
  const [editorOpen, setEditorOpen] = useState(false)
  const capasById = new Map(capas.map(c => [c.id, c] as const))

  // Refs para scrollear al evento desde el Gantt.
  const refs = useRef<Map<number, React.RefObject<HTMLLIElement | null>>>(new Map())
  function getRef(id: number): React.RefObject<HTMLLIElement | null> {
    let r = refs.current.get(id)
    if (!r) {
      r = { current: null }
      refs.current.set(id, r)
    }
    return r
  }

  // Al cambiar flashId, scrollear el card correspondiente.
  if (flashId != null) {
    const r = refs.current.get(flashId)
    if (r?.current) {
      r.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Storytelling del caso</h3>
        <span className="text-[11px] text-gray-500">{eventos.length} evento{eventos.length === 1 ? '' : 's'}</span>
      </div>

      {eventos.length === 0 && !editorOpen && (
        <div className="border border-dashed border-gray-300 rounded-lg px-4 py-6 text-center">
          <p className="text-xs text-gray-500 mb-2">Sin eventos todavía.</p>
          <p className="text-[11px] text-gray-400 leading-snug">
            Agrega los hitos del caso: qué se hizo, en qué estás trabajando ahora, qué viene.
          </p>
        </div>
      )}

      {eventos.length > 0 && (
        <ol className="relative border-l border-gray-200 ml-[5px]">
          {eventos.map(ev => (
            <DesalojoTimelineCard
              key={ev.id}
              evento={ev}
              capa={ev.capa_id !== null ? capasById.get(ev.capa_id) ?? null : null}
              hitos={hitosByParent.get(ev.id) ?? []}
              readOnly={readOnly}
              onPatch={onPatch}
              onDelete={onDelete}
              onAddHito={async input => { await onCreate(input) }}
              onSelectFocus={onSelectFocus ? () => onSelectFocus(focusedEventId === ev.id ? null : ev.id) : undefined}
              focused={focusedEventId === ev.id}
              cardRef={getRef(ev.id)}
              flash={flashId === ev.id}
              onVerEnMapa={onVerEnMapa}
              poligonoCount={polyCountByEtapa?.get(ev.id) ?? 0}
              granularidad={granularidad}
            />
          ))}
        </ol>
      )}

      {!readOnly && (editorOpen ? (
        <DesalojoTimelineEditor
          capas={capas.filter(c => c.activa)}
          onCreate={async (input) => {
            await onCreate(input)
            setEditorOpen(false)
          }}
          onCancel={() => setEditorOpen(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditorOpen(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-600 hover:border-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-colors"
        >
          + Agregar evento
        </button>
      ))}
    </div>
  )
}
