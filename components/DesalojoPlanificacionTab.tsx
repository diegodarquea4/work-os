'use client'

import { useEffect, useState } from 'react'
import type { DesalojoCapa, DesalojoPlanificacion } from '@/lib/types'
import DesalojoTimelineList from './DesalojoTimelineList'
import DesalojoGantt from './DesalojoGantt'

/**
 * Tab "Planificación" del case view de Desalojos.
 *
 * Layout 2 columnas: izquierda timeline vertical de eventos, derecha carta
 * Gantt grande. Click en barra del Gantt → flashea la card del timeline.
 */

type Props = {
  eventos:   DesalojoPlanificacion[]
  capas:     DesalojoCapa[]
  onCreate:  (input: {
    capa_id?:     number | null
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
  onPatch:   (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:  (id: number) => Promise<void>
}

export default function DesalojoPlanificacionTab({
  eventos, capas, onCreate, onPatch, onDelete,
}: Props) {
  const [flashId, setFlashId] = useState<number | null>(null)

  useEffect(() => {
    if (flashId === null) return
    const t = setTimeout(() => setFlashId(null), 600)
    return () => clearTimeout(t)
  }, [flashId])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,440px)_1fr] gap-6">
      <section className="min-w-0">
        <DesalojoTimelineList
          eventos={eventos}
          capas={capas}
          onCreate={onCreate}
          onPatch={onPatch}
          onDelete={onDelete}
          flashId={flashId}
        />
      </section>
      <section className="min-w-0">
        <DesalojoGantt
          eventos={eventos}
          onSelectEvento={(id) => setFlashId(id)}
        />
      </section>
    </div>
  )
}
