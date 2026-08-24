'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Metrica, RegionEje } from '@/lib/types'
import { composeEjeLabel } from '@/lib/ejes'
import { Alert } from '@/components/ui'
import { useAnchoredDropdown, DropdownPanel } from './gabinete/pickers'

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
  // Cartera del eje (mig 080): para vincular opcionalmente la métrica a una
  // iniciativa específica. Vacío/ausente → no se muestra el selector.
  iniciativas?: { id: number; nombre: string }[]
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
  iniciativas,
}: Props) {
  const displayLabel = ejeLabel ?? composeEjeLabel(eje.numero, eje.nombre)
  const isEdit = !!metrica
  const [titulo, setTitulo]           = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [objetivo, setObjetivo]       = useState('')
  const [unidad, setUnidad]           = useState('')
  const [tipo, setTipo]               = useState<'suma' | 'pulso'>('suma')
  const [enSesion, setEnSesion]       = useState(false)
  const [prioridadId, setPrioridadId] = useState<number | null>(null)
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
    setPrioridadId(metrica?.prioridad_id ?? null)
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
      prioridad_id: prioridadId,
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
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
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
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500 resize-none"
            />
          </div>

          {/* Vínculo opcional a una iniciativa del eje (mig 080) — dropdown
              flotante estándar del panel (portal, no deforma el modal). */}
          {iniciativas && iniciativas.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Iniciativa vinculada <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <IniciativaPicker iniciativas={iniciativas} value={prioridadId} onChange={setPrioridadId} />
            </div>
          )}

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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
              />
            </div>
          </div>
          {esPulso && (
            <p className="text-[11px] text-gray-400 -mt-1">
              Las métricas pulso no llevan meta: cada sesión registra la foto de la semana y la card muestra la tendencia.
            </p>
          )}

          {error && (
            <Alert variant="error">{error}</Alert>
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
              className="flex-1 py-2 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear métrica'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Selector de iniciativa (mig 080) con el dropdown flotante estándar del panel
 * (mismo `useAnchoredDropdown`/`DropdownPanel` del Gabinete): se monta en un
 * portal a document.body con position:fixed, así NO estira ni deforma el modal
 * ni se recorta por su overflow-hidden.
 */
function IniciativaPicker({ iniciativas, value, onChange }: {
  iniciativas: { id: number; nombre: string }[]
  value: number | null
  onChange: (id: number | null) => void
}) {
  const { open, setOpen, pos, triggerRef, panelRef, abrir } = useAnchoredDropdown()
  const sel = value != null ? iniciativas.find(i => i.id === value) : null
  return (
    <>
      <button
        type="button" ref={triggerRef}
        onClick={() => { if (open) setOpen(false); else abrir() }}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm text-left bg-white transition-colors ${
          open ? 'border-violet-400 ring-2 ring-violet-200' : 'border-slate-200 hover:border-violet-300'
        }`}
      >
        <span className={sel ? 'text-slate-900 truncate' : 'text-slate-400'}>{sel ? sel.nombre : '— Sin iniciativa —'}</span>
        <svg className={`w-3.5 h-3.5 text-slate-400 flex-none transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M2.5 4.5L6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && pos && (
        <DropdownPanel pos={pos} panelRef={panelRef}>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button" onClick={() => { onChange(null); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-violet-50 border-b border-slate-50 ${value == null ? 'text-violet-700 font-medium' : 'text-slate-500'}`}
            >
              — Sin iniciativa —
            </button>
            {iniciativas.map(i => (
              <button
                key={i.id} type="button" onClick={() => { onChange(i.id); setOpen(false) }}
                className={`w-full text-left px-3 py-1.5 text-[13px] hover:bg-violet-50 border-b border-slate-50 last:border-0 truncate ${value === i.id ? 'text-violet-700 font-medium' : 'text-slate-700'}`}
              >
                {i.nombre}
              </button>
            ))}
          </div>
        </DropdownPanel>
      )}
    </>
  )
}
