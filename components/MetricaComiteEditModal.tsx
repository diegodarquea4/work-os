'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { ComiteMetrica, DesglosePlantillaItem } from '@/lib/types'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'
import { comunasDeRegion } from '@/lib/comunas'
import { provinciasDeRegion } from '@/lib/provincias'
import { Alert } from '@/components/ui'

type DesgloseTipo = ComiteMetrica['desglose_tipo']

const DESGLOSE_TIPO_LABEL: Record<DesgloseTipo, string> = {
  ninguno: 'Ninguno',
  comuna: 'Por comuna',
  provincia: 'Por provincia',
  libre: 'Campo libre',
}

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
  institucion: string              // clave preseleccionada (sub-tab activo)
  institucionLabel?: string        // etiqueta (mig 078 — instituciones dinámicas)
  currentUserEmail: string
  ordenSugerido: number            // último orden + 1 al crear
  onSaved: () => void
}

export default function MetricaComiteEditModal({
  open, onClose, metrica, regionCod, institucion, institucionLabel, currentUserEmail, ordenSugerido, onSaved,
}: Props) {
  const isEdit = !!metrica
  // El modal se monta fresco por apertura (el padre lo renderiza condicional),
  // así que los inicializadores desde props son correctos — sin efecto de sync.
  const [nombre, setNombre]   = useState(metrica?.nombre ?? '')
  const [tipo, setTipo]       = useState<'numerico' | 'texto'>(metrica?.tipo ?? 'numerico')
  const [unidad, setUnidad]   = useState(metrica?.unidad ?? '')
  const [desgloseTipo, setDesgloseTipo] = useState<DesgloseTipo>(metrica?.desglose_tipo ?? 'ninguno')
  const [etiquetasLibres, setEtiquetasLibres] = useState<string[]>(
    metrica?.desglose_tipo === 'libre' ? metrica.desglose_plantilla.map(p => p.etiqueta) : [],
  )
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  if (!open) return null

  const instLabel = institucionLabel ?? COMITE_INSTITUCIONES.find(i => i.key === institucion)?.label ?? institucion

  function handleClose() { if (!saving) onClose() }

  // Plantilla de desglose (mig 094): SIEMPRE {clave, etiqueta}[], sin importar
  // el tipo — comuna/provincia se resuelven contra el catálogo de la región en
  // este momento (snapshot; no se recalcula después si el catálogo cambiara),
  // libre usa lo que el usuario tipeó. Ninguno/tipo texto → [].
  function resolverPlantilla(): DesglosePlantillaItem[] {
    if (tipo !== 'numerico') return []
    if (desgloseTipo === 'comuna') {
      return comunasDeRegion(regionCod).map(c => ({ clave: String(c.cut), etiqueta: c.nombre }))
    }
    if (desgloseTipo === 'provincia') {
      return provinciasDeRegion(regionCod).map(nombre => ({ clave: nombre, etiqueta: nombre }))
    }
    if (desgloseTipo === 'libre') {
      return etiquetasLibres.map(e => e.trim()).filter(Boolean).map(e => ({ clave: e, etiqueta: e }))
    }
    return []
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    setError(null)
    const payload = {
      nombre: nombre.trim(),
      tipo,
      unidad: tipo === 'numerico' ? (unidad.trim() || null) : null,
      desglose_tipo: tipo === 'numerico' ? desgloseTipo : 'ninguno',
      desglose_plantilla: resolverPlantilla(),
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
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
              />
            </div>
          )}

          {tipo === 'numerico' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Desglose predeterminado</label>
              <p className="text-[11px] text-slate-500 mb-1.5">
                Etiquetas que van a aparecer ya listas para completar en cada sesión (ej. una fila por comuna).
                El valor se escribe cada semana; esto solo predefine los nombres.
              </p>
              <div className="flex flex-wrap items-center gap-1 border border-slate-200 rounded-lg p-0.5 w-fit">
                {(['ninguno', 'comuna', 'provincia', 'libre'] as DesgloseTipo[]).map(t => (
                  <button
                    key={t} type="button" onClick={() => setDesgloseTipo(t)}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${desgloseTipo === t ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'}`}
                  >
                    {DESGLOSE_TIPO_LABEL[t]}
                  </button>
                ))}
              </div>

              {desgloseTipo === 'comuna' && (
                <PreviewCatalogo etiquetas={comunasDeRegion(regionCod).map(c => c.nombre)} sustantivo="comunas" />
              )}
              {desgloseTipo === 'provincia' && (
                <PreviewCatalogo etiquetas={provinciasDeRegion(regionCod)} sustantivo="provincias" />
              )}
              {desgloseTipo === 'libre' && (
                <div className="mt-2 space-y-1">
                  {etiquetasLibres.map((etq, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        type="text" value={etq}
                        onChange={e => setEtiquetasLibres(arr => arr.map((x, k) => k === i ? e.target.value : x))}
                        placeholder="Etiqueta (ej. Total región)"
                        className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                      <button
                        type="button" onClick={() => setEtiquetasLibres(arr => arr.filter((_, k) => k !== i))}
                        className="text-gray-300 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar etiqueta"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/></svg>
                      </button>
                    </div>
                  ))}
                  <button
                    type="button" onClick={() => setEtiquetasLibres(arr => [...arr, ''])}
                    className="text-[11px] text-violet-700 hover:text-violet-900 font-medium hover:underline"
                  >
                    + agregar etiqueta
                  </button>
                </div>
              )}
            </div>
          )}

          {error && <Alert variant="error">{error}</Alert>}

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
              className="flex-1 py-2 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {saving ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Vista de solo lectura del catálogo que se va a copiar como plantilla
// (comuna/provincia): confirma el alcance sin obligar a leer los N nombres.
function PreviewCatalogo({ etiquetas, sustantivo }: { etiquetas: string[]; sustantivo: string }) {
  const visibles = etiquetas.slice(0, 6)
  const resto = etiquetas.length - visibles.length
  return (
    <p className="mt-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
      Se va a desglosar por las <strong>{etiquetas.length} {sustantivo}</strong> de la región: {visibles.join(', ')}
      {resto > 0 ? `, +${resto} más` : ''}.
    </p>
  )
}
