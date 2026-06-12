'use client'

/**
 * Card de alertas críticas. Originalmente inline en VistaRegional.tsx (líneas
 * 72-110); se extrajo para que RegionPreviewPanel (preview del Mapa) la pueda
 * reusar sin duplicar lógica de borde, expand, y formato de items.
 *
 * Sin cambios de comportamiento respecto al original.
 */

import { useState } from 'react'

export type AlertItem = {
  label:     string
  sub:       string
  isUrgent?: boolean
}

type Props = {
  icon:  string
  title: string
  color: 'red' | 'amber' | 'gray'
  items: AlertItem[]
}

export default function AlertCard({ icon, title, color, items }: Props) {
  const [expanded, setExpanded] = useState(false)
  const borderCls = color === 'red'   ? 'border-red-100 bg-red-50'
                  : color === 'amber' ? 'border-amber-100 bg-amber-50'
                  :                     'border-gray-100 bg-gray-50'
  const titleCls  = color === 'red'   ? 'text-red-700'
                  : color === 'amber' ? 'text-amber-700'
                  :                     'text-gray-600'
  const visible   = expanded ? items : items.slice(0, 3)

  return (
    <div className={`rounded-xl border p-3 ${borderCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${titleCls}`}>
          <span>{icon}</span>{title}
        </span>
        {items.length > 3 && (
          <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-gray-400 hover:text-gray-600">
            {expanded ? 'Ver menos' : `+${items.length - 3} más`}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {visible.map((item, i) => (
          <div key={i} className="flex flex-col">
            <span className={`text-xs font-medium leading-tight truncate ${item.isUrgent ? 'text-red-700' : 'text-slate-700'}`}>
              {item.label}
            </span>
            <span className="text-[10px] text-gray-400 truncate">{item.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
