'use client'

import { useState } from 'react'
import type { Tarea } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { EmptyState } from '@/components/ui'

const ESTADO_CONFIG = {
  no_iniciada: { label: 'No iniciada', color: 'bg-gray-100 text-gray-600'   },
  en_proceso:  { label: 'En proceso',  color: 'bg-blue-100 text-blue-700'   },
  bloqueada:   { label: 'Bloqueada',   color: 'bg-red-100 text-red-700'     },
  completada:  { label: 'Completada',  color: 'bg-green-100 text-green-700' },
} as const

type EstadoKey = keyof typeof ESTADO_CONFIG

function fmtVencimiento(fecha: string | null) {
  if (!fecha) return null
  // date puro YYYY-MM-DD: ancla a mediodía para que no se corra un día por timezone.
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  prioridadId: number
  tareas: Tarea[]
  usuarios: { email: string; name: string }[]
  onRefresh: () => Promise<void>
  canCreate?: boolean
  canDeleteAny?: boolean
  currentUserEmail?: string
}

export default function TareasTab({
  prioridadId,
  tareas,
  usuarios,
  onRefresh,
  canCreate = true,
  canDeleteAny = true,
  currentUserEmail = '',
}: Props) {
  const [showForm, setShowForm]           = useState(false)
  const [formTarea, setFormTarea]         = useState('')
  const [formResponsable, setFormResponsable] = useState('')
  const [formEstado, setFormEstado]       = useState<EstadoKey>('no_iniciada')
  const [formVencimiento, setFormVencimiento] = useState('')
  const [formComentarios, setFormComentarios] = useState('')
  const [saving, setSaving]               = useState(false)

  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editTarea, setEditTarea]         = useState('')
  const [editResponsable, setEditResponsable] = useState('')
  const [editEstado, setEditEstado]       = useState<EstadoKey>('no_iniciada')
  const [editVencimiento, setEditVencimiento] = useState('')
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
    setFormTarea(''); setFormResponsable(''); setFormEstado('no_iniciada')
    setFormVencimiento(''); setFormComentarios(''); setShowForm(false)
  }

  async function handleSave() {
    if (!formTarea.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('tareas').insert({
          prioridad_id:      prioridadId,
          tarea:             formTarea.trim(),
          responsable:       formResponsable || null,
          estado:            formEstado,
          fecha_vencimiento: formVencimiento || null,
          comentarios:       formComentarios.trim() || null,
          autor:             currentUserEmail || null,
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
    setEditTarea(t.tarea)
    setEditResponsable(t.responsable ?? '')
    setEditEstado(t.estado)
    setEditVencimiento(t.fecha_vencimiento ?? '')
    setEditComentarios(t.comentarios ?? '')
  }

  async function handleUpdate() {
    if (!editTarea.trim() || editingId === null) return
    setEditSaving(true)
    try {
      // No tocamos `autor` en update — queda quien la creó originalmente.
      await safeWrite(
        getSupabase().from('tareas').update({
          tarea:             editTarea.trim(),
          responsable:       editResponsable || null,
          estado:            editEstado,
          fecha_vencimiento: editVencimiento || null,
          comentarios:       editComentarios.trim() || null,
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
      {!showForm && canCreate && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors mb-5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
          </svg>
          Agregar tarea
        </button>
      )}

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <textarea
            placeholder="Describe la tarea..."
            value={formTarea}
            onChange={e => setFormTarea(e.target.value)}
            rows={2}
            className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Responsable</label>
              <select value={formResponsable} onChange={e => setFormResponsable(e.target.value)} className={`${selectCls} w-full`}>
                <option value="">Sin asignar</option>
                {usuarios.map(u => (
                  <option key={u.email} value={u.email}>{u.name !== u.email ? `${u.name} (${u.email})` : u.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Estado</label>
              <select value={formEstado} onChange={e => setFormEstado(e.target.value as EstadoKey)} className={`${selectCls} w-full`}>
                {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha vencimiento</label>
              <input type="date" value={formVencimiento} onChange={e => setFormVencimiento(e.target.value)} className={`${selectCls} w-full`} />
            </div>
            <div>
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
              disabled={saving || !formTarea.trim()}
              className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

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
                <th className="font-medium py-2 pr-3 w-28">Vencimiento</th>
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
                // tarea que vence hoy se marcaría vencida antes de tiempo.
                // Mismo patrón que AttentionTray.diasHastaHito.
                const vencido = !!t.fecha_vencimiento && t.estado !== 'completada' && t.fecha_vencimiento < new Date().toLocaleDateString('en-CA')

                if (isEditing) {
                  return (
                    <tr key={t.id} className="border-b border-gray-50 align-top">
                      <td colSpan={6} className="py-3">
                        <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                          <textarea
                            value={editTarea}
                            onChange={e => setEditTarea(e.target.value)}
                            rows={2}
                            className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                          />
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Responsable</label>
                              <select value={editResponsable} onChange={e => setEditResponsable(e.target.value)} className={`${selectCls} w-full`}>
                                <option value="">Sin asignar</option>
                                {usuarios.map(u => (
                                  <option key={u.email} value={u.email}>{u.name !== u.email ? `${u.name} (${u.email})` : u.email}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Estado</label>
                              <select value={editEstado} onChange={e => setEditEstado(e.target.value as EstadoKey)} className={`${selectCls} w-full`}>
                                {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                                  <option key={key} value={key}>{cfg.label}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">Fecha vencimiento</label>
                              <input type="date" value={editVencimiento} onChange={e => setEditVencimiento(e.target.value)} className={`${selectCls} w-full`} />
                            </div>
                            <div>
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
                              disabled={editSaving || !editTarea.trim()}
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
                    <td className="py-2.5 pr-3 text-gray-700 align-top">{t.tarea}</td>
                    <td className="py-2.5 pr-3 align-top">
                      {responsableLabel(t.responsable) ?? <span className="text-gray-400">Sin asignar</span>}
                    </td>
                    <td className="py-2.5 pr-3 align-top">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${est.color}`}>{est.label}</span>
                    </td>
                    <td className={`py-2.5 pr-3 align-top whitespace-nowrap ${vencido ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                      {fmtVencimiento(t.fecha_vencimiento) ?? '—'}
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
    </div>
  )
}
