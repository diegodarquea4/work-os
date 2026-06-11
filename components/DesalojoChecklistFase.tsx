'use client'

import { useState } from 'react'
import type {
  DesalojoChecklistEstado,
  DesalojoFaseConSemaforo,
  DesalojoTipologia,
} from '@/lib/types'
import { checklistItems } from '@/lib/desalojos'

/**
 * Checklist genérico por tipología × fase. Sustituye al v2 DesalojoChecklistPaso0
 * (que era específico de PR). Estado persistido como JSONB en
 * desalojo_fase_estado.checklist_estado.
 *
 * Sin tipología asignada: aviso, sin items.
 *
 * El PATCH envía solo el subset cambiado — el server hace shallow merge contra
 * el estado actual. Items huérfanos (cambio de tipología) se conservan sin
 * renderizar.
 */

type Props = {
  tipologia:    DesalojoTipologia | null
  fase:         DesalojoFaseConSemaforo
  estado:       DesalojoChecklistEstado
  onPatch:      (patch: DesalojoChecklistEstado) => Promise<void>
}

export default function DesalojoChecklistFase({ tipologia, fase, estado, onPatch }: Props) {
  const items = checklistItems(tipologia, fase)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  if (!tipologia) {
    return (
      <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded">
        Asigna una tipología (A/B/C/D) para ver el checklist específico de esta fase.
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="text-xs text-gray-400 px-3 py-2">
        Sin checklist específico para esta fase.
      </div>
    )
  }

  const completos = items.filter(it => estado?.[it.key]?.done).length
  const pct       = Math.round((completos / items.length) * 100)

  async function toggleDone(key: string, current: boolean) {
    const node = estado?.[key] ?? { done: false, fecha: null }
    setSavingKey(key)
    try {
      await onPatch({ [key]: { done: !current, fecha: node.fecha } })
    } finally {
      setSavingKey(null)
    }
  }

  async function changeFecha(key: string, fecha: string) {
    const node    = estado?.[key] ?? { done: false, fecha: null }
    const nueva   = fecha || null
    if (nueva !== null && !/^\d{4}-\d{2}-\d{2}$/.test(nueva)) return
    setSavingKey(key)
    try {
      await onPatch({ [key]: { done: node.done, fecha: nueva } })
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-2">
      {/* Barra de progreso */}
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-slate-700'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums font-medium text-gray-700">{completos} / {items.length}</span>
      </div>

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
        {items.map(item => {
          const node    = estado?.[item.key]
          const done    = !!node?.done
          const fecha   = node?.fecha ?? ''
          const saving  = savingKey === item.key
          return (
            <li key={item.key} className="px-3 py-2.5 flex items-start gap-3 bg-white">
              <button
                type="button"
                onClick={() => toggleDone(item.key, done)}
                disabled={saving}
                aria-pressed={done}
                className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0 ${
                  done
                    ? 'bg-slate-900 border-slate-900 text-white'
                    : 'bg-white border-gray-300 text-transparent hover:border-slate-400'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <path d="M2 6l3 3 5-6"/>
                </svg>
              </button>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${done ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
                  {item.label}
                </p>
                {item.descripcion && (
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.descripcion}</p>
                )}
              </div>
              <input
                type="date"
                value={fecha}
                onChange={e => changeFecha(item.key, e.target.value)}
                disabled={saving}
                className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-700 disabled:opacity-50 flex-shrink-0"
                title="Fecha de cumplimiento (opcional)"
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
