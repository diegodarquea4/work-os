'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
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
  // Módulo Sesiones (mig 044): si el eje tiene sesiones habilitadas, el
  // formulario muestra tipo (suma/pulso) + "se reporta en sesión". Con
  // false el modal es idéntico al histórico (cero regresión).
  sesionesOn?: boolean
  // "+ indicador no contemplado" desde SesionModal: prefija el checkbox.
  defaultsSesion?: { se_reporta_en_sesion: boolean }
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
  sesionesOn = false,
  defaultsSesion,
}: Props) {
  const displayLabel = ejeLabel ?? composeEjeLabel(eje.numero, eje.nombre)
  const isEdit = !!metrica
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [objetivo, setObjetivo]       = useState('')
  const [unidad, setUnidad]           = useState('')
  const [tipo, setTipo]               = useState<'suma' | 'pulso'>('suma')
  const [enSesion, setEnSesion]       = useState(false)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)

  // Inicializar / resetear formulario cuando se abre.
  useEffect(() => {
    if (!open) return
    setTitulo(metrica?.titulo ?? '')
    setDescripcion(metrica?.descripcion ?? '')
    setObjetivo(metrica?.objetivo != null ? String(metrica.objetivo) : '')
    setUnidad(metrica?.unidad ?? '')
    setTipo(metrica?.tipo ?? 'suma')
    setEnSesion(metrica?.se_reporta_en_sesion ?? defaultsSesion?.se_reporta_en_sesion ?? false)
    setError(null)
  }, [open, metrica, defaultsSesion])

  if (!open) return null

  function handleClose() {
    if (saving) return
    onClose()
  }

  const esPulso = sesionesOn && tipo === 'pulso'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Pulso no lleva meta: objetivo queda en 0 (columna NOT NULL) y la UI
    // lo ignora — decisión documentada en mig 044.
    if (!titulo.trim() || (!esPulso && !objetivo.trim())) return
    const objetivoNum = esPulso ? 0 : parseFloat(objetivo.replace(',', '.'))
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
      // Con sesiones apagadas el estado conserva los valores existentes
      // (o los defaults suma/false) — el payload es idéntico al histórico.
      tipo,
      se_reporta_en_sesion: enSesion,
      updated_at:  new Date().toISOString(),
    }
    // En INSERT: setea eje_id (FK) Y eje string denormalizado (compat).
    // En UPDATE: la asignación de eje no se cambia desde este modal (la
    // métrica vive en el contexto de un eje; cambiar de eje sería mover
    // la métrica → flow distinto, fuera de scope acá).
    try {
      if (isEdit) {
        await safeWrite(
          sb.from('metricas_eje').update(payload).eq('id', metrica!.id),
          `metricas_eje update id=${metrica!.id}`,
        )
      } else {
        await safeWrite(
          sb.from('metricas_eje').insert({
            ...payload,
            region_cod:       regionCod,
            eje:              displayLabel,
            eje_id:           eje.id,
            created_by_email: currentUserEmail || null,
          }),
          `metricas_eje insert ${regionCod}/${eje.id}`,
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

          {/* Tipo + reporte en sesión — solo con el módulo Sesiones activo */}
          {sesionesOn && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo de métrica</label>
                <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 w-fit">
                  <button
                    type="button"
                    onClick={() => setTipo('suma')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      tipo === 'suma' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Acumula hacia una meta — cada sesión incrementa el valor"
                  >
                    Suma (con meta)
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipo('pulso')}
                    className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                      tipo === 'pulso' ? 'bg-violet-100 text-violet-800' : 'text-gray-500 hover:text-gray-700'
                    }`}
                    title="Foto semanal sin meta — cada sesión reemplaza el valor"
                  >
                    Pulso (foto semanal)
                  </button>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={enSesion}
                  onChange={e => setEnSesion(e.target.checked)}
                  className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                />
                <span className="text-xs text-slate-700">
                  Se reporta en sesión <span className="text-gray-400">(aparece precargada en el formulario del comité)</span>
                </span>
              </label>
            </div>
          )}

          <div className="flex gap-2">
            {!esPulso && (
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
            )}
            <div className={esPulso ? 'flex-1' : 'w-28'}>
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
          {esPulso && (
            <p className="text-[11px] text-gray-400 -mt-1">
              Las métricas pulso no llevan meta: cada sesión registra la foto de la semana y la card muestra la tendencia.
            </p>
          )}

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
              disabled={saving || !titulo.trim() || (!esPulso && !objetivo.trim())}
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
