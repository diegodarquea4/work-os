'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Metrica, RegionEje } from '@/lib/types'
import { composeEjeLabel } from '@/lib/ejes'

/**
 * Modal compacto para crear o editar la DEFINICIÓN de una métrica por eje
 * (título, descripción, objetivo, unidad). Solo admin/editor llega acá —
 * el gate en cliente lo aplica el drawer que lo invoca y la RLS de
 * `metricas_eje` lo refuerza server-side.
 *
 * El `valor_actual` NO se edita acá: vive como inline edit en el drawer
 * porque es la operación más frecuente y la única que regional/viewer
 * también puede ejecutar.
 */

type Props = {
  open: boolean
  onClose: () => void
  // Si viene `metrica`, es edición. Si es null/undefined, es creación.
  metrica?: Metrica | null
  regionCod: string
  // Eje del catálogo (migración 015) al que pertenece la métrica.
  eje: RegionEje
  // Label compuesto opcional para mostrar en el header. Si no viene se
  // compone internamente.
  ejeLabel?: string
  currentUserEmail: string
  onSaved: () => void   // dispara reload del drawer padre
}

export default function MetricaEditModal({
  open,
  onClose,
  metrica,
  regionCod,
  eje,
  ejeLabel,
  currentUserEmail,
  onSaved,
}: Props) {
  const displayLabel = ejeLabel ?? composeEjeLabel(eje.numero, eje.nombre)
  const isEdit = !!metrica
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [objetivo, setObjetivo]       = useState('')
  const [unidad, setUnidad]           = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Inicializar / resetear formulario cuando se abre.
  useEffect(() => {
    if (!open) return
    setTitulo(metrica?.titulo ?? '')
    setDescripcion(metrica?.descripcion ?? '')
    setObjetivo(metrica?.objetivo != null ? String(metrica.objetivo) : '')
    setUnidad(metrica?.unidad ?? '')
    setError(null)
  }, [open, metrica])

  if (!open) return null

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!titulo.trim() || !objetivo.trim()) return
    const objetivoNum = parseFloat(objetivo.replace(',', '.'))
    if (isNaN(objetivoNum)) {
      setError('El objetivo debe ser un número válido.')
      return
    }
    setSaving(true)
    setError(null)
    const sb = getSupabase()
    const payload = {
      titulo:      titulo.trim(),
      descripcion: descripcion.trim() || null,
      objetivo:    objetivoNum,
      unidad:      unidad.trim() || null,
      updated_at:  new Date().toISOString(),
    }
    // En INSERT: setea eje_id (FK) Y eje string denormalizado (compat).
    // En UPDATE: la asignación de eje no se cambia desde este modal (la
    // métrica vive en el contexto de un eje; cambiar de eje sería mover
    // la métrica → flow distinto, fuera de scope acá).
    const { error: dbErr } = isEdit
      ? await sb.from('metricas_eje').update(payload).eq('id', metrica!.id)
      : await sb.from('metricas_eje').insert({
          ...payload,
          region_cod:       regionCod,
          eje:              displayLabel,
          eje_id:           eje.id,
          created_by_email: currentUserEmail || null,
        })
    setSaving(false)
    if (dbErr) {
      setError(dbErr.message)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 leading-snug">
                {isEdit ? 'Editar métrica' : 'Nueva métrica'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{displayLabel}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={saving}
              className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 flex-shrink-0 disabled:opacity-50"
              title="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16"/>
              </svg>
            </button>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Título <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              required
              placeholder="Ej: Cobertura APS"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Descripción
            </label>
            <textarea
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              rows={2}
              placeholder="A qué corresponde esta métrica"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
            />
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Objetivo <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                value={objetivo}
                onChange={e => setObjetivo(e.target.value)}
                required
                step="any"
                placeholder="Ej: 95"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unidad
              </label>
              <input
                type="text"
                value={unidad}
                onChange={e => setUnidad(e.target.value)}
                placeholder="%, km…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !titulo.trim() || !objetivo.trim()}
              className="flex-1 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear métrica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
