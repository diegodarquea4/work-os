'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import type { Region } from '@/lib/regions'
import { LISTA_CANONICA } from '@/lib/ministerios'
import { ESTADO_ACTUAL_ECONOMICO_OPCIONES } from '@/lib/comiteEconomico'
import SelectorCatalogoProyectos from './SelectorCatalogoProyectos'

/**
 * Alta de un proyecto en la cartera del Comité Económico (mig 094), por las
 * dos vías que existen, en un solo lugar:
 *
 *   · Desde el SEIA — elegirlo del catálogo (`v2_proyectos_inversion`, que
 *     alimentan el sync del SEIA y los demás) y que llegue con lo que la
 *     fuente ya sabe. Es la vía normal y por eso abre primero.
 *   · Nuevo proyecto — los 16 campos del spec, para lo que el SEIA no conoce.
 *
 * Son dos pestañas y no dos botones porque agregar un proyecto es UNA
 * intención; de dónde salen los datos es un detalle de esa intención, no otra
 * tarea. Solo `nombre` es obligatorio en la vía manual: el resto se completa
 * después desde la ficha (ProyectoEconomicoFichaModal).
 */

type Props = {
  region: Region
  currentUserEmail: string
  /** origen_id de lo que la región ya trajo del catálogo — no se ofrece de nuevo. */
  yaImportados: Set<string>
  onClose: () => void
  /**
   * Ids de la cartera recién creados. `desdeCatalogo` distingue la vía: por ahí
   * los proyectos llegan con campos sin llenar, y hay que llevar a la persona a
   * completarlos. En la vía manual ya los llenó recién.
   */
  onCreated: (idsCreados: number[], desdeCatalogo: boolean) => void
}

const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
const labelCls = 'text-[10px] text-gray-500 font-medium'

export default function NuevoProyectoEconomicoModal({
  region, currentUserEmail, yaImportados, onClose, onCreated,
}: Props) {
  const [via, setVia] = useState<'catalogo' | 'manual'>('catalogo')

  // Con las dos pestañas montadas, dos `autoFocus` se pelean el cursor y gana
  // el que monte último. El foco se pone a mano, según la pestaña visible.
  const nombreRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (via === 'manual') nombreRef.current?.focus()
  }, [via])

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
  const [notas, setNotas]                       = useState('')
  const [vidaUtil, setVidaUtil]                 = useState('')
  const [riesgo, setRiesgo]                     = useState(false)
  const [saving, setSaving]                     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nombre.trim()) return
    setSaving(true)
    try {
      const creados = await safeWrite(
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
          estado_actual: estadoActual || null,
          notas: notas.trim() || null,
          vida_util_anios: vidaUtil ? Number(vidaUtil) : null,
          riesgo,
          created_by_email: currentUserEmail || null,
        }),
        'comite_economico_proyecto insert',
      )
      onCreated((creados as { id: number }[]).map(f => f.id), false)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const tabCls = (activo: boolean) =>
    `text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
      activo ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className={`relative bg-white rounded-2xl shadow-2xl w-full ${via === 'catalogo' ? 'max-w-5xl' : 'max-w-2xl'} max-h-[92vh] flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nuevo proyecto del Comité Económico"
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 bg-violet-50/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-gray-900">Nuevo proyecto — Comité Económico</p>
              <p className="text-xs text-gray-500 mt-0.5">{region.nombre}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={() => setVia('catalogo')} className={tabCls(via === 'catalogo')}>
              Desde el SEIA
            </button>
            <button type="button" onClick={() => setVia('manual')} className={tabCls(via === 'manual')}>
              Nuevo proyecto
            </button>
          </div>
        </header>

        {/* Las dos pestañas quedan MONTADAS y se alternan con `hidden`, en vez de
            desmontarse. Volver al SEIA después de pasar por el formulario tenía
            que recargar el catálogo entero y perdía los filtros, la búsqueda y
            lo que ya estaba marcado. Alternar es gratis; recargar no. */}
        <div className={`flex-1 flex flex-col min-h-0 ${via === 'catalogo' ? '' : 'hidden'}`}>
          <SelectorCatalogoProyectos
            region={region}
            currentUserEmail={currentUserEmail}
            yaImportados={yaImportados}
            onCancel={onClose}
            onImported={ids => onCreated(ids, true)}
          />
        </div>

        <div className={`flex-1 flex flex-col min-h-0 ${via === 'manual' ? '' : 'hidden'}`}>
          <>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <label className="flex flex-col gap-0.5">
                <span className={labelCls}>Nombre del proyecto *</span>
                <input ref={nombreRef} type="text" value={nombre} onChange={e => setNombre(e.target.value)} className={inputCls} required />
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
                  <select value={estadoActual} onChange={e => setEstadoActual(e.target.value)} className={inputCls}>
                    <option value="">—</option>
                    {ESTADO_ACTUAL_ECONOMICO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>

              <label className="flex flex-col gap-0.5">
                <span className={labelCls}>Notas</span>
                <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="N° de RCA, fechas, contexto…" className={`${inputCls} resize-y`} />
              </label>
            </form>

            <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2">
              <button onClick={onClose} disabled={saving} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={saving || !nombre.trim()} className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
                {saving ? 'Guardando…' : 'Crear proyecto'}
              </button>
            </footer>
          </>
        </div>
      </div>
    </div>
  )
}
