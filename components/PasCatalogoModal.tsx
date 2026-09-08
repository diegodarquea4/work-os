'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { PasCatalogo } from '@/lib/types'
import { EmptyState } from '@/components/ui'

/**
 * Catálogo de PAS (Permisos Ambientales Sectoriales) — ver, editar y agregar.
 * Es GLOBAL, no regional: las 16 regiones comparten la misma lista (mismo
 * criterio que `oaeca`, mig 051). Nació con los 50 PAS 111-160 y crece por dos
 * caminos: acá, y desde la ficha de un proyecto cuando alguien necesita uno
 * que todavía no está (mig 095).
 *
 * Editar necesita la policy de UPDATE de la mig 098; borrar no existe a
 * propósito (un PAS puede estar asociado a proyectos — ver esa migración).
 */

type Props = {
  currentUserEmail: string
  onClose: () => void
}

const inputCls = 'px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'

type Borrador = { n_pas: string; sector_materia: string; nombre: string; organo_otorgante: string }

const VACIO: Borrador = { n_pas: '', sector_materia: '', nombre: '', organo_otorgante: '' }

export default function PasCatalogoModal({ currentUserEmail, onClose }: Props) {
  const [lista, setLista]     = useState<PasCatalogo[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery]     = useState('')
  const [saving, setSaving]   = useState(false)

  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevo, setNuevo]         = useState<Borrador>(VACIO)

  // Fila en edición (id) + su borrador.
  const [editId, setEditId]     = useState<number | null>(null)
  const [edit, setEdit]         = useState<Borrador>(VACIO)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase().from('pas_catalogo').select('*').order('n_pas')
    setLista((data ?? []) as PasCatalogo[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return lista
    return lista.filter(p =>
      p.n_pas.toLowerCase().includes(q) ||
      p.nombre.toLowerCase().includes(q) ||
      (p.sector_materia ?? '').toLowerCase().includes(q) ||
      (p.organo_otorgante ?? '').toLowerCase().includes(q))
  }, [lista, query])

  async function crear() {
    if (!nuevo.nombre.trim() || !nuevo.n_pas.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('pas_catalogo').insert({
          n_pas: nuevo.n_pas.trim(),
          sector_materia: nuevo.sector_materia.trim() || null,
          nombre: nuevo.nombre.trim(),
          organo_otorgante: nuevo.organo_otorgante.trim() || null,
          created_by_email: currentUserEmail || null,
        }),
        `pas_catalogo insert ${nuevo.n_pas.trim()}`,
      )
      setNuevo(VACIO); setNuevoOpen(false)
      await load()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  function abrirEdicion(p: PasCatalogo) {
    setEditId(p.id)
    setEdit({
      n_pas: p.n_pas,
      sector_materia: p.sector_materia ?? '',
      nombre: p.nombre,
      organo_otorgante: p.organo_otorgante ?? '',
    })
  }

  async function guardarEdicion() {
    if (editId == null || !edit.nombre.trim() || !edit.n_pas.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('pas_catalogo').update({
          n_pas: edit.n_pas.trim(),
          sector_materia: edit.sector_materia.trim() || null,
          nombre: edit.nombre.trim(),
          organo_otorgante: edit.organo_otorgante.trim() || null,
        }).eq('id', editId),
        `pas_catalogo update id=${editId}`,
      )
      setEditId(null)
      await load()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[min(56rem,95vw)] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-semibold text-gray-900">Catálogo de permisos (PAS)</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Compartido por todas las regiones — también crece desde la ficha de un proyecto
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5 flex-shrink-0" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 flex items-center gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por N°, nombre, sector u órgano…"
            className={`${inputCls} flex-1`}
          />
          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">{filtrados.length} de {lista.length}</span>
          <button
            onClick={() => { setNuevoOpen(v => !v); setEditId(null) }}
            className="text-sm px-4 py-1.5 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 flex-shrink-0"
          >
            {nuevoOpen ? 'Cancelar' : '+ Nuevo permiso'}
          </button>
        </div>

        {nuevoOpen && (
          <div className="flex-shrink-0 px-5 py-3 bg-gray-50 border-b border-gray-100 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input type="text" value={nuevo.n_pas} onChange={e => setNuevo({ ...nuevo, n_pas: e.target.value })} placeholder="N° PAS (ej: PAS 161) *" className={inputCls} />
              <input type="text" value={nuevo.sector_materia} onChange={e => setNuevo({ ...nuevo, sector_materia: e.target.value })} placeholder="Sector / materia" className={inputCls} />
            </div>
            <input type="text" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del permiso *" className={`${inputCls} w-full`} />
            <input type="text" value={nuevo.organo_otorgante} onChange={e => setNuevo({ ...nuevo, organo_otorgante: e.target.value })} placeholder="Órgano otorgante" className={`${inputCls} w-full`} />
            <div className="flex justify-end">
              <button
                onClick={crear}
                disabled={saving || !nuevo.nombre.trim() || !nuevo.n_pas.trim()}
                className="text-sm px-4 py-1.5 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Agregar al catálogo'}
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando catálogo…</p>
          ) : filtrados.length === 0 ? (
            <EmptyState
              title={lista.length === 0 ? 'Catálogo vacío' : 'Sin resultados'}
              description={lista.length === 0 ? undefined : `Ningún permiso calza con «${query.trim()}».`}
            />
          ) : (
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs border-collapse min-w-[720px]">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left font-semibold py-1.5 pr-3">N°</th>
                    <th className="text-left font-semibold py-1.5 pr-3">Nombre</th>
                    <th className="text-left font-semibold py-1.5 pr-3">Sector / materia</th>
                    <th className="text-left font-semibold py-1.5 pr-3">Órgano otorgante</th>
                    <th className="py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => (
                    editId === p.id ? (
                      <tr key={p.id} className="border-b border-gray-100 bg-violet-50/40">
                        <td className="py-2 pr-3 align-top">
                          <input type="text" value={edit.n_pas} onChange={e => setEdit({ ...edit, n_pas: e.target.value })} className={`${inputCls} w-24 text-xs`} />
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <input type="text" value={edit.nombre} onChange={e => setEdit({ ...edit, nombre: e.target.value })} className={`${inputCls} w-full text-xs`} />
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <input type="text" value={edit.sector_materia} onChange={e => setEdit({ ...edit, sector_materia: e.target.value })} className={`${inputCls} w-full text-xs`} />
                        </td>
                        <td className="py-2 pr-3 align-top">
                          <input type="text" value={edit.organo_otorgante} onChange={e => setEdit({ ...edit, organo_otorgante: e.target.value })} className={`${inputCls} w-full text-xs`} />
                        </td>
                        <td className="py-2 text-right align-top whitespace-nowrap">
                          <button
                            onClick={guardarEdicion}
                            disabled={saving || !edit.nombre.trim() || !edit.n_pas.trim()}
                            className="text-xs px-2 py-1 bg-violet-700 text-white rounded hover:bg-violet-800 disabled:opacity-50"
                          >
                            {saving ? '…' : 'Guardar'}
                          </button>
                          <button onClick={() => setEditId(null)} className="text-xs px-2 py-1 ml-1 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">✕</button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                        <td className="py-2 pr-3 text-gray-600 whitespace-nowrap font-medium">{p.n_pas}</td>
                        <td className="py-2 pr-3 text-gray-800">{p.nombre}</td>
                        <td className="py-2 pr-3 text-gray-600">{p.sector_materia ?? '—'}</td>
                        <td className="py-2 pr-3 text-gray-600">{p.organo_otorgante ?? '—'}</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => { abrirEdicion(p); setNuevoOpen(false) }}
                            className="text-xs text-violet-700 opacity-0 group-hover:opacity-100 hover:underline font-medium"
                          >
                            Editar
                          </button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
