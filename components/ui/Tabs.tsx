'use client'

import { useRef, type ReactNode, type KeyboardEvent } from 'react'

type Item = { key: string; label: ReactNode; disabled?: boolean }

type Props = {
  items: Item[]
  value: string
  onChange: (key: string) => void
  variant?: 'underline' | 'segmented'
  ariaLabel?: string
  className?: string
}

/**
 * Tabs del sistema con semántica ARIA (role=tablist/tab) y navegación por
 * flechas — reemplaza los strips de <button> planos sin accesibilidad.
 */
export function Tabs({ items, value, onChange, variant = 'underline', ariaLabel, className = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    const enabled = items.filter(i => !i.disabled)
    const idx = enabled.findIndex(i => i.key === value)
    if (idx < 0) return
    e.preventDefault()
    const next = e.key === 'ArrowRight'
      ? enabled[(idx + 1) % enabled.length]
      : enabled[(idx - 1 + enabled.length) % enabled.length]
    onChange(next.key)
    requestAnimationFrame(() => ref.current?.querySelector<HTMLElement>(`[data-key="${next.key}"]`)?.focus())
  }

  if (variant === 'segmented') {
    return (
      <div ref={ref} role="tablist" aria-label={ariaLabel} onKeyDown={onKey}
        className={`inline-flex bg-slate-100 border border-slate-200 rounded-lg p-0.5 gap-0.5 ${className}`}>
        {items.map(i => {
          const on = i.key === value
          return (
            <button key={i.key} data-key={i.key} role="tab" aria-selected={on} disabled={i.disabled}
              tabIndex={on ? 0 : -1} onClick={() => onChange(i.key)}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40 ${
                on ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {i.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={ref} role="tablist" aria-label={ariaLabel} onKeyDown={onKey}
      className={`flex gap-0.5 border-b border-slate-200 ${className}`}>
      {items.map(i => {
        const on = i.key === value
        return (
          <button key={i.key} data-key={i.key} role="tab" aria-selected={on} disabled={i.disabled}
            tabIndex={on ? 0 : -1} onClick={() => onChange(i.key)}
            className={`text-sm font-semibold px-3.5 py-2 -mb-px border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 rounded-t disabled:opacity-40 ${
              on ? 'text-violet-700 border-violet-700' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
            {i.label}
          </button>
        )
      })}
    </div>
  )
}
