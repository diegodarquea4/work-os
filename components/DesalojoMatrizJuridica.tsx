'use client'

import { useState } from 'react'
import type { DesalojoTipologia } from '@/lib/types'
import { MATRIZ_JURIDICA, sugerenciasInstrumento } from '@/lib/desalojos'

/**
 * Widget de la matriz jurídica (Sección VI del 038). Si la capa tiene
 * tipología asignada, sugiere el instrumento aplicable arriba; debajo,
 * pliega un acordeón con la matriz completa para consulta.
 *
 * No es interactivo en el sentido de "asignar"; sirve como referencia
 * en línea para que admin no tenga que recordar la tabla de memoria
 * mientras llena el instrumento jurídico en la capa.
 */

type Props = {
  tipologia: DesalojoTipologia | null
}

export default function DesalojoMatrizJuridica({ tipologia }: Props) {
  const [open, setOpen] = useState(false)
  const sugerencias = sugerenciasInstrumento(tipologia)

  return (
    <section className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Matriz jurídica</h3>
        <p className="text-xs text-gray-500 mt-0.5 leading-tight">
          Instrumento aplicable según propiedad del terreno × situación procesal (Sección VI, minuta 038).
        </p>
      </header>

      {tipologia && sugerencias.length > 0 && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
          <p className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide mb-2">
            Sugerido para tipología {tipologia}
          </p>
          <ul className="space-y-2">
            {sugerencias.map(s => (
              <li key={s.key} className="text-xs">
                <p className="font-semibold text-gray-800">{s.instrumento}</p>
                <p className="text-gray-500 leading-tight mt-0.5">
                  {s.propiedad} · {s.situacion}
                </p>
                <p className="text-gray-400 leading-tight mt-0.5 italic">Referencia: {s.referencia}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2 text-xs text-slate-600 hover:bg-gray-50 flex items-center justify-between border-t border-gray-100"
      >
        <span>{open ? 'Ocultar matriz completa' : 'Ver matriz completa'}</span>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M4 6l4 4 4-4"/>
        </svg>
      </button>

      {open && (
        <table className="w-full text-xs border-collapse">
          <thead className="bg-gray-50 text-left text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Propiedad</th>
              <th className="px-3 py-2 font-semibold">Situación</th>
              <th className="px-3 py-2 font-semibold">Instrumento</th>
              <th className="px-3 py-2 font-semibold">Referencia</th>
            </tr>
          </thead>
          <tbody>
            {MATRIZ_JURIDICA.map(m => {
              const highlight = tipologia && m.tipologia === tipologia
              return (
                <tr key={m.key} className={`border-t border-gray-100 ${highlight ? 'bg-amber-50/30' : ''}`}>
                  <td className="px-3 py-2 font-medium text-gray-800">{m.propiedad}</td>
                  <td className="px-3 py-2 text-gray-600">{m.situacion}</td>
                  <td className="px-3 py-2 text-gray-800">{m.instrumento}</td>
                  <td className="px-3 py-2 text-gray-500 italic">{m.referencia}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}
