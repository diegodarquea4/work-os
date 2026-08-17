'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Oaeca } from '@/lib/types'
import { EmptyState } from '@/components/ui'

/**
 * Catálogo de OAECA (organismos que emiten oficios) — lista + alta simple.
 * Autoincremental: también crece desde la Zona 3 de SesionModalInversion
 * cuando alguien escribe uno nuevo al cargar un oficio (mismo insert,
 * mismo catálogo). Sin "desactivar" — a diferencia de la nómina no hay
 * noción de vigencia para un organismo.
 */

type Props = {
  currentUserEmail: string
  onClose: () => void
}

export default function OaecaModal({ currentUserEmail, onClose }: Props) {
  const [lista, setLista]   = useState<Oaeca[]>([])
  const [loading, setLoading] = useState(true)
  const [nombre, setNombre] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase().from('oaeca').select('*').order('nombre')
    setLista((data ?? []) as Oaeca[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('oaeca').insert({ nombre: nombre.trim(), created_by_email: currentUserEmail || null }),
        `oaeca insert ${nombre.trim()}`,
      )
      setNombre('')
      await load()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">OAECA</p>
            <p className="text-xs text-gray-500 mt-0.5">Organismos que emiten oficios — catálogo compartido</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={handleAdd} className="flex gap-2 mb-4">
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Nombre de la OAECA…"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
            />
            <button
              type="submit"
              disabled={saving || !nombre.trim()}
              className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? 'Agregando…' : 'Agregar'}
            </button>
          </form>

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando…</p>
          ) : lista.length === 0 ? (
            <EmptyState title="Sin OAECA registradas todavía" />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {lista.map(o => (
                <span key={o.id} className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700">
                  {o.nombre}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
