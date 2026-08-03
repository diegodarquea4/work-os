'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Alert } from './Alert'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'
type ToastItem = { id: number; variant: ToastVariant; title?: string; message: ReactNode }
type ToastInput = { variant?: ToastVariant; title?: string; message: ReactNode; duration?: number }

const ToastCtx = createContext<{ toast: (t: ToastInput) => void } | null>(null)

/** Hook para disparar avisos. Reemplaza window.alert / rollback silencioso. */
export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}

/**
 * Sistema de avisos del panel (toasts). Montar una vez cerca de la raíz.
 * Auto-descartan a los 5s (los de error duran más). Se apilan arriba a la
 * derecha, por encima de todo (z-[9999]).
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => setItems(x => x.filter(t => t.id !== id)), [])

  const toast = useCallback((t: ToastInput) => {
    const id = ++idRef.current
    const variant = t.variant ?? 'info'
    setItems(x => [...x, { id, variant, title: t.title, message: t.message }])
    const dur = t.duration ?? (variant === 'error' ? 8000 : 5000)
    if (dur > 0) setTimeout(() => dismiss(id), dur)
  }, [dismiss])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[min(380px,calc(100vw-2rem))]" role="region" aria-label="Notificaciones" aria-live="polite">
          {items.map(t => (
            <div key={t.id} className="shadow-lg rounded-lg">
              <Alert variant={t.variant} title={t.title} onClose={() => dismiss(t.id)}>{t.message}</Alert>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  )
}
