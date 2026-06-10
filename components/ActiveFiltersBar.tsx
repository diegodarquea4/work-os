'use client'

/**
 * Bar de "filtros activos" — chips de qué se está filtrando arriba del bloque
 * de filtros. Cada chip tiene label + valor + `×` para deselect puntual.
 * A la derecha, "Limpiar todo".
 *
 * API genérica: el llamador construye un array de `ActiveChip` y la bar los
 * renderiza. Esto permite reusarla entre Dashboard y Bandeja sin atar la API
 * a un set fijo de campos. Helper `setChip(label, set, onClear, format?)`
 * cubre el caso típico de un Set<string>.
 */

export type ActiveChip = {
  /** Identificador único para React key. */
  key:      string
  /** Etiqueta del filtro (ej. "Región", "Etapa"). */
  label:    string
  /** Texto del valor después del ":". Si se omite, solo se ve el label. */
  value?:   string
  /** Click en el chip o en `×`. */
  onClear:  () => void
  /** Estilo del chip. Default 'slate'. 'amber' para foco / alertas. */
  variant?: 'slate' | 'amber'
}

type Props = {
  chips:        ActiveChip[]
  clearFilters: () => void
}

/**
 * Helper para construir un chip a partir de un Set<string>. Devuelve `null`
 * si el set está vacío (para filtrar con `.filter(Boolean)` en el array de
 * chips del llamador).
 *
 * Si hay 1-2 valores, los muestra concatenados. Si hay ≥3, muestra `(N)`.
 */
export function setChip(
  label:   string,
  sel:     Set<string>,
  onClear: () => void,
  format?: (v: string) => string,
): ActiveChip | null {
  if (sel.size === 0) return null
  const fmt    = format ?? ((s: string) => s)
  const values = Array.from(sel).map(fmt)
  const value  = sel.size <= 2 ? values.join(', ') : `(${sel.size})`
  return { key: label, label, value, onClear }
}

/**
 * Helper para un valor single-string (no Set) — útil para filtros globales
 * tipo `activeRegionName` en Bandeja. Devuelve null si vacío o sentinel.
 */
export function stringChip(
  label:    string,
  value:    string,
  onClear:  () => void,
  sentinel: string = 'todas',
): ActiveChip | null {
  if (!value || value === sentinel) return null
  return { key: label, label, value, onClear }
}

export default function ActiveFiltersBar({ chips, clearFilters }: Props) {
  if (chips.length === 0) return null
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {chips.map(c => {
        const variantClass = c.variant === 'amber'
          ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
        return (
          <button
            key={c.key}
            type="button"
            onClick={c.onClear}
            title={c.value ?? c.label}
            className={`inline-flex items-center gap-1.5 text-xs pl-2.5 pr-1.5 py-1 rounded-full transition-colors max-w-[280px] ${variantClass}`}
          >
            <span className="font-medium flex-shrink-0">{c.label}</span>
            {c.value !== undefined && (
              <>
                <span className="opacity-60 flex-shrink-0">:</span>
                <span className="truncate">{c.value}</span>
              </>
            )}
            <span className="opacity-50 text-sm leading-none -mt-px">×</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={clearFilters}
        className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline"
      >
        Limpiar todo
      </button>
    </div>
  )
}
