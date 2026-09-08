'use client'

import { useState } from 'react'

/**
 * Fecha «clic para editar» de la cabecera de la consola. Extraída del header
 * de `ConsolaSesionGabinete`: se ve como texto, al hacer clic se vuelve un
 * `<input type=date>`, y al elegir guarda y vuelve a texto.
 *
 * Reemplaza al `<input type=date>` controlado que tenía el modal, que
 * disparaba un `onChange` (y un UPDATE) por cada tecleo parcial en Chrome y
 * ocupaba ancho fijo en una cabecera que ahora lleva más cosas.
 */

function fmtFecha(iso: string): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  value: string                                        // YYYY-MM-DD
  onCommit: (iso: string) => void | Promise<void>
  disabled?: boolean
  title?: string
}

export default function FechaEditable({ value, onCommit, disabled = false, title = 'Editar la fecha de la sesión' }: Props) {
  const [editando, setEditando]   = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function guardar(nueva: string) {
    if (!nueva || nueva === value) { setEditando(false); return }
    setGuardando(true)
    try { await onCommit(nueva) }
    finally { setGuardando(false); setEditando(false) }
  }

  if (disabled) return <span className="font-medium text-slate-400">{fmtFecha(value)}</span>

  if (editando) {
    return (
      <input type="date" autoFocus defaultValue={value} disabled={guardando}
        onChange={e => guardar(e.target.value)}
        onBlur={() => setEditando(false)}
        className="text-[13px] font-medium border border-violet-300 rounded-md px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-violet-200" />
    )
  }

  return (
    <button onClick={() => setEditando(true)} disabled={guardando} title={title}
      className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-violet-700 border-b border-dashed border-slate-300 hover:border-violet-400 disabled:opacity-50">
      {guardando ? 'Guardando…' : fmtFecha(value)}
      {!guardando && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>
        </svg>
      )}
    </button>
  )
}
