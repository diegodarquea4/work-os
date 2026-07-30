'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { ComiteInstitucion, ComiteMetrica } from '@/lib/types'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'

/**
 * Editor de la DEFINICIÓN de un ítem del catálogo por institución
 * (`comite_metrica`, mig 048). La institución viene preseleccionada del
 * sub-tab. "Quitar" = activo=false (soft-delete) para no romper el histórico
 * de sesiones que ya reportaron el ítem. RLS permite al regional gestionar el
 * catálogo de su región.
 */

type Props = {
  open: boolean
  onClose: () => void
  metrica?: ComiteMetrica | null   // null = creación
  regionCod: string
  institucion: ComiteInstitucion   // preseleccionada (sub-tab activo)
  currentUserEmail: string
  ordenSugerido: number            // último orden + 1 al crear
  onSaved: () => void
}

export default function MetricaComiteEditModal({
  open, onClose, metrica, regionCod, institucion, currentUserEmail, ordenSugerido, onSaved,
}: Props) {
  const isEdit = !!metrica
  // El modal se monta fresco por apertura (el padre lo renderiza condicional),
  // así que los inicializadores desde props son correctos — sin efecto de sync.
  const [nombre, setNombre]   = useState(metrica?.nombre ?? '')
  const [tipo, setTipo]       = useState<'numerico' | 'texto'>(metrica?.tipo ?? 'numerico')
  const [unidad, setUnidad]   = useState(metrica?.unidad ?? '')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (!open) return null

  const instLabel = COMITE_INSTITUCIONES.find(i => i.key === institucion)?.label ?? institucion

  function handleClose() { if (!saving) onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      nombre: nombre.trim(),
      tipo,
      unidad: tipo === 'numerico' ? (unidad.trim() || null) : null,
    }
    try {
      if (isEdit) {
        await safeWrite(
          getSupabase().from('comite_metrica').update(payload).eq('id', metrica!.id),
          `comite_metrica update id=${metrica!.id}`,
        )
      } else {
        await safeWrite(
          getSupabase().from('comite_metrica').insert({
            ...payload,
            region_cod: regionCod,
            institucion,
            orden: ordenSugerido,
            created_by_email: currentUserEmail || null,
          }),
          `comite_metrica insert ${regionCod}/${institucion}`,
        )
      }
    } catch (err) {
      setSaving(false)
      setError((err as Error).message)
      return
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  async function handleQuitar() {
    if (!metrica) return
    if (!window.confirm(`¿Quitar "${metrica.nombre}" del catálogo de ${instLabel}? El histórico de sesiones anteriores se conserva.`)) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('comite_metrica').update({ activo: false }).eq('id', metrica.id),
        `comite_metrica desactivar id=${metrica.id}`,
      )
    } catch (err) {
      setSaving(false)
      setError((err as Error).message)
      return
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{isEdit ? 'Editar métrica' : 'Nueva métrica'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{instLabel}</p>
          </div>
          <button onClick={handleClose} disabled={saving} className="text-gray-400 hover:text-gray-600 mt-0.5 disabled:opacity-50" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del ítem <span className="text-red-500">*</span></label>
            <input
              type="text" value={nombre} onChange={e => setNombre(e.target.value)} required
              placeholder="Ej: Detenidos durante la última semana"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setTipo('numerico')} title="Un número por semana — con tendencia (Δ vs semana anterior)"
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${tipo === 'numerico' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Numérico (con tendencia)
              </button>
              <button type="button" onClick={() => setTipo('texto')} title="Bloque de texto libre — sin tendencia (procedimientos destacados, reportes)"
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${tipo === 'texto' ? 'bg-violet-100 text-violet-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Texto
              </button>
            </div>
          </div>

          {tipo === 'numerico' && (
            <div className="w-40">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad</label>
              <input
                type="text" value={unidad} onChange={e => setUnidad(e.target.value)}
                placeholder="detenidos, kg, %…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
              />
            </div>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>}

          <div className="flex gap-2 pt-1">
            {isEdit && (
              <button type="button" onClick={handleQuitar} disabled={saving}
                className="py-2 px-3 border border-red-200 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 disabled:opacity-50">
                Quitar
              </button>
            )}
            <button type="button" onClick={handleClose} disabled={saving}
              className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50">
              Cancelar
            </button>
            <button type="submit" disabled={saving || !nombre.trim()}
              className="flex-1 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50">
              {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
