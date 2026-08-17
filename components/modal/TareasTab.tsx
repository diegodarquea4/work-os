'use client'

import { useState } from 'react'
import type { Tarea } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { EmptyState } from '@/components/ui'
import TareaGantt from './TareaGantt'

const ESTADO_CONFIG = {
  no_iniciada: { label: 'No iniciada', color: 'bg-gray-100 text-gray-600'   },
  en_proceso:  { label: 'En proceso',  color: 'bg-blue-100 text-blue-700'   },
  bloqueada:   { label: 'Bloqueada',   color: 'bg-red-100 text-red-700'     },
  completada:  { label: 'Completada',  color: 'bg-green-100 text-green-700' },
} as const

type EstadoKey = keyof typeof ESTADO_CONFIG
type Usuario = { email: string; name: string }

// Sentinel para el <option> "Otro / escribir nombre…" del select de
// Responsable — no es un email real, solo dispara el modo texto libre.
const OTRO_VALUE = '__otro__'

function fmtFecha(fecha: string | null) {
  if (!fecha) return null
  // date puro YYYY-MM-DD: ancla a mediodía para que no se corra un día por timezone.
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Opciones del select de Responsable: la lista filtrada por región +
// transversales, más el valor actual si es un email conocido que quedó
// fuera del filtro (ej. tarea asignada antes de un cambio de región).
function responsableOptions(current: string, usuariosRegion: Usuario[], usuariosAll: Usuario[]): Usuario[] {
  if (!current || usuariosRegion.some(u => u.email === current)) return usuariosRegion
  const found = usuariosAll.find(u => u.email === current)
  return found ? [found, ...usuariosRegion] : usuariosRegion
}

type Props = {
  prioridadId: number
  nombreIniciativa: string
  tareas: Tarea[]
  usuarios: Usuario[]
  usuariosRegion: Usuario[]
  onRefresh: () => Promise<void>
  canCreate?: boolean
  canDeleteAny?: boolean
  currentUserEmail?: string
}

export default function TareasTab({
  prioridadId,
  nombreIniciativa,
  tareas,
  usuarios,
  usuariosRegion,
  onRefresh,
  canCreate = true,
  canDeleteAny = true,
  currentUserEmail = '',
}: Props) {
  const [showForm, setShowForm]           = useState(false)
  const [showGantt, setShowGantt]         = useState(false)
  const [formNombre, setFormNombre]       = useState('')
  const [formTarea, setFormTarea]         = useState('')
  const [formResponsable, setFormResponsable] = useState('')
  const [formResponsableManual, setFormResponsableManual] = useState(false)
  const [formEstado, setFormEstado]       = useState<EstadoKey>('no_iniciada')
  const [formInicio, setFormInicio]       = useState('')
  const [formTermino, setFormTermino]     = useState('')
  const [formComentarios, setFormComentarios] = useState('')
  const [saving, setSaving]               = useState(false)

  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editNombre, setEditNombre]       = useState('')
  const [editTarea, setEditTarea]         = useState('')
  const [editResponsable, setEditResponsable] = useState('')
  const [editResponsableManual, setEditResponsableManual] = useState(false)
  const [editEstado, setEditEstado]       = useState<EstadoKey>('no_iniciada')
  const [editInicio, setEditInicio]       = useState('')
  const [editTermino, setEditTermino]     = useState('')
  const [editComentarios, setEditComentarios] = useState('')
  const [editSaving, setEditSaving]       = useState(false)

  // "Mío vs ajeno" — mismo patrón que Seguimiento/Documentos.
  const isOwn = (t: Tarea) => !!currentUserEmail && t.autor === currentUserEmail
  const canManage = (t: Tarea) => canDeleteAny || isOwn(t)

  function responsableLabel(email: string | null) {
    if (!email) return null
    return usuarios.find(u => u.email === email)?.name ?? email
  }

  function resetForm() {
    setFormNombre(''); setFormTarea(''); setFormResponsable(''); setFormResponsableManual(false)
    setFormEstado('no_iniciada'); setFormInicio(''); setFormTermino('')
    setFormComentarios(''); setShowForm(false)
  }

  async function handleSave() {
    if (!formNombre.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('tareas').insert({
          prioridad_id:  prioridadId,
          nombre:        formNombre.trim(),
          tarea:         formTarea.trim(),
          responsable:   formResponsable.trim() || null,
          estado:        formEstado,
          fecha_inicio:  formInicio || null,
          fecha_termino: formTermino || null,
          comentarios:   formComentarios.trim() || null,
          autor:         currentUserEmail || null,
        }),
        `tareas insert prioridad=${prioridadId}`,
      )
      resetForm()
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(t: Tarea) {
    setEditingId(t.id)
    setEditNombre(t.nombre)
    setEditTarea(t.tarea)
    const conocido = !t.responsable || usuarios.some(u => u.email === t.responsable)
    setEditResponsableManual(!!t.responsable && !conocido)
    setEditResponsable(t.responsable ?? '')
    setEditEstado(t.estado)
    setEditInicio(t.fecha_inicio ?? '')
    setEditTermino(t.fecha_termino ?? '')
    setEditComentarios(t.comentarios ?? '')
  }

  async function handleUpdate() {
    if (!editNombre.trim() || editingId === null) return
    setEditSaving(true)
    try {
      // No tocamos `autor` en update — queda quien la creó originalmente.
      await safeWrite(
        getSupabase().from('tareas').update({
          nombre:        editNombre.trim(),
          tarea:         editTarea.trim(),
          responsable:   editResponsable.trim() || null,
          estado:        editEstado,
          fecha_inicio:  editInicio || null,
          fecha_termino: editTermino || null,
          comentarios:   editComentarios.trim() || null,
        }).eq('id', editingId),
        `tareas update id=${editingId}`,
      )
      setEditingId(null)
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta tarea?')) return
    try {
      await safeDelete(
        getSupabase().from('tareas').delete().eq('id', id),
        `tareas delete id=${id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  const inputCls = 'w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white'
  const selectCls = 'text-sm text-gray-700 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white'

  return (
    <div className="px-6 py-4">
      {/* Carta Gantt — colapsada por defecto, primero en el orden visual. */}
      <div className="mb-5">
        <button
          onClick={() => setShowGantt(v => !v)}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:border-slate-300 hover:text-slate-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: showGantt ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
            <path d="M2.5 4.5L6 8l3.5-3.5"/>
          </svg>
          {showGantt ? 'Ocultar' : 'Desplegar'} carta Gantt
        </button>
        {showGantt && (
          tareas.length > 0
            ? <TareaGantt tareas={tareas} nombreIniciativa={nombreIniciativa} />
            : <p className="text-xs text-gray-500 mt-2 text-center">Sin tareas para graficar.</p>
        )}
      </div>

      {tareas.length === 0 ? (
        <EmptyState
          title="Sin tareas registradas"
          description="Las tareas y compromisos de esta iniciativa se listan acá."
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          }
        />
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="font-medium py-2 pr-3">Tarea</th>
                <th className="font-medium py-2 pr-3 w-36">Responsable</th>
                <th className="font-medium py-2 pr-3 w-32">Estado</th>
                <th className="font-medium py-2 pr-3 w-40">Inicio – Término</th>
                <th className="font-medium py-2 pr-3">Comentarios</th>
                <th className="font-medium py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {tareas.map(t => {
                const isEditing = editingId === t.id
                const est = ESTADO_CONFIG[t.estado] ?? ESTADO_CONFIG.no_iniciada
                // Fecha local (en-CA → YYYY-MM-DD), no UTC: con toISOString(),
                // desde las ~20-21h de Chile la fecha UTC ya es "mañana" y una
                // tarea que termina hoy se marcaría vencida antes de tiempo.
                // Mismo patrón que AttentionTray.diasHastaHito.
                const vencido = !!t.fecha_termino && t.estado !== 'completada' && t.fecha_termino < new Date().toLocaleDateString('en-CA')

                if (isEditing) {
                  return (
                    <tr key={t.id} className="border-b border-gray-50 align-top">
                      <td colSpan={6} className="py-3">
                        <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                          <input
                            type="text"
                            placeholder="Nombre de la tarea"
                            value={editNombre}
                            onChange={e => setEditNombre(e.target.value)}
                            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                          />
                          <textarea
                            value={editTarea}
                            onChange={e => setEditTarea(e.target.value)}
                            rows={2}
                            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                          />
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Responsable</label>
                              <select
                                value={editResponsableManual ? OTRO_VALUE : editResponsable}
                                onChange={e => {
                                  if (e.target.value === OTRO_VALUE) { setEditResponsableManual(true); setEditResponsable('') }
                                  else { setEditResponsableManual(false); setEditResponsable(e.target.value) }
                                }}
                                className={`${selectCls} w-full`}
                              >
                                <option value="" className="text-sm">Sin asignar</option>
                                {responsableOptions(editResponsable, usuariosRegion, usuarios).map(u => (
                                  <option key={u.email} value={u.email} className="text-sm">{u.name !== u.email ? `${u.name} (${u.email})` : u.email}</option>
                                ))}
                                <option value={OTRO_VALUE} className="text-sm">Otro / escribir nombre…</option>
                              </select>
                              {editResponsableManual && (
                                <input
                                  type="text"
                                  placeholder="Nombre del responsable"
                                  value={editResponsable}
                                  onChange={e => setEditResponsable(e.target.value)}
                                  className={`${inputCls} mt-1.5`}
                                />
                              )}
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Estado</label>
                              <select value={editEstado} onChange={e => setEditEstado(e.target.value as EstadoKey)} className={`${selectCls} w-full`}>
                                {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                                  <option key={key} value={key} className="text-sm">{cfg.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Fecha inicio</label>
                              <input type="date" value={editInicio} onChange={e => setEditInicio(e.target.value)} className={`${selectCls} w-full`} />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Fecha término</label>
                              <input type="date" value={editTermino} onChange={e => setEditTermino(e.target.value)} className={`${selectCls} w-full`} />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-500 block mb-1">Comentarios</label>
                              <input type="text" value={editComentarios} onChange={e => setEditComentarios(e.target.value)} className={inputCls} />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                              Cancelar
                            </button>
                            <button
                              onClick={handleUpdate}
                              disabled={editSaving || !editNombre.trim()}
                              className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                            >
                              {editSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors group">
                    <td className="py-2.5 pr-3 align-top">
                      <div className="font-medium text-gray-800">{t.nombre}</div>
                      {t.tarea && <div className="text-xs text-gray-500 mt-0.5">{t.tarea}</div>}
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      {responsableLabel(t.responsable) ?? <span className="text-gray-400">Sin asignar</span>}
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${est.color}`}>{est.label}</span>
                    </td>
                    <td className={`py-2.5 pr-3 align-top whitespace-nowrap ${vencido ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {t.fecha_inicio || t.fecha_termino
                        ? `${fmtFecha(t.fecha_inicio) ?? '—'} – ${fmtFecha(t.fecha_termino) ?? '—'}`
                        : '—'}
                    </td>
                    <td className="py-2.5 pr-3 align-top text-gray-500">{t.comentarios || '—'}</td>
                    <td className="py-2.5 align-top">
                      {canManage(t) && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startEdit(t)}
                            className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 transition-colors"
                            title={isOwn(t) ? 'Editar' : 'Editar (eres admin/editor)'}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                            title={isOwn(t) ? 'Eliminar' : 'Eliminar (eres admin/editor)'}
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                            </svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Agregar tarea — bajo la lista, no arriba. */}
      {!showForm && canCreate && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors mt-5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
          </svg>
          Agregar tarea
        </button>
      )}

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 mt-5 space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Nombre</label>
            <input
              type="text"
              placeholder="Nombre de la tarea"
              value={formNombre}
              onChange={e => setFormNombre(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Descripción</label>
            <textarea
              placeholder="Describe la tarea..."
              value={formTarea}
              onChange={e => setFormTarea(e.target.value)}
              rows={2}
              className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Responsable</label>
              <select
                value={formResponsableManual ? OTRO_VALUE : formResponsable}
                onChange={e => {
                  if (e.target.value === OTRO_VALUE) { setFormResponsableManual(true); setFormResponsable('') }
                  else { setFormResponsableManual(false); setFormResponsable(e.target.value) }
                }}
                className={`${selectCls} w-full`}
              >
                <option value="" className="text-sm">Sin asignar</option>
                {responsableOptions(formResponsable, usuariosRegion, usuarios).map(u => (
                  <option key={u.email} value={u.email} className="text-sm">{u.name !== u.email ? `${u.name} (${u.email})` : u.email}</option>
                ))}
                <option value={OTRO_VALUE} className="text-sm">Otro / escribir nombre…</option>
              </select>
              {formResponsableManual && (
                <input
                  type="text"
                  placeholder="Nombre del responsable"
                  value={formResponsable}
                  onChange={e => setFormResponsable(e.target.value)}
                  className={`${inputCls} mt-1.5`}
                />
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estado</label>
              <select value={formEstado} onChange={e => setFormEstado(e.target.value as EstadoKey)} className={`${selectCls} w-full`}>
                {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key} className="text-sm">{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha inicio</label>
              <input type="date" value={formInicio} onChange={e => setFormInicio(e.target.value)} className={`${selectCls} w-full`} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha término</label>
              <input type="date" value={formTermino} onChange={e => setFormTermino(e.target.value)} className={`${selectCls} w-full`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">Comentarios</label>
              <input type="text" value={formComentarios} onChange={e => setFormComentarios(e.target.value)} placeholder="Opcional" className={inputCls} />
            </div>
          </div>
          {currentUserEmail && (
            <p className="text-xs text-gray-400">
              Se registrará a tu nombre: <span className="font-mono">{currentUserEmail}</span>
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={resetForm} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formNombre.trim()}
              className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
