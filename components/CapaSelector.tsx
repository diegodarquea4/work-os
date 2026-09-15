'use client'

import type { Capa } from '@/lib/projects'
import { CAPA_OPCIONES, capasDe, type CapaSel } from '@/lib/capas'

/**
 * Tres chips I · II · III que se marcan y desmarcan — el selector de capas
 * de una vista. Lo que está en negro es lo que se muestra (Diego,
 * 2026-09-15). Es un ALCANCE, no un filtro: rige listas, pines, conteos y %
 * de avance de la vista donde está ("el avance mide lo mismo que se ve"), y
 * se recuerda por usuario (useCapaSel). Por eso "Limpiar filtros" no lo toca.
 *
 * Nunca quedan las tres apagadas: el último chip encendido no se puede
 * apagar (lo dice su title), porque una vista sin capa no muestra nada.
 */
type Props = {
  value: CapaSel
  onToggle: (capa: Capa) => void
  /** El Tablero lo deshabilita al agrupar por capa (ahí se ven las tres). */
  disabled?: boolean
  disabledTitle?: string
  className?: string
}

export default function CapaSelector({ value, onToggle, disabled = false, disabledTitle, className = '' }: Props) {
  const activas = capasDe(value)
  const soloQueda = activas.size === 1

  return (
    <div
      role="group"
      aria-label="Capas de importancia"
      title={disabled ? disabledTitle : undefined}
      className={`inline-flex rounded-md border border-gray-200 overflow-hidden ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      {CAPA_OPCIONES.map((o, i) => {
        const on = activas.has(o.key)
        const ultima = on && soloQueda
        const title = disabled
          ? undefined
          : ultima
            ? `${o.largo} — es la única marcada; marca otra antes de desmarcar esta`
            : on ? `${o.largo} — clic para ocultar` : `${o.largo} — clic para mostrar`
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => { if (!disabled && !ultima) onToggle(o.key) }}
            disabled={disabled}
            aria-pressed={on}
            title={title}
            className={`px-2 py-0.5 text-[11px] font-semibold transition-colors whitespace-nowrap disabled:cursor-not-allowed ${i > 0 ? 'border-l border-gray-200' : ''} ${
              on ? 'bg-slate-800 text-white' : 'bg-white text-gray-400 hover:text-gray-700'
            } ${ultima && !disabled ? 'cursor-default' : ''}`}
          >
            {o.corto}
          </button>
        )
      })}
    </div>
  )
}
