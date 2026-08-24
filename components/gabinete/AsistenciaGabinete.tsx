'use client'

import { useState } from 'react'
import type { SalaApi } from '@/lib/hooks/useSalaGabinete'

/**
 * ASISTENCIA del Gabinete v2 — modal reutilizable, abierto desde el pill de
 * conteo de la Consola en sala y desde el visor de cierre. Roster fijo
 * (sesion_nomina, presente/ausente) + invitados ad-hoc. Toda la data y las
 * mutaciones viven en useSalaGabinete (fuente única: el conteo del header sale
 * de acá). Solo lectura si !canEdit.
 */

export default function AsistenciaGabinete({ sala, canEdit, onClose }: {
  sala: SalaApi
  canEdit: boolean
  onClose: () => void
}) {
  const [nombre, setNombre] = useState('')
  const [institucion, setInstitucion] = useState('')
  const invitados = sala.asistenciaRows.filter(a => a.nomina_id == null)
  const filaDe = (nominaId: number) => sala.asistenciaRows.find(a => a.nomina_id === nominaId)

  function agregar() {
    if (!nombre.trim() || !institucion.trim()) return
    sala.agregarInvitado(nombre, institucion)
    setNombre(''); setInstitucion('')
  }

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/40 grid place-items-center p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 flex-none">
          <h2 className="text-[15px] font-extrabold text-slate-900">Asistencia</h2>
          <span className="text-[12.5px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-2.5 py-0.5 rounded-full tabular-nums">
            {sala.asistencia.presentes} / {sala.asistencia.total} presentes
          </span>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700 p-1" title="Cerrar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {sala.nomina.length === 0 && (
            <p className="text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              La nómina del gabinete está vacía. Cárgala (seremis + equipo DPR) desde el botón <b className="font-semibold">Nómina</b> del tab Gabinete Regional. Igual puedes sumar invitados aquí.
            </p>
          )}

          {sala.nomina.length > 0 && (
            <div>
              {canEdit && (
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={() => sala.marcarTodos(true)} className="text-[12px] font-semibold text-violet-700 hover:text-violet-900">Todos presentes</button>
                  <span className="text-slate-200">·</span>
                  <button onClick={() => sala.marcarTodos(false)} className="text-[12px] font-semibold text-slate-500 hover:text-slate-700">Ninguno</button>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {sala.nomina.map(m => {
                  const presente = filaDe(m.id)?.presente ?? false
                  return (
                    <label key={m.id} className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg ${canEdit ? 'hover:bg-slate-50 cursor-pointer' : ''}`}>
                      <input type="checkbox" checked={presente} disabled={!canEdit} onChange={() => sala.toggleAsistencia(m.id)}
                        className="rounded border-slate-300 text-violet-600 focus:ring-violet-400" />
                      <span className="flex-1 min-w-0">
                        <span className="text-[13.5px] text-slate-800 block truncate">{m.nombre}</span>
                        <span className="text-[11px] text-slate-400 block truncate">{m.institucion}{m.cargo ? ` · ${m.cargo}` : ''}</span>
                      </span>
                      <span className={`flex-none text-[9px] font-bold px-1 py-0.5 rounded ${m.calidad === 'titular' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                        {m.calidad === 'titular' ? 'T' : 'S'}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Invitados */}
          <div>
            <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Invitados</div>
            {invitados.length === 0 && <p className="text-[13px] text-slate-400 italic mb-1.5">Sin invitados.</p>}
            <div className="space-y-1">
              {invitados.map(inv => (
                <div key={inv.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg bg-sky-50/70">
                  <span className="flex-none text-[9px] font-bold px-1 py-0.5 rounded bg-sky-200 text-sky-800">INV</span>
                  <span className="flex-1 min-w-0 text-[13.5px] text-slate-700 truncate">
                    {inv.invitado_nombre} <span className="text-[12px] text-slate-400">· {inv.invitado_institucion}</span>
                  </span>
                  {canEdit && (
                    <button onClick={() => sala.quitarInvitado(inv.id)} className="flex-none text-slate-300 hover:text-red-500 p-0.5" title="Quitar invitado">
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="flex flex-wrap gap-2 mt-2">
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Invitado: nombre"
                  className="flex-1 min-w-[140px] text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
                <input value={institucion} onChange={e => setInstitucion(e.target.value)} placeholder="Institución"
                  onKeyDown={e => { if (e.key === 'Enter') agregar() }}
                  className="w-40 text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
                <button onClick={agregar} disabled={!nombre.trim() || !institucion.trim()}
                  className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700">+ Invitado</button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none px-5 py-3 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">Listo</button>
        </div>
      </div>
    </div>
  )
}
