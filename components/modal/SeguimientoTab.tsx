'use client'

import { useState } from 'react'
import type { Seguimiento } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
  alerta:  { label: 'Alerta',  color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'    },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'En curso',   color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

type Props = {
  prioridadId: number
  seguimientos: Seguimiento[]
  onRefresh: () => Promise<void>
  canEdit?: boolean
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SeguimientoTab({ prioridadId, seguimientos, onRefresh, canEdit = true }: Props) {
  const [showForm, setShowForm]   = useState(false)
  const [formDesc, setFormDesc]   = useState('')
  const [formTipo, setFormTipo]   = useState<keyof typeof TIPO_CONFIG>('avance')
  const [formEstado, setFormEstado] = useState('')
  const [formAutor, setFormAutor] = useState('')
  const [formFecha, setFormFecha] = useState(() => new Date().toISOString().split('T')[0])
  const [saving, setSaving]       = useState(false)

  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editDesc, setEditDesc]     = useState('')
  const [editTipo, setEditTipo]     = useState<keyof typeof TIPO_CONFIG>('avance')
  const [editEstado, setEditEstado] = useState('')
  const [editAutor, setEditAutor]   = useState('')
  const [editFecha, setEditFecha]   = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function handleSave() {
    if (!formDesc.trim()) return
    setSaving(true)
    const { error } = await getSupabase().from('seguimientos').insert({
      prioridad_id: prioridadId,
      tipo:         formTipo,
      descripcion:  formDesc.trim(),
      autor:        formAutor.trim() || null,
      estado:       formEstado || null,
      fecha:        formFecha,
    })
    if (!error) {
      setFormDesc(''); setFormEstado(''); setFormAutor('')
      setFormFecha(new Date().toISOString().split('T')[0]); setShowForm(false)
      await onRefresh()
    }
    setSaving(false)
  }

  function startEdit(s: Seguimiento) {
    setEditingId(s.id)
    setEditDesc(s.descripcion)
    setEditTipo(s.tipo)
    setEditEstado(s.estado ?? '')
    setEditAutor(s.autor ?? '')
    setEditFecha(s.fecha ? s.fecha.split('T')[0] : new Date().toISOString().split('T')[0])
  }

  async function handleUpdate() {
    if (!editDesc.trim() || editingId === null) return
    setEditSaving(true)
    const { error } = await getSupabase().from('seguimientos').update({
      tipo:        editTipo,
      descripcion: editDesc.trim(),
      autor:       editAutor.trim() || null,
      estado:      editEstado || null,
      fecha:       editFecha,
    }).eq('id', editingId)
    if (!error) { setEditingId(null); await onRefresh() }
    setEditSaving(false)
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta actualización?')) return
    await getSupabase().from('seguimientos').delete().eq('id', id)
    await onRefresh()
  }

  return (
    <div className="px-6 py-4">
      {!showForm && canEdit && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors mb-5"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 2v10M2 7h10" strokeLinecap="round"/>
          </svg>
          Agregar actualización
        </button>
      )}

      {showForm && (
        <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
              <button
                key={key}
                onClick={() => setFormTipo(key)}
                className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  formTipo === key ? cfg.color : 'bg-white text-gray-400 border border-gray-200'
                }`}
              >
                {cfg.label}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Describe el avance, reunión, hito o alerta..."
            value={formDesc}
            onChange={e => setFormDesc(e.target.value)}
            rows={3}
            className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Autor (opcional)"
              value={formAutor}
              onChange={e => setFormAutor(e.target.value)}
              className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
            />
            <select
              value={formEstado}
              onChange={e => setFormEstado(e.target.value)}
              className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
            >
              <option value="">Estado (sin cambio)</option>
              {Object.entries(ESTADO_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 flex-shrink-0">Fecha</label>
            <input
              type="date"
              value={formFecha}
              onChange={e => setFormFecha(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-700"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formDesc.trim()}
              className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {seguimientos.length === 0 ? (
        <div className="text-center py-10 text-gray-300">
          <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 8v4l3 3" strokeLinecap="round"/>
          </svg>
          <p className="text-sm">Sin actualizaciones aún</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-100" />
          <div className="space-y-5">
            {seguimientos.map(s => {
              const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
              const est = s.estado ? ESTADO_CONFIG[s.estado as keyof typeof ESTADO_CONFIG] : null
              const isEditing = editingId === s.id
              return (
                <div key={s.id} className="flex gap-4 pl-1 group">
                  <div className={`w-3.5 h-3.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot} ring-2 ring-white`} />
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="bg-gray-50 rounded-xl p-3 space-y-2.5">
                        <div className="flex gap-2 flex-wrap">
                          {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, c]) => (
                            <button
                              key={key}
                              onClick={() => setEditTipo(key)}
                              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                                editTipo === key ? c.color : 'bg-white text-gray-400 border border-gray-200'
                              }`}
                            >
                              {c.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          rows={3}
                          className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Autor (opcional)"
                            value={editAutor}
                            onChange={e => setEditAutor(e.target.value)}
                            className="flex-1 text-sm text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                          />
                          <select
                            value={editEstado}
                            onChange={e => setEditEstado(e.target.value)}
                            className="flex-1 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
                          >
                            <option value="">Sin estado</option>
                            {Object.entries(ESTADO_CONFIG).map(([key, c]) => (
                              <option key={key} value={key}>{c.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-500 flex-shrink-0">Fecha</label>
                          <input
                            type="date"
                            value={editFecha}
                            onChange={e => setEditFecha(e.target.value)}
                            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white text-gray-700"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setEditingId(null)} className="text-sm text-gray-400 hover:text-gray-600 px-3 py-1.5">
                            Cancelar
                          </button>
                          <button
                            onClick={handleUpdate}
                            disabled={editSaving || !editDesc.trim()}
                            className="text-sm bg-slate-900 text-white px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition-colors"
                          >
                            {editSaving ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                          {est && <span className={`text-xs px-2 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                          <span className="text-xs text-gray-500 ml-auto">{fmtDate(s.created_at)}</span>
                          {canEdit && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => startEdit(s)}
                              className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 transition-colors"
                              title="Editar"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDelete(s.id)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 transition-colors"
                              title="Eliminar"
                            >
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                              </svg>
                            </button>
                          </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>
                        {s.autor && <p className="text-xs text-gray-500 mt-1">{s.autor}</p>}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
