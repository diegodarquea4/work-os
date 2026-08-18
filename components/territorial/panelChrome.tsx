'use client'

/**
 * Chrome compartido de los paneles flotantes del modo «Autoridades» (barra de
 * controles y simbología), para que ambos «conversen»: mismo pill colapsado,
 * misma tipografía, mismo chevron y mismo botón de minimizar. Los dos paneles
 * se coordinan por `panelAbierto` en el contexto (son mutuamente excluyentes).
 */

// Los paneles viven dentro de un stack `pointer-events-none` (deja pasar el mouse
// al mapa entre los chips), así que cada uno reactiva sus eventos con
// `pointer-events-auto` — sin esto los clicks no llegan al control.

/** Pill colapsado: ancho fijo (par apilado alineado), texto + chevron a los extremos. */
export const PILL_CLS =
  'pointer-events-auto flex w-64 max-w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur transition-colors hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300'

/** Contenedor del panel expandido (sin ancho — cada panel fija el suyo). */
export const PANEL_CLS =
  'pointer-events-auto rounded-lg border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur'

/** Encabezado del panel expandido: título + botón de minimizar. */
export const PANEL_TITLE_CLS = 'text-xs font-semibold text-slate-700'

export const MINIMIZE_BTN_CLS =
  'rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300'

export function Chevron({ up = false }: { up?: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`shrink-0 transition-transform ${up ? 'rotate-180' : ''}`}
      aria-hidden
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}
