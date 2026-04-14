'use client'

import type { StopStats } from '@/lib/hooks/useStopStats'

type Props = {
  stats:   StopStats | null
  loading: boolean
  error:   string | null
}

function num(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return v.toLocaleString('es-CL')
}

function fmtPeriodo(desde: string, hasta: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
  return `${fmt(desde)} — ${fmt(hasta)}`
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-100 px-3 py-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">{label}</p>
      <p className="text-sm font-bold text-gray-900 leading-tight">{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function StopPanel({ stats, loading, error }: Props) {
  if (loading) {
    return (
      <div className="px-5 pb-4 animate-pulse">
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-lg border border-gray-100 px-3 py-2">
              <div className="h-2 bg-gray-200 rounded w-2/3 mb-1.5" />
              <div className="h-4 bg-gray-200 rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return <p className="px-5 pb-3 text-xs text-red-500">{error}</p>
  }

  if (!stats) {
    return (
      <p className="px-5 pb-3 text-xs text-gray-400 italic">
        Sin datos — ejecutar sync de Ley S.T.O.P primero.
      </p>
    )
  }

  const delitos = [
    { n: stats.mayor_registro_1, pct: stats.pct_1 },
    { n: stats.mayor_registro_2, pct: stats.pct_2 },
    { n: stats.mayor_registro_3, pct: stats.pct_3 },
    { n: stats.mayor_registro_4, pct: stats.pct_4 },
    { n: stats.mayor_registro_5, pct: stats.pct_5 },
  ].filter(d => d.n)

  return (
    <div className="px-5 pb-4">
      <p className="text-[10px] text-gray-400 mb-2">
        Semana {fmtPeriodo(stats.fecha_desde, stats.fecha_hasta)} · Fuente: Carabineros de Chile
      </p>

      {/* Controles */}
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Controles y fiscalizaciones</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatCard label="Controles vehiculares" value={num(stats.controles_vehicular)} />
        <StatCard label="Controles identidad"   value={num(stats.controles_identidad)} />
        <StatCard label="Fiscalizaciones"        value={num(stats.fiscalizaciones)} />
        <StatCard label="Fiscalizaciones alcohol" value={num(stats.fiscal_alcohol)} />
      </div>

      {/* Incautaciones */}
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Incautaciones y operativos</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <StatCard label="Incautaciones"    value={num(stats.incautaciones)} />
        <StatCard label="Armas de fuego"   value={num(stats.incaut_fuego)} />
        <StatCard label="Allanamientos"    value={num(stats.allanamientos_semana)} sub="esta semana" />
        <StatCard label="Veh. recuperados" value={num(stats.vehiculos_rec_semana)} sub="esta semana" />
      </div>

      {/* Top delitos */}
      {delitos.length > 0 && (
        <>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Principales registros</p>
          <div className="space-y-1">
            {delitos.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-gray-400 w-4">{i + 1}.</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-300"
                    style={{ width: `${d.pct ?? 0}%` }}
                  />
                </div>
                <span className="text-[11px] text-gray-600 flex-1 truncate" title={d.n ?? ''}>
                  {d.n}
                </span>
                <span className="text-[10px] text-gray-400 w-8 text-right">
                  {d.pct != null ? `${d.pct.toFixed(1)}%` : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
