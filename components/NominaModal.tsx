'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import type { RegionEje, SesionNomina } from '@/lib/types'

/**
 * Nómina fija de la instancia (titulares/suplentes designados por oficio).
 * CRUD mínimo sobre sesion_nomina para (región, instancia[, eje]). Sin esto
 * el piloto no puede partir — la asistencia se marca sobre esta nómina.
 * Comité: la nómina del (región, eje). Gabinete: seremis + equipo DPR, sin
 * eje (instancia='gabinete', mig 046).
 *
 * "Eliminar" = activo:false (regional no tiene DELETE por RLS; además la
 * nómina histórica se conserva para las actas antiguas que la referencian).
 */

type Props = {
  region: Region
  instancia: 'eje' | 'gabinete'
  eje: RegionEje | null          // null ⇔ instancia='gabinete'
  nombreInstancia: string        // header (ej. 'Comité Policial' / 'Gabinete Regional')
  onClose: () => void
}

const CALIDAD_LABEL = { titular: 'Titular', suplente: 'Suplente' } as const

export default function NominaModal({ region, instancia, eje, nombreInstancia, onClose }: Props) {
  const [miembros, setMiembros] = useState<SesionNomina[]>([])
  const [loading, setLoading]   = useState(true)

  // Form alta
  const [showForm, setShowForm]   = useState(false)
  const [fNombre, setFNombre]     = useState('')
  const [fCargo, setFCargo]       = useState('')
  const [fInstitucion, setFInstitucion] = useState('')
  const [fCalidad, setFCalidad]   = useState<'titular' | 'suplente'>('titular')
  const [saving, setSaving]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = getSupabase()
      .from('sesion_nomina')
      .select('*')
      .eq('region_cod', region.cod)
      .eq('activo', true)
    q = instancia === 'gabinete' ? q.eq('instancia', 'gabinete') : q.eq('eje_id', eje!.id)
    const { data } = await q.order('institucion').order('calidad')
    setMiembros((data ?? []) as SesionNomina[])
    setLoading(false)
  }, [region.cod, instancia, eje?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!fNombre.trim() || !fInstitucion.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('sesion_nomina').insert({
          region_cod:  region.cod,
          instancia,
          eje_id:      eje?.id ?? null,
          nombre:      fNombre.trim(),
          cargo:       fCargo.trim() || null,
          institucion: fInstitucion.trim(),
          calidad:     fCalidad,
        }),
        `sesion_nomina insert ${region.cod}/${instancia}${eje ? `/${eje.id}` : ''}`,
      )
      setFNombre(''); setFCargo(''); setFInstitucion(''); setFCalidad('titular')
      setShowForm(false)
      await load()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDesactivar(m: SesionNomina) {
    if (!confirm(`¿Quitar a ${m.nombre} de la nómina?\n\nDeja de aparecer en la asistencia de las próximas sesiones; las actas anteriores no cambian.`)) return
    try {
      await safeWrite(
        getSupabase().from('sesion_nomina').update({ activo: false }).eq('id', m.id),
        `sesion_nomina desactivar id=${m.id}`,
      )
      await load()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Nómina — {nombreInstancia}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {region.nombre} · {instancia === 'gabinete' ? 'seremis y equipo DPR' : 'titulares y suplentes designados por oficio'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-violet-200 text-violet-700 text-sm font-medium rounded-lg hover:border-violet-400 hover:bg-violet-50/60 transition-colors mb-4"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2v8M2 6h8" strokeLinecap="round"/>
              </svg>
              Agregar miembro
            </button>
          )}

          {showForm && (
            <form onSubmit={handleAdd} className="bg-violet-50/60 border border-violet-100 rounded-xl p-3.5 mb-4 space-y-2.5">
              <input type="text" value={fNombre} onChange={e => setFNombre(e.target.value)} required placeholder="Nombre completo *" className={inputCls} />
              <div className="grid grid-cols-2 gap-2.5">
                <input type="text" value={fCargo} onChange={e => setFCargo(e.target.value)} placeholder="Cargo" className={inputCls} />
                <input type="text" value={fInstitucion} onChange={e => setFInstitucion(e.target.value)} required placeholder="Institución *" className={inputCls} />
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5 border border-violet-200 bg-white rounded-lg p-0.5">
                  {(['titular', 'suplente'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFCalidad(c)}
                      className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                        fCalidad === c ? 'bg-violet-700 text-white' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {CALIDAD_LABEL[c]}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="text-sm text-gray-400 hover:text-gray-600 px-2 py-1.5">
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !fNombre.trim() || !fInstitucion.trim()}
                    className="text-sm bg-violet-700 text-white px-4 py-1.5 rounded-lg hover:bg-violet-800 disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Agregar'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando nómina…</p>
          ) : miembros.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-sm">La nómina está vacía.</p>
              <p className="text-xs mt-1">Agrega a los miembros designados por oficio antes de la primera sesión.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {miembros.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-3 py-2 border border-gray-100 rounded-lg hover:bg-gray-50 group">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{m.nombre}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {m.institucion}{m.cargo ? ` · ${m.cargo}` : ''}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                    m.calidad === 'titular' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {CALIDAD_LABEL[m.calidad]}
                  </span>
                  <button
                    onClick={() => handleDesactivar(m)}
                    className="p-1 text-gray-300 hover:text-red-500 rounded hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Quitar de la nómina"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
