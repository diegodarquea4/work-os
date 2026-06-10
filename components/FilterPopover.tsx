'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Popover reusable para filtros multi-select del Dashboard. Una sola pieza
 * cubre Región, Eje, Etapa, RAT, Fuente, Comuna, Origen, Etiquetas y
 * Responsable — el patrón es siempre el mismo: botón gatillo con badge de
 * cantidad seleccionada + dropdown con search opcional + lista scrolleable
 * de opciones + footer con "Limpiar".
 *
 * Decisiones de diseño:
 * - Siempre multi-select (Set<string>). Lo que antes era single ('todas')
 *   ahora es Set vacío. Suma feature: filtrar por varias regiones a la vez.
 * - Search aparece auto si hay >8 opciones, override con prop `searchable`.
 * - Click fuera y ESC cierran. No cierra al elegir (multi-select implica
 *   que el usuario quizás quiera marcar varios sin reabrir).
 * - `sublabel` se renderiza chico abajo de cada label (caso típico:
 *   responsable mostrando email completo).
 */

export type FilterOption = {
  value:     string
  label:     string
  sublabel?: string
  count?:    number
}

type Props = {
  label:      string
  options:    FilterOption[]
  selected:   Set<string>
  onChange:   (next: Set<string>) => void
  /** Si se omite, aparece cuando hay >8 opciones. */
  searchable?: boolean
  disabled?:  boolean
  /** Alineación del dropdown respecto al botón. Default: izquierda. */
  align?:     'left' | 'right'
  /** Placeholder del input de búsqueda. */
  searchPlaceholder?: string
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export default function FilterPopover({
  label,
  options,
  selected,
  onChange,
  searchable,
  disabled,
  align = 'left',
  searchPlaceholder = 'Buscar...',
}: Props) {
  const [open, setOpen]     = useState(false)
  const [query, setQuery]   = useState('')
  const rootRef             = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const willSearch = searchable ?? options.length > 8
  const filtered = query.trim()
    ? options.filter(o =>
        norm(o.label).includes(norm(query)) ||
        (o.sublabel ? norm(o.sublabel).includes(norm(query)) : false))
    : options

  function toggle(v: string) {
    const next = new Set(selected)
    next.has(v) ? next.delete(v) : next.add(v)
    onChange(next)
  }

  function clearAll() {
    onChange(new Set())
  }

  const count  = selected.size
  const active = count > 0

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
          active
            ? 'bg-slate-100 border-slate-300 text-slate-700'
            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span>{label}</span>
        {count > 0 && (
          <span className="bg-slate-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-px min-w-[18px] text-center leading-none">
            {count}
          </span>
        )}
        <span className="text-gray-400 text-[10px]">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg z-30 w-64 overflow-hidden`}
        >
          {willSearch && (
            <div className="px-2.5 pt-2.5 pb-2 border-b border-gray-100">
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full text-xs px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-300 placeholder:text-gray-400"
              />
            </div>
          )}
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">Sin resultados</p>
            ) : (
              filtered.map(o => {
                const checked = selected.has(o.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => toggle(o.value)}
                    className="w-full text-left px-3 py-1.5 hover:bg-gray-50 flex items-start gap-2"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      readOnly
                      className="mt-0.5 flex-shrink-0 rounded cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-700 truncate">{o.label}</span>
                        {typeof o.count === 'number' && (
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{o.count}</span>
                        )}
                      </div>
                      {o.sublabel && (
                        <p className="text-[10px] text-gray-400 truncate leading-tight mt-px">{o.sublabel}</p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
          {count > 0 && (
            <div className="border-t border-gray-100 px-3 py-1.5 flex items-center justify-between bg-gray-50">
              <span className="text-[10px] text-gray-500">
                {count} seleccionada{count !== 1 ? 's' : ''}
              </span>
              <button
                onClick={clearAll}
                className="text-[10px] text-slate-600 hover:text-slate-800 font-medium"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
