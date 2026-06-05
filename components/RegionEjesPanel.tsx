'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import {
  useCanEditAny,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { RegionEje } from '@/lib/types'

/**
 * Modal de gestión del catálogo de ejes de una región. Solo admin/editor DCI
 * puede agregar / editar / borrar (RLS de `region_ejes` lo refuerza
 * server-side; acá gateamos en cliente para UX).
 *
 * Borrar un eje en uso por iniciativas o métricas devuelve foreign key
 * violation (Postgres 23503) → mostramos mensaje claro. No hacemos
 * CASCADE porque queremos forzar que admin reasigne antes.
 */

type Props = {
  open:     boolean
  onClose:  () => void
  region:   Region
  onSaved:  () => void   // dispara reload arriba (VistaRegional.ejeData)
}

export default function RegionEjesPanel({ open, onClose, region, onSaved }: Props) {
  const canEditAny = useCanEditAny()
  const userEmail  = useCurrentUserEmail()

  const [ejes, setEjes]                     = useState<RegionEje[]>([])
  const [loading, setLoading]               = useState(true)
  const [editingId, setEditingId]           = useState<number | null>(null)
  const [editDraft, setEditDraft]           = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm]       = useState(false)
  const [newNumero, setNewNumero]           = useState('')
  const [newNombre, setNewNombre]           = useState('')
  const [saving, setSaving]                 = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const loadEjes = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase()
      .from('region_ejes')
      .select('*')
      .eq('region_cod', region.cod)
      .order('numero', { ascending: true })
    setEjes((data ?? []) as RegionEje[])
    setLoading(false)
  }, [region.cod])

  useEffect(() => {
    if (!open) return
    loadEjes()
    setError(null)
    setShowAddForm(false)
    setNewNumero('')
    setNewNombre('')
    setEditingId(null)
    setConfirmDeleteId(null)
  }, [open, loadEjes])

  if (!open) return null

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const numero = parseInt(newNumero, 10)
    const nombre = newNombre.trim()
    if (!numero || numero < 1 || numero > 99) {
      setError('El número debe estar entre 1 y 99.')
      return
    }
    if (!nombre) {
      setError('El nombre es requerido.')
      return
    }
    setSaving(true)
    setError(null)
    const { error: dbErr } = await getSupabase().from('region_ejes').insert({
      region_cod: region.cod,
      numero,
      nombre,
      created_by_email: userEmail || null,
    })
    setSaving(false)
    if (dbErr) {
      if (dbErr.code === '23505') {
        setError(`Ya existe un Eje ${numero} en esta región.`)
      } else {
        setError(dbErr.message)
      }
      return
    }
    setNewNumero('')
    setNewNombre('')
    setShowAddForm(false)
    await loadEjes()
    onSaved()
  }

  async function handleSaveEdit(eje: RegionEje) {
    const nombre = editDraft.trim()
    if (!nombre) {
      setEditingId(null)
      return
    }
    if (nombre === eje.nombre) {
      setEditingId(null)
      return
    }
    setSaving(true)
    setError(null)
    const { error: dbErr } = await getSupabase()
      .from('region_ejes')
      .update({ nombre, updated_at: new Date().toISOString() })
      .eq('id', eje.id)
    setSaving(false)
    setEditingId(null)
    if (dbErr) {
      setError(dbErr.message)
      return
    }
    await loadEjes()
    onSaved()
  }

  async function handleDelete(eje: RegionEje) {
    setSaving(true)
    setError(null)
    const { error: dbErr } = await getSupabase()
      .from('region_ejes')
      .delete()
      .eq('id', eje.id)
    setSaving(false)
    setConfirmDeleteId(null)
    if (dbErr) {
      // 23503 = foreign_key_violation — el eje está siendo referenciado
      // por iniciativas o métricas. Mensaje claro al admin.
      if (dbErr.code === '23503') {
        setError(
          `No se puede eliminar el Eje ${eje.numero}: hay iniciativas o métricas que lo usan. ` +
          `Reasigna o elimina esas referencias primero.`
        )
      } else {
        setError(dbErr.message)
      }
      return
    }
    await loadEjes()
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header limpio (estilo unificado) ── */}
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 leading-snug">Gestionar ejes</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{region.nombre}</p>
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

        {/* ── Lista de ejes ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 max-h-[60vh] min-h-[140px]">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-6">Cargando catálogo…</p>
          ) : ejes.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-6">
              Aún no hay ejes definidos para esta región.
              {canEditAny && ' Usa "Agregar eje" abajo.'}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {ejes.map(eje => {
                const isEditing  = editingId === eje.id
                const isDeleting = confirmDeleteId === eje.id
                return (
                  <li
                    key={eje.id}
                    className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-slate-50/70 border border-gray-100 hover:border-gray-200 transition-colors"
                  >
                    <span className="text-xs font-bold text-slate-500 w-7 flex-shrink-0">
                      [{eje.numero}]
                    </span>

                    {isEditing ? (
                      <input
                        type="text"
                        value={editDraft}
                        onChange={e => setEditDraft(e.target.value)}
                        onBlur={() => handleSaveEdit(eje)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                        autoFocus
                        disabled={saving}
                        className="flex-1 px-2 py-1 border border-slate-300 rounded text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                      />
                    ) : (
                      <span className="flex-1 text-sm text-slate-800 truncate" title={eje.nombre}>
                        {eje.nombre}
                      </span>
                    )}

                    {!isEditing && !isDeleting && canEditAny && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => {
                            setEditDraft(eje.nombre)
                            setEditingId(eje.id)
                          }}
                          className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100"
                          title="Editar nombre"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(eje.id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
                          title="Eliminar eje"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                          </svg>
                        </button>
                      </div>
                    )}

                    {isDeleting && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
                        <button
                          onClick={() => handleDelete(eje)}
                          disabled={saving}
                          className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                        >Sí</button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={saving}
                          className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300 disabled:opacity-50"
                        >No</button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* Form para agregar */}
          {canEditAny && !showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true)
                setError(null)
                // Sugerir el siguiente número disponible
                const next = ejes.length > 0 ? Math.max(...ejes.map(e => e.numero)) + 1 : 1
                setNewNumero(String(next))
              }}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:border-slate-400 hover:text-slate-800 hover:bg-slate-50/60 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2v8M2 6h8" strokeLinecap="round"/>
              </svg>
              Agregar eje
            </button>
          )}

          {canEditAny && showAddForm && (
            <form onSubmit={handleCreate} className="mt-3 p-3 bg-slate-50/70 border border-gray-200 rounded-lg space-y-2">
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">N°</label>
                  <input
                    type="number"
                    value={newNumero}
                    onChange={e => setNewNumero(e.target.value)}
                    min="1"
                    max="99"
                    required
                    placeholder="1"
                    className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">Nombre</label>
                  <input
                    type="text"
                    value={newNombre}
                    onChange={e => setNewNombre(e.target.value)}
                    required
                    placeholder="Ej: Salud y Servicios Básicos"
                    className="w-full px-2 py-1 border border-slate-200 rounded text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setError(null) }}
                  disabled={saving}
                  className="flex-1 py-1.5 border border-slate-200 text-slate-600 text-xs font-medium rounded hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !newNumero || !newNombre.trim()}
                  className="flex-1 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded hover:bg-slate-700 disabled:opacity-50"
                >
                  {saving ? '…' : 'Agregar'}
                </button>
              </div>
            </form>
          )}

          {error && (
            <p className="mt-3 text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg leading-snug">
              {error}
            </p>
          )}
        </div>

        {/* ── Footer info ── */}
        {!canEditAny && (
          <div className="flex-shrink-0 px-5 py-2.5 bg-slate-50/70 border-t border-gray-100">
            <p className="text-xs text-gray-500 leading-snug">
              Solo admin DCI puede modificar el catálogo. Pídelo al administrador.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
