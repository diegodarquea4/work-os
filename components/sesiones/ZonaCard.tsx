'use client'

import type { ReactNode } from 'react'

/**
 * Tarjeta de la ZONA ACTIVA en el panel principal de la consola: cabecera con
 * el número (o ícono) y el título, el contenido de la zona, y al pie los
 * botones ← Anterior / Siguiente → que recorren la reunión en orden.
 * Reemplaza a la cabecera `zoneHead` de cada <section> del modal.
 */

export type NavZona = { label: string; onClick: () => void }

type Props = {
  numero: number | null
  icono?: ReactNode
  titulo: string
  /** Texto corto a la derecha del título (conteos). */
  badge?: ReactNode
  descripcion?: string
  anterior?: NavZona | null
  siguiente?: NavZona | null
  /** El botón «Siguiente» se pinta como acción primaria (p. ej. «Terminar sesión →»). */
  siguienteDestacado?: boolean
  children: ReactNode
}

export default function ZonaCard({
  numero, icono, titulo, badge, descripcion, anterior = null, siguiente = null, siguienteDestacado = false, children,
}: Props) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4">
        <span className="w-[30px] h-[30px] flex-none rounded-full bg-violet-600 text-white grid place-items-center text-[14px] font-extrabold tabular-nums">
          {numero != null ? numero : icono}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-extrabold text-slate-900 leading-tight">{titulo}</h2>
          {descripcion && <p className="text-[12.5px] text-slate-500 mt-0.5 leading-snug">{descripcion}</p>}
        </div>
        {badge !== undefined && <span className="flex-none text-[12px] font-semibold text-slate-500 tabular-nums mt-1">{badge}</span>}
      </div>

      <div className="px-5 pb-5">{children}</div>

      {(anterior || siguiente) && (
        <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50/60 rounded-b-xl">
          {anterior && (
            <button onClick={anterior.onClick}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-slate-500 hover:text-slate-800">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
              {anterior.label}
            </button>
          )}
          {siguiente && (
            <button onClick={siguiente.onClick}
              className={`ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold rounded-lg px-3 py-1.5 ${
                siguienteDestacado
                  ? 'bg-violet-600 text-white hover:bg-violet-700'
                  : 'text-violet-700 hover:bg-violet-50'}`}>
              {siguiente.label}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
