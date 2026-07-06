'use client'

import { useEffect, useMemo, useState } from 'react'
import type { DesalojoCapa, DesalojoPlanificacion, DesalojoPoligono } from '@/lib/types'
import DesalojoTimelineList from './DesalojoTimelineList'
import DesalojoGantt from './DesalojoGantt'

/**
 * Tab "Planificación" del case view de Desalojos.
 *
 * Layout 2 columnas: izquierda timeline vertical de eventos (todos juntos
 * en orden cronológico, con badge de capa). Derecha una carta Gantt por
 * capa con eventos + una para los eventos sin capa ("Caso completo").
 * Click en barra del Gantt → flashea la card del timeline.
 */

type Props = {
  eventos:   DesalojoPlanificacion[]  // todos: top-level (parent_id NULL) + hitos (parent_id NOT NULL)
  capas:     DesalojoCapa[]
  poligonos?: DesalojoPoligono[]      // para el badge "N polígonos" por Etapa
  onCreate:  (input: {
    capa_id?:     number | null
    parent_id?:   number | null
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
  onPatch:   (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:  (id: number) => Promise<void>
  onVerEnMapa?: (etapaId: number) => void
}

type GanttGrupo = {
  key:      string
  title:    string
  subtitle: string | null
  eventos:  DesalojoPlanificacion[]
}

export default function DesalojoPlanificacionTab({
  eventos, capas, poligonos, onCreate, onPatch, onDelete, onVerEnMapa,
}: Props) {
  const [flashId, setFlashId]               = useState<number | null>(null)
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null)

  // Conteo de polígonos por Etapa (evento top-level), para el badge "N en mapa".
  const polyCountByEtapa = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of poligonos ?? []) {
      if (p.planificacion_id != null) m.set(p.planificacion_id, (m.get(p.planificacion_id) ?? 0) + 1)
    }
    return m
  }, [poligonos])

  useEffect(() => {
    if (flashId === null) return
    const t = setTimeout(() => setFlashId(null), 600)
    return () => clearTimeout(t)
  }, [flashId])

  // Separar eventos top-level (parent_id NULL) de hitos (parent_id NOT NULL).
  // Los hitos los indexamos por su parent_id para pasárselos a cada card.
  const { topLevel, hitosByParent } = useMemo(() => {
    const top: DesalojoPlanificacion[] = []
    const byParent = new Map<number, DesalojoPlanificacion[]>()
    for (const e of eventos) {
      if (e.parent_id === null) {
        top.push(e)
      } else {
        const arr = byParent.get(e.parent_id) ?? []
        arr.push(e)
        byParent.set(e.parent_id, arr)
      }
    }
    // Sort hitos de cada padre por fecha_inicio, orden, id.
    for (const arr of byParent.values()) {
      arr.sort((a, b) =>
        a.fecha_inicio.localeCompare(b.fecha_inicio) ||
        a.orden - b.orden ||
        a.id    - b.id
      )
    }
    return { topLevel: top, hitosByParent: byParent }
  }, [eventos])

  // Si el evento en foco se elimina, salir del modo foco.
  useEffect(() => {
    if (focusedEventId !== null && !topLevel.find(e => e.id === focusedEventId)) {
      setFocusedEventId(null)
    }
  }, [focusedEventId, topLevel])

  const focusedEvent = focusedEventId !== null ? topLevel.find(e => e.id === focusedEventId) ?? null : null
  const focusedHitos = focusedEventId !== null ? hitosByParent.get(focusedEventId) ?? [] : []

  // Agrupar eventos top-level por capa_id. capa_id=null → "Caso completo".
  // Solo grupos con al menos 1 evento (capas vacías no generan Gantt).
  const grupos = useMemo<GanttGrupo[]>(() => {
    const sinCapa = topLevel.filter(e => e.capa_id === null)
    const capasOrdenadas = [...capas].sort((a, b) => a.orden - b.orden)

    const out: GanttGrupo[] = []
    if (sinCapa.length > 0) {
      out.push({
        key:      'sin-capa',
        title:    'Caso completo',
        subtitle: null,
        eventos:  sinCapa,
      })
    }
    for (const c of capasOrdenadas) {
      const ev = topLevel.filter(e => e.capa_id === c.id)
      if (ev.length === 0) continue
      out.push({
        key:      `capa-${c.id}`,
        title:    c.nombre,
        subtitle: c.activa ? null : 'capa archivada',
        eventos:  ev,
      })
    }
    return out
  }, [topLevel, capas])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr] gap-6">
      <section className="min-w-0">
        <DesalojoTimelineList
          eventos={topLevel}
          hitosByParent={hitosByParent}
          capas={capas}
          onCreate={onCreate}
          onPatch={onPatch}
          onDelete={onDelete}
          flashId={flashId}
          focusedEventId={focusedEventId}
          onSelectFocus={setFocusedEventId}
          onVerEnMapa={onVerEnMapa}
          polyCountByEtapa={polyCountByEtapa}
        />
      </section>
      <section className="min-w-0 space-y-4">
        {focusedEvent ? (
          <DesalojoGantt
            title={focusedEvent.titulo}
            subtitle={focusedHitos.length === 0
              ? 'sin hitos — agrega hitos en la card para verlos desglosados'
              : `${focusedHitos.length} hito${focusedHitos.length === 1 ? '' : 's'}`}
            eventos={[]}                              // ignorado en modo foco
            focusedParent={focusedEvent}
            focusedHitos={focusedHitos}
            onExitFocus={() => setFocusedEventId(null)}
            onSelectEvento={id => setFlashId(id)}
          />
        ) : grupos.length === 0 ? (
          <DesalojoGantt
            eventos={topLevel}
            onSelectEvento={id => setFlashId(id)}
          />
        ) : (
          grupos.map(g => (
            <DesalojoGantt
              key={g.key}
              title={g.title}
              subtitle={g.subtitle ?? undefined}
              eventos={g.eventos}
              onSelectEvento={id => setFlashId(id)}
            />
          ))
        )}
      </section>
    </div>
  )
}
