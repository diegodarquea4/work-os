'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts'
import { useRegionIndicadores } from '@/lib/hooks/useRegionIndicadores'
import { useAllRegionsMetric } from '@/lib/hooks/useAllRegionsMetric'
import { ZONA_COLORS, REGIONS } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { MetricSeries, RegionMetrics, SecurityWeekly } from '@/lib/types'

// ── Tab types ─────────────────────────────────────────────────────────────────

type MainTab    = 'seguridad' | 'economia' | 'censo' | 'comparar'
type SecSubTab  = 'resumen'   | 'evolucion'
type CensoSub   = 'demografia' | 'vivienda' | 'educacion'
type ActiveM    = 'tasa_desocupacion' | 'pib_regional' | 'tasa_delictual'
type PibMode    = 'pct' | 'mm'

// ── Config ────────────────────────────────────────────────────────────────────

const MAIN_TABS: { id: MainTab; label: string; emoji: string }[] = [
  { id: 'seguridad', label: 'Seguridad Pública', emoji: '🛡' },
  { id: 'economia',  label: 'PIB Regional',       emoji: '📈' },
  { id: 'censo',     label: 'Censo 2024',          emoji: '🏘' },
  { id: 'comparar',  label: 'Comparar',            emoji: '📊' },
]

const TAB_COLOR: Record<MainTab, string> = {
  seguridad: '#16a34a',
  economia:  '#2563eb',
  censo:     '#7c3aed',
  comparar:  '#475569',
}

const METRIC_CFG = {
  tasa_desocupacion: { label: 'Desocupación',    yFmt: (v: number) => `${v.toFixed(1)}%` },
  pib_regional:      { label: 'PIB Regional',    yFmt: (v: number, m?: PibMode) => m === 'pct' ? `${v.toFixed(2)}%` : `${v.toFixed(0)} MM$` },
  tasa_delictual:    { label: 'Tasa Delictual',  yFmt: (v: number) => `${v.toFixed(0)}/100k` },
}

// Region colors for comparison chart (zone-aware palette)
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

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string
}) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5 leading-none">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1.5 leading-snug">{sub}</p>}
    </div>
  )
}

// ── Sub-tab bar ───────────────────────────────────────────────────────────────

function SubTabs<T extends string>({
  tabs, active, onChange,
}: { tabs: { id: T; label: string }[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="flex gap-0 border-b border-gray-200 mb-5">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`text-sm px-4 py-2.5 font-medium border-b-2 transition-colors -mb-px ${
            active === t.id
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm text-center px-4">
      {text}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = { region: Region; onClose: () => void }

export default function IndicadoresModal({ region, onClose }: Props) {
  const [mainTab,   setMainTab]   = useState<MainTab>('seguridad')
  const [secSub,    setSecSub]    = useState<SecSubTab>('resumen')
  const [censoSub,  setCensoSub]  = useState<CensoSub>('demografia')
  const [metric,    setMetric]    = useState<ActiveM>('tasa_desocupacion')
  const [pibMode,   setPibMode]   = useState<PibMode>('pct')

  const { timeSeries, nationalSeries, security, metrics, loading } =
    useRegionIndicadores(region.cod)

  const zoneColor = ZONA_COLORS[region.zona] ?? '#64748b'
  const tabColor  = TAB_COLOR[mainTab]

  // ── Economy chart data ───────────────────────────────────────────────────
  const econData = useMemo(() => {
    const regS = timeSeries.find(s => s.metric_name === metric)
    const natS = nationalSeries.find(s => s.metric_name === metric)
    if (!regS) return []
    const natMap = new Map((natS?.data ?? []).map(d => [d.period, d.value]))

    if (metric === 'pib_regional' && pibMode === 'pct') {
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
  }, [timeSeries, nationalSeries, metric, pibMode])

  // ── Security evolution (tasa_delictual time series) ──────────────────────
  const secEvolution = useMemo(() => {
    const s = timeSeries.find(s => s.metric_name === 'tasa_delictual')
    if (!s) return []
    return s.data.slice(-24).map(d => ({ period: d.period, value: d.value }))
  }, [timeSeries])

  const latestReg = econData.at(-1)?.regional ?? null
  const latestNat = econData.at(-1)?.national ?? null
  const econYFmt  = (v: number) =>
    metric === 'pib_regional'
      ? METRIC_CFG.pib_regional.yFmt(v, pibMode)
      : METRIC_CFG[metric].yFmt(v)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Dark header + tab nav ── */}
        <div className="flex-shrink-0 bg-[#1a1a2e] rounded-t-2xl">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor }} />
              <span className="text-white font-semibold text-sm">{region.nombre}</span>
              <span className="text-gray-500 text-xs">· Dashboard Regional</span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded"
              aria-label="Cerrar"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l12 12M14 2L2 14" />
              </svg>
            </button>
          </div>

          {/* Main tab bar */}
          <nav className="flex mt-3 px-2 overflow-x-auto">
            {MAIN_TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setMainTab(t.id)}
                className={`flex items-center gap-1.5 text-sm px-4 py-2.5 font-medium transition-colors whitespace-nowrap border-b-2 rounded-t-md ${
                  mainTab === t.id
                    ? 'text-white border-white bg-white/10'
                    : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5'
                }`}
              >
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
                  security={security}
                  evolutionData={secEvolution}
                  subTab={secSub}
                  setSubTab={setSecSub}
                  accentColor={tabColor}
                />
              )}
              {mainTab === 'economia' && (
                <EconomiaSection
                  region={region}
                  timeSeries={timeSeries}
                  chartData={econData}
                  metric={metric}
                  pibMode={pibMode}
                  setMetric={setMetric}
                  setPibMode={setPibMode}
                  yFmt={econYFmt}
                  latestReg={latestReg}
                  latestNat={latestNat}
                  zoneColor={zoneColor}
                />
              )}
              {mainTab === 'censo' && metrics && (
                <CensoSection
                  metrics={metrics}
                  subTab={censoSub}
                  setSubTab={setCensoSub}
                />
              )}
              {mainTab === 'censo' && !metrics && (
                <div className="p-6">
                  <EmptyState text="Sin datos de Censo 2024. Los datos se actualizan con el sync semanal." />
                </div>
              )}
              {mainTab === 'comparar' && (
                <CompararSection region={region} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Seguridad ─────────────────────────────────────────────────────────────────

function SeguridadSection({ security: s, evolutionData, subTab, setSubTab, accentColor }: {
  security: SecurityWeekly | null
  evolutionData: { period: string; value: number }[]
  subTab: SecSubTab
  setSubTab: (t: SecSubTab) => void
  accentColor: string
}) {
  const noData = !s && evolutionData.length === 0
  const SUB = [
    { id: 'resumen'   as SecSubTab, label: 'Resumen por región' },
    { id: 'evolucion' as SecSubTab, label: 'Evolución temporal' },
  ]

  return (
    <div className="p-6">
      {noData ? (
        <EmptyState text="Sin datos de seguridad disponibles. Los datos de LeyStop se actualizan automáticamente cada lunes." />
      ) : (
        <>
          <SubTabs tabs={SUB} active={subTab} onChange={setSubTab} />
          {subTab === 'resumen' && (
            s ? <SeguridadResumen security={s} accentColor={accentColor} />
              : <EmptyState text="Sin snapshot de seguridad para esta región." />
          )}
          {subTab === 'evolucion' && (
            evolutionData.length > 0
              ? <SeguridadEvolucion data={evolutionData} />
              : <EmptyState text="Sin histórico de tasa delictual. Requiere sync previo." />
          )}
        </>
      )}
    </div>
  )
}

function SeguridadResumen({ security: s, accentColor }: { security: SecurityWeekly; accentColor: string }) {
  const varPos = (s.var_semana_pct ?? 0) > 0
  const varColor = varPos ? '#dc2626' : '#16a34a'

  const delitos = [
    { nombre: s.delito_1, pct: s.pct_1 },
    { nombre: s.delito_2, pct: s.pct_2 },
    { nombre: s.delito_3, pct: s.pct_3 },
  ].filter(d => d.nombre)

  const maxPct = Math.max(...delitos.map(d => d.pct ?? 0), 1)

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <KpiCard
          label="Casos año a la fecha"
          value={s.casos_semana?.toLocaleString('es-CL') ?? '—'}
          sub={s.semana ? `Semana ${s.semana}` : undefined}
          color={accentColor}
        />
        <KpiCard
          label="Variación año a la fecha"
          value={s.var_semana_pct != null ? `${varPos ? '+' : ''}${s.var_semana_pct.toFixed(1)}%` : '—'}
          sub="vs semana anterior"
          color={varColor}
        />
        <KpiCard
          label="Tasa por 100 mil hab."
          value={s.tasa_registro != null ? s.tasa_registro.toFixed(0) : '—'}
          sub="Promedio regional"
          color="#2563eb"
        />
      </div>

      {/* Top delitos */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
          Top delito más frecuente
        </h3>
        <div className="space-y-4">
          {delitos.map((d, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-gray-700 leading-tight pr-4">{d.nombre}</span>
                <span className="text-sm font-bold text-gray-900 flex-shrink-0">{fmt(d.pct, 1)}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${((d.pct ?? 0) / maxPct) * 100}%`,
                    backgroundColor: i === 0 ? accentColor : '#86efac',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Fuente: Ley S.T.O.P. — Carabineros de Chile
        {s.fecha_desde && s.fecha_hasta ? ` · ${s.fecha_desde} al ${s.fecha_hasta}` : ''}
        {' · Datos actualizados semanalmente'}
      </p>
    </div>
  )
}

function SeguridadEvolucion({ data }: { data: { period: string; value: number }[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        Tasa de registro por 100 mil hab. — evolución semanal
      </h3>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="period"
            tickFormatter={fmtShortDate}
            tick={{ fontSize: 9, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
            angle={-45}
            textAnchor="end"
            interval={Math.max(0, Math.floor(data.length / 10) - 1)}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: unknown) => [`${Number(v).toFixed(0)} /100k`, 'Tasa delictual']}
            labelFormatter={(l) => typeof l === 'string' ? fmtShortDate(l) : String(l)}
            contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
          />
          <Bar dataKey="value" fill="#86efac" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <p className="text-xs text-gray-400 mt-2">
        Fuente: Ley S.T.O.P. — Carabineros de Chile · Actualización semanal
      </p>
    </div>
  )
}

// ── Economía ──────────────────────────────────────────────────────────────────

function EconomiaSection({ region, timeSeries, chartData, metric, pibMode, setMetric, setPibMode, yFmt, latestReg, latestNat, zoneColor }: {
  region: Region
  timeSeries: MetricSeries[]
  chartData: { period: string; regional: number | null; national: number | null }[]
  metric: ActiveM
  pibMode: PibMode
  setMetric: (m: ActiveM) => void
  setPibMode: (m: PibMode) => void
  yFmt: (v: number) => string
  latestReg: number | null
  latestNat: number | null
  zoneColor: string
}) {
  const available = (Object.keys(METRIC_CFG) as ActiveM[]).filter(m =>
    timeSeries.some(s => s.metric_name === m)
  )
  const periodFmt = metric === 'pib_regional' ? fmtQuarterly : fmtMonthly

  return (
    <div className="p-6 space-y-5">
      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
          {available.map(m => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                metric === m ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {METRIC_CFG[m].label}
            </button>
          ))}
        </div>
        {metric === 'pib_regional' && (
          <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
            <button
              onClick={() => setPibMode('pct')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                pibMode === 'pct' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              % Nacional
            </button>
            <button
              onClick={() => setPibMode('mm')}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                pibMode === 'mm' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500'
              }`}
            >
              MM$
            </button>
          </div>
        )}
      </div>

      {/* Latest value pills */}
      <div className="flex flex-wrap items-center gap-2">
        {latestReg != null && (
          <span className="text-xs px-3 py-1.5 rounded-full font-semibold text-white" style={{ backgroundColor: zoneColor }}>
            {region.nombre.split(' ')[0]}: {yFmt(latestReg)}
          </span>
        )}
        {latestNat != null && metric !== 'pib_regional' && (
          <span className="text-xs px-3 py-1.5 rounded-full bg-gray-200 text-gray-600 font-medium">
            Nacional: {yFmt(latestNat)}
          </span>
        )}
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <EmptyState text="Sin datos de tendencia para esta métrica." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" />
              <XAxis
                dataKey="period"
                tickFormatter={periodFmt}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={yFmt}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                width={54}
              />
              <Tooltip
                formatter={(value, name) => [
                  typeof value === 'number' ? yFmt(value) : String(value),
                  name === 'regional' ? region.nombre : 'Promedio Nacional',
                ]}
                labelFormatter={(l) => typeof l === 'string' ? periodFmt(l) : String(l)}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
              />
              <Line type="monotone" dataKey="regional" stroke={zoneColor} strokeWidth={2.5} dot={{ r: 2, fill: zoneColor }} activeDot={{ r: 5 }} connectNulls />
              {metric !== 'pib_regional' && (
                <Line type="monotone" dataKey="national" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} activeDot={{ r: 3 }} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-4 mt-3 px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-0.5 rounded inline-block" style={{ backgroundColor: zoneColor }} />
              <span className="text-xs text-gray-500">{region.nombre}</span>
            </div>
            {metric !== 'pib_regional' && (
              <div className="flex items-center gap-1.5">
                <svg width="20" height="4" viewBox="0 0 20 4">
                  <line x1="0" y1="2" x2="20" y2="2" stroke="#9CA3AF" strokeWidth="1.5" strokeDasharray="5 3" />
                </svg>
                <span className="text-xs text-gray-400">Promedio Nacional</span>
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400">Fuente: Banco Central de Chile · Actualización mensual / trimestral</p>
    </div>
  )
}

// ── Censo 2024 ────────────────────────────────────────────────────────────────

function CensoSection({ metrics: m, subTab, setSubTab }: {
  metrics: RegionMetrics
  subTab: CensoSub
  setSubTab: (t: CensoSub) => void
}) {
  const pct  = (v: number | null | undefined, d = 1) => v != null ? `${v.toFixed(d)}%` : '—'
  const num  = (v: number | null | undefined)         => v != null ? v.toLocaleString('es-CL') : '—'
  const fnum = (v: number | null | undefined, d = 1)  =>
    v != null ? v.toLocaleString('es-CL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—'

  const CENSO_TABS = [
    { id: 'demografia' as CensoSub, label: 'Demografía' },
    { id: 'vivienda'  as CensoSub,  label: 'Vivienda' },
    { id: 'educacion' as CensoSub,  label: 'Educación y Servicios' },
  ]

  const PURPLE = '#7c3aed'

  return (
    <div className="p-6">
      <SubTabs tabs={CENSO_TABS} active={subTab} onChange={setSubTab} />

      {subTab === 'demografia' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Población total"      value={num(m.poblacion_total)}                   sub="habitantes" color={PURPLE} />
            <KpiCard label="Edad promedio"         value={fnum(m.prom_edad) + ' años'}               sub="promedio regional" color={PURPLE} />
            <KpiCard label="Inmigrantes"           value={pct(m.pct_inmigrantes)}                    sub={`${num(m.n_inmigrantes)} personas`} color={PURPLE} />
            <KpiCard label="Pueblos originarios"   value={pct(m.pct_indigena)}                       sub={`${num(m.n_pueblos_orig)} personas`} color={PURPLE} />
            <KpiCard label="Mayores de 60 años"    value={pct(m.pct_edad_60_mas)}                    sub="del total regional" color={PURPLE} />
            <KpiCard label="Discapacidad"          value={num(m.n_discapacidad)}                     sub="personas" color={PURPLE} />
          </div>
          <p className="text-xs text-gray-400">Fuente: Censo de Población y Vivienda 2024 — INE Chile</p>
        </div>
      )}

      {subTab === 'vivienda' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Déficit habitacional"  value={num(m.n_deficit_cuantitativo)}             sub="unidades" color={PURPLE} />
            <KpiCard label="Hacinamiento"           value={pct(m.pct_viv_hacinadas)}                  sub="de viviendas" color={PURPLE} />
            <KpiCard label="Acceso agua pública"    value={pct(m.pct_acceso_agua_publica)}             sub="de viviendas" color={PURPLE} />
            <KpiCard label="Jefatura femenina"      value={pct(m.pct_jefatura_mujer)}                 sub="de hogares" color={PURPLE} />
            <KpiCard label="Pobreza por ingresos"   value={pct(m.pct_pobreza_ingresos)}               sub="del total" color={PURPLE} />
            <KpiCard label="Pobreza multidimensional" value={pct(m.pct_pobreza_multidimensional)}     sub="CASEN" color={PURPLE} />
          </div>
          <p className="text-xs text-gray-400">Fuente: Censo 2024 + CASEN — INE Chile</p>
        </div>
      )}

      {subTab === 'educacion' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <KpiCard label="Educación superior"     value={pct(m.pct_educacion_superior)}             sub="de la población" color={PURPLE} />
            <KpiCard label="Años escolaridad (18+)"  value={`${fnum(m.anios_escolaridad_promedio)} años`} sub="promedio" color={PURPLE} />
            <KpiCard label="Hogares con internet"    value={pct(m.pct_hogares_internet)}               sub="del total" color={PURPLE} />
            <KpiCard label="Tasa desocupación"       value={pct(m.tasa_desocupacion)}                  sub="promedio anual (BCCh)" color={PURPLE} />
            <KpiCard label="Ocupados (Censo)"        value={num(m.n_ocupado)}                          sub="personas" color={PURPLE} />
            <KpiCard label="Desocupados (Censo)"     value={num(m.n_desocupado)}                       sub="personas" color={PURPLE} />
          </div>
          <p className="text-xs text-gray-400">Fuente: Censo 2024 + BCCh + CASEN — INE Chile</p>
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
    if (activeMetric === 'pib_regional') {
      return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
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
      else cods.forEach(c => next.add(c))
      return next
    })
  }

  return (
    <div className="p-6 space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 shadow-sm">
          {COMP_METRICS.map(m => (
            <button
              key={m.name}
              onClick={() => setActiveMetric(m.name)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeMetric === m.name ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{visible.size} de 16 regiones visibles</span>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-7 h-7 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis
                dataKey="period"
                tickFormatter={fmtP}
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                tickLine={false}
                axisLine={{ stroke: '#E5E7EB' }}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={metricCfg.yFmt}
                tick={{ fontSize: 10, fill: '#9CA3AF' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(value, name) =>
                  typeof value === 'number'
                    ? [metricCfg.yFmt(value), REGIONS.find(r => r.cod === name)?.nombre ?? name]
                    : [value, name]
                }
                labelFormatter={(l) => typeof l === 'string' ? fmtP(l) : l}
                contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E5E7EB' }}
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
                    stroke={s.region.cod === region.cod ? zoneColor : (REGION_COLORS[s.region.cod] ?? '#9CA3AF')}
                    strokeWidth={s.region.cod === region.cod ? 2.5 : 1.5}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))
              }
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Region toggles */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs text-gray-500 font-medium">Regiones:</span>
          <button
            onClick={() => setVisible(new Set(REGIONS.map(r => r.cod)))}
            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Todas
          </button>
          <button
            onClick={() => setVisible(new Set())}
            className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Ninguna
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {ZONES.map(([zona, cods]) => {
            const zColor = ZONA_COLORS[zona] ?? '#9CA3AF'
            const allOn = cods.every(c => visible.has(c))
            return (
              <div key={zona} className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleZone(cods)}
                  className="flex items-center gap-1 text-xs font-medium rounded px-1.5 py-0.5 transition-opacity"
                  style={{ color: zColor, opacity: allOn ? 1 : 0.4 }}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: zColor }} />
                  {zona}
                </button>
                <div className="flex gap-1 flex-wrap">
                  {cods.map(cod => {
                    const r = REGIONS.find(r => r.cod === cod)!
                    const on = visible.has(cod)
                    const isCurrent = cod === region.cod
                    return (
                      <button
                        key={cod}
                        onClick={() => toggleRegion(cod)}
                        title={r.nombre}
                        className={`text-xs px-2 py-0.5 rounded-full border transition-all ${isCurrent ? 'ring-1 ring-offset-1 ring-slate-400' : ''}`}
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

      <p className="text-xs text-gray-400">Fuente: Banco Central de Chile · Actualización mensual / trimestral</p>
    </div>
  )
}
