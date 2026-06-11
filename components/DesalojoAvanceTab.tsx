'use client'

import { useEffect, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoChecklistEstado,
  DesalojoDimension,
  DesalojoDocumento,
  DesalojoFase,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoSeguimiento,
  DesalojoSeguimientoTipo,
  DesalojoTipologia,
  SemaforoDimension,
} from '@/lib/types'
import {
  TIPOLOGIA_CFG,
  diasDesdeTipologia,
  getFasesAplicables,
  tipoDSinVia,
} from '@/lib/desalojos'
import DesalojoCapaSelector from './DesalojoCapaSelector'
import DesalojoFaseCard from './DesalojoFaseCard'
import DesalojoFaseStepper from './DesalojoFaseStepper'
import DesalojoTipologiaChip from './DesalojoTipologiaChip'

/**
 * Tab Avance: lo que se gestiona por CAPA.
 *
 * Layout v3:
 *   1. Selector de capa (oculto si hay 1 sola activa).
 *   2. Header: nombre, propietario, chip tipología o CTA "Asignar tipología",
 *      tarjeta resumen del nudo crítico de la tipología.
 *   3. Banners: financiamiento DIPRES y Tipo D >30 días sin vía.
 *   4. Stepper bidireccional de fases (PR → F1 → F2 → F3 → F4 → F5 → cerrado).
 *   5. 6 fase cards (PR, F1, F2, F3, F4, F5), cada una con su checklist,
 *      campos, notas, docs y timeline.
 */

const TIPOLOGIA_OPTS: DesalojoTipologia[] = ['A', 'B', 'C', 'D']

type Props = {
  capas:           DesalojoCapa[]
  fasesEstado:     DesalojoFaseEstado[]
  seguimientos:    DesalojoSeguimiento[]
  documentos:      DesalojoDocumento[]
  selectedCapaId:  number | null
  onSelectCapa:    (capaId: number) => void
  onPatchCapa:     (capaId: number, patch: Partial<DesalojoCapa>) => Promise<void>
  onPatchFase:     (capaId: number, fase: DesalojoFaseConSemaforo, patch: { semaforo?: SemaforoDimension; notas?: string | null; checklist_patch?: DesalojoChecklistEstado }) => Promise<void>
  onAddSeguimiento:(capaId: number, dimension: DesalojoDimension, tipo: DesalojoSeguimientoTipo, descripcion: string) => Promise<void>
  onUploadDoc:     (capaId: number, dimension: DesalojoDimension | null, file: File) => Promise<void>
  onDeleteDoc:     (docId: number) => Promise<void>
}

export default function DesalojoAvanceTab({
  capas, fasesEstado, seguimientos, documentos,
  selectedCapaId, onSelectCapa,
  onPatchCapa, onPatchFase,
  onAddSeguimiento, onUploadDoc, onDeleteDoc,
}: Props) {
  const activas = capas.filter(c => c.activa)
  const capa    = activas.find(c => c.id === selectedCapaId) ?? activas[0] ?? null

  const [openFases, setOpenFases] = useState<Record<DesalojoFaseConSemaforo, boolean>>({
    pr: true, f1: false, f2: false, f3: false, f4: false, f5: false,
  })
  const [assigningTipo, setAssigningTipo] = useState(false)
  const [tipoDraft, setTipoDraft]         = useState<DesalojoTipologia | null>(null)
  const [tipoNotaDraft, setTipoNotaDraft] = useState('')
  const [savingTipo, setSavingTipo]       = useState(false)

  useEffect(() => {
    if (activas.length > 0 && !activas.find(c => c.id === selectedCapaId)) {
      onSelectCapa(activas[0].id)
    }
  }, [activas, selectedCapaId, onSelectCapa])

  // Abrir automáticamente el card de la fase actual cuando cambia la capa
  // o cuando cambia la fase actual de la capa visible.
  useEffect(() => {
    if (!capa) return
    if (capa.fase_actual === 'cerrado') return
    const f = capa.fase_actual as DesalojoFaseConSemaforo
    setOpenFases(prev => ({ ...prev, [f]: true }))
  }, [capa?.id, capa?.fase_actual]) // eslint-disable-line react-hooks/exhaustive-deps

  if (activas.length === 0) {
    return (
      <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800 font-semibold">Sin capas activas</p>
        <p className="text-xs text-amber-700 mt-1">Crea una capa desde la pestaña Contexto para empezar el seguimiento.</p>
      </div>
    )
  }
  if (!capa) return null

  async function commitTipologia() {
    if (!capa) return
    setSavingTipo(true)
    try {
      await onPatchCapa(capa.id, {
        tipologia:      tipoDraft,
        tipologia_nota: tipoNotaDraft.trim() || null,
      })
      setAssigningTipo(false)
    } finally { setSavingTipo(false) }
  }

  const sinDipres   = capa.financiamiento_asegurado === false
  const tipoDDias   = diasDesdeTipologia(capa)
  const tipoDAlerta = tipoDSinVia(capa) && tipoDDias !== null && tipoDDias > 30

  const fasesCapa = fasesEstado.filter(f => f.capa_id === capa.id)
  const segCapa   = seguimientos.filter(s => s.capa_id === capa.id)
  const docsCapa  = documentos.filter(d => d.capa_id === capa.id)

  // Crear las 6 filas si por alguna razón faltan (defensive).
  function estadoDeFase(f: DesalojoFaseConSemaforo): DesalojoFaseEstado | null {
    return fasesCapa.find(e => e.fase === f) ?? null
  }

  return (
    <div className="space-y-4">
      {/* Selector */}
      <DesalojoCapaSelector capas={activas} selectedId={capa.id} onSelect={onSelectCapa} />

      {/* Header de la capa */}
      <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-gray-900">{capa.nombre}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {capa.propietario ? <>Propietario: <span className="text-gray-700">{capa.propietario}</span></> : 'Propietario sin definir'}
              {capa.superficie_ha != null && <> · {capa.superficie_ha.toLocaleString('es-CL')} ha</>}
              {capa.sitios_total != null    && <> · {capa.sitios_desocupados ?? 0} / {capa.sitios_total} sitios</>}
            </p>
          </div>
          <DesalojoTipologiaChip
            tipologia={capa.tipologia}
            size="md"
            onClick={() => {
              setTipoDraft(capa.tipologia)
              setTipoNotaDraft(capa.tipologia_nota ?? '')
              setAssigningTipo(true)
            }}
          />
        </div>
        {capa.tipologia && (
          <div className="mt-2 pt-2 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            <div>
              <p className="font-semibold text-gray-700">Nudo crítico</p>
              <p className="text-gray-600 leading-snug">{TIPOLOGIA_CFG[capa.tipologia].nudo_critico}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Financiamiento por defecto</p>
              <p className="text-gray-600 leading-snug">{TIPOLOGIA_CFG[capa.tipologia].financiamiento_default}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-700">Rol DPR</p>
              <p className="text-gray-600 leading-snug">{TIPOLOGIA_CFG[capa.tipologia].rol_dpr}</p>
            </div>
            {capa.tipologia_nota && (
              <div className="md:col-span-3 pt-1">
                <p className="font-semibold text-gray-700">Nota</p>
                <p className="text-gray-600 leading-snug">{capa.tipologia_nota}</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Asignar tipología (panel inline) */}
      {assigningTipo && (
        <section className="border border-slate-300 rounded-xl bg-slate-50 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900">Asignar tipología</h3>
          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
            Define qué exige cada fase, quién financia, cuál es el nudo crítico. Cambiarla reinicia el contador de 30 días del Tipo D.
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mb-3">
            {TIPOLOGIA_OPTS.map(t => {
              const cfg = TIPOLOGIA_CFG[t]
              const active = tipoDraft === t
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipoDraft(t)}
                  className={`text-xs px-3 py-1.5 rounded-full font-semibold ring-1 inline-flex items-center gap-1.5 transition-colors ${
                    active ? `${cfg.chip.bg} ${cfg.chip.text} ${cfg.chip.ring}` : 'bg-white text-gray-500 ring-gray-200 hover:ring-gray-300'
                  }`}
                >
                  <span className="font-bold">{cfg.short}</span> {cfg.label}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setTipoDraft(null)}
              className={`text-xs px-3 py-1.5 rounded-full font-semibold ring-1 ${
                tipoDraft === null ? 'bg-gray-200 text-gray-700 ring-gray-300' : 'bg-white text-gray-400 ring-gray-200 hover:ring-gray-300'
              }`}
            >
              Sin tipología
            </button>
          </div>
          <textarea
            value={tipoNotaDraft}
            onChange={e => setTipoNotaDraft(e.target.value)}
            placeholder="Nota (opcional, ej. razón del cambio)"
            rows={2}
            className="w-full text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400 mb-2"
          />
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setAssigningTipo(false)} disabled={savingTipo}
              className="text-xs px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100">
              Cancelar
            </button>
            <button type="button" onClick={commitTipologia} disabled={savingTipo}
              className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold">
              {savingTipo ? 'Guardando…' : 'Asignar'}
            </button>
          </div>
        </section>
      )}

      {/* Banners */}
      {sinDipres && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <span className="text-base flex-shrink-0 leading-none text-red-700">!</span>
          <p className="text-xs text-red-800 leading-snug">
            <span className="font-bold">Sin financiamiento DIPRES asegurado</span> — regla de la Mesa, sin excepción.
            Marca el flag &quot;Validación DIPRES&quot; en la fase F4 cuando se confirme.
          </p>
        </div>
      )}
      {tipoDAlerta && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <span className="text-base flex-shrink-0 leading-none text-red-700">!</span>
          <p className="text-xs text-red-800 leading-snug">
            <span className="font-bold">Vía jurídica pendiente (Tipo D, {tipoDDias} días)</span> — la Mesa exige definirla en 30 días.
            Llena el campo &quot;Vía jurídica&quot; en la fase PR.
          </p>
        </div>
      )}

      {/* Stepper de fases */}
      <section className="border border-gray-200 rounded-xl bg-white px-4 py-4">
        <DesalojoFaseStepper
          capa={capa}
          fasesEstado={fasesCapa}
          onSetFase={async (fase: DesalojoFase) => { await onPatchCapa(capa.id, { fase_actual: fase }) }}
        />
      </section>

      {/* Fase cards — sólo las aplicables a la tipología asignada */}
      <div className="space-y-3">
        {getFasesAplicables(capa.tipologia).map(f => {
          const estado = estadoDeFase(f)
          if (!estado) {
            return (
              <div key={f} className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
                Falta la fila de fase {f.toUpperCase()} para esta capa. Esto no debería ocurrir — contacta al admin de BD.
              </div>
            )
          }
          return (
            <DesalojoFaseCard
              key={f}
              capa={capa}
              fase={f}
              estado={estado}
              seguimientos={segCapa}
              documentos={docsCapa}
              onPatchCapa={async patch => { await onPatchCapa(capa.id, patch) }}
              onPatchFase={async patch => { await onPatchFase(capa.id, f, patch) }}
              onAddSeguimiento={async (dim, tipo, desc) => { await onAddSeguimiento(capa.id, dim, tipo, desc) }}
              onUploadDoc={async (dim, file) => { await onUploadDoc(capa.id, dim, file) }}
              onDeleteDoc={onDeleteDoc}
              open={openFases[f]}
              onToggleOpen={() => setOpenFases(prev => ({ ...prev, [f]: !prev[f] }))}
            />
          )
        })}
        {!capa.tipologia && (
          <div className="border border-gray-200 bg-gray-50 rounded-lg px-3 py-3 text-xs text-gray-600 text-center">
            Asigna una tipología arriba para ver las fases que aplican a este caso.
          </div>
        )}
      </div>
    </div>
  )
}
