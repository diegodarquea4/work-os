'use client'

import type { ReactNode } from 'react'

/**
 * Grupo colapsable de un megaproyecto — `<details>` nativo (mismo patrón que
 * el modo "por ministerio" del Kanban: sin estado controlado, el navegador
 * maneja abrir/cerrar). Abierto por defecto para que se vea de entrada; el
 * usuario lo achica si quiere despejar espacio. Compartido por el preview del
 * tab (ComiteInfraestructuraTab) y la zona 3 de la sesión (SesionModal).
 */
export default function MegaproyectoGroup({ nombre, count, muted = false, children }: {
  nombre: string
  count: number
  muted?: boolean
  children: ReactNode
}) {
  return (
    <details open className="group">
      <summary className="cursor-pointer flex items-center gap-1.5 mb-1 select-none list-none">
        <svg
          width="9" height="9" viewBox="0 0 10 10"
          className={`flex-shrink-0 transition-transform group-open:rotate-90 ${muted ? 'text-gray-400' : 'text-violet-500'}`}
          fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className={`text-[11px] font-semibold ${muted ? 'text-gray-500' : 'text-violet-800'}`}>{nombre}</span>
        <span className="text-[10px] font-normal text-gray-400">{count}</span>
      </summary>
      <div className="space-y-1 pl-[15px]">{children}</div>
    </details>
  )
}
