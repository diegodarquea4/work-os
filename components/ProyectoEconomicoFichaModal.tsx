'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { ComiteEconomicoProyecto, ComiteEconomicoProyectoSeguimiento } from '@/lib/types'
import { LISTA_CANONICA } from '@/lib/ministerios'
import { ESTADO_ACTUAL_ECONOMICO_OPCIONES } from '@/lib/comiteEconomico'

/**
 * Ficha de un proyecto privado del Comité Económico — ver/editar los 16
 * campos (edición inline, onBlur commit — mismo patrón liviano que las
 * notas de SesionModalInversion.tsx) + historial de avances registrados
 * por SEREMI + form para agregar uno nuevo. Misma lógica que
 * SeguimientoTab.tsx (fecha/descripción/estado/autor) pero tabla propia
 * (comite_economico_proyecto_seguimiento) y sin reunión/hito.
 *
 * Se abre desde ComiteEconomicoProyectosPanel.tsx (cartera) o desde la
 * zona "Proyectos tratados" de la sesión — ambos casos solo necesitan el id.
 */

type Props = {
  proyectoId: number
  puedeOperar: boolean
  currentUserEmail: string
  onClose: () => void
  /** Refresca la lista del llamador (nombre/campos pueden haber cambiado). */
  onChanged?: () => void
}

const ESTADO_AVANCE = {
  pendiente:  { label: 'Pendiente',  cls: 'bg-gray-100 text-gray-600' },
  en_curso:   { label: 'En curso',   cls: 'bg-blue-100 text-blue-700' },
  completado: { label: 'Completado', cls: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  cls: 'bg-red-100 text-red-700' },
} as const

const inputCls = 'px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
const labelCls = 'text-[10px] text-gray-500 font-medium'

export default function ProyectoEconomicoFichaModal({ proyectoId, puedeOperar, currentUserEmail, onClose, onChanged }: Props) {
  const [proyecto, setProyecto] = useState<ComiteEconomicoProyecto | null>(null)
  const [avances, setAvances]   = useState<ComiteEconomicoProyectoSeguimiento[]>([])
  const [loading, setLoading]   = useState(true)

  const [avanceDescripcion, setAvanceDescripcion] = useState('')
  const [avanceEstado, setAvanceEstado]           = useState<'' | keyof typeof ESTADO_AVANCE>('')
  const [avanceSaving, setAvanceSaving]           = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const sb = getSupabase()
    const [{ data: p }, { data: segs }] = await Promise.all([
      sb.from('comite_economico_proyecto').select('*').eq('id', proyectoId).single(),
      sb.from('comite_economico_proyecto_seguimiento').select('*').eq('proyecto_id', proyectoId).order('fecha', { ascending: false }).order('created_at', { ascending: false }),
    ])
    setProyecto((p as ComiteEconomicoProyecto | null) ?? null)
    setAvances((segs ?? []) as ComiteEconomicoProyectoSeguimiento[])
    setLoading(false)
  }, [proyectoId])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function commitCampo<K extends keyof ComiteEconomicoProyecto>(campo: K, valor: ComiteEconomicoProyecto[K]) {
    if (!proyecto || valor === proyecto[campo]) return
    setProyecto(prev => prev ? { ...prev, [campo]: valor } : prev)
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').update({ [campo]: valor, updated_at: new Date().toISOString() }).eq('id', proyectoId),
        `comite_economico_proyecto ${String(campo)} id=${proyectoId}`,
      )
      onChanged?.()
    } catch (err) {
      window.alert((err as Error).message)
      cargar()
    }
  }

  async function agregarAvance(e: React.FormEvent) {
    e.preventDefault()
    if (!avanceDescripcion.trim()) return
    setAvanceSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('comite_economico_proyecto_seguimiento').insert({
          proyecto_id: proyectoId,
          descripcion: avanceDescripcion.trim(),
          estado: avanceEstado || null,
          autor: currentUserEmail || null,
        }),
        `comite_economico_proyecto_seguimiento insert proyecto=${proyectoId}`,
      )
      setAvances(prev => [rows[0] as ComiteEconomicoProyectoSeguimiento, ...prev])
      setAvanceDescripcion(''); setAvanceEstado('')
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setAvanceSaving(false)
    }
  }

  async function borrarAvance(a: ComiteEconomicoProyectoSeguimiento) {
    if (!confirm('¿Borrar este avance?')) return
    try {
      await safeDelete(
        getSupabase().from('comite_economico_proyecto_seguimiento').delete().eq('id', a.id),
        `comite_economico_proyecto_seguimiento delete id=${a.id}`,
      )
      setAvances(prev => prev.filter(x => x.id !== a.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  function fmtFecha(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const editable = puedeOperar

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 bg-violet-50/40 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900 truncate">{proyecto?.nombre ?? (loading ? 'Cargando…' : 'Proyecto')}</p>
            <p className="text-xs text-gray-500 mt-0.5">Proyecto privado — Comité Económico</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading || !proyecto ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo label="Plazo">
                  {editable ? (
                    <select defaultValue={proyecto.plazo ?? ''} onBlur={e => commitCampo('plazo', (e.target.value || null) as ComiteEconomicoProyecto['plazo'])} className={inputCls}>
                      <option value="">—</option>
                      <option value="CP">Corto plazo</option>
                      <option value="MP">Mediano plazo</option>
                      <option value="LP">Largo plazo</option>
                    </select>
                  ) : <span className="text-sm text-gray-800">{proyecto.plazo ?? '—'}</span>}
                </Campo>
                <Campo label="Priorizado">
                  <input type="checkbox" defaultChecked={proyecto.priorizado} disabled={!editable} onChange={e => commitCampo('priorizado', e.target.checked)} className="rounded border-gray-300 text-violet-700 focus:ring-violet-400" />
                </Campo>
                <Campo label="Riesgo">
                  <input type="checkbox" defaultChecked={proyecto.riesgo} disabled={!editable} onChange={e => commitCampo('riesgo', e.target.checked)} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
                </Campo>
              </div>

              <Campo label="SEREMI líder">
                {editable ? (
                  <select defaultValue={proyecto.seremi_lider ?? ''} onBlur={e => commitCampo('seremi_lider', e.target.value || null)} className={inputCls}>
                    <option value="">—</option>
                    {LISTA_CANONICA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                ) : <span className="text-sm text-gray-800">{proyecto.seremi_lider ?? '—'}</span>}
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Inversión (MM$)">
                  {editable ? <input type="number" defaultValue={proyecto.inversion_monto ?? ''} onBlur={e => commitCampo('inversion_monto', e.target.value ? Number(e.target.value) : null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.inversion_monto ?? '—'}</span>}
                </Campo>
                <Campo label="Moneda">
                  {editable ? <input type="text" defaultValue={proyecto.inversion_moneda ?? ''} onBlur={e => commitCampo('inversion_moneda', e.target.value || null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.inversion_moneda ?? '—'}</span>}
                </Campo>
              </div>

              <Campo label="Fuente de financiamiento">
                {editable ? <input type="text" defaultValue={proyecto.fuente_financiamiento ?? ''} onBlur={e => commitCampo('fuente_financiamiento', e.target.value || null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.fuente_financiamiento ?? '—'}</span>}
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Mano de obra directa (construcción)">
                  {editable ? <input type="number" defaultValue={proyecto.mano_obra_directa ?? ''} onBlur={e => commitCampo('mano_obra_directa', e.target.value ? Number(e.target.value) : null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.mano_obra_directa ?? '—'}</span>}
                </Campo>
                <Campo label="Mano de obra indirecta (construcción)">
                  {editable ? <input type="number" defaultValue={proyecto.mano_obra_indirecta ?? ''} onBlur={e => commitCampo('mano_obra_indirecta', e.target.value ? Number(e.target.value) : null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.mano_obra_indirecta ?? '—'}</span>}
                </Campo>
              </div>

              <Campo label="Responsable operativo">
                {editable ? <input type="text" defaultValue={proyecto.responsable_operativo ?? ''} onBlur={e => commitCampo('responsable_operativo', e.target.value || null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.responsable_operativo ?? '—'}</span>}
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="KPI">
                  {editable ? <input type="text" defaultValue={proyecto.kpi ?? ''} onBlur={e => commitCampo('kpi', e.target.value || null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.kpi ?? '—'}</span>}
                </Campo>
                <Campo label="Vida útil (años)">
                  {editable ? <input type="number" defaultValue={proyecto.vida_util_anios ?? ''} onBlur={e => commitCampo('vida_util_anios', e.target.value ? Number(e.target.value) : null)} className={inputCls} /> : <span className="text-sm text-gray-800">{proyecto.vida_util_anios ?? '—'}</span>}
                </Campo>
              </div>

              <Campo label="Meta 2026 - 2027">
                {editable ? <textarea defaultValue={proyecto.meta_2026_2027 ?? ''} onBlur={e => commitCampo('meta_2026_2027', e.target.value || null)} rows={2} className={`${inputCls} resize-y`} /> : <p className="text-sm text-gray-800 whitespace-pre-wrap">{proyecto.meta_2026_2027 ?? '—'}</p>}
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Estado inicial">
                  {editable ? <textarea defaultValue={proyecto.estado_inicial ?? ''} onBlur={e => commitCampo('estado_inicial', e.target.value || null)} rows={2} className={`${inputCls} resize-y`} /> : <p className="text-sm text-gray-800 whitespace-pre-wrap">{proyecto.estado_inicial ?? '—'}</p>}
                </Campo>
                <Campo label="Estado actual">
                  {editable ? (
                    <select defaultValue={proyecto.estado_actual ?? ''} onBlur={e => commitCampo('estado_actual', e.target.value || null)} className={inputCls}>
                      <option value="">—</option>
                      {ESTADO_ACTUAL_ECONOMICO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : <span className="text-sm text-gray-800">{proyecto.estado_actual ?? '—'}</span>}
                </Campo>
              </div>

              <Campo label="Notas">
                {editable ? <textarea defaultValue={proyecto.notas ?? ''} onBlur={e => commitCampo('notas', e.target.value || null)} rows={2} placeholder="N° de RCA, fechas, contexto…" className={`${inputCls} resize-y`} /> : <p className="text-sm text-gray-800 whitespace-pre-wrap">{proyecto.notas ?? '—'}</p>}
              </Campo>

              {/* Avances */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700 mb-2">Avances registrados</p>
                {avances.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">Sin avances registrados todavía.</p>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {avances.map(a => {
                      const puedeEditar = puedeOperar || a.autor === currentUserEmail
                      return (
                        <div key={a.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                          <div className="flex items-start gap-2">
                            {a.estado && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-px ${ESTADO_AVANCE[a.estado].cls}`}>
                                {ESTADO_AVANCE[a.estado].label}
                              </span>
                            )}
                            <p className="text-sm text-gray-700 leading-snug flex-1">{a.descripcion}</p>
                            {puedeEditar && (
                              <button onClick={() => borrarAvance(a)} className="text-gray-300 hover:text-red-500 flex-shrink-0" title="Borrar avance">
                                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                  <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                                </svg>
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {fmtFecha(a.fecha)}{a.autor ? ` · ${a.autor}` : ''}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
                <form onSubmit={agregarAvance} className="space-y-2">
                  <textarea
                    value={avanceDescripcion}
                    onChange={e => setAvanceDescripcion(e.target.value)}
                    rows={2}
                    placeholder="Registrar un avance…"
                    className={`${inputCls} resize-none`}
                  />
                  <div className="flex gap-2">
                    <select value={avanceEstado} onChange={e => setAvanceEstado(e.target.value as typeof avanceEstado)} className={`${inputCls} flex-1`}>
                      <option value="">Sin estado</option>
                      {(Object.keys(ESTADO_AVANCE) as (keyof typeof ESTADO_AVANCE)[]).map(k => (
                        <option key={k} value={k}>{ESTADO_AVANCE[k].label}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={avanceSaving || !avanceDescripcion.trim()}
                      className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40 flex-shrink-0"
                    >
                      {avanceSaving ? 'Guardando…' : '+ Avance'}
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}
