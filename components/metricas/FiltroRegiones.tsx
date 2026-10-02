'use client'

import { useEffect, useRef, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { COD_REGIONES } from '@/lib/seguimientoSeia'

const NOMBRE_REGION = Object.fromEntries(REGIONS.map(r => [r.cod, r.nombre]))

/** Selector de varias regiones, el de los tableros de Métricas (Seguimiento SEIA, calendario de comités). */
export default function FiltroRegiones({ seleccion, onCambio, compacto = false, opciones = COD_REGIONES }: {
  seleccion: Set<string>
  onCambio: (s: Set<string>) => void
  compacto?: boolean
  /** Las regiones que se pueden elegir (por defecto las 16). */
  opciones?: string[]
}) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const todas = opciones.every(c => seleccion.has(c))
  const resumen = todas ? 'Todas las regiones' : seleccion.size === 1 ? NOMBRE_REGION[[...seleccion][0]] : `${seleccion.size} regiones`
  const alternar = (c: string) => {
    const s = new Set(seleccion)
    if (s.has(c)) { if (s.size > 1) s.delete(c) } else s.add(c)
    onCambio(s)
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(a => !a)}
        className={compacto
          ? `text-[11px] uppercase tracking-wide font-semibold ${todas ? 'text-gray-400' : 'text-violet-700'} hover:text-slate-800`
          : `text-[13px] font-semibold text-slate-800 bg-white border rounded-[9px] px-3 py-1.5 ${abierto ? 'border-violet-500' : 'border-gray-300'}`}>
        {compacto ? `Región${todas ? '' : ` (${seleccion.size})`}` : resumen} <span className="text-gray-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-30 left-0 top-[calc(100%+6px)] w-60 max-h-80 overflow-y-auto bg-white border border-gray-300 rounded-xl shadow-xl p-1.5 text-left normal-case tracking-normal">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-semibold text-slate-800 border-b border-gray-100 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" className="accent-violet-700" checked={todas}
              onChange={e => onCambio(e.target.checked ? new Set(opciones) : new Set([opciones[0]]))} />
            Todas
          </label>
          {REGIONS.filter(r => opciones.includes(r.cod)).map(r => (
            <label key={r.cod} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-normal text-slate-800 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="accent-violet-700" checked={seleccion.has(r.cod)} onChange={() => alternar(r.cod)} />
              {r.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
