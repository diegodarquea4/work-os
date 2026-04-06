'use client'

import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import type { MetricSeries } from '@/lib/types'

const LINE_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#A855F7', '#EF4444']

const fmtPeriod = (iso: string) =>
  new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(
    new Date(iso + 'T12:00:00'),
  )

type Props = {
  series: MetricSeries[]
  loading: boolean
  error: string | null
  metricLabels?: Record<string, string>
  yFormatter?: (v: number) => string
}

export default function RegionMetricsChart({
  series,
  loading,
  error,
  metricLabels = {},
  yFormatter = (v) => v.toLocaleString('es-CL'),
}: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const toggle = (name: string) =>
    setHidden(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  if (loading) {
    return (
      <div className="space-y-2 mt-2">
        <div className="h-3 bg-gray-100 rounded animate-pulse w-32" />
        <div className="h-28 bg-gray-100 rounded-lg animate-pulse" />
      </div>
    )
  }

  if (error || series.length === 0) return null

  // Merge all periods into a single array of data points keyed by period
  const periodSet = new Set<string>()
  for (const s of series) s.data.forEach(d => periodSet.add(d.period))
  const periods = Array.from(periodSet).sort()

  const chartData = periods.map(period => {
    const row: Record<string, string | number> = { period }
    for (const s of series) {
      const point = s.data.find(d => d.period === period)
      if (point) row[s.metric_name] = point.value
    }
    return row
  })

  const visibleSeries = series.filter(s => !hidden.has(s.metric_name))

  return (
    <div className="mt-2">
      {/* Series toggles */}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {series.map((s, i) => (
            <button
              key={s.metric_name}
              onClick={() => toggle(s.metric_name)}
              className={`text-xs px-2 py-0.5 rounded-full border transition-opacity ${
                hidden.has(s.metric_name) ? 'opacity-40' : 'opacity-100'
              }`}
              style={{ borderColor: LINE_COLORS[i % LINE_COLORS.length], color: LINE_COLORS[i % LINE_COLORS.length] }}
            >
              {metricLabels[s.metric_name] ?? s.metric_name}
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-100 p-3">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="period"
              tickFormatter={fmtPeriod}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickFormatter={yFormatter}
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <Tooltip
              formatter={(value, name) => [
                typeof value === 'number' ? yFormatter(value) : String(value),
                typeof name === 'string' ? (metricLabels[name] ?? name) : String(name),
              ]}
              labelFormatter={(label) =>
                typeof label === 'string' ? fmtPeriod(label) : String(label)
              }
              contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
            />
            {visibleSeries.map((s, i) => (
              <Line
                key={s.metric_name}
                type="monotone"
                dataKey={s.metric_name}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
