'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell, ReferenceLine,
} from 'recharts'
import { useRegionIndicadores } from '@/lib/hooks/useRegionIndicadores'
import { useAllRegionsMetric } from '@/lib/hooks/useAllRegionsMetric'
import { useAllRegionsMetrics } from '@/lib/hooks/useAllRegionsMetrics'
import { usePibSectorial } from '@/lib/hooks/usePibSectorial'
import { useColegaSeguridadAll, useColegaSeguridadRegion } from '@/lib/hooks/useColegaSeguridad'
import type { LeystopRow } from '@/lib/hooks/useColegaSeguridad'
import { useColegaEmpleoRegion, useColegaEmpleoAll } from '@/lib/hooks/useColegaEmpleo'
import { ZONA_COLORS, REGIONS, INE_CODE } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'

// ── Tab types ─────────────────────────────────────────────────────────────────

type MainTab       = 'pulso' | 'economia' | 'perfil'
type PibMode       = 'pct' | 'mm'
type TableDimension = 'pobreza' | 'salud' | 'vivienda' | 'educacion' | 'conectividad' | 'victimizacion'

// ── Config ────────────────────────────────────────────────────────────────────

const MAIN_TABS: { id: MainTab; label: string; emoji: string; badge: string }[] = [
  { id: 'pulso',    label: 'Pulso',             emoji: '📡', badge: 'Semanal' },
  { id: 'economia', label: 'Economía y Empleo',  emoji: '📈', badge: 'Trimestral' },
  { id: 'perfil',   label: 'Perfil Regional',    emoji: '🏘', badge: 'Censal 2024' },
]

const TAB_COLOR: Record<MainTab, string> = {
  pulso:    '#16a34a',
  economia: '#2563eb',
  perfil:   '#7c3aed',
}

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

const COMP_METRICS = [
  { name: 'tasa_desocupacion', label: 'Desocupación (%)',   yFmt: (v: number) => `${v.toFixed(1)}%`   },
  { name: 'pib_regional',      label: 'PIB Regional (MM$)', yFmt: (v: number) => `${v.toFixed(0)} MM$` },
] as const

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center" style={{ borderBottomWidth: 3, borderBottomColor: color }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 leading-none">{label}</p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1.5 leading-snug">{sub}</p>}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm text-center px-4">{text}</div>
  )
}

function Source({ text, updated }: { text: string; updated?: string }) {
  return (
    <div className="flex items-center justify-between mt-3 gap-4">
      <p className="text-xs text-gray-500">{text}</p>
      {updated && <p className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">↻ {updated}</p>}
    </div>
  )
}

function SectionHeader({ title, subtitle, badge, color = '#374151' }: {
  title: string; subtitle?: string; badge?: string; color?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 pt-1">
      <div className="pl-3 min-w-0" style={{ borderLeft: `3px solid ${color}` }}>
        <h2 className="text-sm font-bold text-gray-800 leading-snug">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      {badge && (
        <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0 whitespace-nowrap"
          style={{ backgroundColor: color + '20', color }}>
          {badge}
        </span>
      )}
    </div>
  )
}

function RegionTable({ rows, currentCod, columns }: {
  rows: RegionMetrics[]
  currentCod: string
  columns: { label: string; fmt: (row: RegionMetrics) => string }[]
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1a1a2e] text-white">
              <th className="text-left px-4 py-2.5 font-medium sticky left-0 bg-[#1a1a2e]">Región</th>
              {columns.map((c, i) => <th key={i} className="text-right px-3 py-2.5 font-medium whitespace-nowrap">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.region_cod}
                className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${row.region_cod === currentCod ? 'bg-blue-50 font-semibold' : ''}`}
                style={row.region_cod === currentCod ? { borderLeft: '4px solid #3b82f6' } : {}}>
                <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{row.region_nombre}</td>
                {columns.map((c, i) => <td key={i} className="px-3 py-2 text-right text-gray-700 whitespace-nowrap">{c.fmt(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { region: Region; onClose: () => void }

export default function IndicadoresModal({ region, onClose }: Props) {
  const [mainTab,         setMainTab]         = useState<MainTab>('pulso')
  const [activeRegionCod, setActiveRegionCod] = useState(region.cod)
  const [pibMode,         setPibMode]         = useState<PibMode>('pct')
  const [openSections,    setOpenSections]    = useState<Set<string>>(new Set(['pobreza']))
  const [tablaDimension,  setTablaDimension]  = useState<TableDimension>('pobreza')

  const activeRegion = REGIONS.find(r => r.cod === activeRegionCod) ?? region
  const zoneColor    = ZONA_COLORS[activeRegion.zona] ?? '#64748b'
  const tabColor     = TAB_COLOR[mainTab]

  const { timeSeries, nationalSeries, metrics, loading } = useRegionIndicadores(activeRegionCod)
  const { data: sectores, latestPeriod: sectPeriod, loading: sectLoading } = usePibSectorial(activeRegionCod)
  const { rows: allLeystop, semana: leystopSemana, loading: secAllLoading } = useColegaSeguridadAll()
  const { history: leystopHistory, loading: secRegLoading } = useColegaSeguridadRegion(activeRegionCod)
  const { series: colegaEmpleo } = useColegaEmpleoRegion(activeRegionCod)
  const { allRegions } = useAllRegionsMetrics()

  const pibData = useMemo(() => {
    const regS = timeSeries.find(s => s.metric_name === 'pib_regional')
    const natS = nationalSeries.find(s => s.metric_name === 'pib_nacional')
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

  function toggleSection(key: string) {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[96vh] flex flex-col overflow-hidden">

        {/* ── Dark header ── */}
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
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400 font-normal ml-0.5">{t.badge}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {mainTab === 'pulso' && (
                <PulsoSection
                  regionCod={activeRegionCod}
                  region={activeRegion}
                  allLeystop={allLeystop}
                  leystopSemana={leystopSemana}
                  leystopHistory={leystopHistory}
                  secLoading={secAllLoading || secRegLoading}
                  colegaEmpleo={colegaEmpleo}
                  empleoData={empleoData}
                  allRegions={allRegions}
                  metrics={metrics}
                  accentColor={tabColor}
                  zoneColor={zoneColor}
                />
              )}
              {mainTab === 'economia' && (
                <EconomiaSection
                  region={activeRegion}
                  pibData={pibData}
                  pibMode={pibMode}
                  setPibMode={setPibMode}
                  metrics={metrics}
                  sectores={sectores}
                  sectPeriod={sectPeriod}
                  sectLoading={sectLoading}
                  colegaEmpleo={colegaEmpleo}
                  empleoData={empleoData}
                  zoneColor={zoneColor}
                />
              )}
              {mainTab === 'perfil' && (
                <PerfilSection
                  metrics={metrics}
                  allRegions={allRegions}
                  regionCod={activeRegionCod}
                  openSections={openSections}
                  toggleSection={toggleSection}
                  tablaDimension={tablaDimension}
                  setTablaDimension={setTablaDimension}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── PULSO ─────────────────────────────────────────────────────────────────────

function PulsoSection({ regionCod, region, allLeystop, leystopSemana, leystopHistory, secLoading,
  colegaEmpleo, empleoData, allRegions, metrics: m, accentColor, zoneColor }: {
  regionCod: string
  region: Region
  allLeystop: LeystopRow[]
  leystopSemana: string
  leystopHistory: LeystopRow[]
  secLoading: boolean
  colegaEmpleo: import('@/lib/hooks/useColegaEmpleo').EmpleoPoint[]
  empleoData: { period: string; regional: number | null; national: number | null }[]
  allRegions: RegionMetrics[]
  metrics: RegionMetrics | null
  accentColor: string
  zoneColor: string
}) {
  const regionRow = allLeystop.find(r => INE_CODE[regionCod] === r.id_region) ?? null
  const latestEmpleo = colegaEmpleo.at(-1)
  const latestNat    = empleoData.at(-1)?.national ?? null

  // Ranking Flash: join allLeystop + allRegions
  const rankingFlash = useMemo(() => {
    return allLeystop.map(row => {
      const rm = allRegions.find(r => INE_CODE[r.region_cod] === row.id_region)
      return {
        nombre:      row.nombre_region,
        id_region:   row.id_region,
        casos:       row.casos_ultima_semana,
        var_sem:     row.var_ultima_semana,
        tasa:        row.tasa_registro,
        delito1:     row.mayor_registro_1,
        desocupacion: rm?.tasa_desocupacion ?? null,
      }
    }).sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))
  }, [allLeystop, allRegions])

  // Sparkline: last 12 weeks of history
  const sparkData = leystopHistory.slice(-12).map(s => ({
    period: s.fecha_hasta_iso,
    tasa:   s.tasa_registro ?? 0,
  }))

  if (secLoading) {
    return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="p-6 space-y-6">

      {/* ── 4 KPI cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Casos última semana"
          value={regionRow?.casos_ultima_semana?.toLocaleString('es-CL') ?? '—'}
          sub={leystopSemana || 'LeyStop'}
          color={accentColor}
        />
        <KpiCard
          label="Var. semana anterior"
          value={regionRow?.var_ultima_semana != null ? `${regionRow.var_ultima_semana > 0 ? '+' : ''}${regionRow.var_ultima_semana.toFixed(1)}%` : '—'}
          sub="vs semana previa"
          color={(regionRow?.var_ultima_semana ?? 0) > 0 ? '#dc2626' : accentColor}
        />
        <KpiCard
          label="Tasa /100k hab."
          value={regionRow?.tasa_registro?.toFixed(0) ?? '—'}
          sub="tasa delictual regional"
          color="#2563eb"
        />
        <KpiCard
          label="Desocupación"
          value={latestEmpleo?.tasa != null ? `${latestEmpleo.tasa.toFixed(1)}%` : pct(m?.tasa_desocupacion)}
          sub={latestEmpleo ? `${latestEmpleo.periodo} · BCE/INE` : 'Censo 2024'}
          color="#0891b2"
        />
      </div>

      {/* ── Seguridad ── */}
      {allLeystop.length > 0 && (
        <div className="space-y-3">
          <SectionHeader
            title="Seguridad"
            subtitle="Top delitos, evolución de la tasa delictual y actividad policial de la región"
            badge={leystopSemana ? `LeyStop · ${leystopSemana}` : 'LeyStop'}
            color={accentColor}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Top 5 delitos */}
          {regionRow && (() => {
            const delitos = [
              { nombre: regionRow.mayor_registro_1, n: regionRow.n_1 },
              { nombre: regionRow.mayor_registro_2, n: regionRow.n_2 },
              { nombre: regionRow.mayor_registro_3, n: regionRow.n_3 },
              { nombre: regionRow.mayor_registro_4, n: regionRow.n_4 },
              { nombre: regionRow.mayor_registro_5, n: regionRow.n_5 },
            ].filter(d => d.nombre)
            const maxN = Math.max(...delitos.map(d => d.n ?? 0), 1)
            return (
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
                  Top 5 delitos — {regionRow.nombre_region} · {leystopSemana}
                </h3>
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
            )
          })()}

          {/* Sparkline evolución tasa */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Evolución tasa /100k — últimas 12 semanas
            </h3>
            {sparkData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={sparkData} margin={{ top: 4, right: 8, left: -24, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="period" tickFormatter={fmtShortDate} tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={2} />
                  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} /100k`, 'Tasa']} labelFormatter={(l) => typeof l === 'string' ? fmtShortDate(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="tasa" fill={accentColor} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState text="Sin histórico disponible aún." />
            )}
            {/* Actividad operativa compacta */}
            {regionRow && (
              <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num(regionRow.controles)}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Controles</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num(regionRow.fiscalizaciones)}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Fiscalizaciones</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num((regionRow.incaut_fuego ?? 0) + (regionRow.incaut_blancas ?? 0))}</p>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Incautaciones</p>
                </div>
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {/* ── Actividad Operativa ── */}
      <div className="space-y-3">
        <SectionHeader
          title="Actividad Operativa"
          subtitle="Controles, fiscalizaciones e incautaciones — comparativa regional por semana"
          badge="LeyStop · Semanal"
          color={accentColor}
        />
        <PulsoActividad regionCod={regionCod} history={leystopHistory} accentColor={accentColor} />
      </div>

      {/* ── Empleo ── */}
      {(colegaEmpleo.length > 0 || empleoData.length > 0) && (() => {
        const mergedTasa = colegaEmpleo.length > 0
          ? colegaEmpleo.map(p => ({ period: p.periodo, regional: p.tasa, national: null as number | null }))
          : empleoData
        const latestTasa = colegaEmpleo.at(-1)?.tasa ?? empleoData.at(-1)?.regional
        return (
          <>
            <SectionHeader
              title="Empleo"
              subtitle="Tasa de desocupación mensual de la región vs. promedio nacional"
              badge="BCE/INE · Mensual"
              color="#0891b2"
            />
            <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {latestTasa != null && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ backgroundColor: zoneColor }}>
                  {region.nombre.split(' ')[0]}: {latestTasa.toFixed(1)}%
                </span>
              )}
              {latestNat != null && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 text-gray-600 font-medium">
                  Nacional: {latestNat.toFixed(1)}%
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={mergedTasa} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                <XAxis dataKey="period" tickFormatter={fmtMonthly} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48} />
                <Tooltip formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : String(value), name === 'regional' ? region.nombre : 'Nacional']} labelFormatter={(l) => typeof l === 'string' ? fmtMonthly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 1.5, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
                {!colegaEmpleo.length && <Line type="monotone" dataKey="national" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
              </LineChart>
            </ResponsiveContainer>
            <Source text="Fuente: BCE/INE — Banco Central de Chile · Actualización mensual" />
          </div>
          </>
        )
      })()}

      {/* ── Ranking Nacional ── */}
      {rankingFlash.length > 0 && (
        <>
          <SectionHeader
            title="Ranking Nacional"
            subtitle="16 regiones ordenadas por tasa delictual — seguridad y desocupación comparados"
            badge="LeyStop + INE"
            color={accentColor}
          />
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-end">
            <span className="text-[10px] text-gray-400">{leystopSemana}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#1a1a2e] text-white">
                  <th className="text-left px-4 py-2.5 font-medium">#</th>
                  <th className="text-left px-3 py-2.5 font-medium">Región</th>
                  <th className="text-right px-3 py-2.5 font-medium">Casos/sem</th>
                  <th className="text-right px-3 py-2.5 font-medium">Var%</th>
                  <th className="text-right px-3 py-2.5 font-medium">Tasa/100k</th>
                  <th className="text-right px-3 py-2.5 font-medium">Desocup%</th>
                  <th className="text-left px-3 py-2.5 font-medium">Delito #1</th>
                </tr>
              </thead>
              <tbody>
                {rankingFlash.map((row, idx) => {
                  const isActive = row.id_region === (allLeystop.find(r => INE_CODE[regionCod] === r.id_region)?.id_region)
                  return (
                    <tr key={row.id_region}
                      className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${isActive ? 'bg-blue-50 font-semibold' : ''}`}
                      style={isActive ? { borderLeft: '4px solid #3b82f6' } : {}}>
                      <td className="px-4 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.nombre}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{num(row.casos)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${(row.var_sem ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {row.var_sem != null ? `${row.var_sem > 0 ? '+' : ''}${row.var_sem.toFixed(1)}%` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.tasa?.toFixed(0) ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.desocupacion != null ? `${row.desocupacion.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2 text-gray-600 max-w-[180px] truncate">{row.delito1 ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}

    </div>
  )
}

// ── Actividad operativa con filtro semana ─────────────────────────────────────

function PulsoActividad({ regionCod, history, accentColor }: {
  regionCod: string
  history: LeystopRow[]
  accentColor: string
}) {
  const [selectedSemana, setSelectedSemana] = useState<number | undefined>(undefined)
  const { rows: allRows, loading } = useColegaSeguridadAll(selectedSemana)
  const regionRow = allRows.find(r => INE_CODE[regionCod] === r.id_region) ?? null

  const semanas = useMemo(() => {
    const seen = new Set<number>()
    return [...history].reverse()
      .filter(h => { if (seen.has(h.id_semana)) return false; seen.add(h.id_semana); return true })
      .map(h => ({ id: h.id_semana, label: `Sem ${h.semana} · hasta ${fmtShortDate(h.fecha_hasta_iso)}` }))
  }, [history])

  const currentSemanaLabel = allRows[0] ? `Semana ${allRows[0].semana}` : ''
  const chartData = [...allRows]
    .sort((a, b) => (b.controles ?? 0) - (a.controles ?? 0))
    .map(row => ({ nombre: row.nombre_region, controles: row.controles ?? 0, id_region: row.id_region }))

  if (allRows.length === 0 && !loading) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Semana:</label>
          <select
            value={selectedSemana ?? ''}
            onChange={e => setSelectedSemana(e.target.value ? Number(e.target.value) : undefined)}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
          >
            <option value="">Última semana</option>
            {semanas.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {currentSemanaLabel && <span className="text-xs text-gray-400">{currentSemanaLabel}</span>}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-20"><div className="w-6 h-6 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {regionRow && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Controles"          value={num(regionRow.controles)}                                              sub="Identidad + Vehicular" color={accentColor} />
              <KpiCard label="Fiscalizaciones"     value={num(regionRow.fiscalizaciones)}                                        sub="Alcohol + Banca"       color="#2563eb" />
              <KpiCard label="Incautaciones armas" value={num((regionRow.incaut_fuego ?? 0) + (regionRow.incaut_blancas ?? 0))} sub="Fuego + Blancas"       color="#dc2626" />
              <KpiCard label="Decomisos"           value={regionRow.decomisos_anno != null ? `${regionRow.decomisos_anno.toFixed(0)} kg` : '—'} sub="Año a la fecha" color="#9333ea" />
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Controles totales por región</h4>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={130} />
                  <Tooltip formatter={(v: unknown) => [Number(v).toLocaleString('es-CL'), 'Controles']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Bar dataKey="controles" radius={[0, 3, 3, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.id_region === regionRow?.id_region ? accentColor : '#86efac'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1a1a2e] text-white">
                    <th className="text-left px-4 py-2.5 font-medium">Región</th>
                    <th className="text-right px-3 py-2.5 font-medium">Controles</th>
                    <th className="text-right px-3 py-2.5 font-medium">Fiscalizaciones</th>
                    <th className="text-right px-3 py-2.5 font-medium">Incautaciones</th>
                    <th className="text-right px-3 py-2.5 font-medium">Decomisos (kg)</th>
                    <th className="text-right px-3 py-2.5 font-medium">Allanamientos</th>
                  </tr>
                </thead>
                <tbody>
                  {[...allRows].sort((a, b) => (b.controles ?? 0) - (a.controles ?? 0)).map(row => (
                    <tr key={row.id_region}
                      className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${row.id_region === regionRow?.id_region ? 'bg-blue-50 font-semibold' : ''}`}
                      style={row.id_region === regionRow?.id_region ? { borderLeft: '4px solid #3b82f6' } : {}}>
                      <td className="px-4 py-2 text-gray-800 whitespace-nowrap">{row.nombre_region}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{num(row.controles)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{num(row.fiscalizaciones)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{num((row.incaut_fuego ?? 0) + (row.incaut_blancas ?? 0))}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{row.decomisos_anno != null ? row.decomisos_anno.toFixed(0) : '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{num(row.allanamientos_anno)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── ECONOMÍA Y EMPLEO ─────────────────────────────────────────────────────────

type PibSectorT = import('@/lib/hooks/usePibSectorial').PibSector

function EconomiaSection({ region, pibData, pibMode, setPibMode, metrics: m, sectores, sectPeriod,
  sectLoading, colegaEmpleo, empleoData, zoneColor }: {
  region: Region
  pibData: { period: string; regional: number | null; national: number | null }[]
  pibMode: PibMode
  setPibMode: (m: PibMode) => void
  metrics: RegionMetrics | null
  sectores: PibSectorT[]
  sectPeriod: string | null
  sectLoading: boolean
  colegaEmpleo: import('@/lib/hooks/useColegaEmpleo').EmpleoPoint[]
  empleoData: { period: string; regional: number | null; national: number | null }[]
  zoneColor: string
}) {
  const latestReg  = pibData.at(-1)?.regional ?? null
  const lastPeriod = pibData.at(-1)?.period ?? sectPeriod ?? null
  const updatedLabel = lastPeriod ? `Último dato: ${fmtQuarterly(lastPeriod)}` : undefined
  const pibYFmt = (v: number) => pibMode === 'pct' ? `${v.toFixed(2)}%` : `${v.toFixed(0)} MM$`

  const latestColega = colegaEmpleo.at(-1)
  const latestNat    = empleoData.at(-1)?.national ?? null
  const mergedTasa   = colegaEmpleo.length > 0
    ? colegaEmpleo.map(p => ({ period: p.periodo, regional: p.tasa, national: null as number | null }))
    : empleoData
  const latestTasa = colegaEmpleo.at(-1)?.tasa ?? empleoData.at(-1)?.regional

  return (
    <div className="p-6 space-y-6">

      {/* KPI cards */}
      {m && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="PIB Regional"         value={m.pib_regional != null ? `${m.pib_regional.toLocaleString('es-CL')} MM$` : '—'} sub="Miles de millones de pesos" color="#2563eb" />
          <KpiCard label="% del PIB Nacional"   value={pct(m.pct_pib_nacional)}                                                         sub="Participación regional"     color="#2563eb" />
          <KpiCard label="Variación interanual" value={m.variacion_interanual != null ? `${m.variacion_interanual > 0 ? '+' : ''}${m.variacion_interanual.toFixed(1)}%` : '—'} sub="Crecimiento anual" color={m.variacion_interanual != null && m.variacion_interanual < 0 ? '#dc2626' : '#16a34a'} />
          <KpiCard label="Inversión pública"    value={m.inversion_publica_ejecutada != null ? `${m.inversion_publica_ejecutada.toLocaleString('es-CL')} MM$` : '—'} sub="Ejecutado" color="#0891b2" />
          <KpiCard label="FNDR"                 value={m.inversion_fndr != null ? `${m.inversion_fndr.toLocaleString('es-CL')} MM$` : '—'} sub="Fondo Nacional de Desarrollo Regional" color="#0891b2" />
          <KpiCard label="Tasa desocupación"    value={latestColega?.tasa != null ? `${latestColega.tasa.toFixed(1)}%` : pct(m?.tasa_desocupacion)} sub={latestColega ? `${latestColega.periodo} · BCE/INE` : 'último dato'} color="#0891b2" />
        </div>
      )}

      {/* PIB evolution */}
      <SectionHeader
        title="PIB Regional"
        subtitle="Evolución histórica y participación en el PIB nacional"
        badge="BCCh · Trimestral"
        color="#2563eb"
      />
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex gap-1 bg-gray-50 rounded-lg p-0.5 border border-gray-200">
            <button onClick={() => setPibMode('pct')} className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${pibMode === 'pct' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>% Nacional</button>
            <button onClick={() => setPibMode('mm')}  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${pibMode === 'mm'  ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>MM$</button>
          </div>
          {latestReg != null && (
            <span className="text-xs px-3 py-1.5 rounded-full font-semibold text-white" style={{ backgroundColor: zoneColor }}>
              {region.nombre.split(' ')[0]}: {pibYFmt(latestReg)}
            </span>
          )}
        </div>
        {pibData.length === 0 && pibMode === 'pct' ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <p className="text-xs text-amber-700">
              <span className="font-semibold">PIB nacional no disponible aún</span> — requiere sync de Banco Central (serie F032.PIB). Cambia a{' '}
              <button onClick={() => setPibMode('mm')} className="underline font-semibold">MM$</button> para ver la evolución regional.
            </p>
          </div>
        ) : pibData.length === 0 ? (
          <EmptyState text="Sin datos de PIB regional. Requiere sync de Banco Central." />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={pibData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="period" tickFormatter={fmtQuarterly} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={pibYFmt} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={54} />
              <Tooltip formatter={(value, name) => [typeof value === 'number' ? pibYFmt(value) : String(value), name === 'regional' ? region.nombre : 'Promedio Nacional']} labelFormatter={(l) => typeof l === 'string' ? fmtQuarterly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 2, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
              {pibMode === 'mm' && <Line type="monotone" dataKey="national" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
        )}
        <Source text="Fuente: Banco Central de Chile · Actualización trimestral" updated={updatedLabel} />
      </div>

      {/* Sectores productivos */}
      <SectionHeader
        title="Sectores Productivos"
        subtitle="Composición del PIB regional por actividad económica"
        badge={sectPeriod ? `BCCh · ${fmtQuarterly(sectPeriod)}` : 'BCCh'}
        color="#2563eb"
      />
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        {sectLoading ? (
          <div className="flex items-center justify-center h-40"><div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : sectores.length === 0 ? (
          <EmptyState text="Datos sectoriales no disponibles aún. Las series de PIB por sector están pendientes de configuración." />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, sectores.length * 30)}>
            <BarChart data={sectores} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v.toFixed(0)} MM$`} />
              <YAxis type="category" dataKey="sector" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={140} />
              <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} MM$`, 'PIB']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Bar dataKey="value" fill="#2563eb" radius={[0, 3, 3, 0]}>
                {sectores.map((_, i) => <Cell key={i} fill={`hsl(${220 + i * 8}, 70%, ${55 - i * 2}%)`} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <Source text="Fuente: Banco Central de Chile · Miles de millones de pesos encadenados base 2018" updated={sectPeriod ? `Último dato: ${fmtQuarterly(sectPeriod)}` : undefined} />
      </div>

      {/* Empleo evolution */}
      {mergedTasa.length > 0 && (
        <>
          <SectionHeader
            title="Evolución del Empleo"
            subtitle="Tasa de desocupación mensual y número de personas ocupadas"
            badge="BCE/INE · Mensual"
            color="#0891b2"
          />
          <div className="bg-white rounded-xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {latestTasa != null && (
              <span className="text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ backgroundColor: zoneColor }}>
                {region.nombre.split(' ')[0]}: {latestTasa.toFixed(1)}%
              </span>
            )}
            {latestNat != null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 text-gray-600 font-medium">
                Nacional: {latestNat.toFixed(1)}%
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={mergedTasa} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis dataKey="period" tickFormatter={fmtMonthly} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(1)}%`} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(value, name) => [typeof value === 'number' ? `${value.toFixed(1)}%` : String(value), name === 'regional' ? region.nombre : 'Nacional']} labelFormatter={(l) => typeof l === 'string' ? fmtMonthly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 1.5, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
              {!colegaEmpleo.length && <Line type="monotone" dataKey="national" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls />}
            </LineChart>
          </ResponsiveContainer>
          {colegaEmpleo.length > 0 && colegaEmpleo.some(p => p.ocupados != null) && (
            <>
              <h4 className="text-sm font-semibold text-gray-700 mt-6 mb-4">Ocupados — miles de personas</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={colegaEmpleo} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
                  <XAxis dataKey="periodo" tickFormatter={fmtMonthly} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => `${v.toFixed(0)}k`} />
                  <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)} mil`, 'Ocupados']} labelFormatter={(l) => typeof l === 'string' ? fmtMonthly(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                  <Line type="monotone" dataKey="ocupados" stroke="#0891b2" strokeWidth={2.5} dot={{ r: 1.5, fill: '#0891b2' }} activeDot={{ r: 5 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </>
          )}
          <Source text="Fuente: BCE/INE — Banco Central de Chile · Actualización mensual" updated={latestColega?.periodo ? `Último dato: ${fmtMonthly(latestColega.periodo)}` : undefined} />
          </div>
        </>
      )}

      {/* Comparar regiones */}
      <SectionHeader
        title="Comparar Regiones"
        subtitle="Evolución histórica de indicadores económicos — 16 regiones en paralelo"
        badge="BCCh · BCE/INE"
        color="#2563eb"
      />
      <CompararRegiones region={region} zoneColor={zoneColor} />
    </div>
  )
}

// ── Comparar regiones (multi-line) ────────────────────────────────────────────

function CompararRegiones({ region, zoneColor }: { region: Region; zoneColor: string }) {
  const [activeMetric, setActiveMetric] = useState<string>(COMP_METRICS[0].name)
  const [visible, setVisible] = useState<Set<string>>(() => new Set(REGIONS.map(r => r.cod)))

  const { data, loading } = useAllRegionsMetric(activeMetric)
  const metricCfg = COMP_METRICS.find(m => m.name === activeMetric) ?? COMP_METRICS[0]

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

  const lastP = data.at(0)?.data.at(-1)?.period
  const updTxt = lastP ? (activeMetric === 'pib_regional' ? `Último dato: ${fmtQuarterly(lastP)}` : `Último dato: ${fmtMonthly(lastP)}`) : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
            {COMP_METRICS.map(m => (
              <button key={m.name} onClick={() => setActiveMetric(m.name)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${activeMetric === m.name ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {m.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500">{visible.size} de 16</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64"><div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis dataKey="period" tickFormatter={fmtP} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#E5E7EB' }} interval="preserveStartEnd" />
              <YAxis tickFormatter={metricCfg.yFmt} tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} width={60} />
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

      <Source text="Fuente: Banco Central de Chile · Actualización mensual / trimestral" updated={updTxt} />
    </div>
  )
}

// ── PERFIL REGIONAL ───────────────────────────────────────────────────────────

const TABLA_CONFIGS: Record<TableDimension, { label: string; columns: { label: string; fmt: (r: RegionMetrics) => string }[] }> = {
  pobreza: {
    label: 'Pobreza',
    columns: [
      { label: 'Pobreza ingresos %',  fmt: r => pct(r.pct_pobreza_ingresos) },
      { label: 'Extrema %',           fmt: r => pct(r.pct_pobreza_extrema) },
      { label: 'Multidimensional %',  fmt: r => pct(r.pct_pobreza_multidimensional) },
      { label: 'Severa %',            fmt: r => pct(r.pct_pobreza_severa) },
    ],
  },
  salud: {
    label: 'Salud',
    columns: [
      { label: 'FONASA %',       fmt: r => pct(r.pct_fonasa) },
      { label: 'Hospitales',     fmt: r => num(r.hospitales_n) },
      { label: 'Camas/1000 hab', fmt: r => r.camas_por_1000_hab != null ? r.camas_por_1000_hab.toFixed(1) : '—' },
      { label: 'Lista espera',   fmt: r => num(r.lista_espera_n) },
    ],
  },
  vivienda: {
    label: 'Vivienda',
    columns: [
      { label: 'Hacinamiento %',  fmt: r => pct(r.pct_viv_hacinadas) },
      { label: 'Agua pública %',  fmt: r => pct(r.pct_acceso_agua_publica) },
      { label: 'Tenencia arr. %', fmt: r => pct(r.pct_tenencia_arrendada) },
      { label: 'Déficit hab.',    fmt: r => num(r.n_deficit_cuantitativo) },
    ],
  },
  educacion: {
    label: 'Educación',
    columns: [
      { label: 'Educ. superior %',   fmt: r => pct(r.pct_educacion_superior) },
      { label: 'Años escolaridad',    fmt: r => r.anios_escolaridad_promedio != null ? `${r.anios_escolaridad_promedio.toFixed(1)} años` : '—' },
      { label: 'Cobertura parvul. %', fmt: r => pct(r.cobertura_parvularia_pct) },
    ],
  },
  conectividad: {
    label: 'Conectividad',
    columns: [
      { label: 'Internet hogares %', fmt: r => pct(r.pct_hogares_internet) },
      { label: 'Internet móvil %',   fmt: r => pct(r.pct_internet_movil) },
      { label: 'Internet fijo %',    fmt: r => pct(r.pct_internet_fijo) },
      { label: 'Loc. aisladas',      fmt: r => num(r.localidades_aisladas_n) },
    ],
  },
  victimizacion: {
    label: 'Victimización',
    columns: [
      { label: 'Víctimas DMCS %', fmt: r => pct(r.pct_hogares_victimas_dmcs) },
      { label: 'Perc. inseg. %',  fmt: r => pct(r.pct_percepcion_inseguridad) },
      { label: 'Denuncias /100k', fmt: r => r.tasa_denuncias_100k != null ? r.tasa_denuncias_100k.toFixed(0) : '—' },
      { label: 'Delitos /100k',   fmt: r => r.tasa_delitos_100k != null ? r.tasa_delitos_100k.toFixed(0) : '—' },
    ],
  },
}

function Accordion({ title, badge, isOpen, onToggle, children }: {
  title: string; badge?: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center justify-between px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors text-left">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">{title}</span>
          {badge && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">{badge}</span>}
        </div>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
          <path d="M2 4l5 5 5-5" />
        </svg>
      </button>
      {isOpen && <div className="px-5 pb-5 pt-2 bg-white border-t border-gray-100 space-y-4">{children}</div>}
    </div>
  )
}

function PerfilSection({ metrics: m, allRegions, regionCod, openSections, toggleSection, tablaDimension, setTablaDimension }: {
  metrics: RegionMetrics | null
  allRegions: RegionMetrics[]
  regionCod: string
  openSections: Set<string>
  toggleSection: (key: string) => void
  tablaDimension: TableDimension
  setTablaDimension: (d: TableDimension) => void
}) {
  const PURPLE = '#7c3aed'
  const ROSE   = '#be185d'

  function makeBarChart(
    data: { nombre: string; valor: number; cod: string }[],
    color: string,
    accentColor: string,
    unit = '%'
  ) {
    const avg = data.reduce((s, r) => s + r.valor, 0) / (data.length || 1)
    return (
      <ResponsiveContainer width="100%" height={360}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} unit={unit} />
          <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={130} />
          <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(1)}${unit}`, '']} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
          <ReferenceLine x={avg} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `Prom ${avg.toFixed(1)}${unit}`, position: 'top', fontSize: 9, fill: '#f59e0b' }} />
          <Bar dataKey="valor" radius={[0, 3, 3, 0]}>
            {data.map((entry, i) => <Cell key={i} fill={entry.cod === regionCod ? accentColor : color} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="p-6 space-y-4">

      {/* Resumen demográfico — KpiCards, misma gramática que Pulso y Economía */}
      {m && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          <KpiCard label="Habitantes"    value={num(m.poblacion_total)}     sub="Censo 2024"      color={PURPLE} />
          <KpiCard label="Urbana"        value={pct(m.pct_urbana)}          sub="% de la población" color={PURPLE} />
          <KpiCard label="60+ años"      value={pct(m.pct_edad_60_mas)}     sub="% de la población" color={PURPLE} />
          <KpiCard label="Inmigrantes"   value={pct(m.pct_inmigrantes)}     sub="% de la población" color={PURPLE} />
          <KpiCard label="Pueblos orig." value={pct(m.pct_indigena)}        sub="% de la población" color={PURPLE} />
          <KpiCard label="Jef. femenina" value={pct(m.pct_jefatura_mujer)}  sub="% de hogares"      color={PURPLE} />
        </div>
      )}

      {/* Indicadores Sociales */}
      <SectionHeader
        title="Indicadores Sociales"
        subtitle="Dimensiones de desarrollo humano: pobreza, salud, vivienda, educación, conectividad y victimización"
        badge="CASEN 2024 · Censo 2024"
        color={PURPLE}
      />

      {/* Pobreza */}
      <Accordion title="Pobreza y Vulnerabilidad" badge="CASEN 2024" isOpen={openSections.has('pobreza')} onToggle={() => toggleSection('pobreza')}>
        {!m ? <EmptyState text="Sin datos CASEN." /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Pobreza por ingresos"     value={pct(m.pct_pobreza_ingresos)}         sub="% de personas" color={ROSE} />
              <KpiCard label="Pobreza extrema"          value={pct(m.pct_pobreza_extrema)}          sub="% de personas" color={ROSE} />
              <KpiCard label="Pobreza multidimensional" value={pct(m.pct_pobreza_multidimensional)} sub="% de hogares"  color={ROSE} />
              <KpiCard label="Pobreza severa"           value={pct(m.pct_pobreza_severa)}           sub="% de hogares"  color={ROSE} />
            </div>
            {allRegions.length > 0 && makeBarChart(
              [...allRegions].filter(r => r.pct_pobreza_ingresos != null)
                .sort((a, b) => (b.pct_pobreza_ingresos ?? 0) - (a.pct_pobreza_ingresos ?? 0))
                .map(r => ({ nombre: r.region_nombre, valor: r.pct_pobreza_ingresos ?? 0, cod: r.region_cod })),
              '#fda4af', ROSE
            )}
            <Source text="Fuente: CASEN 2024 — Ministerio de Desarrollo Social" updated="CASEN 2024" />
          </>
        )}
      </Accordion>

      {/* Salud */}
      <Accordion title="Salud" badge="FONASA / DEIS" isOpen={openSections.has('salud')} onToggle={() => toggleSection('salud')}>
        {!m ? <EmptyState text="Sin datos de salud." /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Cobertura FONASA"     value={pct(m.pct_fonasa)}            sub="% de la población"     color={ROSE} />
              <KpiCard label="Hospitales"            value={num(m.hospitales_n)}           sub="establecimientos"      color={ROSE} />
              <KpiCard label="Camas por 1.000 hab." value={fmt(m.camas_por_1000_hab, 1)} sub="capacidad hospitalaria" color={ROSE} />
              <KpiCard label="Lista de espera"       value={num(m.lista_espera_n)}         sub="personas en espera"    color={ROSE} />
            </div>
            {allRegions.length > 0 && makeBarChart(
              [...allRegions].filter(r => r.pct_fonasa != null)
                .sort((a, b) => (b.pct_fonasa ?? 0) - (a.pct_fonasa ?? 0))
                .map(r => ({ nombre: r.region_nombre, valor: r.pct_fonasa ?? 0, cod: r.region_cod })),
              '#fda4af', ROSE
            )}
            <Source text="Fuente: FONASA / DEIS Ministerio de Salud" />
          </>
        )}
      </Accordion>

      {/* Vivienda */}
      <Accordion title="Vivienda" badge="Censo 2024" isOpen={openSections.has('vivienda')} onToggle={() => toggleSection('vivienda')}>
        {!m ? <EmptyState text="Sin datos de vivienda." /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Déficit habitacional" value={num(m.n_deficit_cuantitativo)} sub="unidades"       color={PURPLE} />
              <KpiCard label="Hacinamiento"          value={pct(m.pct_viv_hacinadas)}      sub="de viviendas"   color={PURPLE} />
              <KpiCard label="Acceso agua pública"   value={pct(m.pct_acceso_agua_publica)} sub="de viviendas"  color={PURPLE} />
              <KpiCard label="Tenencia arrendada"    value={pct(m.pct_tenencia_arrendada)} sub="de hogares"     color={PURPLE} />
            </div>
            {allRegions.length > 0 && makeBarChart(
              [...allRegions].filter(r => r.pct_viv_hacinadas != null)
                .sort((a, b) => (b.pct_viv_hacinadas ?? 0) - (a.pct_viv_hacinadas ?? 0))
                .map(r => ({ nombre: r.region_nombre, valor: r.pct_viv_hacinadas ?? 0, cod: r.region_cod })),
              '#c4b5fd', PURPLE
            )}
            <Source text="Fuente: Censo 2024 — INE Chile" updated="Censo 2024" />
          </>
        )}
      </Accordion>

      {/* Educación */}
      <Accordion title="Educación" badge="Censo 2024" isOpen={openSections.has('educacion')} onToggle={() => toggleSection('educacion')}>
        {!m ? <EmptyState text="Sin datos de educación." /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard label="Educación superior"     value={pct(m.pct_educacion_superior)}              sub="de la población"   color={PURPLE} />
              <KpiCard label="Años escolaridad (18+)" value={`${fnum(m.anios_escolaridad_promedio)} años`} sub="promedio"         color={PURPLE} />
              <KpiCard label="Cobertura parvularia"   value={pct(m.cobertura_parvularia_pct)}             sub="de niños en edad" color={PURPLE} />
            </div>
            {allRegions.length > 0 && makeBarChart(
              [...allRegions].filter(r => r.pct_educacion_superior != null)
                .sort((a, b) => (b.pct_educacion_superior ?? 0) - (a.pct_educacion_superior ?? 0))
                .map(r => ({ nombre: r.region_nombre, valor: r.pct_educacion_superior ?? 0, cod: r.region_cod })),
              '#c4b5fd', PURPLE
            )}
            <Source text="Fuente: Censo 2024 — INE Chile" updated="Censo 2024" />
          </>
        )}
      </Accordion>

      {/* Conectividad */}
      <Accordion title="Conectividad" badge="Censo 2024" isOpen={openSections.has('conectividad')} onToggle={() => toggleSection('conectividad')}>
        {!m ? <EmptyState text="Sin datos de conectividad." /> : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <KpiCard label="Hogares con internet"   value={pct(m.pct_hogares_internet)}    sub="del total de hogares"     color={PURPLE} />
              <KpiCard label="Internet móvil"          value={pct(m.pct_internet_movil)}      sub="cobertura"                color={PURPLE} />
              <KpiCard label="Internet fijo"           value={pct(m.pct_internet_fijo)}       sub="cobertura"                color={PURPLE} />
              <KpiCard label="Acceso agua pública"     value={pct(m.pct_acceso_agua_publica)} sub="de viviendas"             color={PURPLE} />
              <KpiCard label="Localidades aisladas"    value={num(m.localidades_aisladas_n)}  sub="con dificultad de acceso" color={PURPLE} />
            </div>
            {allRegions.length > 0 && (() => {
              const chartData = [...allRegions]
                .filter(r => r.pct_hogares_internet != null)
                .sort((a, b) => (b.pct_hogares_internet ?? 0) - (a.pct_hogares_internet ?? 0))
                .map(r => ({ nombre: r.region_nombre, internet: r.pct_hogares_internet ?? 0, movil: r.pct_internet_movil ?? 0, fijo: r.pct_internet_fijo ?? 0, cod: r.region_cod }))
              return (
                <>
                  <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} unit="%" />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip formatter={(v: unknown, name) => [`${Number(v).toFixed(1)}%`, String(name)]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="internet" name="Hogares c/internet" fill="#7c3aed" />
                      <Bar dataKey="movil"    name="Internet móvil"     fill="#a78bfa" />
                      <Bar dataKey="fijo"     name="Internet fijo"      fill="#ddd6fe" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    {[['#7c3aed','Hogares c/internet'],['#a78bfa','Internet móvil'],['#ddd6fe','Internet fijo']].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor:color}}/><span className="text-[10px] text-gray-600">{label}</span></div>
                    ))}
                  </div>
                </>
              )
            })()}
            <Source text="Fuente: Censo 2024 — INE Chile" updated="Censo 2024" />
          </>
        )}
      </Accordion>

      {/* Victimización */}
      <Accordion title="Victimización" badge="ENUSC 2022" isOpen={openSections.has('victimizacion')} onToggle={() => toggleSection('victimizacion')}>
        {!m ? <EmptyState text="Sin datos de victimización." /> : (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-700"><span className="font-semibold">Nota:</span> Indicadores de la ENUSC 2022 — realizada por INE, independiente de CASEN.</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Hogares víctimas (DMCS)" value={pct(m.pct_hogares_victimas_dmcs)}      sub="% hogares · ENUSC 2022"    color={ROSE} />
              <KpiCard label="Percepción inseguridad"  value={pct(m.pct_percepcion_inseguridad)}     sub="% personas · ENUSC 2022"   color={ROSE} />
              <KpiCard label="Tasa denuncias"          value={fmt(m.tasa_denuncias_100k, 0, ' /100k')} sub="por 100.000 hab."        color={ROSE} />
              <KpiCard label="Tasa delitos"            value={fmt(m.tasa_delitos_100k, 0, ' /100k')} sub="por 100.000 hab."          color={ROSE} />
            </div>
            {allRegions.length > 0 && (() => {
              const chartData = [...allRegions]
                .filter(r => r.pct_hogares_victimas_dmcs != null)
                .sort((a, b) => (b.pct_hogares_victimas_dmcs ?? 0) - (a.pct_hogares_victimas_dmcs ?? 0))
                .map(r => ({ nombre: r.region_nombre, victimas: r.pct_hogares_victimas_dmcs ?? 0, percepcion: r.pct_percepcion_inseguridad ?? 0, cod: r.region_cod }))
              return (
                <>
                  <ResponsiveContainer width="100%" height={380}>
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: '#6b7280' }} tickLine={false} axisLine={false} unit="%" />
                      <YAxis type="category" dataKey="nombre" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} width={130} />
                      <Tooltip formatter={(v: unknown, name) => [`${Number(v).toFixed(1)}%`, String(name)]} contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }} />
                      <Bar dataKey="victimas"   name="Hogares víctimas DMCS %" fill={ROSE}    />
                      <Bar dataKey="percepcion" name="Percepción inseguridad %" fill="#fda4af" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 mt-2">
                    {[[ROSE,'Hogares víctimas DMCS'],['#fda4af','Percepción inseguridad']].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm" style={{backgroundColor:color}}/><span className="text-[10px] text-gray-600">{label}</span></div>
                    ))}
                  </div>
                </>
              )
            })()}
            <Source text="Fuente: ENUSC 2022 — INE Chile" updated="ENUSC 2022" />
          </>
        )}
      </Accordion>

      {/* Tabla Maestra */}
      {allRegions.length > 0 && (
        <>
          <SectionHeader
            title="Comparativa Nacional"
            subtitle="Comparar las 16 regiones en la dimensión seleccionada"
            badge="CASEN 2024 · Censo 2024"
            color={PURPLE}
          />
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-end flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Dimensión:</span>
              <select
                value={tablaDimension}
                onChange={e => setTablaDimension(e.target.value as TableDimension)}
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {(Object.keys(TABLA_CONFIGS) as TableDimension[]).map(k => (
                  <option key={k} value={k}>{TABLA_CONFIGS[k].label}</option>
                ))}
              </select>
            </div>
          </div>
          <RegionTable
            rows={allRegions}
            currentCod={regionCod}
            columns={TABLA_CONFIGS[tablaDimension].columns}
          />
          </div>
        </>
      )}
    </div>
  )
}
