'use client'

import { useState } from 'react'
import type { DesalojoCapa, DesalojoPlanificacion } from '@/lib/types'

/**
 * Form inline para agregar un evento al timeline de Planificación.
 *
 * Submit atómico (no draft+commit por campo). Si capa_id no se selecciona,
 * el evento es del caso global. Toggle "Rango" muestra fecha_fin.
 */

type Props = {
  capas:    DesalojoCapa[]              // capas activas del caso
  onCreate: (input: {
    capa_id?:     number | null
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
  onCancel: () => void
}

export default function DesalojoTimelineEditor({ capas, onCreate, onCancel }: Props) {
  const [titulo,       setTitulo]       = useState('')
  const [descripcion,  setDescripcion]  = useState('')
  const [fechaInicio,  setFechaInicio]  = useState(() => new Date().toLocaleDateString('sv-SE'))
  const [isRango,      setIsRango]      = useState(false)
  const [fechaFin,     setFechaFin]     = useState('')
  const [capaId,       setCapaId]       = useState<number | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = titulo.trim()
    if (!t) { setError('Título requerido'); return }
    if (isRango && fechaFin && fechaFin < fechaInicio) {
      setError('La fecha de fin debe ser mayor o igual a la de inicio')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onCreate({
        capa_id:      capaId,
        titulo:       t,
        descripcion:  descripcion.trim() || null,
        fecha_inicio: fechaInicio,
        fecha_fin:    isRango ? (fechaFin || null) : null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="relative pl-6 pb-5 border-l border-dashed border-slate-300 ml-[5px] -mt-1"
    >
      <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white bg-slate-400" />
      <div className="space-y-2 bg-slate-50 border border-slate-200 rounded-lg p-3">
        <input
          type="text"
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          autoFocus
          placeholder="Título del evento (ej: Convocatoria Comité Caso)"
          className="w-full text-sm font-medium px-2 py-1 border border-gray-200 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <textarea
          value={descripcion}
          onChange={e => setDescripcion(e.target.value)}
          rows={2}
          placeholder="Descripción (opcional)"
          className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] font-semibold text-gray-600">
            Inicio
            <input
              type="date"
              value={fechaInicio}
              onChange={e => setFechaInicio(e.target.value)}
              required
              className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-800 mt-0.5"
            />
          </label>
          <label className="text-[11px] font-semibold text-gray-600 flex flex-col">
            <span className="flex items-center gap-1.5">
              Fin
              <label className="text-[10px] text-gray-500 font-normal flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isRango}
                  onChange={e => { setIsRango(e.target.checked); if (!e.target.checked) setFechaFin('') }}
                  className="w-3 h-3"
                />
                rango
              </label>
            </span>
            <input
              type="date"
              value={fechaFin}
              onChange={e => setFechaFin(e.target.value)}
              disabled={!isRango}
              min={fechaInicio}
              className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-800 disabled:bg-gray-100 disabled:opacity-50 mt-0.5"
            />
          </label>
        </div>
        {capas.length > 0 && (
          <label className="text-[11px] font-semibold text-gray-600 block">
            Capa asociada (opcional)
            <select
              value={capaId ?? ''}
              onChange={e => setCapaId(e.target.value ? Number(e.target.value) : null)}
              className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-800 mt-0.5"
            >
              <option value="">— Evento del caso global —</option>
              {capas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </label>
        )}
        {error && <p className="text-[11px] text-red-700">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !titulo.trim()}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Creando…' : 'Crear evento'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-white disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  )
}
