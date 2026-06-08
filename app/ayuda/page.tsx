'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import FaqList from '@/components/FaqList'

/**
 * Página completa del Centro de Ayuda. Mismo contenido que el modal
 * (tabs Tour | FAQ) pero a viewport completo — útil para enlaces
 * directos en correos de capacitación y para mobile donde el modal
 * aprieta.
 *
 * No requiere auth para ver el tour (es público para regional). Si el
 * usuario tiene sesión activa, hacemos fetch a /api/me para filtrar el
 * FAQ por su rol; si no, asumimos audiencia regional/todos (la más útil
 * para descubrimiento).
 */

type Tab = 'tour' | 'faq'

export default function AyudaPage() {
  const [tab, setTab] = useState<Tab>('tour')
  const [caps, setCaps] = useState<{ isAdmin: boolean; canEditAny: boolean }>({
    isAdmin: false,
    canEditAny: false,
  })

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(profile => {
        if (!profile) return
        setCaps({
          isAdmin:    profile.role === 'admin',
          canEditAny: profile.role === 'admin' || profile.role === 'editor',
        })
      })
      .catch(() => null)
  }, [])

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="flex-shrink-0 h-16 bg-slate-900 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo-ministerio.jpg" alt="Ministerio del Interior" className="h-10 w-auto rounded-md" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-sm leading-tight">Centro de Ayuda · PSG</span>
            <span className="text-slate-400 text-xs leading-tight">Panel Seguimiento Gubernamental</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-0.5 bg-slate-800 rounded-lg p-0.5">
            <button
              onClick={() => setTab('tour')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === 'tour' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              Tour guiado
            </button>
            <button
              onClick={() => setTab('faq')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                tab === 'faq' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              FAQ
            </button>
          </div>
          <Link
            href="/"
            className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
          >
            ← Volver al panel
          </Link>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {tab === 'tour' ? (
          <iframe
            src="/tour/explainer.html"
            title="Tour guiado del PSG"
            className="w-full h-full border-0 block"
          />
        ) : (
          <FaqList isAdmin={caps.isAdmin} canEditAny={caps.canEditAny} />
        )}
      </main>
    </div>
  )
}
