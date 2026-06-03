'use client'

import { useState } from 'react'
import type { PipelineMeta } from '@/lib/portfolioMeta'

/**
 * Drawer lateral con el proceso completo (SEIA o MOP). Por default está
 * colapsado y solo se ve una pestaña fina a la derecha; al hacer click se
 * expande a un panel ~24rem con el detalle completo de cada paso.
 *
 * Diseño intencional: la versión colapsada no ocupa espacio visual relevante,
 * y la versión expandida da espacio para leer cómodamente. Para entender una
 * columna específica se usa el tooltip del header — el drawer es para entender
 * el flujo entero.
 */
type DrawerProps = {
  title:    string
  intro:    string
  pipeline: readonly PipelineMeta[]
}

export default function ProcessDrawer({ title, intro, pipeline }: DrawerProps) {
  const [open, setOpen] = useState(false)

  if (!open) {
    // Pestaña colapsada: pegada al borde derecho del kanban, vertical.
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex-shrink-0 w-8 h-full bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors group"
        title={`Abrir detalle del ${title.toLowerCase()}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-slate-500 group-hover:text-slate-800">
          <path d="M8 2L4 6l4 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 group-hover:text-slate-800 whitespace-nowrap"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {title}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-slate-400 group-hover:text-slate-700">
          <circle cx="6" cy="6" r="5"/><path d="M6 5v3M6 3.5v.1" strokeLinecap="round"/>
        </svg>
      </button>
    )
  }

  // Drawer expandido.
  return (
    <aside className="flex-shrink-0 w-96 h-full overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
      <header className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Proceso</p>
          <h3 className="text-sm font-bold text-slate-900 leading-tight">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Cerrar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-600 leading-relaxed">{intro}</p>
      </div>

      <ol className="px-4 py-3 space-y-3">
        {pipeline.map((step, idx) => {
          const isLast = idx === pipeline.length - 1
          return (
            <li key={step.canonical} className="relative">
              <div className="flex gap-3">
                <div className="flex-shrink-0 flex flex-col items-center">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {step.orden}
                  </span>
                  {!isLast && <div className="flex-1 w-px bg-slate-200 my-1" />}
                </div>
                <div className="flex-1 pb-3">
                  <p className="text-sm font-semibold text-slate-900 leading-snug">{step.canonical}</p>
                  {step.alternativas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {step.alternativas.map(a => (
                        <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-medium">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-700 leading-relaxed mt-1.5">{step.definicion}</p>
                  <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-100">
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      <span className="font-semibold">Para el seguimiento: </span>
                      {step.implicancia}
                    </p>
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <footer className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 leading-relaxed">
        Fuentes: información de carácter oficial obtenida de sea.gob.cl, sni.gob.cl, mop.gob.cl, dipres.gob.cl y el Reglamento SEIA (DS 40/2012).
      </footer>
    </aside>
  )
}

/**
 * Tooltip que aparece al hovereal el header de una columna del kanban.
 * Card blanca, padding amplio, fuentes legibles a 12px.
 */
export function ColumnHeaderTooltip({ meta }: { meta: PipelineMeta }) {
  return (
    <div className="absolute z-40 hidden group-hover:block top-full mt-1.5 left-0 w-80 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-xs leading-relaxed pointer-events-none">
      <p className="text-sm font-bold text-slate-900 mb-2">{meta.canonical}</p>
      <p className="text-slate-700">{meta.definicion}</p>
      <p className="text-slate-500 italic mt-2 pt-2 border-t border-gray-100">
        <span className="font-semibold not-italic text-slate-600">Para el seguimiento: </span>
        {meta.implicancia}
      </p>
    </div>
  )
}
