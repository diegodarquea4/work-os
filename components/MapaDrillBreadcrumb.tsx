'use client'

/**
 * Breadcrumb del drill comunal — overlay sobre el mapa:
 *   Mapa · Chile · {Región} · nivel comunal | {Comuna}
 * El botón ← retrocede UN nivel (mismo comportamiento que Esc).
 * Offset izquierdo para no chocar con el control de zoom de Leaflet (topleft).
 */

type Props = {
  regionNombre: string
  comunaNombre: string | null
  onBack: () => void
}

export default function MapaDrillBreadcrumb({ regionNombre, comunaNombre, onBack }: Props) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-2.5 py-1.5 max-w-full">
      <button
        onClick={onBack}
        title="Volver un nivel (Esc)"
        className="shrink-0 px-1.5 py-0.5 text-xs text-gray-500 border border-gray-200 rounded hover:border-gray-400 hover:text-gray-700 transition-colors"
      >
        ←
      </button>
      <p className="text-xs text-gray-400 truncate">
        Mapa · Chile · <span className="font-semibold text-slate-800">{regionNombre}</span>
        {' · '}
        <span className="font-semibold text-slate-600">{comunaNombre ?? 'nivel comunal'}</span>
      </p>
    </div>
  )
}
