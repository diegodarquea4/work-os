'use client'

import type { ReactNode } from 'react'

/**
 * Bloque numerado de una pantalla de cierre («movimiento»): rótulo pequeño en
 * mayúsculas con su número, y una card blanca con el contenido. Copia del que
 * usa `CierreGabinete` — se duplica a propósito para no tocar el gabinete en
 * este cambio; se unifican en la limpieza posterior.
 */
export function Movimiento({ n, label, children }: { n: number; label: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-[18px] h-[18px] rounded-full bg-violet-100 text-violet-700 grid place-items-center text-[11px] font-extrabold">{n}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">{children}</div>
    </div>
  )
}

export function Vacio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-3.5 text-[13px] text-slate-400 italic">{children}</p>
}
