'use client'

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
 *   - Click en la siguiente aplicable: avanzar (validado por canAdvanceFase para PR → F1).
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
  onSetFase:    (fase: DesalojoFase) => Promise<void>
  disabled?:    boolean
}

export default function DesalojoFaseStepper({ capa, fasesEstado, onSetFase, disabled = false }: Props) {
  const aplicables = getFasesAplicables(capa.tipologia)
  // El stepper muestra las aplicables + 'cerrado' como estado terminal.
  const fases: DesalojoFase[] = [...aplicables, 'cerrado']
  const idxActual = fases.indexOf(capa.fase_actual)
  const siguiente = nextFaseAplicable(capa.fase_actual, capa.tipologia)
  const anterior  = prevFaseAplicable(capa.fase_actual, capa.tipologia)

  const semByFase = new Map(fasesEstado.map(f => [f.fase, f.semaforo]))

  async function handleClick(fase: DesalojoFase) {
    if (fase === capa.fase_actual || disabled) return
    const idxDestino = fases.indexOf(fase)
    if (idxDestino < 0) return

    // Retroceso: confirm.
    if (idxActual >= 0 && idxDestino < idxActual) {
      const msg = idxDestino === idxActual - 1
        ? `¿Retroceder a ${FASE_CFG[fase].label}? Quedará en el audit log.`
        : `¿Retroceder varias fases hasta ${FASE_CFG[fase].label}? Quedará en el audit log.`
      if (!window.confirm(msg)) return
      await onSetFase(fase)
      return
    }

    // Avance: solo a la siguiente aplicable.
    if (fase !== siguiente) return
    if (capa.fase_actual === 'pr' && fase === 'f1') {
      const check = canAdvanceFase(capa, fasesEstado, fase)
      if (!check.ok) {
        window.alert(`No se puede avanzar:\n• ${check.reasons.join('\n• ')}`)
        return
      }
    }
    await onSetFase(fase)
  }

  const advanceCheck =
    capa.fase_actual === 'pr' && siguiente === 'f1'
      ? canAdvanceFase(capa, fasesEstado, 'f1')
      : { ok: true, reasons: [] }

  // Tipo D: el único avance posible es asignar otra tipología.
  const esTipoDSoloPR = capa.tipologia === 'D' && aplicables.length === 1

  return (
    <div className="space-y-3">
      {/* Stepper */}
      <ol className="flex items-start gap-0">
        {fases.map((fase, idx) => {
          const cfg     = FASE_CFG[fase]
          const isLast  = idx === fases.length - 1
          const isPast  = idxActual >= 0 && idx <  idxActual
          const isCur   = idx === idxActual
          const isNext  = fase === siguiente
          const isPrev  = fase === anterior
          const sem     = fase === 'cerrado' ? null : semByFase.get(fase as Exclude<DesalojoFase, 'cerrado'>) ?? 'gris'

          const clickable = !disabled && (
            isPrev ||
            (isNext && advanceCheck.ok) ||
            (idxActual >= 0 && idx < idxActual)
          )

          let circleCls = 'bg-white text-gray-400 ring-1 ring-gray-200'
          if (isCur)          circleCls = 'bg-slate-900 text-white ring-2 ring-slate-300'
          else if (isPast)    circleCls = 'bg-slate-900 text-white'
          else if (isNext && advanceCheck.ok) circleCls = 'bg-white text-slate-700 ring-2 ring-slate-400'
          else if (isNext)    circleCls = 'bg-white text-gray-400 ring-1 ring-amber-300'

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
                  isNext && !advanceCheck.ok  ? `Bloqueado: ${advanceCheck.reasons.join(' · ')}` :
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

      {/* Aviso si la siguiente está bloqueada */}
      {siguiente && capa.fase_actual === 'pr' && !advanceCheck.ok && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
          <p className="font-semibold">Avance a F1 bloqueado</p>
          <ul className="list-disc list-inside mt-1 space-y-0.5">
            {advanceCheck.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      {/* Tipo D: el avance pasa por definir la vía y reasignar tipología */}
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
    </div>
  )
}
