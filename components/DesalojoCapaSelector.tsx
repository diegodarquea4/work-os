'use client'

import type { DesalojoCapa } from '@/lib/types'
import DesalojoTipologiaChip from './DesalojoTipologiaChip'

/**
 * Selector horizontal de capas (pills). Si hay 1 sola capa activa, no se
 * renderiza — la ficha se comporta como caso simple sin chrome adicional.
 */

type Props = {
  capas:      DesalojoCapa[]      // ya ordenadas por orden, solo las que mostrar
  selectedId: number | null
  onSelect:   (capaId: number) => void
}

export default function DesalojoCapaSelector({ capas, selectedId, onSelect }: Props) {
  const activas = capas.filter(c => c.activa)
  if (activas.length <= 1) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-semibold text-gray-500 mr-1">Capa:</span>
      {activas.map(c => {
        const active = c.id === selectedId
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSelect(c.id)}
            className={`text-xs px-2.5 py-1 rounded-full font-medium ring-1 inline-flex items-center gap-1.5 transition-colors ${
              active
                ? 'bg-slate-900 text-white ring-slate-900'
                : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
            }`}
          >
            <span>{c.nombre}</span>
            <DesalojoTipologiaChip tipologia={c.tipologia} size="xs" withLabel={false} />
          </button>
        )
      })}
    </div>
  )
}
