'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import type { RegionMetaEmpleo, RegionSubsidioEmpleo } from '@/lib/types'

/**
 * Meta Empleo de la región — objetivo, foco productivo y cupos de subsidios,
 * más el acumulado que llevan las sesiones.
 *
 * Vive detrás de un botón, al lado de Nómina y OAECA, y no suelto en el panel:
 * el avance de la meta es material de la reunión, no un titular que el comité
 * tenga que ver cada vez que entra a mirar sus proyectos.
 *
 * Lo editable acá es la configuración de la región —lo que se define una vez y
 * cambia poco—. Los acumulados NO se tocan a mano: los va sumando el cierre de
 * cada sesión desde lo que ahí se digita (mig 052/055), y editarlos por fuera
 * los dejaría fuera de sincronía con la fuente que los explica.
 */

type Props = {
  region: Region
  currentUserEmail: string
  puedeEditar: boolean
  onClose: () => void
  onSaved?: () => void
}

const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
const labelCls = 'text-[10px] text-gray-500 font-medium'

export default function MetaEmpleoModal({ region, currentUserEmail, puedeEditar, onClose, onSaved }: Props) {
  const [meta, setMeta]         = useState<RegionMetaEmpleo | null>(null)
  const [subsidio, setSubsidio] = useState<RegionSubsidioEmpleo | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)

  const [objetivo, setObjetivo] = useState('')
  const [foco, setFoco]         = useState('')
  const [cupos, setCupos]       = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const sb = getSupabase()
    const [{ data: m }, { data: s }] = await Promise.all([
      sb.from('region_meta_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
      sb.from('region_subsidio_empleo').select('*').eq('region_cod', region.cod).maybeSingle(),
    ])
    const mm = (m as RegionMetaEmpleo | null) ?? null
    const ss = (s as RegionSubsidioEmpleo | null) ?? null
    setMeta(mm)
    setSubsidio(ss)
    setObjetivo(mm?.objetivo != null ? String(mm.objetivo) : '')
    setFoco(mm?.foco_productivo ?? '')
    setCupos(ss?.cupos != null ? String(ss.cupos) : '')
    setLoading(false)
  }, [region.cod])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function guardar() {
    setSaving(true)
    try {
      const sb = getSupabase()
      const ahora = new Date().toISOString()
      await safeWrite(
        sb.from('region_meta_empleo').upsert({
          region_cod: region.cod,
          objetivo: objetivo.trim() === '' ? 0 : Number(objetivo),
          foco_productivo: foco.trim() || null,
          valor_updated_by_email: currentUserEmail || null,
          valor_updated_at: ahora,
        }, { onConflict: 'region_cod' }),
        `region_meta_empleo upsert ${region.cod}`,
      )
      await safeWrite(
        sb.from('region_subsidio_empleo').upsert({
          region_cod: region.cod,
          cupos: cupos.trim() === '' ? 0 : Number(cupos),
          valor_updated_by_email: currentUserEmail || null,
          valor_updated_at: ahora,
        }, { onConflict: 'region_cod' }),
        `region_subsidio_empleo upsert ${region.cod}`,
      )
      await load()
      onSaved?.()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const pct = meta && meta.objetivo > 0
    ? Math.round((meta.valor_actual / meta.objetivo) * 100)
    : null
  const pctCupos = subsidio && subsidio.cupos > 0
    ? Math.round((subsidio.postulados / subsidio.cupos) * 100)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Meta Empleo de la región"
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Meta Empleo</p>
            <p className="text-xs text-gray-500 mt-0.5">{region.nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando…</p>
          ) : (
            <>
              {/* Acumulados — de solo lectura: los suma el cierre de cada sesión. */}
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">Empleos generados</p>
                <p className="text-lg font-semibold text-amber-900 tabular-nums leading-tight">
                  {(meta?.valor_actual ?? 0).toLocaleString('es-CL')}
                  {meta && meta.objetivo > 0 && (
                    <span className="text-sm font-normal text-amber-700"> de {meta.objetivo.toLocaleString('es-CL')}</span>
                  )}
                  {pct != null && <span className="text-sm font-normal text-amber-600"> · {pct}%</span>}
                </p>
              </div>

              <div className="rounded-lg border border-sky-100 bg-sky-50 px-3 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700 mb-1">Subsidios</p>
                <p className="text-[13px] text-sky-900 tabular-nums">
                  {(subsidio?.postulados ?? 0).toLocaleString('es-CL')}
                  {subsidio && subsidio.cupos > 0 && ` de ${subsidio.cupos.toLocaleString('es-CL')} cupos`} postulados
                  {pctCupos != null && <span className="text-sky-600"> · {pctCupos}%</span>}
                </p>
                <p className="text-[13px] text-sky-900 tabular-nums">
                  {(subsidio?.entregados ?? 0).toLocaleString('es-CL')} entregados ·{' '}
                  {(subsidio?.empresas_postulantes ?? 0).toLocaleString('es-CL')} empresas
                </p>
              </div>

              <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-3">
                Los acumulados los suma el cierre de cada sesión, desde lo que se digita
                en «Meta mesa empleo». Acá se define contra qué se miden.
              </p>

              <label className="flex flex-col gap-0.5">
                <span className={labelCls}>Objetivo de empleos</span>
                <input
                  type="number" value={objetivo} onChange={e => setObjetivo(e.target.value)}
                  disabled={!puedeEditar} placeholder="0" className={inputCls}
                />
              </label>

              <label className="flex flex-col gap-0.5">
                <span className={labelCls}>Foco productivo</span>
                <textarea
                  value={foco} onChange={e => setFoco(e.target.value)}
                  disabled={!puedeEditar} rows={2}
                  placeholder="Sectores en los que la región concentra su meta…"
                  className={`${inputCls} resize-y`}
                />
              </label>

              <label className="flex flex-col gap-0.5">
                <span className={labelCls}>Cupos de subsidios</span>
                <input
                  type="number" value={cupos} onChange={e => setCupos(e.target.value)}
                  disabled={!puedeEditar} placeholder="0" className={inputCls}
                />
              </label>
            </>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
            {puedeEditar ? 'Cancelar' : 'Cerrar'}
          </button>
          {puedeEditar && (
            <button onClick={guardar} disabled={saving || loading} className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
