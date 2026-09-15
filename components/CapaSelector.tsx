'use client'

import { CAPA_SEL_OPCIONES, type CapaSel } from '@/lib/capas'

/**
 * Control segmentado de 5 estados (I · II · III · I+II · Todas) — el selector
 * de capas de una vista. Es un ALCANCE, no un filtro: rige listas, pines,
 * conteos y % de avance de la vista donde está ("el avance mide lo mismo que
 * se ve"), y se recuerda por usuario (useCapaSel). Por eso "Limpiar filtros"
 * no lo toca.
 *
 * Mismo look de los chips que había en el Mapa (encendido = slate-800).
 */
type Props = {
  value: CapaSel
  onChange: (sel: CapaSel) => void
  /** El Tablero lo deshabilita al agrupar por capa (ahí se ven las tres). */
  disabled?: boolean
  disabledTitle?: string
  className?: string
}

export default function CapaSelector({ value, onChange, disabled = false, disabledTitle, className = '' }: Props) {
  return (
    <div
      role="group"
      aria-label="Capa de importancia"
      title={disabled ? disabledTitle : undefined}
      className={`inline-flex rounded-md border border-gray-200 overflow-hidden ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {CAPA_SEL_OPCIONES.map((o, i) => {
        const on = o.key === value
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => { if (!disabled && !on) onChange(o.key) }}
            disabled={disabled}
            title={disabled ? undefined : o.largo}
            aria-pressed={on}
            className={`px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed ${i > 0 ? 'border-l border-gray-200' : ''} ${
              on ? 'bg-slate-800 text-white' : 'bg-white text-gray-400 hover:text-gray-700'
            }`}
          >
            {o.corto}
          </button>
        )
      })}
    </div>
  )
}
