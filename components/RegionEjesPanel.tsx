'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, DbWriteError } from '@/lib/dbWrite'
import {
  useCanEditAny,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { RegionEje } from '@/lib/types'
import { parseEjeString, moverEnLista } from '@/lib/ejes'
import { Alert, EmptyState } from '@/components/ui'
import ReasignarEjeModal from '@/components/ReasignarEjeModal'

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
  // Sincroniza en memoria las iniciativas movidas al reasignar un eje (el
  // eje_id cambió). Ver VistaRegional.handleReasignado.
  onReasignado?: (origenEjeId: number, destino: { id: number; numero: number; nombre: string }) => void
}

export default function RegionEjesPanel({ open, onClose, region, onSaved, onReasignado }: Props) {
  const canEditAny = useCanEditAny()
  const userEmail  = useCurrentUserEmail()

  const [ejes, setEjes]                     = useState<RegionEje[]>([])
  const [loading, setLoading]               = useState(true)
  const [editingId, setEditingId]           = useState<number | null>(null)
  const [editDraft, setEditDraft]           = useState('')
  const [reasignarEje, setReasignarEje]     = useState<RegionEje | null>(null)
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
    setReasignarEje(null)
  }, [open, loadEjes])

  if (!open) return null

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const numero = parseInt(newNumero, 10)
    if (!numero || numero < 1 || numero > 99) {
      setError('El número debe estar entre 1 y 99.')
      return
    }
    // Normalización: si el delegado escribió "Eje 5: Salud" en el campo Nombre,
    // extraemos solo "Salud" y validamos que el N° coincida con el campo aparte.
    // El catálogo guarda nombre PURO (sin "Eje N:") — el label canónico se
    // compone con composeEjeLabel en UI.
    let nombre = newNombre.trim()
    const parsed = parseEjeString(nombre)
    if (parsed) {
      if (parsed.numero !== numero) {
        setError(`El nombre incluye "Eje ${parsed.numero}" pero el N° es ${numero}. Corrige uno de los dos.`)
        return
      }
      nombre = parsed.nombre
    }
    if (!nombre) {
      setError('El nombre es requerido.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await safeWrite(
        getSupabase().from('region_ejes').insert({
          region_cod: region.cod,
          numero,
          nombre,
          created_by_email: userEmail || null,
        }),
        `region_ejes insert ${region.cod}/${numero}`,
      )
    } catch (err) {
      setSaving(false)
      const cause = (err as DbWriteError).cause as { code?: string; message?: string } | undefined
      if (cause?.code === '23505') {
        setError(`Ya existe un Eje ${numero} en esta región.`)
      } else {
        setError((err as Error).message)
      }
      return
    }
    setSaving(false)
    setNewNumero('')
    setNewNombre('')
    setShowAddForm(false)
    await loadEjes()
    onSaved()
  }

  async function handleSaveEdit(eje: RegionEje) {
    let nombre = editDraft.trim()
    // Misma normalización que en handleCreate: si pegó "Eje N: Nombre", extraer
    // y validar coincidencia del número con el eje editado.
    const parsed = parseEjeString(nombre)
    if (parsed) {
      if (parsed.numero !== eje.numero) {
        setError(`El nombre incluye "Eje ${parsed.numero}" pero este es el Eje ${eje.numero}. Quita el prefijo o corrige el número.`)
        return
      }
      nombre = parsed.nombre
    }
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
    try {
      await safeWrite(
        getSupabase()
          .from('region_ejes')
          .update({ nombre, updated_at: new Date().toISOString() })
          .eq('id', eje.id),
        `region_ejes update id=${eje.id}`,
      )
    } catch (err) {
      setSaving(false)
      setEditingId(null)
      setError((err as Error).message)
      return
    }
    setSaving(false)
    setEditingId(null)
    await loadEjes()
    onSaved()
  }

  // Reordenar con flechas. Renumera 1..N según la posición vía la RPC atómica
  // `reordenar_region_ejes` (unicidad diferida). El trigger 083 re-escribe el
  // label "Eje N: Nombre" en las iniciativas de cada eje cuyo número cambia.
  async function handleMove(index: number, dir: -1 | 1) {
    if (saving) return
    const orderedIds = ejes.map(e => e.id)
    const nextOrder = moverEnLista(orderedIds, index, dir)
    if (nextOrder === orderedIds) return  // fuera de rango: no-op

    // Optimista: reordenar + renumerar localmente para feedback inmediato.
    const byId = new Map(ejes.map(e => [e.id, e]))
    const optimistic = nextOrder.map((id, i) => ({ ...byId.get(id)!, numero: i + 1 }))
    setEjes(optimistic)
    setEditingId(null)
    setSaving(true)
    setError(null)

    const { error: rpcError } = await getSupabase().rpc('reordenar_region_ejes', {
      p_region_cod: region.cod,
      p_ids:        nextOrder,
    })
    setSaving(false)
    if (rpcError) {
      setError(`No se pudo reordenar: ${rpcError.message}`)
    }
    // En éxito o error, recargar desde la BD para quedar con el estado canónico.
    await loadEjes()
    if (!rpcError) onSaved()
  }

  return (
    <>
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
            <EmptyState
              title="Sin ejes definidos"
              description={canEditAny ? 'Usá "Agregar eje" abajo para crear el primero.' : 'Aún no hay ejes definidos para esta región.'}
            />
          ) : (
            <>
            {canEditAny && ejes.length > 1 && (
              <p className="text-[11px] text-slate-500 leading-snug mb-2 px-0.5">
                Usa las flechas para reordenar. El orden define el número (Eje 1, 2, 3…) y las
                iniciativas vinculadas se actualizan al nuevo número o nombre.
              </p>
            )}
            <ul className="space-y-1.5">
              {ejes.map((eje, index) => {
                const isEditing  = editingId === eje.id
                const isFirst    = index === 0
                const isLast     = index === ejes.length - 1
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

                    {!isEditing && canEditAny && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <div className="flex flex-col -my-1 mr-0.5">
                          <button
                            onClick={() => handleMove(index, -1)}
                            disabled={saving || isFirst}
                            className="p-0.5 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-default"
                            title="Subir (Eje anterior)"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <path d="M3 7.5L6 4.5l3 3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          <button
                            onClick={() => handleMove(index, 1)}
                            disabled={saving || isLast}
                            className="p-0.5 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100 disabled:opacity-25 disabled:hover:bg-transparent disabled:cursor-default"
                            title="Bajar (Eje siguiente)"
                          >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.75">
                              <path d="M3 4.5L6 7.5l3-3" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
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
                          onClick={() => setReasignarEje(eje)}
                          disabled={saving}
                          className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 disabled:opacity-40"
                          title="Eliminar eje"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
            </>
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
              <p className="text-[10px] text-slate-500 leading-snug">
                Solo el nombre — el prefijo &quot;Eje N:&quot; se agrega automático al mostrar.
              </p>
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
                  className="flex-1 py-1.5 bg-violet-700 text-white text-xs font-semibold rounded hover:bg-violet-800 disabled:opacity-50"
                >
                  {saving ? '…' : 'Agregar'}
                </button>
              </div>
            </form>
          )}

          {error && (
            <Alert variant="error" className="mt-3">{error}</Alert>
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

    {reasignarEje && (
      <ReasignarEjeModal
        region={region}
        origen={reasignarEje}
        candidatos={ejes.filter(e => e.id !== reasignarEje.id)}
        onCancel={() => setReasignarEje(null)}
        onReasignado={onReasignado}
        onDone={async () => {
          setReasignarEje(null)
          await loadEjes()
          onSaved()
        }}
      />
    )}
    </>
  )
}
