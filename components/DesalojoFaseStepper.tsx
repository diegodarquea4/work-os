'use client'

import { useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoFase,
  DesalojoFaseEstado,
} from '@/lib/types'
import {
  FASE_CFG,
  canAdvanceFase,
  getFasesAplicables,
  nextFaseAplicable,
  prevFaseAplicable,
} from '@/lib/desalojos'
import { SEMAFORO_CONFIG } from '@/lib/config'

/**
 * Stepper horizontal bidireccional. Cada fase es un círculo con su sigla,
 * conectado por una línea cuyo color refleja el avance. Click en un círculo:
 *
 *   - Click en la fase actual: no-op.
 *   - Click en la siguiente aplicable: avanzar. Para PR → F1, si faltan ítems
 *     del checklist se abre un modal que exige una justificación obligatoria
 *     (soft-override). El gate ya no es bloqueante duro: queda en el audit log
 *     como `fase_actual_override` con los ítems pendientes y la justificación.
 *   - Click en una previa: retroceder con confirm.
 *   - Click en futuras lejanas: bloqueado.
 *
 * El stepper sólo muestra las fases APLICABLES a la tipología de la capa
 * + 'cerrado' al final como cierre del flujo. Tipo D (sólo PR): muestra
 * PR y un aviso de que para avanzar se debe definir la vía jurídica
 * (cambia la tipología).
 */

type Props = {
  capa:         DesalojoCapa
  fasesEstado:  DesalojoFaseEstado[]
  /** Avanzar a `fase`. Si se pasa `justificacion`, el server permite el avance
   *  aunque falten ítems del checklist (soft-override) y deja audit. */
  onSetFase:    (fase: DesalojoFase, justificacion?: string) => Promise<void>
  disabled?:    boolean
}

export default function DesalojoFaseStepper({ capa, fasesEstado, onSetFase, disabled = false }: Props) {
  const aplicables = getFasesAplicables(capa.tipologia)
  const fases: DesalojoFase[] = [...aplicables, 'cerrado']
  const idxActual = fases.indexOf(capa.fase_actual)
  const siguiente = nextFaseAplicable(capa.fase_actual, capa.tipologia)
  const anterior  = prevFaseAplicable(capa.fase_actual, capa.tipologia)

  const semByFase = new Map(fasesEstado.map(f => [f.fase, f.semaforo]))

  const [overrideModal, setOverrideModal] = useState<{ fase: DesalojoFase; reasons: string[] } | null>(null)

  async function handleClick(fase: DesalojoFase) {
    if (fase === capa.fase_actual || disabled) return
    const idxDestino = fases.indexOf(fase)
    if (idxDestino < 0) return

    if (idxActual >= 0 && idxDestino < idxActual) {
      const msg = idxDestino === idxActual - 1
        ? `¿Retroceder a ${FASE_CFG[fase].label}? Quedará en el audit log.`
        : `¿Retroceder varias fases hasta ${FASE_CFG[fase].label}? Quedará en el audit log.`
      if (!window.confirm(msg)) return
      await onSetFase(fase)
      return
    }

    if (fase !== siguiente) return
    if (capa.fase_actual === 'pr' && fase === 'f1') {
      const check = canAdvanceFase(capa, fasesEstado, fase)
      if (!check.ok) {
        // Soft-override: abrir modal pidiendo justificación.
        setOverrideModal({ fase, reasons: check.reasons })
        return
      }
    }
    await onSetFase(fase)
  }

  const advanceCheck =
    capa.fase_actual === 'pr' && siguiente === 'f1'
      ? canAdvanceFase(capa, fasesEstado, 'f1')
      : { ok: true, reasons: [] }

  const esTipoDSoloPR = capa.tipologia === 'D' && aplicables.length === 1

  return (
    <div className="space-y-3">
      <ol className="flex items-start gap-0">
        {fases.map((fase, idx) => {
          const cfg     = FASE_CFG[fase]
          const isLast  = idx === fases.length - 1
          const isPast  = idxActual >= 0 && idx <  idxActual
          const isCur   = idx === idxActual
          const isNext  = fase === siguiente
          const isPrev  = fase === anterior
          const sem     = fase === 'cerrado' ? null : semByFase.get(fase as Exclude<DesalojoFase, 'cerrado'>) ?? 'gris'

          // Con soft-override, la "siguiente" siempre es clickeable (el modal
          // se encarga de pedir justificación si faltan ítems).
          const clickable = !disabled && (
            isPrev ||
            isNext ||
            (idxActual >= 0 && idx < idxActual)
          )

          let circleCls = 'bg-white text-gray-400 ring-1 ring-gray-200'
          if (isCur)          circleCls = 'bg-slate-900 text-white ring-2 ring-slate-300'
          else if (isPast)    circleCls = 'bg-slate-900 text-white'
          else if (isNext && advanceCheck.ok) circleCls = 'bg-white text-slate-700 ring-2 ring-slate-400'
          else if (isNext)    circleCls = 'bg-white text-amber-700 ring-2 ring-amber-400'

          const connectorCls = idx > 0
            ? (idxActual >= 0 && idx <= idxActual ? 'bg-slate-900' : 'bg-gray-200')
            : ''

          return (
            <li key={fase} className={`${isLast ? '' : 'flex-1'} flex items-start min-w-0`}>
              {idx > 0 && <span className={`h-px flex-1 ${connectorCls} mt-4`} />}
              <button
                type="button"
                onClick={() => handleClick(fase)}
                disabled={!clickable}
                title={
                  isCur                       ? `Fase actual: ${cfg.label}` :
                  isNext && !advanceCheck.ok  ? `Avanzar con justificación: ${advanceCheck.reasons.join(' · ')}` :
                  isPrev                      ? `Retroceder a ${cfg.label}` :
                  isNext                      ? `Avanzar a ${cfg.label}` :
                  clickable                   ? `Retroceder a ${cfg.label}` :
                                                cfg.label
                }
                className={`flex flex-col items-center gap-1 px-1 ${clickable ? 'cursor-pointer' : 'cursor-default'} flex-shrink-0 group`}
              >
                <span className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center tabular-nums transition-all ${circleCls} ${clickable ? 'group-hover:scale-110' : ''}`}>
                  {cfg.short}
                </span>
                <span className={`text-[10px] leading-tight ${isCur ? 'text-slate-900 font-semibold' : 'text-gray-500'} text-center min-w-[3.5rem]`}>
                  {cfg.sublabel}
                </span>
                {sem && (
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${SEMAFORO_CONFIG[sem]?.dot ?? SEMAFORO_CONFIG.gris.dot}`} title={SEMAFORO_CONFIG[sem]?.label} />
                )}
              </button>
            </li>
          )
        })}
      </ol>

      {siguiente && capa.fase_actual === 'pr' && !advanceCheck.ok && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">Avance a F1 con ítems pendientes</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {advanceCheck.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="mt-1.5 leading-snug text-amber-700">
            Puedes avanzar igual: el sistema pedirá una justificación que quedará en el audit log.
          </p>
        </div>
      )}

      {esTipoDSoloPR && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-800">
          <p className="font-semibold">Tipo D — sin flujo operativo definido</p>
          <p className="mt-0.5 leading-snug">
            La capa permanece en PR mientras se decide la vía jurídica. Al definirla,
            reasigna la tipología (B si Ley 21.633 / Art. 157 LGUC, C si expropiación con sentencia)
            y el resto del flujo se activa.
          </p>
        </div>
      )}

      {overrideModal && (
        <OverrideAvanceModal
          destino={overrideModal.fase}
          reasons={overrideModal.reasons}
          onCancel={() => setOverrideModal(null)}
          onConfirm={async justificacion => {
            await onSetFase(overrideModal.fase, justificacion)
            setOverrideModal(null)
          }}
        />
      )}
    </div>
  )
}

function OverrideAvanceModal({
  destino, reasons, onCancel, onConfirm,
}: {
  destino:   DesalojoFase
  reasons:   string[]
  onCancel:  () => void
  onConfirm: (justificacion: string) => Promise<void>
}) {
  const [text, setText]       = useState('')
  const [saving, setSaving]   = useState(false)
  const trimmed = text.trim()
  const validLen = trimmed.length >= 10

  async function submit() {
    if (!validLen || saving) return
    setSaving(true)
    try { await onConfirm(trimmed) }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">
            Avanzar a {FASE_CFG[destino].label} con ítems pendientes
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            El checklist de PR tiene ítems sin completar. Si igualmente decides avanzar,
            documenta la razón para que quede registrada en el audit log.
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold mb-1">Ítems pendientes:</p>
          <ul className="list-disc list-inside space-y-0.5">
            {reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-700">
            Justificación <span className="text-rose-500">*</span>
          </label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={4}
            placeholder="Ej. La resolución del Servicio propietario ya fue dictada pero no está aún publicada en el DO. El operativo no puede esperar la publicación."
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <p className={`text-[11px] ${validLen ? 'text-gray-400' : 'text-amber-700'}`}>
            Mínimo 10 caracteres. {trimmed.length} / 1000.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!validLen || saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-medium"
          >
            {saving ? 'Avanzando…' : 'Avanzar con justificación'}
          </button>
        </div>
      </div>
    </div>
  )
}
