'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { reconciliarAdopcion, slugifyInstitucion } from '@/lib/sesiones/helpers'
import type { ComiteInstitucionCatalogo, ComiteMetricaEstandar } from '@/lib/types'
import { useEstandaresComite } from '@/lib/hooks/useComiteMetricas'

/**
 * «Métricas» del Comité Policial (migs 078 + 079). Una sola vista donde las
 * instituciones y las métricas nacionales CONVERSAN: por cada institución de la
 * región (las 4 base + las propias) se ven sus métricas del catálogo nacional
 * con check para adoptar las que la región reporta. Acá también se agregan y
 * quitan instituciones propias.
 *
 * Adoptar = fila comite_metrica activa con estandar_id (reactiva la inactiva si
 * existe → respeta el UNIQUE parcial). Desmarcar = activo=false (conserva el
 * historial). Quitar institución propia = activo=false (las 4 base no se quitan).
 */

const BASE_CLAVES = ['carabineros', 'pdi', 'armada', 'gendarmeria']

type Props = {
  regionCod: string
  currentUserEmail: string
  onClose: () => void
  onSaved: () => void   // el padre recarga instituciones + catálogo por región
}

type RegionRow = { id: number; estandar_id: number | null; activo: boolean }

export default function MetricasComiteModal({ regionCod, currentUserEmail, onClose, onSaved }: Props) {
  const { estandares, loading: estLoading } = useEstandaresComite(true)
  const [instRows, setInstRows]   = useState<ComiteInstitucionCatalogo[]>([])
  const [regionRows, setRegionRows] = useState<RegionRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState(false)
  const [fNombre, setFNombre]     = useState('')

  const load = useCallback(async () => {
    const sb = getSupabase()
    const [instRes, mrRes] = await Promise.all([
      sb.from('comite_institucion').select('*').eq('region_cod', regionCod).eq('activo', true).order('orden'),
      sb.from('comite_metrica').select('id, estandar_id, activo').eq('region_cod', regionCod).not('estandar_id', 'is', null),
    ])
    setInstRows((instRes.data ?? []) as ComiteInstitucionCatalogo[])
    setRegionRows((mrRes.data ?? []) as RegionRow[])
    setLoading(false)
  }, [regionCod])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const adopcion = useMemo(() => {
    const list = reconciliarAdopcion(estandares.map(e => e.id), regionRows)
    return new Map(list.map(a => [a.estandarId, a]))
  }, [estandares, regionRows])

  // Instituciones de la región (base + propias) con sus métricas nacionales.
  const grupos = useMemo(() => instRows.map(inst => ({
    inst,
    esBase: BASE_CLAVES.includes(inst.clave),
    items: estandares.filter(e => e.institucion === inst.clave),
  })), [instRows, estandares])

  async function setAdoptado(est: ComiteMetricaEstandar, on: boolean) {
    const rec = adopcion.get(est.id)
    const sb = getSupabase()
    if (on) {
      if (rec?.adoptado) return
      if (rec?.reactivarId) {
        await safeWrite(sb.from('comite_metrica').update({ activo: true }).eq('id', rec.reactivarId),
          `comite_metrica reactivar id=${rec.reactivarId}`)
      } else {
        await safeWrite(sb.from('comite_metrica').insert({
          region_cod: regionCod, institucion: est.institucion, nombre: est.nombre,
          tipo: est.tipo, unidad: est.unidad, orden: est.orden,
          estandar_id: est.id, origen: 'estandar', created_by_email: currentUserEmail || null,
        }), `comite_metrica adoptar estandar=${est.id}`)
      }
    } else if (rec?.filaActivaId) {
      await safeWrite(sb.from('comite_metrica').update({ activo: false }).eq('id', rec.filaActivaId),
        `comite_metrica desadoptar id=${rec.filaActivaId}`)
    }
  }

  async function toggle(est: ComiteMetricaEstandar) {
    if (busy) return
    setBusy(true)
    try {
      await setAdoptado(est, !adopcion.get(est.id)?.adoptado)
      await load(); onSaved()
    } catch (err) { window.alert((err as Error).message) }
    finally { setBusy(false) }
  }

  async function marcarGrupo(items: ComiteMetricaEstandar[], on: boolean) {
    if (busy) return
    setBusy(true)
    try {
      for (const est of items) {
        if (!!adopcion.get(est.id)?.adoptado !== on) await setAdoptado(est, on)
      }
      await load(); onSaved()
    } catch (err) { window.alert((err as Error).message) }
    finally { setBusy(false) }
  }

  async function agregarInstitucion(e: React.FormEvent) {
    e.preventDefault()
    if (!fNombre.trim() || busy) return
    setBusy(true)
    const clave = slugifyInstitucion(fNombre, instRows.map(r => r.clave))
    const orden = Math.max(0, ...instRows.map(r => r.orden)) + 1
    try {
      await safeWrite(getSupabase().from('comite_institucion').insert({
        region_cod: regionCod, clave, nombre: fNombre.trim(), orden, created_by_email: currentUserEmail || null,
      }), `comite_institucion insert ${regionCod}/${clave}`)
      setFNombre('')
      await load(); onSaved()
    } catch (err) { window.alert((err as Error).message) }
    finally { setBusy(false) }
  }

  async function quitarInstitucion(inst: ComiteInstitucionCatalogo) {
    if (busy) return
    if (!window.confirm(`¿Quitar a ${inst.nombre} de las instituciones que reportan?\n\nSus métricas dejan de aparecer en la sesión; el histórico ya reportado se conserva.`)) return
    setBusy(true)
    try {
      await safeWrite(getSupabase().from('comite_institucion').update({ activo: false }).eq('id', inst.id),
        `comite_institucion desactivar id=${inst.id}`)
      await load(); onSaved()
    } catch (err) { window.alert((err as Error).message) }
    finally { setBusy(false) }
  }

  const cargando = estLoading || loading

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Métricas</p>
            <p className="text-xs text-gray-500 mt-0.5">Por institución, marca las del catálogo nacional que reporta tu región.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4l12 12M16 4L4 16"/></svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cargando ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando…</p>
          ) : (
            <div className="space-y-4">
              {grupos.map(({ inst, esBase, items }) => {
                const adoptadas = items.filter(e => adopcion.get(e.id)?.adoptado).length
                return (
                  <div key={inst.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-violet-700 truncate">{inst.nombre}</p>
                        {!esBase && (
                          <button onClick={() => quitarInstitucion(inst)} disabled={busy}
                            className="text-gray-300 hover:text-red-500 flex-none disabled:opacity-40" title="Quitar institución">
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/></svg>
                          </button>
                        )}
                      </div>
                      {items.length > 0 && (
                        <div className="flex items-center gap-2 text-[11px] flex-none">
                          <span className="text-gray-400">{adoptadas}/{items.length}</span>
                          <button disabled={busy || adoptadas === items.length} onClick={() => marcarGrupo(items, true)}
                            className="text-violet-700 hover:underline disabled:text-gray-300 disabled:no-underline">Todas</button>
                          <span className="text-gray-200">·</span>
                          <button disabled={busy || adoptadas === 0} onClick={() => marcarGrupo(items, false)}
                            className="text-gray-500 hover:underline disabled:text-gray-300 disabled:no-underline">Ninguna</button>
                        </div>
                      )}
                    </div>
                    {items.length === 0 ? (
                      <p className="text-[11px] text-gray-400 italic px-1 pb-1">
                        Sin métricas estándar nacionales para esta institución{esBase ? '' : ' (agrégalas en la sesión con «+ métrica»)'}.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {items.map(est => {
                          const on = !!adopcion.get(est.id)?.adoptado
                          return (
                            <label key={est.id}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                                on ? 'border-violet-200 bg-violet-50/60' : 'border-gray-100 hover:bg-gray-50'
                              } ${busy ? 'opacity-60' : ''}`}>
                              <input type="checkbox" checked={on} disabled={busy} onChange={() => toggle(est)}
                                className="w-4 h-4 accent-violet-600 flex-shrink-0" />
                              <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                                {est.nombre}
                                {est.tipo === 'texto' && <span className="text-[10px] text-gray-400 ml-1">(texto)</span>}
                              </span>
                              {est.unidad && <span className="text-[11px] text-gray-400 flex-shrink-0">{est.unidad}</span>}
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 space-y-2">
          <form onSubmit={agregarInstitucion} className="flex items-center gap-2">
            <input type="text" value={fNombre} onChange={e => setFNombre(e.target.value)}
              placeholder="Agregar institución (ej. Fiscalía, SENDA)…"
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <button type="submit" disabled={busy || !fNombre.trim()}
              className="text-sm bg-violet-700 text-white px-4 py-2 rounded-lg hover:bg-violet-800 disabled:opacity-50 flex-shrink-0">
              Agregar
            </button>
          </form>
          <p className="text-[11px] text-gray-400 leading-snug">
            Adoptar copia la métrica al catálogo de tu región; los valores se cargan en la sesión. El catálogo nacional lo define la división.
          </p>
        </footer>
      </div>
    </div>
  )
}
