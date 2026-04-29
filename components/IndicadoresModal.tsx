'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import { useRegionIndicadores } from '@/lib/hooks/useRegionIndicadores'
import { useAllRegionsMetric } from '@/lib/hooks/useAllRegionsMetric'
import { usePibSectorial } from '@/lib/hooks/usePibSectorial'
import { useColegaSeguridadAll, useColegaSeguridadRegion } from '@/lib/hooks/useColegaSeguridad'
import type { LeystopRow } from '@/lib/hooks/useColegaSeguridad'
import { useColegaEmpleoRegion } from '@/lib/hooks/useColegaEmpleo'
import { ZONA_COLORS, REGIONS, INE_CODE } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { MetricSeries, RegionMetrics } from '@/lib/types'

// ── Tab types ─────────────────────────────────────────────────────────────────

type MainTab    = 'seguridad' | 'pib' | 'censo' | 'empleo' | 'casen' | 'comparar'
type SecSubTab  = 'resumen'   | 'evolucion' | 'actividad'
type PibSubTab  = 'evolucion' | 'sectores'  | 'resumen'
type CensoSub   = 'demografia' | 'vivienda' | 'educacion' | 'conectividad'
type EmpleoSub  = 'resumen'   | 'evolucion' | 'ranking'
type CasenSub   = 'pobreza'   | 'salud'     | 'seguridad'
type PibMode    = 'pct' | 'mm'

// ── Config ────────────────────────────────────────────────────────────────────

const MAIN_TABS: { id: MainTab; label: string; emoji: string }[] = [
  { id: 'seguridad', label: 'Seguridad Pública', emoji: '🛡' },
  { id: 'pib',       label: 'PIB Regional',      emoji: '📈' },
  { id: 'censo',     label: 'Censo 2024',         emoji: '🏘' },
  { id: 'empleo',    label: 'Empleo',             emoji: '💼' },
  { id: 'casen',     label: 'CASEN',               emoji: '🏠' },
  { id: 'comparar',  label: 'Comparar',           emoji: '📊' },
]

const TAB_COLOR: Record<MainTab, string> = {
  seguridad: '#16a34a',
  pib:       '#2563eb',
  censo:     '#7c3aed',
  empleo:    '#0891b2',
  casen:     '#be185d',
  comparar:  '#475569',
}

// Region colors for comparison chart
const REGION_COLORS: Record<string, string> = {
  XV: '#F59E0B', I: '#D97706', II: '#92400E',
  III: '#EAB308', IV: '#CA8A04',
  V: '#3B82F6', RM: '#1D4ED8', VI: '#60A5FA', VII: '#2563EB', XVI: '#93C5FD',
  VIII: '#22C55E', IX: '#16A34A', XIV: '#4ADE80', X: '#15803D',
  XI: '#A855F7', XII: '#7C3AED',
}

const ZONES = Object.entries(
  REGIONS.reduce<Record<string, string[]>>((acc, r) => {
    if (!acc[r.zona]) acc[r.zona] = []
    acc[r.zona].push(r.cod)
    return acc
  }, {})
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, d = 1, suffix = ''): string {
  if (v == null) return '—'
  return `${v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d })}${suffix}`
}

function fmtMonthly(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' })
    .format(new Date(iso + 'T12:00:00'))
}

function fmtQuarterly(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}

function fmtShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' })
    .format(new Date(iso + 'T12:00:00'))
}

function pct(v: number | null | undefined, d = 1) { return v != null ? `${v.toFixed(d)}%` : '—' }
function num(v: number | null | undefined)         { return v != null ? v.toLocaleString('es-CL') : '—' }
function fnum(v: number | null | undefined, d = 1) {
  return v != null ? v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'
}

// ── Shared components ─────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 leading-none">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5 leading-snug">{sub}</p>}
    </div>
  )
}

function SubTabs<T extends string>({ tabs, active, onChange }: {
  tabs: { id: T; label: string }[]; active: T; onChange: (t: T) => void
}) {
  return (
    <div className="flex gap-0 border-b border-gray-200 mb-5">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`text-sm px-4 py-2.5 font-medium border-b-2 transition-colors -mb-px ${
            active === t.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm text-center px-4">{text}</div>
  )
}

function Source({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 mt-3">{text}</p>
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { region: Region; onClose: () => void }

export default function IndicadoresModal({ region, onClose }: Props) {
  const [mainTab,    setMainTab]    = useState<MainTab>('seguridad')
  const [activeRegionCod, setActiveRegionCod] = useState(region.cod)
  const [secSub,     setSecSub]     = useState<SecSubTab>('resumen')
  const [pibSub,     setPibSub]     = useState<PibSubTab>('evolucion')
  const [censoSub,   setCensoSub]   = useState<CensoSub>('demografia')
  const [empleoSub,  setEmpleoSub]  = useState<EmpleoSub>('resumen')
  const [casenSub,   setCasenSub]   = useState<CasenSub>('pobreza')
  const [pibMode,    setPibMode]    = useState<PibMode>('pct')

  const activeRegion = REGIONS.find(r => r.cod === activeRegionCod) ?? region
  const zoneColor    = ZONA_COLORS[activeRegion.zona] ?? '#64748b'
  const tabColor     = TAB_COLOR[mainTab]

  const { timeSeries, nationalSeries, metrics, loading } =
    useRegionIndicadores(activeRegionCod)
  const { data: sectores, latestPeriod: sectPeriod, loading: sectLoading } = usePibSectorial(activeRegionCod)
  const { rows: allLeystop, semana: leystopSemana, loading: secAllLoading } = useColegaSeguridadAll()
  const { history: leystopHistory, loading: secRegLoading } = useColegaSeguridadRegion(activeRegionCod)
  const { series: colegaEmpleo } = useColegaEmpleoRegion(activeRegionCod)

  // ── PIB chart data ────────────────────────────────────────────────────────
  const pibData = useMemo(() => {
    const regS = timeSeries.find(s => s.metric_name === 'pib_regional')
    const natS = nationalSeries.find(s => s.metric_name === 'pib_regional')
    if (!regS) return []
    const natMap = new Map((natS?.data ?? []).map(d => [d.period, d.value]))

    if (pibMode === 'pct') {
      return regS.data
        .filter(d => natMap.has(d.period) && (natMap.get(d.period) ?? 0) > 0)
        .map(d => ({
          period:   d.period,
          regional: parseFloat(((d.value / natMap.get(d.period)!) * 100).toFixed(3)),
          national: null as number | null,
        }))
    }
    const allPeriods = [...new Set(regS.data.map(d => d.period))].sort()
    const regMap = new Map(regS.data.map(d => [d.period, d.value]))
    return allPeriods
      .map(p => ({ period: p, regional: regMap.get(p) ?? null, national: natMap.get(p) ?? null }))
      .filter(d => d.regional != null)
  }, [timeSeries, nationalSeries, pibMode])

  // ── Empleo chart data ─────────────────────────────────────────────────────
  const empleoData = useMemo(() => {
    const regS = timeSeries.find(s => s.metric_name === 'tasa_desocupacion')
    const natS = nationalSeries.find(s => s.metric_name === 'tasa_desocupacion')
    if (!regS) return []
    const natMap = new Map((natS?.data ?? []).map(d => [d.period, d.value]))
    const allPeriods = [...new Set(regS.data.map(d => d.period))].sort()
    const regMap = new Map(regS.data.map(d => [d.period, d.value]))
    return allPeriods
      .map(p => ({ period: p, regional: regMap.get(p) ?? null, national: natMap.get(p) ?? null }))
      .filter(d => d.regional != null)
  }, [timeSeries, nationalSeries])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Dark header + tab nav ── */}
        <div className="flex-shrink-0 bg-[#1a1a2e] rounded-t-2xl">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor }} />
              <select
                value={activeRegionCod}
                onChange={e => setActiveRegionCod(e.target.value)}
                className="text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 max-w-[280px]"
              >
                {REGIONS.map(r => (
                  <option key={r.cod} value={r.cod} className="text-gray-900 bg-white">{r.nombre}</option>
                ))}
              </select>
              <span className="text-gray-500 text-xs flex-shrink-0">· Dashboard Regional</span>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded flex-shrink-0" aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          {/* Main tab bar */}
          <nav className="flex mt-3 px-2 overflow-x-auto">
            {MAIN_TABS.map(t => (
              <button key={t.id} onClick={() => setMainTab(t.id)}
                className={`flex items-center gap-1.5 text-sm px-4 py-2.5 font-medium transition-colors whitespace-nowrap border-b-2 rounded-t-md ${
                  mainTab === t.id
                    ? 'text-white border-white bg-white/10'
                    : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5'
                }`}>
                <span className="text-base leading-none">{t.emoji}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ── Content area ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {mainTab === 'seguridad' && (
                <SeguridadSection
                  regionCod={activeRegionCod}
                  allRows={allLeystop}
                  history={leystopHistory}
                  semana={leystopSemana}
                  loading={secAllLoading || secRegLoading}
                  subTab={secSub}
                  setSubTab={setSecSub}
                  accentColor={tabColor}
                />
              )}
              {mainTab === 'pib' && (
                <PibSection
                  region={activeRegion}
                  pibData={pibData}
                  pibMode={pibMode}
                  setPibMode={setPibMode}
                  metrics={metrics}
                  sectores={sectores}
                  sectPeriod={sectPeriod}
                  sectLoading={sectLoading}
                  subTab={pibSub}
                  setSubTab={setPibSub}
                  zoneColor={zoneColor}
                />
              )}
              {mainTab === 'censo' && (
                <CensoSection
                  metrics={metrics}
                  subTab={censoSub}
                  setSubTab={setCensoSub}
                />
              )}
              {mainTab === 'empleo' && (
                <EmpleoSection
                  region={activeRegion}
                  empleoData={empleoData}
                  colegaEmpleo={colegaEmpleo}
                  metrics={metrics}
                  subTab={empleoSub}
                  setSubTab={setEmpleoSub}
                  zoneColor={zoneColor}
                />
              )}
              {mainTab === 'casen' && (
                <CasenSection
                  metrics={metrics}
                  subTab={casenSub}
                  setSubTab={setCasenSub}
                />
              )}
              {mainTab === 'comparar' && (
                <CompararSection region={activeRegion} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Seguridad ─────────────────────────────────────────────────────────────────

function SeguridadSection({ regionCod, allRows, history, semana, loading, subTab, setSubTab, accentColor }: {
  regionCod: string
  allRows: LeystopRow[]
  history: LeystopRow[]
  semana: string
  loading: boolean
  subTab: SecSubTab
  setSubTab: (t: SecSubTab) => void
  accentColor: string
}) {
  const SUB = [
    { id: 'resumen'   as SecSubTab, label: 'Resumen por región' },
    { id: 'evolucion' as SecSubTab, label: 'Evolución temporal' },
    { id: 'actividad' as SecSubTab, label: 'Actividad operativa' },
  ]

  const regionRow = allRows.find(r => INE_CODE[regionCod] === r.id_region) ?? null

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6">
      <SubTabs tabs={SUB} active={subTab} onChange={setSubTab} />
      {subTab === 'resumen'   && <SeguridadResumen regionRow={regionRow} allRows={allRows} semana={semana} accentColor={accentColor} />}
      {subTab === 'evolucion' && <SeguridadEvolucion history={history} />}
      {subTab === 'actividad' && <SeguridadActividad regionRow={regionRow} allRows={allRows} accentColor={accentColor} />}
    </div>
  )
}

function SeguridadResumen({ regionRow: r, allRows, semana, accentColor }: {
  regionRow: LeystopRow | null
  allRows: LeystopRow[]
  semana: string
  accentColor: string
}) {
  const totalAnno = allRows.reduce((s, row) => s + (row.casos_anno_fecha ?? 0), 0)
  const totalSem  = allRows.reduce((s, row) => s + (row.casos_ultima_semana ?? 0), 0)
  const avgTasa   = allRows.length > 0
    ? allRows.reduce((s, row) => s + (row.tasa_registro ?? 0), 0) / allRows.filter(row => row.tasa_registro != null).length
    : null

  const chartData = [...allRows]
    .filter(row => row.tasa_registro != null)
    .sort((a, b) => (b.tasa_registro ?? 0) - (a.tasa_registro ?? 0))
    .map(row => ({ nombre: row.nombre_region, tasa: row.tasa_registro ?? 0 }))

  if (allRows.length === 0) {
    return <EmptyState text="Sin datos de seguridad. Los datos de LeyStop se actualizan automáticamente cada miércoles." />
  }

  return (
    <div className="space-y-5">
      {/* KPIs — región seleccionada + nacionales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Casos año a la fecha" value={r?.casos_anno_fecha?.toLocaleString('es-CL') ?? totalAnno.toLocaleString('es-CL')} sub={r ? r.nombre_region : 'Total nacional'} color={accentColor} />
        <KpiCard label="Última semana" value={r?.casos_ultima_semana?.toLocaleString('es-CL') ?? totalSem.toLocaleString('es-CL')} sub={semana || 'Semana actual'} color={accentColor} />
        <KpiCard label="Var. año a la fecha" value={r?.var_anno_fecha != null ? `${r.var_anno_fecha > 0 ? '+' : ''}${r.var_anno_fecha.toFixed(1)}%` : '—'} sub="vs año anterior" color={(r?.var_anno_fecha ?? 0) > 0 ? '#dc2626' : accentColor} />
        <KpiCard label="Tasa /100k hab." value={r?.tasa_registro?.toFixed(0) ?? (avgTasa?.toFixed(0) ?? '—')} sub={r ? 'Región seleccionada' : 'Promedio nacional'} color="#2563eb" />
      </div>

      {/* Top 5 delitos de la región */}
      {r && (() => {
        const delitos = [
          { nombre: r.mayor_registro_1, n: r.n_1 }, { nombre: r.mayor_registro_2, n: r.n_2 },
          { nombre: r.mayor_registro_3, n: r.n_3 }, { nombre: r.mayor_registro_4, n: r.n_4 },
          { nombre: r.mayor_registro_5, n: r.n_5 },
        ].filter(d => d.nombre)
        const maxN = Math.max(...delitos.map(d => d.n ?? 0), 1)
        return delitos.length > 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Top 5 delitos — {r.nombre_region} · {semana}</h3>
            <div className="space-y-3">
              {delitos.map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-700 leading-tight pr-4 truncate">{d.nombre}</span>
                    <span className="text-xs font-bold text-gray-900 flex-shrink-0">{d.n?.toLocaleString('es-CL') ?? '—'}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${((d.n ?? 0) / maxN) * 100}%`, backgroundColor: i === 0 ? accentColor : '#86efac' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null
      })()}

      {/* Ranking table — todas las regiones */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ranking por región — {semana}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#1a1a2e] text-white">
                <th className="text-left px-4 py-2.5 font-medium">Región</th>
                <th className="text-right px-3 py-2.5 font-medium">Casos año</th>
                <th className="text-right px-3 py-2.5 font-medium">Var. año %</th>
                <th className="text-right px-3 py-2.5 font-medium">Últ. semana</th>
                <th className="text-right px-3 py-2.5 font-medium">Tasa/100k</th>
                <th className="text-left px-3 py-2.5 font-medium">Delito principal</th>
              </tr>
            </thead>
            <tbody>
              {[...allRows]
                .sort((a, b) => (b.tasa_registro ?? 0) - (a.tasa_registro ?? 0))
                .map(row => (
                  <tr key={row.id_region} className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${row.id_region === r?.id_region ? 'bg-blue-50 font-semibold' : ''}`}>
                    <td className="px-4 py-2 text-gray-800">{row.nombre_region}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.casos_anno_fecha?.toLocaleString('es-CL') ?? '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${(row.var_anno_fecha ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {row.var_anno_fecha != null ? `${row.var_anno_fecha > 0 ? '+' : ''}${row.var_anno_fecha.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.casos_ultima_semana?.toLocaleString('es-CL') ?? '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{row.tasa_registro?.toFixed(0) ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate">{row.mayor_registro_1 ?? '—'}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bar chart tasa por región */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Tasa de registro por 100 mil hab.</h3>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={130} />
              <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} /100k`, 'Tasa']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="tasa" radius={[0, 3, 3, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.nombre === r?.nombre_region ? accentColor : '#86efac'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <Source text="Fuente: Ley S.T.O.P. — Carabineros de Chile · Actualización semanal" />
    </div>
  )
}

function SeguridadEvolucion({ history }: { history: LeystopRow[] }) {
  const data = history.map(s => ({ period: s.fecha_hasta_iso, value: s.tasa_registro ?? 0, casos: s.casos_ultima_semana ?? 0 }))

  if (data.length === 0) {
    return <EmptyState text="Sin histórico de seguridad disponible. Los datos se acumulan con cada sync semanal." />
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasa de registro por 100 mil hab. — evolución semanal</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="period" tickFormatter={fmtShortDate} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={Math.max(0, Math.floor(data.length / 10) - 1)} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} /100k`, 'Tasa delictual']} labelFormatter={(l) => typeof l === 'string' ? fmtShortDate(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Bar dataKey="value" fill="#86efac" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Casos por semana</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 4, right: 10, left: -20, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="period" tickFormatter={fmtShortDate} tick={{ fontSize: 9, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={Math.max(0, Math.floor(data.length / 10) - 1)} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString('es-CL'), 'Casos']} labelFormatter={(l) => typeof l === 'string' ? fmtShortDate(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
            <Bar dataKey="casos" fill="#16a34a" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <Source text="Fuente: Ley S.T.O.P. — Carabineros de Chile · Actualización semanal" />
    </div>
  )
}

function SeguridadActividad({ regionRow: r, allRows, accentColor }: {
  regionRow: LeystopRow | null
  allRows: LeystopRow[]
  accentColor: string
}) {
  const row = r ?? allRows[0]
  if (!row) {
    return <EmptyState text="Datos operativos no disponibles. Se actualizan con el sync semanal de LeyStop." />
  }

  const controlesData = [
    { nombre: 'Identidad', valor: row.controles_identidad ?? 0 },
    { nombre: 'Vehicular',  valor: row.controles_vehicular  ?? 0 },
  ]
  const incautData = [
    { nombre: 'Armas de fuego', valor: row.incaut_fuego   ?? 0 },
    { nombre: 'Armas blancas',  valor: row.incaut_blancas ?? 0 },
  ]
  const fiscData = [
    { nombre: 'Control alcohol', valor: row.fiscal_alcohol  ?? 0 },
    { nombre: 'Control banca',   valor: row.fiscal_bancaria ?? 0 },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Controles"           value={num(row.controles)}                                        sub="Identidad + Vehicular"       color={accentColor} />
        <KpiCard label="Fiscalizaciones"      value={num(row.fiscalizaciones)}                                  sub="Alcohol + Banca"             color="#2563eb" />
        <KpiCard label="Incautaciones armas"  value={num((row.incaut_fuego ?? 0) + (row.incaut_blancas ?? 0))} sub="Fuego + Blancas"             color="#dc2626" />
        <KpiCard label="Decomisos"            value={row.decomisos_anno != null ? `${row.decomisos_anno.toFixed(0)} kg` : '—'} sub="Año a la fecha"   color="#9333ea" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard label="Allanamientos"        value={num(row.allanamientos_anno)}      sub="Año a la fecha"   color={accentColor} />
        <KpiCard label="Vehículos recuperados" value={num(row.vehiculos_recuperados_anno)} sub="Año a la fecha" color="#0891b2" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          { title: 'Controles por tipo', data: controlesData, color: '#3b82f6' },
          { title: 'Fiscalizaciones por tipo', data: fiscData, color: '#2563eb' },
          { title: 'Incautaciones de armas', data: incautData, color: '#dc2626' },
        ].map(({ title, data: bData, color }) => (
          <div key={title} className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{title}</h3>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={bData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={110} />
                <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString('es-CL'), '']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Bar dataKey="valor" fill={color} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <Source text={`Fuente: Ley S.T.O.P. — Carabineros de Chile · ${row.fecha_desde_iso} al ${row.fecha_hasta_iso}`} />
    </div>
  )
}

// ── PIB Regional ──────────────────────────────────────────────────────────────

type PibSectorT = import('@/lib/hooks/usePibSectorial').PibSector

function PibSection({ region, pibData, pibMode, setPibMode, metrics: m, sectores, sectPeriod, sectLoading, subTab, setSubTab, zoneColor }: {
  region: Region
  pibData: { period: string; regional: number | null; national: number | null }[]
  pibMode: PibMode
  setPibMode: (m: PibMode) => void
  metrics: RegionMetrics | null
  sectores: PibSectorT[]
  sectPeriod: string | null
  sectLoading: boolean
  subTab: PibSubTab
  setSubTab: (t: PibSubTab) => void
  zoneColor: string
}) {
  const SUB = [
    { id: 'evolucion' as PibSubTab, label: 'Evolución' },
    { id: 'sectores'  as PibSubTab, label: 'Sectores productivos' },
    { id: 'resumen'   as PibSubTab, label: 'Resumen' },
  ]
  const latestReg = pibData.at(-1)?.regional ?? null
  const pibYFmt = (v: number) => pibMode === 'pct' ? `${v.toFixed(2)}%` : `${v.toFixed(0)} MM$`

  return (
    <div className="p-6">
      <SubTabs tabs={SUB} active={subTab} onChange={setSubTab} />

      {subTab === 'evolucion' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
              <button onClick={() => setPibMode('pct')} className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${pibMode === 'pct' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>% Nacional</button>
              <button onClick={() => setPibMode('mm')}  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${pibMode === 'mm'  ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>MM$</button>
            </div>
          </div>
          {latestReg != null && (
            <span className="text-xs px-3 py-1.5 rounded-full font-semibold text-white inline-block" style={{ backgroundColor: zoneColor }}>
              {region.nombre.split(' ')[0]}: {pibYFmt(latestReg)}
            </span>
          )}
          {pibData.length === 0 ? (
            <EmptyState text="Sin datos de PIB regional. Requiere sync de Banco Central." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={pibData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="period" tickFormatter={fmtQuarterly} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={pibYFmt} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={54} />
                  <Tooltip formatter={(value, name) => [typeof value === 'number' ? pibYFmt(value) : String(value), name === 'regional' ? region.nombre : 'Promedio Nacional']} labelFormatter={(l) => typeof l === 'string' ? fmtQuarterly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 2, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <Source text="Fuente: Banco Central de Chile · Actualización trimestral" />
        </div>
      )}

      {subTab === 'sectores' && (
        <div className="space-y-5">
          {sectLoading ? (
            <div className="flex items-center justify-center h-40"><div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : sectores.length === 0 ? (
            <EmptyState text="Datos sectoriales no disponibles aún. Las series de PIB por sector están pendientes de configuración." />
          ) : (
            <>
              {sectPeriod && <p className="text-sm font-semibold text-gray-700">Composición sectorial — {fmtQuarterly(sectPeriod)}</p>}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <ResponsiveContainer width="100%" height={Math.max(280, sectores.length * 32)}>
                  <BarChart data={sectores} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)} MM$`} />
                    <YAxis type="category" dataKey="sector" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={140} />
                    <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} MM$`, 'PIB']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                    <Bar dataKey="value" fill="#2563eb" radius={[0, 3, 3, 0]}>
                      {sectores.map((_, i) => <Cell key={i} fill={`hsl(${220 + i * 8}, 70%, ${55 - i * 2}%)`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
          <Source text="Fuente: Banco Central de Chile · Miles de millones de pesos encadenados base 2018" />
        </div>
      )}

      {subTab === 'resumen' && (
        <div className="space-y-4">
          {!m ? (
            <EmptyState text="Sin datos de resumen económico para esta región." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard label="PIB Regional"           value={m.pib_regional != null ? `${m.pib_regional.toLocaleString('es-CL')} MM$` : '—'} sub="Miles de millones de pesos"     color="#2563eb" />
              <KpiCard label="% del PIB Nacional"     value={pct(m.pct_pib_nacional)}                                                          sub="Participación regional"          color="#2563eb" />
              <KpiCard label="Variación interanual"   value={m.variacion_interanual != null ? `${m.variacion_interanual > 0 ? '+' : ''}${m.variacion_interanual.toFixed(1)}%` : '—'} sub="Crecimiento anual" color={m.variacion_interanual != null && m.variacion_interanual < 0 ? '#dc2626' : '#16a34a'} />
              <KpiCard label="Inversión pública"      value={m.inversion_publica_ejecutada != null ? `${m.inversion_publica_ejecutada.toLocaleString('es-CL')} MM$` : '—'} sub="Ejecutado" color="#0891b2" />
              <KpiCard label="FNDR"                   value={m.inversion_fndr != null ? `${m.inversion_fndr.toLocaleString('es-CL')} MM$` : '—'}                       sub="Fondo Nacional de Desarrollo Regional" color="#0891b2" />
              {m.sectores_productivos_principales && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 col-span-2 sm:col-span-1" style={{ borderLeftWidth: 4, borderLeftColor: '#2563eb' }}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Sectores principales</p>
                  <p className="text-sm font-medium text-gray-800">{m.sectores_productivos_principales}</p>
                </div>
              )}
            </div>
          )}
          <Source text="Fuente: Banco Central de Chile · Datos anuales / snapshot estático" />
        </div>
      )}
    </div>
  )
}

// ── Censo 2024 ────────────────────────────────────────────────────────────────

function CensoSection({ metrics: m, subTab, setSubTab }: {
  metrics: RegionMetrics | null
  subTab: CensoSub
  setSubTab: (t: CensoSub) => void
}) {
  const CENSO_TABS = [
    { id: 'demografia'    as CensoSub, label: 'Demografía' },
    { id: 'vivienda'      as CensoSub, label: 'Vivienda' },
    { id: 'educacion'     as CensoSub, label: 'Educación' },
    { id: 'conectividad'  as CensoSub, label: 'Conectividad y Servicios' },
  ]
  const PURPLE = '#7c3aed'

  if (!m) {
    return (
      <div className="p-6">
        <EmptyState text="Sin datos de Censo 2024. Los datos se actualizan con el sync semanal." />
      </div>
    )
  }

  return (
    <div className="p-6">
      <SubTabs tabs={CENSO_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'demografia' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Población total"     value={num(m.poblacion_total)}                   sub="habitantes"              color={PURPLE} />
            <KpiCard label="Hombres"              value={pct(m.pct_hombres)}                       sub={num(m.poblacion_total != null && m.pct_hombres != null ? Math.round(m.poblacion_total * m.pct_hombres / 100) : null)} color={PURPLE} />
            <KpiCard label="Mujeres"              value={pct(m.pct_mujeres)}                       sub={num(m.poblacion_total != null && m.pct_mujeres != null ? Math.round(m.poblacion_total * m.pct_mujeres / 100) : null)} color={PURPLE} />
            <KpiCard label="Edad promedio"        value={`${fnum(m.prom_edad)} años`}              sub="promedio regional"       color={PURPLE} />
            <KpiCard label="Mayores de 60 años"   value={pct(m.pct_edad_60_mas)}                   sub="del total regional"      color={PURPLE} />
            <KpiCard label="Inmigrantes"          value={pct(m.pct_inmigrantes)}                   sub={`${num(m.n_inmigrantes)} personas`} color={PURPLE} />
            <KpiCard label="Pueblos originarios"  value={pct(m.pct_indigena)}                      sub={`${num(m.n_pueblos_orig)} personas`} color={PURPLE} />
            <KpiCard label="Discapacidad"         value={num(m.n_discapacidad)}                    sub="personas"                color={PURPLE} />
            <KpiCard label="Zona urbana"          value={pct(m.pct_urbana)}                        sub="de la población"         color={PURPLE} />
            <KpiCard label="Zona rural"           value={pct(m.pct_rural)}                         sub="de la población"         color={PURPLE} />
            <KpiCard label="Densidad poblacional" value={m.densidad_poblacional != null ? `${fnum(m.densidad_poblacional, 1)} hab/km²` : '—'} sub="" color={PURPLE} />
          </div>
          <Source text="Fuente: Censo 2024 — INE Chile · Urbano/rural y densidad: Censo 2017" />
        </div>
      )}

      {subTab === 'vivienda' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Déficit habitacional"    value={num(m.n_deficit_cuantitativo)}         sub="unidades"        color={PURPLE} />
            <KpiCard label="Hacinamiento"             value={pct(m.pct_viv_hacinadas)}              sub="de viviendas"    color={PURPLE} />
            <KpiCard label="Acceso agua pública"      value={pct(m.pct_acceso_agua_publica)}        sub="de viviendas"    color={PURPLE} />
            <KpiCard label="Jefatura femenina"        value={pct(m.pct_jefatura_mujer)}             sub="de hogares"      color={PURPLE} />
          </div>
          <Source text="Fuente: Censo 2024 — INE Chile" />
        </div>
      )}

      {subTab === 'educacion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Educación superior"     value={pct(m.pct_educacion_superior)}          sub="de la población"         color={PURPLE} />
            <KpiCard label="Años escolaridad (18+)" value={`${fnum(m.anios_escolaridad_promedio)} años`} sub="promedio"          color={PURPLE} />
            <KpiCard label="Cobertura parvularia"   value={pct(m.cobertura_parvularia_pct)}         sub="de niños en edad"        color={PURPLE} />
          </div>
          <Source text="Fuente: Censo 2024 — INE Chile" />
        </div>
      )}

      {subTab === 'conectividad' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Hogares con internet"    value={pct(m.pct_hogares_internet)}            sub="del total de hogares"    color={PURPLE} />
            <KpiCard label="Internet móvil"          value={pct(m.pct_internet_movil)}              sub="cobertura"               color={PURPLE} />
            <KpiCard label="Internet fijo"           value={pct(m.pct_internet_fijo)}               sub="cobertura"               color={PURPLE} />
            <KpiCard label="Acceso agua pública"     value={pct(m.pct_acceso_agua_publica)}         sub="de viviendas"            color={PURPLE} />
            <KpiCard label="Localidades aisladas"    value={num(m.localidades_aisladas_n)}           sub="con dificultad de acceso" color={PURPLE} />
          </div>
          <Source text="Fuente: Censo 2024 — INE Chile" />
        </div>
      )}
    </div>
  )
}

// ── Empleo ────────────────────────────────────────────────────────────────────

function EmpleoSection({ region, empleoData, colegaEmpleo, metrics: m, subTab, setSubTab, zoneColor }: {
  region: Region
  empleoData: { period: string; regional: number | null; national: number | null }[]
  colegaEmpleo: import('@/lib/hooks/useColegaEmpleo').EmpleoPoint[]
  metrics: RegionMetrics | null
  subTab: EmpleoSub
  setSubTab: (t: EmpleoSub) => void
  zoneColor: string
}) {
  const SUB = [
    { id: 'resumen'   as EmpleoSub, label: 'Resumen' },
    { id: 'evolucion' as EmpleoSub, label: 'Evolución por región' },
    { id: 'ranking'   as EmpleoSub, label: 'Ranking regional' },
  ]
  const latestEmpleo = empleoData.at(-1)?.regional ?? null
  const latestNat    = empleoData.at(-1)?.national  ?? null
  const latestColega = colegaEmpleo.at(-1)

  return (
    <div className="p-6">
      <SubTabs tabs={SUB} active={subTab} onChange={setSubTab} />
      {subTab === 'resumen'   && <EmpleoResumen region={region} metrics={m} latestColega={latestColega ?? null} zoneColor={zoneColor} />}
      {subTab === 'evolucion' && <EmpleoEvolucion region={region} data={empleoData} colegaEmpleo={colegaEmpleo} metrics={m} latestReg={latestEmpleo} latestNat={latestNat} zoneColor={zoneColor} />}
      {subTab === 'ranking'   && <EmpleoRanking region={region} zoneColor={zoneColor} />}
    </div>
  )
}

function EmpleoResumen({ region, metrics: m, latestColega, zoneColor }: {
  region: Region
  metrics: RegionMetrics | null
  latestColega: import('@/lib/hooks/useColegaEmpleo').EmpleoPoint | null
  zoneColor: string
}) {
  const CYAN = '#0891b2'

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Prefer colega monthly tasa over static region_metrics */}
        <KpiCard label="Tasa desocupación" value={latestColega?.tasa != null ? `${latestColega.tasa.toFixed(1)}%` : pct(m?.tasa_desocupacion)} sub={latestColega ? `${latestColega.periodo} · BCE/INE` : 'último dato'} color={CYAN} />
        <KpiCard label="Ocupados"          value={latestColega?.ocupados != null ? `${latestColega.ocupados.toFixed(0)} mil` : num(m?.n_ocupado)} sub={latestColega ? 'miles de personas · BCE/INE' : 'Censo 2024'} color={CYAN} />
        <KpiCard label="Tasa ocupación"    value={pct(m?.tasa_ocupacion)}                  sub="del total de la fuerza laboral" color={CYAN} />
        <KpiCard label="Tasa participación laboral" value={pct(m?.tasa_participacion_laboral)} sub="de la población en edad de trabajar" color={CYAN} />
        <KpiCard label="Ocupación informal" value={pct(m?.tasa_ocupacion_informal)}         sub="del total de ocupados"         color={CYAN} />
        <KpiCard label="Desocupados (Censo)" value={num(m?.n_desocupado)}                   sub="personas · Censo 2024"          color={CYAN} />
      </div>
      <Source text="Fuente: BCE/INE (mensual) + Censo 2024 — INE Chile" />
    </div>
  )
}

function EmpleoEvolucion({ region, data, colegaEmpleo, metrics: m, latestReg, latestNat, zoneColor }: {
  region: Region
  data: { period: string; regional: number | null; national: number | null }[]
  colegaEmpleo: import('@/lib/hooks/useColegaEmpleo').EmpleoPoint[]
  metrics: RegionMetrics | null
  latestReg: number | null
  latestNat: number | null
  zoneColor: string
}) {
  const yFmt = (v: number) => `${v.toFixed(1)}%`
  // Merge colega tasa series with work-os series (colega preferred where available)
  const mergedTasa = useMemo(() => {
    if (colegaEmpleo.length > 0) {
      return colegaEmpleo.map(p => ({ period: p.periodo, regional: p.tasa, national: null as number | null }))
    }
    return data
  }, [colegaEmpleo, data])

  const latestTasa = colegaEmpleo.at(-1)?.tasa ?? latestReg

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {latestTasa != null && (
          <span className="text-xs px-3 py-1.5 rounded-full font-semibold text-white" style={{ backgroundColor: zoneColor }}>
            {region.nombre.split(' ')[0]}: {yFmt(latestTasa)}
          </span>
        )}
        {latestNat != null && (
          <span className="text-xs px-3 py-1.5 rounded-full bg-gray-200 text-gray-600 font-medium">
            Nacional: {yFmt(latestNat)}
          </span>
        )}
      </div>

      {mergedTasa.length === 0 ? (
        <EmptyState text="Sin datos de evolución de desempleo. Requiere sync del Banco Central." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Tasa de desocupación mensual (%)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={mergedTasa} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="period" tickFormatter={fmtMonthly} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={yFmt} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value, name) => [typeof value === 'number' ? yFmt(value) : String(value), name === 'regional' ? region.nombre : 'Promedio Nacional']} labelFormatter={(l) => typeof l === 'string' ? fmtMonthly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 1.5, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
              {!colegaEmpleo.length && <Line type="monotone" dataKey="national" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Ocupados chart — only if colega has data */}
      {colegaEmpleo.length > 0 && colegaEmpleo.some(p => p.ocupados != null) && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Ocupados — miles de personas</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={colegaEmpleo} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="periodo" tickFormatter={fmtMonthly} tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `${v.toFixed(0)}k`} />
              <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} mil`, 'Ocupados']} labelFormatter={(l) => typeof l === 'string' ? fmtMonthly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="ocupados" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 1.5, fill: '#0891b2' }} activeDot={{ r: 5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <Source text="Fuente: BCE/INE — Banco Central de Chile · Actualización mensual" />
    </div>
  )
}

function EmpleoRanking({ region, zoneColor }: { region: Region; zoneColor: string }) {
  const { data, loading } = useAllRegionsMetric('tasa_desocupacion')

  const rankingData = useMemo(() => {
    if (!data.length) return []
    // Get the latest period per region
    return data
      .map(s => {
        const latest = s.data.at(-1)
        return latest ? { cod: s.region.cod, nombre: s.region.nombre, value: latest.value, period: latest.period } : null
      })
      .filter(Boolean)
      .sort((a, b) => (b!.value) - (a!.value)) as { cod: string; nombre: string; value: number; period: string }[]
  }, [data])

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex items-center justify-center h-40"><div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : rankingData.length === 0 ? (
        <EmptyState text="Sin datos de empleo disponibles. Requiere sync del Banco Central." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Ranking regional — Tasa de desocupación (%)</h3>
          {rankingData[0] && <p className="text-xs text-gray-400 mb-4">Último período disponible: {fmtMonthly(rankingData[0].period)}</p>}
          <ResponsiveContainer width="100%" height={Math.max(320, rankingData.length * 28)}>
            <BarChart data={rankingData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} unit="%" domain={[0, 'auto']} />
              <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={140} />
              <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(1)}%`, 'Tasa desocupación']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {rankingData.map(entry => (
                  <Cell key={entry.cod} fill={entry.cod === region.cod ? zoneColor : '#93c5fd'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <Source text="Fuente: Banco Central de Chile · Actualización mensual" />
    </div>
  )
}

// ── CASEN 2024 ────────────────────────────────────────────────────────────────

function CasenSection({ metrics: m, subTab, setSubTab }: {
  metrics: RegionMetrics | null
  subTab: CasenSub
  setSubTab: (t: CasenSub) => void
}) {
  const CASEN_TABS = [
    { id: 'pobreza'   as CasenSub, label: 'Pobreza' },
    { id: 'salud'     as CasenSub, label: 'Salud' },
    { id: 'seguridad' as CasenSub, label: 'Victimización' },
  ]
  const ROSE = '#be185d'

  if (!m) {
    return (
      <div className="p-6">
        <EmptyState text="Sin datos CASEN para esta región. Los indicadores se cargan desde el snapshot de región." />
      </div>
    )
  }

  return (
    <div className="p-6">
      <SubTabs tabs={CASEN_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'pobreza' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <KpiCard label="Pobreza por ingresos"      value={pct(m.pct_pobreza_ingresos)}          sub="% de personas"        color={ROSE} />
            <KpiCard label="Pobreza extrema"           value={pct(m.pct_pobreza_extrema)}           sub="% de personas"        color={ROSE} />
            <KpiCard label="Pobreza multidimensional"  value={pct(m.pct_pobreza_multidimensional)}  sub="% de hogares"         color={ROSE} />
            <KpiCard label="Pobreza severa"            value={pct(m.pct_pobreza_severa)}            sub="% de hogares"         color={ROSE} />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">Fuentes:</span> Pobreza por ingresos: CASEN 2024. Pobreza multidimensional: CASEN 2022 (estimación parcial por región). Pobreza extrema y severa: datos pendientes de carga.
            </p>
          </div>
          <Source text="Fuente: CASEN — Ministerio de Desarrollo Social y Familia (MIDESO)" />
        </div>
      )}

      {subTab === 'salud' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <KpiCard label="Cobertura FONASA"         value={pct(m.pct_fonasa)}                    sub="% de la población"         color={ROSE} />
            <KpiCard label="Hospitales"               value={num(m.hospitales_n)}                   sub="establecimientos"          color={ROSE} />
            <KpiCard label="Camas por 1.000 hab."     value={fmt(m.camas_por_1000_hab, 1)}          sub="capacidad hospitalaria"    color={ROSE} />
            <KpiCard label="Lista de espera"          value={num(m.lista_espera_n)}                 sub="personas en espera"        color={ROSE} />
          </div>
          <Source text="Fuente: FONASA / DEIS Ministerio de Salud" />
        </div>
      )}

      {subTab === 'seguridad' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <p className="text-xs text-blue-700">
              <span className="font-semibold">Nota:</span> Estos indicadores provienen de la ENUSC (Encuesta Nacional Urbana de Seguridad Ciudadana) — encuesta independiente de CASEN, realizada por INE.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
            <KpiCard label="Hogares víctimas (DMCS)" value={pct(m.pct_hogares_victimas_dmcs)}      sub="% de hogares · ENUSC 2022"  color={ROSE} />
            <KpiCard label="Percepción inseguridad"  value={pct(m.pct_percepcion_inseguridad)}     sub="% personas · ENUSC 2022"    color={ROSE} />
            <KpiCard label="Tasa denuncias"          value={fmt(m.tasa_denuncias_100k, 0, ' /100k')} sub="por 100.000 hab."         color={ROSE} />
            <KpiCard label="Tasa delitos"            value={fmt(m.tasa_delitos_100k, 0, ' /100k')} sub="por 100.000 hab."           color={ROSE} />
          </div>
          <Source text="Fuente: ENUSC 2022 — INE Chile · Tasa denuncias/delitos: Carabineros de Chile" />
        </div>
      )}
    </div>
  )
}

// ── Comparar ──────────────────────────────────────────────────────────────────

const COMP_METRICS = [
  { name: 'tasa_desocupacion', label: 'Desocupación (%)',    yFmt: (v: number) => `${v.toFixed(1)}%`   },
  { name: 'pib_regional',      label: 'PIB Regional (MM$)',  yFmt: (v: number) => `${v.toFixed(0)} MM$` },
] as const

function CompararSection({ region }: { region: Region }) {
  const [activeMetric, setActiveMetric] = useState<string>(COMP_METRICS[0].name)
  const [visible, setVisible] = useState<Set<string>>(() => new Set(REGIONS.map(r => r.cod)))

  const { data, loading } = useAllRegionsMetric(activeMetric)
  const metricCfg = COMP_METRICS.find(m => m.name === activeMetric) ?? COMP_METRICS[0]
  const zoneColor = ZONA_COLORS[region.zona] ?? '#64748b'

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

  function fmtP(iso: string): string {
    const d = new Date(iso + 'T12:00:00')
    if (activeMetric === 'pib_regional') return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
    return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' }).format(d)
  }

  function toggleRegion(cod: string) {
    setVisible(prev => { const next = new Set(prev); next.has(cod) ? next.delete(cod) : next.add(cod); return next })
  }

  function toggleZone(cods: string[]) {
    const allOn = cods.every(c => visible.has(c))
    setVisible(prev => { const next = new Set(prev); if (allOn) cods.forEach(c => next.delete(c)); else cods.forEach(c => next.add(c)); return next })
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
          {COMP_METRICS.map(m => (
            <button key={m.name} onClick={() => setActiveMetric(m.name)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${activeMetric === m.name ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{visible.size} de 16 regiones visibles</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis dataKey="period" tickFormatter={fmtP} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
              <YAxis tickFormatter={metricCfg.yFmt} tick={{ fontSize: 10, fill: '#9CA3AF' }} tickLine={false} axisLine={false} width={60} />
              <Tooltip formatter={(value, name) => typeof value === 'number' ? [metricCfg.yFmt(value), REGIONS.find(r => r.cod === name)?.nombre ?? name] : [value, name]} labelFormatter={(l) => typeof l === 'string' ? fmtP(l) : l} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }} itemSorter={(item) => -(item.value as number)} />
              {data.filter(s => visible.has(s.region.cod)).map(s => (
                <Line key={s.region.cod} type="monotone" dataKey={s.region.cod} name={s.region.cod}
                  stroke={s.region.cod === region.cod ? zoneColor : (REGION_COLORS[s.region.cod] ?? '#9CA3AF')}
                  strokeWidth={s.region.cod === region.cod ? 2.5 : 1.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500 font-medium">Regiones:</span>
          <button onClick={() => setVisible(new Set(REGIONS.map(r => r.cod)))} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Todas</button>
          <button onClick={() => setVisible(new Set())} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">Ninguna</button>
        </div>
        <div className="flex flex-wrap gap-3">
          {ZONES.map(([zona, cods]) => {
            const zColor = ZONA_COLORS[zona] ?? '#9CA3AF'
            const allOn = cods.every(c => visible.has(c))
            return (
              <div key={zona} className="flex items-center gap-1.5">
                <button onClick={() => toggleZone(cods)} className="flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 transition-opacity" style={{ color: zColor, opacity: allOn ? 1 : 0.4 }}>
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zColor }} />{zona}
                </button>
                <div className="flex gap-1 flex-wrap">
                  {cods.map(cod => {
                    const r = REGIONS.find(r => r.cod === cod)!
                    const on = visible.has(cod)
                    const isCurrent = cod === region.cod
                    return (
                      <button key={cod} onClick={() => toggleRegion(cod)} title={r.nombre}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-all ${isCurrent ? 'ring-1 ring-offset-1 ring-slate-400' : ''}`}
                        style={{ borderColor: on ? REGION_COLORS[cod] : '#E5E7EB', backgroundColor: on ? REGION_COLORS[cod] + '22' : 'transparent', color: on ? REGION_COLORS[cod] : '#9CA3AF', fontWeight: on ? 600 : 400 }}>
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

      <Source text="Fuente: Banco Central de Chile · Actualización mensual / trimestral" />
    </div>
  )
}
