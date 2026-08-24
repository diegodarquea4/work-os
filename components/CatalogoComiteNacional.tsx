'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'
import { useEstandaresComite } from '@/lib/hooks/useComiteMetricas'
import { useCurrentUserEmail } from '@/lib/context/UserContext'
import type { ComiteMetricaEstandar } from '@/lib/types'
import { Alert } from '@/components/ui'

/**
 * Catálogo NACIONAL de métricas estándar del Comité Policial (mig 079).
 * Vista admin-only (gate useCan('comite.metricas.catalogo') + RLS por rol).
 * Cada región luego ADOPTA con check las que reporta (MetricasComiteModal).
 * "Quitar" = activo=false (soft-delete): las copias ya adoptadas por regiones se
 * conservan (son filas independientes de comite_metrica).
 */

export default function CatalogoComiteNacional() {
  const userEmail = useCurrentUserEmail()
  const { estandares, loading, refresh } = useEstandaresComite(true)
  const [editor, setEditor] = useState<{ estandar: ComiteMetricaEstandar | null; institucion: string } | null>(null)
  const [colapsadas, setColapsadas] = useState<Set<string>>(new Set())

  function toggleColapso(key: string) {
    setColapsadas(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-5">
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Catálogo de métricas — Comité Policial</h1>
        <p className="text-sm text-slate-500 mt-1 leading-snug">
          Métricas estándar para las 16 regiones. Cada región activa con check las que reporta (desde la sesión del comité).
          Los valores los carga cada región; editar acá no cambia las ya adoptadas.
        </p>
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400 py-10">Cargando catálogo…</p>
      ) : (
        <div className="space-y-5">
          {COMITE_INSTITUCIONES.map(inst => {
            const items = estandares
              .filter(e => e.institucion === inst.key)
              .sort((a, b) => a.orden - b.orden || a.id - b.id)
            const colapsado = colapsadas.has(inst.key)
            return (
              <section key={inst.key} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <button onClick={() => toggleColapso(inst.key)}
                    className="flex items-center gap-2 min-w-0 group" title={colapsado ? 'Expandir' : 'Minimizar'}>
                    <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"
                      className={`text-slate-400 flex-none transition-transform ${colapsado ? '-rotate-90' : ''}`}>
                      <path d="M2 3.5L5 6.5L8 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <h2 className="text-sm font-bold text-slate-800 group-hover:text-slate-900">{inst.label}</h2>
                    <span className="text-[11px] text-slate-400 font-normal">{items.length}</span>
                  </button>
                  <button
                    onClick={() => setEditor({ estandar: null, institucion: inst.key })}
                    className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                  >
                    + métrica
                  </button>
                </div>
                {!colapsado && (
                <div className="divide-y divide-slate-50">
                  {items.length === 0 ? (
                    <p className="text-xs text-slate-400 px-4 py-3">Sin métricas estándar para {inst.label}.</p>
                  ) : items.map(e => (
                    <button
                      key={e.id}
                      onClick={() => setEditor({ estandar: e, institucion: e.institucion })}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex-1 min-w-0 text-sm text-slate-800 truncate">{e.nombre}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        e.tipo === 'numerico' ? 'bg-slate-100 text-slate-500' : 'bg-violet-100 text-violet-700'
                      }`}>
                        {e.tipo === 'numerico' ? (e.unidad || 'número') : 'texto'}
                      </span>
                      <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9z" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  ))}
                </div>
                )}
              </section>
            )
          })}
        </div>
      )}

      {editor && (
        <EstandarEditor
          estandar={editor.estandar}
          institucion={editor.institucion}
          institucionLabel={COMITE_INSTITUCIONES.find(i => i.key === editor.institucion)?.label ?? editor.institucion}
          ordenSugerido={Math.max(0, ...estandares.filter(e => e.institucion === editor.institucion).map(e => e.orden)) + 1}
          currentUserEmail={userEmail}
          onClose={() => setEditor(null)}
          onSaved={() => { refresh(); setEditor(null) }}
        />
      )}
    </div>
  )
}

// ── Editor de un ítem estándar (crear / editar / quitar) ────────────────────
function EstandarEditor({
  estandar, institucion, institucionLabel, ordenSugerido, currentUserEmail, onClose, onSaved,
}: {
  estandar: ComiteMetricaEstandar | null
  institucion: string
  institucionLabel: string
  ordenSugerido: number
  currentUserEmail: string
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!estandar
  const [nombre, setNombre] = useState(estandar?.nombre ?? '')
  const [tipo, setTipo]     = useState<'numerico' | 'texto'>(estandar?.tipo ?? 'numerico')
  const [unidad, setUnidad] = useState(estandar?.unidad ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  function handleClose() { if (!saving) onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true); setError(null)
    const payload = { nombre: nombre.trim(), tipo, unidad: tipo === 'numerico' ? (unidad.trim() || null) : null }
    try {
      if (isEdit) {
        await safeWrite(getSupabase().from('comite_metrica_estandar').update(payload).eq('id', estandar!.id),
          `comite_metrica_estandar update id=${estandar!.id}`)
      } else {
        await safeWrite(getSupabase().from('comite_metrica_estandar').insert({
          ...payload, institucion, orden: ordenSugerido, created_by_email: currentUserEmail || null,
        }), `comite_metrica_estandar insert ${institucion}`)
      }
    } catch (err) { setSaving(false); setError((err as Error).message); return }
    setSaving(false); onSaved()
  }

  async function handleQuitar() {
    if (!estandar) return
    if (!window.confirm(`¿Quitar "${estandar.nombre}" del catálogo nacional? Las regiones que ya la adoptaron la conservan.`)) return
    setSaving(true)
    try {
      await safeWrite(getSupabase().from('comite_metrica_estandar').update({ activo: false }).eq('id', estandar.id),
        `comite_metrica_estandar desactivar id=${estandar.id}`)
    } catch (err) { setSaving(false); setError((err as Error).message); return }
    setSaving(false); onSaved()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{isEdit ? 'Editar métrica estándar' : 'Nueva métrica estándar'}</p>
            <p className="text-xs text-gray-500 mt-0.5">{institucionLabel} · catálogo nacional</p>
          </div>
          <button onClick={handleClose} disabled={saving} className="text-gray-400 hover:text-gray-600 mt-0.5 disabled:opacity-50" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Nombre del ítem <span className="text-red-500">*</span></label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} required
              placeholder="Ej: Detenidos durante la última semana"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setTipo('numerico')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${tipo === 'numerico' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Numérico (con tendencia)
              </button>
              <button type="button" onClick={() => setTipo('texto')}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${tipo === 'texto' ? 'bg-violet-100 text-violet-800' : 'text-gray-500 hover:text-gray-700'}`}>
                Texto
              </button>
            </div>
          </div>

          {tipo === 'numerico' && (
            <div className="w-40">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Unidad</label>
              <input type="text" value={unidad} onChange={e => setUnidad(e.target.value)} placeholder="detenidos, kg, %…"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500" />
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
