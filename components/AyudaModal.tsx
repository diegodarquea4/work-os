'use client'

import { useEffect, useState } from 'react'
import { useCanEditAny, useIsAdmin } from '@/lib/context/UserContext'
import FaqList from './FaqList'

/**
 * Centro de Ayuda. Modal multi-sección con tabs `Tour | FAQ`.
 *
 * - Tour: iframe del explainer servido desde /tour/explainer.html.
 *   Solo montamos el iframe cuando la tab Tour está activa Y el modal
 *   abierto — el SpeechSynthesis del explainer queda hablando si el
 *   iframe sigue vivo mientras se navega fuera o se cierra.
 * - FAQ: catálogo filtrado por rol del usuario, con búsqueda y acordeón
 *   (componente reutilizable FaqList).
 *
 * Atajo `Shift + /` (la tecla ?) abre el modal — lo controla el padre.
 */

type Tab = 'tour' | 'faq'

type Props = {
  open:        boolean
  onClose:     () => void
  initialTab?: Tab
}

export default function AyudaModal({ open, onClose, initialTab = 'tour' }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const isAdmin    = useIsAdmin()
  const canEditAny = useCanEditAny()

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-2"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-slate-900">Centro de Ayuda</h2>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setTab('tour')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tab === 'tour' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Tour guiado
              </button>
              <button
                onClick={() => setTab('faq')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
                  tab === 'faq' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                FAQ
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15"/>
            </svg>
          </button>
        </div>

        {/* Body — min-h-0 es crítico: sin eso, flex-1 no permite que el hijo
            overflowee y el FAQ no scrollea / el iframe colapsa a 0 de alto. */}
        <div className="flex-1 min-h-0 overflow-hidden bg-gray-50">
          {tab === 'tour' ? (
            <iframe
              src="/tour/explainer.html"
              title="Tour guiado del PSG"
              className="w-full h-full border-0 block"
            />
          ) : (
            <FaqList isAdmin={isAdmin} canEditAny={canEditAny} />
          )}
        </div>
      </div>
    </div>
  )
}
