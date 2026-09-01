'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import { LISTA_CANONICA } from '@/lib/ministerios'

/**
 * Alta de un proyecto privado de la cartera del Comité Económico (mig 086)
 * — los 16 campos del spec del comité. Solo `nombre` es obligatorio; el
 * resto se puede completar después desde la ficha (ProyectoEconomicoFichaModal).
 */

type Props = {
  region: Region
  currentUserEmail: string
  onClose: () => void
  onCreated: () => void
}

const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
const labelCls = 'text-[10px] text-gray-500 font-medium'

export default function NuevoProyectoEconomicoModal({ region, currentUserEmail, onClose, onCreated }: Props) {
  const [nombre, setNombre]                     = useState('')
  const [plazo, setPlazo]                       = useState<'' | 'CP' | 'MP' | 'LP'>('')
  const [priorizado, setPriorizado]             = useState(false)
  const [seremiLider, setSeremiLider]           = useState('')
  const [inversionMonto, setInversionMonto]     = useState('')
  const [inversionMoneda, setInversionMoneda]   = useState('CLP')
  const [fuenteFinanciamiento, setFuenteFinanciamiento] = useState('')
  const [manoObraDirecta, setManoObraDirecta]   = useState('')
  const [manoObraIndirecta, setManoObraIndirecta] = useState('')
  const [responsableOperativo, setResponsableOperativo] = useState('')
  const [kpi, setKpi]                           = useState('')
  const [meta, setMeta]                         = useState('')
  const [estadoInicial, setEstadoInicial]       = useState('')
  const [estadoActual, setEstadoActual]         = useState('')
  const [vidaUtil, setVidaUtil]                 = useState('')
  const [riesgo, setRiesgo]                     = useState(false)
  const [saving, setSaving]                     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').insert({
          region_cod: region.cod,
          nombre: nombre.trim(),
          plazo: plazo || null,
          priorizado,
          seremi_lider: seremiLider || null,
          inversion_monto: inversionMonto ? Number(inversionMonto) : null,
          inversion_moneda: inversionMonto ? inversionMoneda : null,
          fuente_financiamiento: fuenteFinanciamiento.trim() || null,
          mano_obra_directa: manoObraDirecta ? Number(manoObraDirecta) : null,
          mano_obra_indirecta: manoObraIndirecta ? Number(manoObraIndirecta) : null,
          responsable_operativo: responsableOperativo.trim() || null,
          kpi: kpi.trim() || null,
          meta_2026_2027: meta.trim() || null,
          estado_inicial: estadoInicial.trim() || null,
          estado_actual: estadoActual.trim() || null,
          vida_util_anios: vidaUtil ? Number(vidaUtil) : null,
          riesgo,
          created_by_email: currentUserEmail || null,
        }),
        'comite_economico_proyecto insert',
      )
      onCreated()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 bg-violet-50/40">
          <p className="text-base font-semibold text-gray-900">Nuevo proyecto — Comité Económico</p>
          <p className="text-xs text-gray-500 mt-0.5">{region.nombre}</p>
        </header>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>Nombre del proyecto *</span>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} autoFocus required />
          </label>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Plazo</span>
              <select value={plazo} onChange={e => setPlazo(e.target.value as typeof plazo)} className={inputCls}>
                <option value="">—</option>
                <option value="CP">Corto plazo</option>
                <option value="MP">Mediano plazo</option>
                <option value="LP">Largo plazo</option>
              </select>
            </label>
            <label className="flex items-center gap-2 pt-4">
              <input type="checkbox" checked={priorizado} onChange={e => setPriorizado(e.target.checked)} className="rounded border-gray-300 text-violet-700 focus:ring-violet-400" />
              <span className="text-sm text-gray-700">Priorizado</span>
            </label>
            <label className="flex items-center gap-2 pt-4">
              <input type="checkbox" checked={riesgo} onChange={e => setRiesgo(e.target.checked)} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
              <span className="text-sm text-gray-700">En riesgo</span>
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>SEREMI líder</span>
            <select value={seremiLider} onChange={e => setSeremiLider(e.target.value)} className={inputCls}>
              <option value="">—</option>
              {LISTA_CANONICA.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Inversión (MM$)</span>
              <input type="number" value={inversionMonto} onChange={e => setInversionMonto(e.target.value)} placeholder="0" className={inputCls} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Moneda</span>
              <input type="text" value={inversionMoneda} onChange={e => setInversionMoneda(e.target.value)} placeholder="CLP" className={inputCls} />
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>Fuente de financiamiento</span>
            <input type="text" value={fuenteFinanciamiento} onChange={e => setFuenteFinanciamiento(e.target.value)} placeholder="Empresa que financia…" className={inputCls} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Mano de obra directa (construcción)</span>
              <input type="number" value={manoObraDirecta} onChange={e => setManoObraDirecta(e.target.value)} placeholder="0" className={inputCls} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Mano de obra indirecta (construcción)</span>
              <input type="number" value={manoObraIndirecta} onChange={e => setManoObraIndirecta(e.target.value)} placeholder="0" className={inputCls} />
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>Responsable operativo</span>
            <input type="text" value={responsableOperativo} onChange={e => setResponsableOperativo(e.target.value)} placeholder="Empresa que opera el proyecto…" className={inputCls} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>KPI</span>
              <input type="text" value={kpi} onChange={e => setKpi(e.target.value)} placeholder="Kwh, metros construidos…" className={inputCls} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Vida útil (años)</span>
              <input type="number" value={vidaUtil} onChange={e => setVidaUtil(e.target.value)} className={inputCls} />
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className={labelCls}>Meta 2026 - 2027</span>
            <textarea value={meta} onChange={e => setMeta(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Estado inicial</span>
              <textarea value={estadoInicial} onChange={e => setEstadoInicial(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={labelCls}>Estado actual</span>
              <textarea value={estadoActual} onChange={e => setEstadoActual(e.target.value)} rows={2} className={`${inputCls} resize-y`} />
            </label>
          </div>
        </form>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={saving || !nombre.trim()} className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
            {saving ? 'Guardando…' : 'Crear proyecto'}
          </button>
        </footer>
      </div>
    </div>
  )
}
