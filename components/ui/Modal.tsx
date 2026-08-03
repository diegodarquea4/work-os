'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

type Size = 'sm' | 'md' | 'lg' | 'xl'
const SIZE: Record<Size, string> = {
  sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl',
}

type Props = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: Size
  /** Si false, el click en el backdrop NO cierra (formularios con cambios). */
  dismissable?: boolean
}

/**
 * Modal único del sistema (portal a document.body). Reemplaza los 26 backdrops
 * reimplementados y los 3 "shells" distintos. Incluye: Esc para cerrar,
 * click-afuera (opcional), scroll-lock, focus-trap con Tab y restauración de
 * foco al cerrar. z-index fijo por capa (base 50).
 */
export function Modal({ open, onClose, title, children, footer, size = 'md', dismissable = true }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const prevFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    prevFocus.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.focus()
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key === 'Tab' && panel) {
        const f = panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        )
        if (f.length === 0) { e.preventDefault(); return }
        const first = f[0], last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
      prevFocus.current?.focus?.()
    }
  }, [open, onClose])

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm"
      onMouseDown={dismissable ? (e) => { if (e.target === e.currentTarget) onClose() } : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`w-full ${SIZE[size]} max-h-[calc(100vh-2rem)] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden focus:outline-none`}
      >
        {title && (
          <header className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100 flex-shrink-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 -mr-1" aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16" /></svg>
            </button>
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex-shrink-0">{footer}</footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
