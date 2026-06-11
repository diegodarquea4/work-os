'use client'

import type { DesalojoCapa } from '@/lib/types'
import { PROTOCOLO_DIPRES } from '@/lib/desalojos'

/**
 * Widget del protocolo de financiamiento (Sección VII del 038). Árbol de
 * decisión que conduce a "Financiamiento ASEGURADO". Visualmente refleja
 * el estado de la capa: cuando `financiamiento_asegurado === true`, todos
 * los nodos quedan verdes; cuando es false, el nodo final queda en rojo.
 *
 * Solo lectura — no editable. Sirve como recordatorio metodológico
 * mientras admin gestiona el financiamiento en la fase F4.
 */

type Props = {
  capa: DesalojoCapa
}

export default function DesalojoProtocoloDipres({ capa }: Props) {
  const asegurado = capa.financiamiento_asegurado === true
  const propietario = capa.propietario ?? '—'
  const fuente      = capa.fuente ?? '—'

  const nodeOk    = 'bg-green-50 border-green-200 text-green-900'
  const nodeWarn  = 'bg-amber-50 border-amber-200 text-amber-900'
  const nodePend  = 'bg-gray-50  border-gray-200  text-gray-700'
  const nodeFinalOk   = 'bg-green-100 border-green-400 text-green-900'
  const nodeFinalRojo = 'bg-red-50    border-red-300   text-red-800'

  return (
    <section className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-bold text-gray-900">Protocolo de financiamiento DIPRES</h3>
        <p className="text-xs text-gray-500 mt-0.5 leading-tight">
          Árbol de decisión (Sección VII, minuta 038). Ningún caso activa F3 sin financiamiento asegurado — sin excepción.
        </p>
      </header>

      <div className="px-4 py-4 space-y-3">

        {/* Paso 1: propietario */}
        <div className={`rounded-lg border px-3 py-2 ${nodePend}`}>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">Paso 1</p>
          <p className="text-sm font-bold mt-0.5">¿Quién es el propietario del terreno?</p>
          <p className="text-xs text-gray-600 mt-0.5">{propietario}</p>
        </div>

        <ArrowDown />

        {/* Paso 2: fuente primaria */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(Object.values(PROTOCOLO_DIPRES.fuente_primaria) as { label: string; detalle: string }[]).map(opt => (
            <div key={opt.label} className={`rounded-lg border px-3 py-2 ${nodePend}`}>
              <p className="text-xs font-bold">{opt.label}</p>
              <p className="text-[11px] text-gray-600 leading-tight mt-0.5">{opt.detalle}</p>
            </div>
          ))}
        </div>

        <ArrowDown />

        {/* Paso 3: alternativas */}
        <div className={`rounded-lg border px-3 py-2 ${nodeWarn}`}>
          <p className="text-[10px] uppercase tracking-wide font-semibold text-amber-700">Paso 3</p>
          <p className="text-sm font-bold mt-0.5">Si la fuente primaria no es viable, ¿existe alternativa?</p>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {PROTOCOLO_DIPRES.alternativas.map(a => (
              <li key={a.key} className="flex items-start gap-1">
                <span className="font-bold text-amber-700">·</span>
                <span>
                  <span className="font-medium">{a.label}</span>
                  {a.detalle && <span className="text-amber-700 ml-1">— {a.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-gray-600 mt-2">
            Fuente actual de la capa: <span className="font-semibold text-gray-800">{fuente}</span>
          </p>
        </div>

        <ArrowDown />

        {/* Paso 4: validación DIPRES en Sala Decisión */}
        <div className={`rounded-lg border px-3 py-2 ${asegurado ? nodeOk : nodeWarn}`}>
          <p className="text-[10px] uppercase tracking-wide font-semibold">Paso 4</p>
          <p className="text-sm font-bold mt-0.5">Validación DIPRES en Sala Decisión</p>
          <p className="text-xs leading-tight mt-0.5">
            Quien resuelve es la Sala Decisión convocada por el Ministro del Interior con DIPRES y ministerios sectoriales.
          </p>
        </div>

        <ArrowDown />

        {/* Paso 5 — estado final */}
        <div className={`rounded-lg border-2 px-4 py-3 text-center ${asegurado ? nodeFinalOk : nodeFinalRojo}`}>
          <p className="text-sm font-bold uppercase tracking-wide">
            {asegurado ? 'Financiamiento ASEGURADO' : 'Financiamiento PENDIENTE'}
          </p>
          <p className="text-xs leading-tight mt-1">
            {asegurado
              ? 'Operativo autorizado a iniciarse.'
              : 'No se autoriza el inicio del operativo. Activa el flag "Validación DIPRES" en la fase F4 cuando se confirme.'}
          </p>
        </div>

      </div>
    </section>
  )
}

function ArrowDown() {
  return (
    <div className="flex justify-center">
      <svg width="14" height="20" viewBox="0 0 14 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-gray-400">
        <path d="M7 1v15M2 12l5 5 5-5"/>
      </svg>
    </div>
  )
}
