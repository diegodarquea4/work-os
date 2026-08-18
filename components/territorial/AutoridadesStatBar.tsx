'use client'

/**
 * Barra de estadística flotante (esquina superior derecha del mapa): 3 chips con
 * el conteo y % de unidades por bloque (izq/der/ind). El «sin dato» va al total
 * pero no tiene chip (espejo de renderStats del PTS).
 */

import { COLOR_HEX } from '@/lib/territorial/politica'
import { computeStats } from '@/lib/territorial/derive'
import { useTerritorialCtx } from './TerritorialProvider'

type Props = {
  view: 'regiones' | 'comunas'
  activeRegion: string | null
}

export default function AutoridadesStatBar({ view, activeRegion }: Props) {
  const { data, state, loading } = useTerritorialCtx()
  if (loading || !data) return null

  const stats = computeStats(data, state, view, activeRegion)
  const chips: [string, number, string][] = [
    ['Izquierda', stats.IZQ, COLOR_HEX.IZQ],
    ['Derecha', stats.DER, COLOR_HEX.DER],
    ['Independiente', stats.IND, COLOR_HEX.IND],
  ]

  return (
    <div className="pointer-events-none absolute right-3 top-3 z-[1000] flex flex-col gap-1.5">
      {chips.map(([label, n, color]) => {
        const pct = stats.total ? Math.round((n / stats.total) * 100) : 0
        return (
          <div key={label} className="pointer-events-auto flex items-center gap-2 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <b className="text-sm font-semibold tabular-nums" style={{ color }}>
              {n} <span className="text-[11px] font-medium text-slate-400">({pct}%)</span>
            </b>
            <span className="text-[11px] text-slate-500">{label} · {stats.unidad}</span>
          </div>
        )
      })}
    </div>
  )
}
