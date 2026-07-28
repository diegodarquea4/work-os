'use client'

import type { ComunaStats } from '@/lib/comunaStats'
import { fmtMM } from '@/lib/comunaStats'

/**
 * Panel lateral del nivel comunal del Mapa (drill-down). Reemplaza al
 * MapaSummarySidebar mientras el usuario está dentro de una región:
 * lista de comunas con n° de iniciativas e inversión (desc por n), y al
 * final — tras el divisor — los buckets "Alcance regional" y "Sin comuna"
 * (requisito de producto: ninguna iniciativa desaparece del nivel comunal).
 *
 * La advertencia del subtítulo es deliberada: multi-comuna cuenta completa
 * en cada comuna (sin prorrateo), así que la suma de la lista puede superar
 * el total regional.
 */

type Props = {
  regionNombre: string
  regionCod: string
  stats: ComunaStats
  selectedCut: number | null
  onSelectComuna: (cut: number, nombre: string) => void
  onBack: () => void
  width: number
}

const NOTA_ENCUADRE: Record<string, string> = {
  V:   'Isla de Pascua y Juan Fernández aparecen en la lista; quedan fuera del encuadre del mapa.',
  XII: 'El territorio antártico queda fuera del encuadre del mapa.',
}

export default function ComunasSidebar({ regionNombre, regionCod, stats, selectedCut, onSelectComuna, onBack, width }: Props) {
  const totalListado = stats.rows.reduce((s, r) => s + r.n, 0)
  const nota = NOTA_ENCUADRE[regionCod]

  return (
    <aside
      className="relative bg-white border-l border-gray-200 flex flex-col overflow-hidden shrink-0"
      style={{ width }}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            title="Volver al mapa de Chile (Esc)"
            className="shrink-0 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded-lg hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            ←
          </button>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 truncate">{regionNombre} · nivel comunal</h3>
            <p className="text-[11px] text-gray-400">
              {stats.rows.length} comuna{stats.rows.length === 1 ? '' : 's'} con iniciativas · las multi-comuna cuentan completas en cada una
            </p>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {stats.rows.length === 0 && (
          <p className="text-xs text-gray-400 italic px-4 py-6 text-center">
            Ninguna comuna tiene iniciativas asignadas todavía.
          </p>
        )}
        {stats.rows.map(r => {
          const isSelected = r.cut === selectedCut
          return (
            <button
              key={r.cut}
              onClick={() => onSelectComuna(r.cut, r.nombre)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-left border-b border-gray-50 transition-colors ${
                isSelected ? 'bg-slate-100' : 'hover:bg-gray-50'
              }`}
            >
              <span className={`text-[13px] flex-1 min-w-0 truncate ${isSelected ? 'font-bold text-slate-900' : 'font-semibold text-gray-800'}`}>
                {r.nombre}
              </span>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">
                {r.n} · {fmtMM(r.mm)}
              </span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#cbd5e1" strokeWidth="2" className="shrink-0">
                <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )
        })}

        {/* Buckets — siempre al final, fuera del nivel comunal */}
        {(stats.alcanceRegional.n > 0 || stats.sinComuna.n > 0) && (
          <>
            <div className="px-4 py-1.5 text-[10px] font-bold tracking-wider text-gray-400 bg-gray-100 uppercase">
              Fuera del nivel comunal
            </div>
            {stats.alcanceRegional.n > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/60 border-b border-gray-50">
                <span className="text-[9px] font-bold tracking-wide text-gray-500 border border-gray-200 rounded px-1.5 py-px shrink-0">REGIONAL</span>
                <span className="text-[13px] font-semibold text-gray-700 flex-1 min-w-0 truncate">Alcance regional</span>
                <span className="text-xs text-gray-500 tabular-nums shrink-0">
                  {stats.alcanceRegional.n} · {fmtMM(stats.alcanceRegional.mm)}
                </span>
              </div>
            )}
            {stats.sinComuna.n > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50/60 border-b border-gray-50">
                <span className="text-[9px] font-bold tracking-wide text-gray-500 border border-gray-200 rounded px-1.5 py-px shrink-0">S/D</span>
                <span className="text-[13px] font-semibold text-gray-700 flex-1 min-w-0 truncate">Sin comuna</span>
                <span className="text-xs text-gray-500 tabular-nums shrink-0">
                  {stats.sinComuna.n} · {fmtMM(stats.sinComuna.mm)}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pie */}
      <div className="px-4 py-2 border-t border-gray-100 space-y-0.5">
        {nota && <p className="text-[10px] text-gray-400 leading-snug">{nota}</p>}
        <p className="text-[10px] text-gray-300">
          {totalListado} asignaciones comunales · ← o Esc para volver
        </p>
      </div>
    </aside>
  )
}
