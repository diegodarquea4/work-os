'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import { REGIONS, ZONA_COLORS } from '@/lib/regions'
import { useAllRegionsMetric } from '@/lib/hooks/useAllRegionsMetric'

// ── Metric config ─────────────────────────────────────────────────────────────
const METRICS = [
  { name: 'tasa_desocupacion', label: 'Desocupación (%)',   yFmt: (v: number) => `${v.toFixed(1)}%`  },
  { name: 'pib_regional',      label: 'PIB Regional (MM$)', yFmt: (v: number) => `${v.toFixed(0)} MM$` },
] as const

// ── Zone-aware color palette ──────────────────────────────────────────────────
// Each zone gets 2–5 shades derived from ZONA_COLORS so the chart ties back
// to the existing zone-color vocabulary.
const REGION_COLORS: Record<string, string> = {
  // Norte Grande
  XV:   '#F59E0B', I:   '#D97706', II:  '#92400E',
  // Norte Chico
  III:  '#EAB308', IV:  '#CA8A04',
  // Zona Central
  V:    '#3B82F6', RM:  '#1D4ED8', VI:  '#60A5FA', VII: '#2563EB', XVI: '#93C5FD',
  // Sur
  VIII: '#22C55E', IX:  '#16A34A', XIV: '#4ADE80', X:   '#15803D',
  // Austral
  XI:   '#A855F7', XII: '#7C3AED',
}

// Zones in display order, each with its member region cods
const ZONES = Object.entries(
  REGIONS.reduce<Record<string, string[]>>((acc, r) => {
    if (!acc[r.zona]) acc[r.zona] = []
    acc[r.zona].push(r.cod)
    return acc
  }, {})
)

type Props = { onClose: () => void }

export default function RegionComparisonModal({ onClose }: Props) {
  const [activeMetric, setActiveMetric] = useState<string>(METRICS[0].name)
  const [visible, setVisible]           = useState<Set<string>>(() => new Set(REGIONS.map(r => r.cod)))

  const { data, loading } = useAllRegionsMetric(activeMetric)
  const metricCfg = METRICS.find(m => m.name === activeMetric) ?? METRICS[0]

  // Build wide-format chart data: [{ period, RM: 8.1, I: 9.3, ... }]
  const chartData = useMemo(() => {
    if (!data.length) return []
    const periods = [...new Set(data.flatMap(s => s.data.map(d => d.period)))].sort()
    return periods.map(period => {
      const row: Record<string, unknown> = { period }
      for (const s of data) {
        const obs = s.data.find(d => d.period === period)
        if (obs) row[s.region.cod] = obs.value
      }
      return row
    })
  }, [data])

  // X-axis label: "ene 2024" (monthly) or "Q1 2024" (quarterly)
  function fmtPeriod(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    const month = d.getMonth()
    const year  = d.getFullYear()
    if (activeMetric === 'pib_regional') {
      const q = Math.floor(month / 3) + 1
      return `T${q} ${year}`
    }
    return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' }).format(d)
  }

  function toggleRegion(cod: string) {
    setVisible(prev => {
      const next = new Set(prev)
      next.has(cod) ? next.delete(cod) : next.add(cod)
      return next
    })
  }

  function toggleZone(cods: string[]) {
    const allOn = cods.every(c => visible.has(c))
    setVisible(prev => {
      const next = new Set(prev)
      if (allOn) cods.forEach(c => next.delete(c))
      else       cods.forEach(c => next.add(c))
      return next
    })
  }

  function setAll(on: boolean) {
    setVisible(on ? new Set(REGIONS.map(r => r.cod)) : new Set())
  }

  const visibleCount = visible.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Comparativa Interregional</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fuente: BCCh — {visibleCount} de 16 regiones visibles</p>
          </div>
          {/* Metric tabs */}
          <div className="flex gap-1 border border-gray-200 rounded-lg p-1">
            {METRICS.map(m => (
              <button
                key={m.name}
                onClick={() => setActiveMetric(m.name)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                  activeMetric === m.name
                    ? 'bg-slate-900 text-white'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4"
            aria-label="Cerrar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </div>

        {/* ── Chart ── */}
        <div className="flex-1 min-h-0 px-6 py-4">
          {loading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                <p className="text-sm text-gray-500">Cargando datos...</p>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
                <XAxis
                  dataKey="period"
                  tickFormatter={fmtPeriod}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={{ stroke: '#E5E7EB' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={metricCfg.yFmt}
                  tick={{ fontSize: 11, fill: '#9CA3AF' }}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                />
                <Tooltip
                  formatter={(value, name) =>
                    typeof value === 'number'
                      ? [metricCfg.yFmt(value), REGIONS.find(r => r.cod === name)?.nombre ?? name]
                      : [value, name]
                  }
                  labelFormatter={(label) =>
                    typeof label === 'string' ? fmtPeriod(label) : label
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  itemSorter={(item) => -(item.value as number)}
                />
                {data
                  .filter(s => visible.has(s.region.cod))
                  .map(s => (
                    <Line
                      key={s.region.cod}
                      type="monotone"
                      dataKey={s.region.cod}
                      name={s.region.cod}
                      stroke={REGION_COLORS[s.region.cod] ?? '#9CA3AF'}
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))
                }
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Region toggles ── */}
        <div className="flex-shrink-0 border-t border-gray-100 px-6 py-3 space-y-2">
          {/* Bulk actions */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium mr-1">Regiones:</span>
            <button
              onClick={() => setAll(true)}
              className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Todas
            </button>
            <button
              onClick={() => setAll(false)}
              className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Ninguna
            </button>
          </div>
          {/* Zone groups */}
          <div className="flex flex-wrap gap-3">
            {ZONES.map(([zona, cods]) => {
              const zoneColor = ZONA_COLORS[zona] ?? '#9CA3AF'
              const allZoneOn = cods.every(c => visible.has(c))
              return (
                <div key={zona} className="flex items-center gap-1.5">
                  <button
                    onClick={() => toggleZone(cods)}
                    className="flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 transition-opacity"
                    style={{ color: zoneColor, opacity: allZoneOn ? 1 : 0.4 }}
                    title={allZoneOn ? `Ocultar ${zona}` : `Mostrar ${zona}`}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor }}/>
                    {zona}
                  </button>
                  <div className="flex gap-1">
                    {cods.map(cod => {
                      const region = REGIONS.find(r => r.cod === cod)!
                      const on = visible.has(cod)
                      return (
                        <button
                          key={cod}
                          onClick={() => toggleRegion(cod)}
                          title={region.nombre}
                          className="text-xs px-2 py-0.5 rounded-full border transition-all"
                          style={{
                            borderColor: on ? REGION_COLORS[cod] : '#E5E7EB',
                            backgroundColor: on ? REGION_COLORS[cod] + '22' : 'transparent',
                            color: on ? REGION_COLORS[cod] : '#9CA3AF',
                            fontWeight: on ? 600 : 400,
                          }}
                        >
                          {cod}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
