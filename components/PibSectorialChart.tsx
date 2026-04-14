'use client'

import type { PibSector } from '@/lib/hooks/usePibSectorial'

type Props = {
  data: PibSector[]
  latestPeriod: string | null
  loading: boolean
  error: string | null
}

function fmtPeriod(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('es-CL', { year: 'numeric' })
}

function fmtVal(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} MM MM$`
  return `${v.toFixed(1)} MM$`
}

export default function PibSectorialChart({ data, latestPeriod, loading, error }: Props) {
  if (loading) {
    return (
      <div className="px-5 pb-4 animate-pulse">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2 mb-2">
            <div className="h-3 bg-gray-200 rounded w-24 flex-shrink-0" />
            <div className="h-3 bg-gray-200 rounded flex-1" style={{ width: `${40 + i * 10}%` }} />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="px-5 pb-3 text-xs text-red-500">{error}</p>
  }

  if (data.length === 0) {
    return (
      <p className="px-5 pb-3 text-xs text-gray-400 italic">
        Sin datos sectoriales — ejecutar sync de PIB sectorial primero.
      </p>
    )
  }

  const maxVal = Math.max(...data.map(d => d.value))

  return (
    <div className="px-5 pb-4">
      {latestPeriod && (
        <p className="text-[10px] text-gray-400 mb-2">Año {fmtPeriod(latestPeriod)} · miles de millones de pesos</p>
      )}
      <div className="space-y-1.5">
        {data.map(sector => (
          <div key={sector.sector} className="flex items-center gap-2">
            <span className="text-[11px] text-gray-600 w-28 flex-shrink-0 truncate" title={sector.sector}>
              {sector.sector}
            </span>
            <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-400"
                style={{ width: `${(sector.value / maxVal) * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-gray-500 w-20 text-right flex-shrink-0">
              {fmtVal(sector.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
