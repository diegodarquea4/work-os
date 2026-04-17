'use client'

import { useState } from 'react'
import type { Seguimiento } from '@/lib/types'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
  alerta:  { label: 'Alerta',  color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'    },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'En curso',   color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

type Props = { seguimientos: Seguimiento[] }

export default function CalendarioTab({ seguimientos }: Props) {
  const [calMonth, setCalMonth] = useState(() => new Date())
  const [calDay, setCalDay]     = useState<string | null>(null)

  const today = new Date().toISOString().split('T')[0]
  const year  = calMonth.getFullYear()
  const month = calMonth.getMonth()

  const byDate: Record<string, Seguimiento[]> = {}
  for (const s of seguimientos) {
    const d = s.fecha ? s.fecha.split('T')[0] : s.created_at.split('T')[0]
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  }

  const firstDow = new Date(year, month, 1).getDay()
  const offset   = (firstDow + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const _mn = calMonth.toLocaleDateString('es-CL', { month: 'long' })
  const monthLabel = `${_mn.charAt(0).toUpperCase() + _mn.slice(1)} ${calMonth.getFullYear()}`
  const selectedEntries = calDay ? (byDate[calDay] ?? []) : []

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setCalMonth(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 2L4 7l5 5"/>
          </svg>
        </button>
        <span className="text-sm font-medium text-gray-800 capitalize">{monthLabel}</span>
        <button
          onClick={() => setCalMonth(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 2l5 5-5 5"/>
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
        {cells.map((dateStr, i) => {
          if (!dateStr) return <div key={i} className="bg-white h-16" />
          const entries    = byDate[dateStr] ?? []
          const isToday    = dateStr === today
          const isSelected = dateStr === calDay
          const dayNum     = parseInt(dateStr.split('-')[2])
          return (
            <button
              key={i}
              onClick={() => setCalDay(isSelected ? null : dateStr)}
              className={`bg-white h-16 p-1.5 flex flex-col items-start transition-colors hover:bg-slate-50 ${
                isSelected ? 'bg-slate-50 ring-2 ring-inset ring-slate-900' : ''
              }`}
            >
              <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                isToday ? 'bg-slate-900 text-white' : 'text-gray-600'
              }`}>{dayNum}</span>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {entries.slice(0, 4).map((s, j) => (
                  <span
                    key={j}
                    title={`${TIPO_CONFIG[s.tipo]?.label}: ${s.descripcion}`}
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_CONFIG[s.tipo]?.dot ?? 'bg-gray-300'}`}
                  />
                ))}
                {entries.length > 4 && <span className="text-xs text-gray-400 leading-none">+{entries.length - 4}</span>}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-xs text-gray-500">{cfg.label}</span>
          </div>
        ))}
      </div>

      {calDay && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-3">
            {new Date(calDay + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            {selectedEntries.length === 0 && ' — Sin actividad'}
          </p>
          {selectedEntries.length > 0 && (
            <div className="space-y-2">
              {selectedEntries.map(s => {
                const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
                const est = s.estado ? ESTADO_CONFIG[s.estado as keyof typeof ESTADO_CONFIG] : null
                return (
                  <div key={s.id} className="flex gap-3 items-start p-2.5 rounded-lg bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {est && <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>
                      {s.autor && <p className="text-xs text-gray-500 mt-0.5">{s.autor}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
