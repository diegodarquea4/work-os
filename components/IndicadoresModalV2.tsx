'use client'

import { useState, useMemo } from 'react'
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import { REGIONS, INE_CODE, ZONA_COLORS } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import { useV2Dashboard } from '@/lib/hooks/useV2Dashboard'
import type { IndicadorContext, SparkSerie } from '@/lib/hooks/useV2Dashboard'
import { useColegaSeguridadAll, useColegaSeguridadRegion } from '@/lib/hooks/useColegaSeguridad'
import type { LeystopRow } from '@/lib/hooks/useColegaSeguridad'
import KpiCardV2 from './KpiCardV2'

// ── Tab config ───────────────────────────────────────────────────────────────

type TabId = 'pulso' | 'economico' | 'social' | 'demografico' | 'salud_edu' | 'seguridad' | 'ambiente'

const TABS: { id: TabId; label: string; badge: string; color: string }[] = [
  { id: 'pulso',       label: 'Pulso',              badge: 'Semanal',       color: '#16a34a' },
  { id: 'economico',   label: 'Económico',          badge: 'Trimestral',    color: '#2563eb' },
  { id: 'social',      label: 'Social',             badge: 'CASEN 2024',    color: '#dc2626' },
  { id: 'demografico', label: 'Demográfico',        badge: 'Censo 2024',    color: '#7c3aed' },
  { id: 'salud_edu',   label: 'Salud y Educación',  badge: 'Anual',         color: '#0891b2' },
  { id: 'seguridad',   label: 'Seguridad',          badge: 'ENUSC/LeyStop', color: '#b91c1c' },
  { id: 'ambiente',    label: 'Ambiente',            badge: 'Varias',        color: '#059669' },
]

const SERIES_CODIGOS = [
  'EMP_DESOC_TASA', 'ECO_VENTAS_REG', 'ECO_PIB_REG', 'ECO_PIB_ANUAL', 'EMP_OCUP_MILES', 'EMP_FT_MILES',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMonth(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: '2-digit' })
    .format(new Date(iso + 'T12:00:00'))
}
function fmtQuarter(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `T${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`
}
function fmtShortDate(iso: string): string {
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' })
    .format(new Date(iso + 'T12:00:00'))
}
function num(v: number | null | undefined) { return v != null ? v.toLocaleString('es-CL') : '—' }

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, subtitle, badge, color, children }: {
  title: string; subtitle?: string; badge?: string; color: string; children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 pt-1">
        <div className="pl-3 min-w-0" style={{ borderLeft: `3px solid ${color}` }}>
          <h2 className="text-sm font-bold text-gray-800 leading-snug">{title}</h2>
          {subtitle && <p className="text-xs text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold flex-shrink-0"
            style={{ backgroundColor: color + '18', color }}>{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/** Renders KPI cards for indicators with data + a compact "sin dato" list for the rest */
function KpiGrid({ codigos, indicadores, accentColor, cols = 4 }: {
  codigos: string[]; indicadores: Map<string, IndicadorContext>; accentColor: string; cols?: number
}) {
  const all = codigos.map(c => indicadores.get(c)).filter(Boolean) as IndicadorContext[]
  const conDato = all.filter(c => c.valor !== null)
  const sinDato = all.filter(c => c.valor === null)

  return (
    <>
      {conDato.length > 0 && (
        <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(cols, conDato.length)} gap-3`}>
          {conDato.map(ctx => <KpiCardV2 key={ctx.codigo} ctx={ctx} accentColor={accentColor} />)}
        </div>
      )}
      {sinDato.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {sinDato.map(ctx => (
            <span key={ctx.codigo} className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded-md" title={`Fuente esperada: ${ctx.fuente ?? 'no definida'}`}>
              {ctx.nombre}: sin dato
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function ToggleBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-colors ${
        active
          ? 'bg-gray-800 text-white'
          : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
      }`}
    >{children}</button>
  )
}

function ChartCard({ title, unit, children, source }: {
  title: string; unit?: string; children: React.ReactNode; source?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-3">
        {title}{unit && <span className="font-normal text-gray-600 ml-1">({unit})</span>}
      </h3>
      {children}
      {source && <p className="text-[10px] text-gray-600 mt-3">{source}</p>}
    </div>
  )
}

function TimeSeriesChart({ serie, color, yFmt, labelFmt, nationalSerie }: {
  serie: SparkSerie; color: string
  yFmt?: (v: number) => string; labelFmt?: (iso: string) => string
  nationalSerie?: SparkSerie
}) {
  const fmt = labelFmt ?? fmtMonth
  const data = useMemo(() => {
    const d = serie.data.slice(-24)
    if (!nationalSerie) return d
    const natMap = new Map(nationalSerie.data.map(p => [p.periodo, p.valor]))
    return d.map(p => ({ ...p, nacional: natMap.get(p.periodo) ?? undefined }))
  }, [serie, nationalSerie])

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
        <XAxis dataKey="periodo" tickFormatter={fmt} tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={yFmt} tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} domain={['auto', 'auto']} width={48} />
        <Tooltip
          formatter={(v: unknown, name: unknown) => [yFmt ? yFmt(Number(v)) : Number(v).toLocaleString('es-CL', { maximumFractionDigits: 1 }), name === 'nacional' ? 'Nacional' : 'Regional']}
          labelFormatter={(l) => typeof l === 'string' ? fmt(l) : String(l)}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e5e7eb' }}
        />
        <Line type="monotone" dataKey="valor" stroke={color} strokeWidth={2.5} dot={{ r: 1.5, fill: color }} activeDot={{ r: 5 }} />
        {nationalSerie && <Line type="monotone" dataKey="nacional" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 3" dot={false} />}
      </LineChart>
    </ResponsiveContainer>
  )
}

/** Ranking table: 16 regions sorted by an indicator */
function RankingTable({ codigo, indicadores, regionId, allRegionsUltimos, label, color }: {
  codigo: string; indicadores: Map<string, IndicadorContext>
  regionId: number; allRegionsUltimos: { region_id: number; valor: number | null; codigo_indicador: string }[]
  label: string; color: string
}) {
  const ctx = indicadores.get(codigo)
  const lowerIsBetter = ctx?.lowerIsBetter ?? false

  const rows = useMemo(() => {
    const filtered = allRegionsUltimos
      .filter(r => r.codigo_indicador === codigo && r.region_id > 0 && r.valor !== null)
    const sorted = [...filtered].sort((a, b) =>
      lowerIsBetter ? (a.valor ?? 0) - (b.valor ?? 0) : (b.valor ?? 0) - (a.valor ?? 0)
    )
    return sorted.map((r, i) => {
      const reg = REGIONS.find(rr => INE_CODE[rr.cod] === r.region_id)
      return { rank: i + 1, nombre: reg?.nombre ?? `Region ${r.region_id}`, valor: r.valor!, isActive: r.region_id === regionId }
    })
  }, [allRegionsUltimos, codigo, lowerIsBetter, regionId])

  if (rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
        <span className="text-xs font-semibold text-gray-600">{label}</span>
        <span className="text-[10px] text-gray-600 ml-2">{lowerIsBetter ? '↑ menor = mejor' : '↑ mayor = mejor'}</span>
      </div>
      <div className="max-h-[320px] overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {rows.map(row => (
              <tr key={row.rank}
                className={`border-b border-gray-50 ${row.isActive ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'}`}
                style={row.isActive ? { borderLeft: `4px solid ${color}` } : {}}>
                <td className="px-3 py-2 text-gray-700 w-8">{row.rank}</td>
                <td className="px-2 py-2 text-gray-900">{row.nombre}</td>
                <td className="px-3 py-2 text-right text-gray-800 font-mono font-medium">
                  {ctx?.unidad === '%' ? `${row.valor.toFixed(1)}%` : row.valor.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Comparison table: all 16 regions for multiple indicators */
function ComparisonTable({ codigos, indicadores, allRegionsUltimos, regionId }: {
  codigos: string[]; indicadores: Map<string, IndicadorContext>
  allRegionsUltimos: { region_id: number; valor: number | null; codigo_indicador: string }[]
  regionId: number
}) {
  const columns = codigos.map(c => indicadores.get(c)).filter(Boolean) as IndicadorContext[]
  if (columns.length === 0) return null

  // Build rows: one per region
  const rows = useMemo(() => {
    const regionIds = [...new Set(allRegionsUltimos.filter(r => r.region_id > 0).map(r => r.region_id))].sort((a, b) => a - b)
    return regionIds.map(rid => {
      const reg = REGIONS.find(r => INE_CODE[r.cod] === rid)
      const vals: Record<string, number | null> = {}
      for (const c of codigos) {
        const found = allRegionsUltimos.find(r => r.region_id === rid && r.codigo_indicador === c)
        vals[c] = found?.valor ?? null
      }
      return { regionId: rid, nombre: reg?.nombre ?? `Region ${rid}`, vals, isActive: rid === regionId }
    })
  }, [allRegionsUltimos, codigos, regionId])

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1a1a2e] text-white">
              <th className="text-left px-4 py-2.5 font-medium sticky left-0 bg-[#1a1a2e]">Región</th>
              {columns.map(c => (
                <th key={c.codigo} className="text-right px-3 py-2.5 font-medium whitespace-nowrap">
                  {c.nombre.replace(/^Porcentaje /, '% ').replace(/^Tasa de /, '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.regionId}
                className={`border-b border-gray-50 hover:bg-blue-50 transition-colors ${row.isActive ? 'bg-blue-50 font-semibold' : ''}`}
                style={row.isActive ? { borderLeft: '4px solid #3b82f6' } : {}}>
                <td className="px-4 py-2 text-gray-900 whitespace-nowrap sticky left-0 bg-inherit">{row.nombre}</td>
                {codigos.map(c => {
                  const v = row.vals[c]
                  const ctx = indicadores.get(c)
                  return (
                    <td key={c} className="px-3 py-2 text-right text-gray-800 whitespace-nowrap">
                      {v === null ? <span className="text-gray-600">—</span>
                        : ctx?.unidad === '%' ? `${v.toFixed(1)}%`
                        : v.toLocaleString('es-CL', { maximumFractionDigits: 1 })}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Tab sections ─────────────────────────────────────────────────────────────

type TabProps = {
  indicadores: Map<string, IndicadorContext>
  series: Map<string, SparkSerie>
  allRegionsUltimos: { region_id: number; valor: number | null; codigo_indicador: string }[]
  regionId: number; color: string; regionNombre: string; regionCod: string
  // LeyStop semanal (from Colega — not v2)
  allLeystop: LeystopRow[]; leystopSemana: string; leystopHistory: LeystopRow[]
}

function PulsoTab({ indicadores, series, allRegionsUltimos, regionId, color, regionNombre, regionCod,
  allLeystop, leystopSemana, leystopHistory }: TabProps) {
  const desoc = indicadores.get('EMP_DESOC_TASA')
  const regionRow = allLeystop.find(r => INE_CODE[regionCod] === r.id_region) ?? null

  // Security KPIs from LeyStop
  const validTasa = allLeystop.filter(r => r.tasa_registro != null)
  const avgTasa = validTasa.length > 0 ? validTasa.reduce((s, r) => s + (r.tasa_registro ?? 0), 0) / validTasa.length : null
  const tasaRank = (() => {
    if (!regionRow?.tasa_registro || validTasa.length === 0) return null
    const sorted = [...validTasa].sort((a, b) => (b.tasa_registro ?? 0) - (a.tasa_registro ?? 0))
    const idx = sorted.findIndex(r => r.id_region === regionRow.id_region)
    return idx === -1 ? null : `${idx + 1}°/${sorted.length}`
  })()

  // Sparkline: last 12 weeks
  const sparkData = leystopHistory.slice(-12).map(s => ({
    period: s.fecha_hasta_iso,
    tasa: s.tasa_registro ?? 0,
  }))

  // Ranking nacional
  const rankingFlash = useMemo(() => {
    return allLeystop.map(row => ({
      nombre: row.nombre_region,
      id_region: row.id_region,
      casos: row.casos_ultima_semana,
      var_sem: row.var_ultima_semana,
      tasa: row.tasa_registro,
      delito1: row.mayor_registro_1,
    })).sort((a, b) => (b.tasa ?? 0) - (a.tasa ?? 0))
  }, [allLeystop])

  return (
    <div className="space-y-6">
      {/* 4 hero KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardV2 ctx={desoc ?? { codigo: 'EMP_DESOC_TASA', nombre: 'Desocupación', valor: null, periodo: null, unidad: '%', calidad: 'verificado', edadDias: null, nacional: null, ranking: null, delta: null, deltaGood: null, fuente: 'INE-ENE', stale: false, catalogo: null, lowerIsBetter: true }} accentColor={color} />
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center" style={{ borderBottomWidth: 3, borderBottomColor: regionRow?.casos_ultima_semana != null ? '#dc2626' : '#d1d5db' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Casos última semana</p>
          <p className="text-2xl font-bold text-gray-900">{regionRow?.casos_ultima_semana?.toLocaleString('es-CL') ?? '—'}</p>
          <p className="text-[10px] text-gray-600 mt-1">{leystopSemana || 'LeyStop'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center" style={{ borderBottomWidth: 3, borderBottomColor: (regionRow?.tasa_registro ?? 0) > (avgTasa ?? 0) ? '#dc2626' : '#16a34a' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Tasa delictual</p>
          <p className="text-2xl font-bold text-gray-900">{regionRow?.tasa_registro?.toFixed(0) ?? '—'}</p>
          <p className="text-[10px] text-gray-600 mt-1">casos / 100k hab</p>
          {avgTasa != null && <p className={`text-[10px] font-medium mt-1 ${(regionRow?.tasa_registro ?? 0) > avgTasa ? 'text-red-600' : 'text-green-600'}`}>Prom: {avgTasa.toFixed(0)}{tasaRank ? ` · ${tasaRank}` : ''}</p>}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 text-center" style={{ borderBottomWidth: 3, borderBottomColor: (regionRow?.var_ultima_semana ?? 0) > 0 ? '#dc2626' : '#16a34a' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-1.5">Var. semanal</p>
          <p className={`text-2xl font-bold ${(regionRow?.var_ultima_semana ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {regionRow?.var_ultima_semana != null ? `${regionRow.var_ultima_semana > 0 ? '+' : ''}${regionRow.var_ultima_semana.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[10px] text-gray-600 mt-1">vs semana anterior</p>
        </div>
      </div>

      {/* Seguridad: top 5 + sparkline */}
      {regionRow && (
        <Section title="Seguridad" subtitle="Top delitos, evolución tasa y actividad policial" badge={leystopSemana ? `LeyStop · ${leystopSemana}` : 'LeyStop'} color={color}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top 5 delitos */}
            {(() => {
              const delitos = [
                { nombre: regionRow.mayor_registro_1, n: regionRow.n_1 },
                { nombre: regionRow.mayor_registro_2, n: regionRow.n_2 },
                { nombre: regionRow.mayor_registro_3, n: regionRow.n_3 },
                { nombre: regionRow.mayor_registro_4, n: regionRow.n_4 },
                { nombre: regionRow.mayor_registro_5, n: regionRow.n_5 },
              ].filter(d => d.nombre)
              const maxN = Math.max(...delitos.map(d => d.n ?? 0), 1)
              return (
                <ChartCard title={`Top 5 delitos — ${regionRow.nombre_region}`}>
                  <div className="space-y-3">
                    {delitos.map((d, i) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-700 pr-4 truncate">{d.nombre}</span>
                          <span className="text-xs font-bold text-gray-900 flex-shrink-0">{d.n?.toLocaleString('es-CL') ?? '—'}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${((d.n ?? 0) / maxN) * 100}%`, backgroundColor: i === 0 ? color : '#86efac' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )
            })()}

            {/* Sparkline tasa + actividad operativa */}
            <ChartCard title="Evolución tasa delictual — últimas 12 semanas">
              {sparkData.length > 0 ? (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={sparkData} margin={{ top: 4, right: 8, left: -24, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="period" tickFormatter={fmtShortDate} tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={2} />
                    <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} />
                    <Tooltip formatter={(v: unknown) => [`${Number(v).toFixed(0)}`, 'Tasa']} labelFormatter={(l) => typeof l === 'string' ? fmtShortDate(l) : String(l)} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                    <Bar dataKey="tasa" fill={color} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-gray-600 text-center py-8">Sin histórico disponible</p>}
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num(regionRow.controles)}</p>
                  <p className="text-[10px] text-gray-600 uppercase">Controles</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num(regionRow.fiscalizaciones)}</p>
                  <p className="text-[10px] text-gray-600 uppercase">Fiscalizaciones</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-gray-800">{num((regionRow.incaut_fuego ?? 0) + (regionRow.incaut_blancas ?? 0))}</p>
                  <p className="text-[10px] text-gray-600 uppercase">Incautaciones</p>
                </div>
              </div>
            </ChartCard>
          </div>
        </Section>
      )}

      {/* Ranking Nacional */}
      {rankingFlash.length > 0 && (
        <Section title="Ranking Nacional" subtitle="16 regiones ordenadas por tasa delictual" badge="LeyStop" color={color}>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#1a1a2e] text-white">
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Región</th>
                    <th className="text-right px-3 py-2.5 font-medium">Casos/sem</th>
                    <th className="text-right px-3 py-2.5 font-medium">Var%</th>
                    <th className="text-right px-3 py-2.5 font-medium">Tasa</th>
                    <th className="text-left px-3 py-2.5 font-medium">Delito #1</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingFlash.map((row, idx) => {
                    const isActive = row.id_region === regionRow?.id_region
                    return (
                      <tr key={row.id_region}
                        className={`border-b border-gray-50 hover:bg-blue-50 ${isActive ? 'bg-blue-50 font-semibold' : ''}`}
                        style={isActive ? { borderLeft: '4px solid #3b82f6' } : {}}>
                        <td className="px-4 py-2 text-gray-700">{idx + 1}</td>
                        <td className="px-3 py-2 text-gray-900 whitespace-nowrap">{row.nombre}</td>
                        <td className="px-3 py-2 text-right text-gray-800">{num(row.casos)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${(row.var_sem ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {row.var_sem != null ? `${row.var_sem > 0 ? '+' : ''}${row.var_sem.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-800 font-medium">{row.tasa?.toFixed(0) ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[180px] truncate">{row.delito1 ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}

      {/* Desocupación chart */}
      {series.get('EMP_DESOC_TASA') && (
        <Section title="Empleo" subtitle="Tasa de desocupación trimestre móvil" badge="INE-ENE" color="#0891b2">
          <ChartCard title="Desocupación regional" unit="%" source="Fuente: INE vía BCCh — trimestre móvil">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {desoc?.valor !== null && desoc && (
                <span className="text-xs px-2.5 py-1 rounded-full font-semibold text-white" style={{ backgroundColor: color }}>
                  {regionNombre.split(' ')[0]}: {desoc.valor!.toFixed(1)}%
                </span>
              )}
              {desoc?.nacional !== null && desoc && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-gray-200 text-gray-600 font-medium">
                  Nacional: {desoc.nacional!.toFixed(1)}%
                </span>
              )}
            </div>
            <TimeSeriesChart serie={series.get('EMP_DESOC_TASA')!} color="#0891b2" yFmt={v => `${v.toFixed(1)}%`} />
          </ChartCard>
        </Section>
      )}
    </div>
  )
}

function EconomicoTab({ indicadores, series, allRegionsUltimos, regionId, color, regionNombre }: TabProps) {
  const [pibFreq, setPibFreq] = useState<'anual' | 'trimestral'>('anual')
  const [pibUnit, setPibUnit] = useState<'mm' | 'pct'>('mm')

  const sectorCodes = [
    'ECO_PIB_MINERIA', 'ECO_PIB_INDUSTRIA', 'ECO_PIB_COMERCIO', 'ECO_PIB_CONSTRUC',
    'ECO_PIB_AGRO', 'ECO_PIB_TRANSPORTE', 'ECO_PIB_FINANCIERO', 'ECO_PIB_PESCA',
    'ECO_PIB_ELECTRIC', 'ECO_PIB_REST_HOT', 'ECO_PIB_VIVIENDA', 'ECO_PIB_SERV_PERS', 'ECO_PIB_ADM_PUB',
  ]
  const sectorData = sectorCodes
    .map(c => indicadores.get(c))
    .filter((ctx): ctx is IndicadorContext => !!ctx && ctx.valor !== null)
    .sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0))

  const SECTOR_COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#818cf8', '#a78bfa', '#c4b5fd', '#ddd6fe', '#e9d5ff', '#f3e8ff']

  // Build PIB chart data with optional % conversion
  const pibSerie = pibFreq === 'anual' ? series.get('ECO_PIB_ANUAL') : series.get('ECO_PIB_REG')

  // For % mode: compute national total per period from allRegionsUltimos or use a fixed national series
  const pibChartData = useMemo(() => {
    if (!pibSerie) return null
    if (pibUnit === 'mm') return pibSerie

    // For % of national: we need national PIB per period
    // Use the same frequency national series to compute shares
    const natSerie = pibFreq === 'anual'
      ? series.get('ECO_PIB_ANUAL') // We need national annual — use allRegions sum as proxy
      : series.get('ECO_PIB_REG')

    if (!natSerie) return pibSerie

    // Sum all regions for each period from allRegionsUltimos to approximate national total
    // For the chart, we compute share = region / sum(all regions) * 100
    // This is a rough approach — allRegionsUltimos only has the latest value per region
    // For a proper time-series %, we'd need national series data
    // Instead, use the latest national total as denominator (constant %)
    const allRegPib = allRegionsUltimos
      .filter(r => r.codigo_indicador === (pibFreq === 'anual' ? 'ECO_PIB_ANUAL' : 'ECO_PIB_REG') && r.region_id > 0)
    const natTotal = allRegPib.reduce((s, r) => s + (r.valor ?? 0), 0)

    if (natTotal <= 0) return pibSerie

    return {
      ...pibSerie,
      data: pibSerie.data.map(p => ({
        ...p,
        valor: parseFloat(((p.valor / natTotal) * 100).toFixed(2)),
      })),
    }
  }, [pibSerie, pibUnit, pibFreq, series, allRegionsUltimos])

  const pibLabel = pibFreq === 'anual' ? 'Evolución anual' : 'Evolución trimestral'
  const pibUnitLabel = pibUnit === 'mm' ? 'Miles de MM CLP' : '% del PIB nacional'
  const pibYFmt = pibUnit === 'mm'
    ? (v: number) => `${Math.round(v).toLocaleString('es-CL')} MM`
    : (v: number) => `${v.toFixed(1)}%`
  const pibLabelFmt = pibFreq === 'anual'
    ? (iso: string) => new Date(iso + 'T12:00:00').getFullYear().toString()
    : fmtQuarter

  return (
    <div className="space-y-6">
      <KpiGrid codigos={['ECO_PCT_PIB', 'ECO_PIB_ANUAL', 'ECO_VENTAS_REG', 'ECO_VAR_IA', 'ECO_INV_PUB', 'ECO_INV_FNDR', 'ECO_COMPRAS_PUB']}
        indicadores={indicadores} accentColor={color} />

      {/* PIB chart + ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {pibChartData && (
          <div className="lg:col-span-3">
            <Section title="PIB Regional" badge="BCCh · CCNN" color={color}>
              <ChartCard title={pibLabel} unit={pibUnitLabel} source="Fuente: BCCh — Cuentas Nacionales">
                <div className="flex gap-1.5 mb-3">
                  <ToggleBtn active={pibFreq === 'anual'} onClick={() => setPibFreq('anual')}>Anual</ToggleBtn>
                  <ToggleBtn active={pibFreq === 'trimestral'} onClick={() => setPibFreq('trimestral')}>Trimestral</ToggleBtn>
                  <span className="w-px bg-gray-200 mx-1" />
                  <ToggleBtn active={pibUnit === 'mm'} onClick={() => setPibUnit('mm')}>$MM</ToggleBtn>
                  <ToggleBtn active={pibUnit === 'pct'} onClick={() => setPibUnit('pct')}>% Nacional</ToggleBtn>
                </div>
                <TimeSeriesChart serie={pibChartData} color={color} yFmt={pibYFmt} labelFmt={pibLabelFmt} />
              </ChartCard>
            </Section>
          </div>
        )}
        <div className="lg:col-span-2">
          <RankingTable codigo="ECO_PCT_PIB" indicadores={indicadores} regionId={regionId}
            allRegionsUltimos={allRegionsUltimos} label="Ranking % PIB nacional" color={color} />
        </div>
      </div>

      {/* Ventas */}
      {series.get('ECO_VENTAS_REG') && (
        <Section title="Ventas Regionales" subtitle="Facturación electrónica" badge="BCCh · Mensual" color="#059669">
          <ChartCard title="Ventas regionales" unit="MM CLP" source="Fuente: BCCh — facturación electrónica">
            <TimeSeriesChart serie={series.get('ECO_VENTAS_REG')!} color="#059669" yFmt={v => `${Math.round(v)} MM`} />
          </ChartCard>
        </Section>
      )}

      {/* Sectoral */}
      {sectorData.length > 0 && (
        <Section title="Composición sectorial" subtitle="PIB por actividad económica" badge="BCCh · Anual" color={color}>
          <ChartCard title="PIB por sector" unit="MM CLP" source="Fuente: BCCh — PIB sectorial nominal">
            <ResponsiveContainer width="100%" height={Math.max(200, sectorData.length * 32)}>
              <BarChart data={sectorData} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#6b7280' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v)} MM`} />
                <YAxis type="category" dataKey="nombre" width={200} tick={{ fontSize: 9, fill: '#374151' }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.replace('PIB sector ', '')} />
                <Tooltip formatter={(v: unknown) => [`${Number(v).toLocaleString('es-CL', { maximumFractionDigits: 0 })} MM$`, 'PIB']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                  {sectorData.map((_, i) => <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </Section>
      )}
    </div>
  )
}

function SocialTab({ indicadores, allRegionsUltimos, regionId, color }: TabProps) {
  const pobIng = indicadores.get('SOC_POB_ING')
  const pobExt = indicadores.get('SOC_POB_EXT')

  return (
    <div className="space-y-6">
      <Section title="Pobreza" subtitle="Indicadores por ingresos y multidimensional" badge="CASEN 2024" color={color}>
        <KpiGrid codigos={['SOC_POB_ING', 'SOC_POB_EXT', 'SOC_POB_MULTI', 'SOC_POB_SEV']}
          indicadores={indicadores} accentColor={color} />
        {pobIng?.valor !== null && pobExt?.valor !== null && pobIng && pobExt && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mt-3">
            <p className="text-xs text-amber-800">Pobreza extrema ({pobExt.valor!.toFixed(1)}%) es subconjunto de pobreza por ingresos ({pobIng.valor!.toFixed(1)}%). No sumar.</p>
          </div>
        )}
      </Section>
      <Section title="Vulnerabilidad" subtitle="Registro Social de Hogares" badge="CASEN 2024" color="#f59e0b">
        <KpiGrid codigos={['SOC_RSH_HOG', 'SOC_RSH_PCT']} indicadores={indicadores} accentColor="#f59e0b" cols={2} />
      </Section>
      <Section title="Vivienda" subtitle="Déficit y condiciones habitacionales" badge="Censo 2024" color="#8b5cf6">
        <KpiGrid codigos={['VIV_HACINAMIENTO', 'VIV_AGUA', 'VIV_DEF_CUANT']}
          indicadores={indicadores} accentColor="#8b5cf6" cols={3} />
      </Section>

      {/* Comparison table */}
      <Section title="Comparación regional" subtitle="Pobreza y vivienda en las 16 regiones" color="#6b7280">
        <ComparisonTable codigos={['SOC_POB_ING', 'SOC_POB_MULTI', 'SOC_RSH_PCT', 'VIV_HACINAMIENTO']}
          indicadores={indicadores} allRegionsUltimos={allRegionsUltimos} regionId={regionId} />
      </Section>
    </div>
  )
}

function DemograficoTab({ indicadores, allRegionsUltimos, regionId, color }: TabProps) {
  return (
    <div className="space-y-6">
      <KpiGrid codigos={['DEM_POB_TOTAL', 'DEM_DENSIDAD', 'DEM_PROM_EDAD', 'DEM_PCT_60MAS', 'DEM_PCT_URBANA', 'DEM_PCT_RURAL']}
        indicadores={indicadores} accentColor={color} cols={6} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Section title="Diversidad e inclusión" badge="Censo 2024" color="#ec4899">
          <KpiGrid codigos={['DEM_PCT_INMIGRANTES', 'DEM_N_INMIGRANTES', 'DEM_PCT_INDIGENA', 'DEM_N_PUEBLOS_ORIG', 'DEM_N_DISCAPACIDAD', 'DEM_PCT_JEF_MUJER']}
            indicadores={indicadores} accentColor="#ec4899" cols={2} />
        </Section>
        <RankingTable codigo="DEM_POB_TOTAL" indicadores={indicadores} regionId={regionId}
          allRegionsUltimos={allRegionsUltimos} label="Ranking población" color={color} />
      </div>

      <Section title="Comparación regional" subtitle="Demografía de las 16 regiones" color="#6b7280">
        <ComparisonTable codigos={['DEM_POB_TOTAL', 'DEM_PROM_EDAD', 'DEM_PCT_INMIGRANTES', 'DEM_PCT_INDIGENA']}
          indicadores={indicadores} allRegionsUltimos={allRegionsUltimos} regionId={regionId} />
      </Section>
    </div>
  )
}

function SaludEduTab({ indicadores, allRegionsUltimos, regionId, color }: TabProps) {
  return (
    <div className="space-y-6">
      <Section title="Salud" subtitle="Cobertura, infraestructura y acceso" badge="DEIS / FONASA" color={color}>
        <KpiGrid codigos={['SAL_FONASA']}
          indicadores={indicadores} accentColor={color} />
      </Section>
      <Section title="Educación" subtitle="Escolaridad y cobertura" badge="Censo 2024 / MINEDUC" color="#6366f1">
        <KpiGrid codigos={['EDU_ESCOLARIDAD', 'EDU_SUPERIOR', 'EDU_ALFABETISMO']}
          indicadores={indicadores} accentColor="#6366f1" cols={3} />
      </Section>

      <Section title="Comparación regional" subtitle="Salud y educación en las 16 regiones" color="#6b7280">
        <ComparisonTable codigos={['SAL_FONASA', 'EDU_ESCOLARIDAD', 'EDU_SUPERIOR', 'EDU_ALFABETISMO']}
          indicadores={indicadores} allRegionsUltimos={allRegionsUltimos} regionId={regionId} />
      </Section>
    </div>
  )
}

function SeguridadTab({ indicadores, allRegionsUltimos, regionId, color }: TabProps) {
  return (
    <div className="space-y-6">
      <KpiGrid codigos={['SEG_VICTIMAS', 'SEG_DEL_100K', 'SEG_INSEG']}
        indicadores={indicadores} accentColor={color} />
      {['SEG_VICTIMAS', 'SEG_INSEG'].some(c => indicadores.get(c)?.catalogo?.comparable_temporalmente === false) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <p className="text-xs text-amber-800"><span className="font-semibold">Quiebre metodológico:</span> ENUSC 2022 no es comparable con versiones anteriores.</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankingTable codigo="SEG_DEL_100K" indicadores={indicadores} regionId={regionId}
          allRegionsUltimos={allRegionsUltimos} label="Ranking tasa delitos / 100k" color={color} />
        <RankingTable codigo="SEG_VICTIMAS" indicadores={indicadores} regionId={regionId}
          allRegionsUltimos={allRegionsUltimos} label="Ranking hogares víctimas DMCS" color={color} />
      </div>

      <Section title="Comparación regional" subtitle="Seguridad en las 16 regiones" color="#6b7280">
        <ComparisonTable codigos={['SEG_DEL_100K', 'SEG_VICTIMAS']}
          indicadores={indicadores} allRegionsUltimos={allRegionsUltimos} regionId={regionId} />
      </Section>
    </div>
  )
}

function AmbienteTab({ indicadores, allRegionsUltimos, regionId, color }: TabProps) {
  return (
    <div className="space-y-6">
      <Section title="Territorio y medio ambiente" badge="Varias fuentes" color={color}>
        <KpiGrid codigos={['GEO_SUP_KM2', 'GEO_PCT_TERR', 'AMB_PROTEGIDA']}
          indicadores={indicadores} accentColor={color} cols={3} />
      </Section>
      <Section title="Calidad del aire" subtitle="Promedio estaciones SINCA" badge="SINCA/MMA" color="#ef4444">
        <KpiGrid codigos={['AMB_MP25', 'AMB_MP10']}
          indicadores={indicadores} accentColor="#ef4444" cols={2} />
      </Section>
      <Section title="Energía" subtitle="Capacidad instalada y renovables" badge="CNE" color="#f59e0b">
        <KpiGrid codigos={['ENE_CAP_INSTALADA', 'ENE_ERNC_PCT']}
          indicadores={indicadores} accentColor="#f59e0b" cols={2} />
      </Section>
      <Section title="Conectividad" subtitle="Acceso a internet y aislamiento" badge="Censo 2024" color="#0ea5e9">
        <KpiGrid codigos={['CON_INTERNET']}
          indicadores={indicadores} accentColor="#0ea5e9" />
      </Section>

      <Section title="Comparación regional" subtitle="Ambiente y energía en las 16 regiones" color="#6b7280">
        <ComparisonTable codigos={['AMB_MP25', 'ENE_ERNC_PCT', 'CON_INTERNET', 'AMB_PROTEGIDA']}
          indicadores={indicadores} allRegionsUltimos={allRegionsUltimos} regionId={regionId} />
      </Section>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

type Props = { region: Region; onClose: () => void }

export default function IndicadoresModalV2({ region, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('pulso')
  const [activeRegionCod, setActiveRegionCod] = useState(region.cod)

  const activeRegion = REGIONS.find(r => r.cod === activeRegionCod) ?? region
  const zoneColor = ZONA_COLORS[activeRegion.zona] ?? '#64748b'
  const tab = TABS.find(t => t.id === activeTab)!
  const regionId = INE_CODE[activeRegionCod] ?? 0

  // v2 data
  const { indicadores, series, allRegionsUltimos, loading } = useV2Dashboard(activeRegionCod, SERIES_CODIGOS)

  // LeyStop semanal (from Colega — separate DB, not v2)
  const { rows: allLeystop, semana: leystopSemana, loading: secAllLoading } = useColegaSeguridadAll()
  const { history: leystopHistory, loading: secRegLoading } = useColegaSeguridadRegion(activeRegionCod)

  const isLoading = loading || secAllLoading || secRegLoading

  const tabProps: TabProps = {
    indicadores, series,
    allRegionsUltimos: allRegionsUltimos as { region_id: number; valor: number | null; codigo_indicador: string }[],
    regionId, color: tab.color, regionNombre: activeRegion.nombre, regionCod: activeRegionCod,
    allLeystop, leystopSemana, leystopHistory,
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-2">
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] h-[96vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#1a1a2e] rounded-t-2xl">
          <div className="flex items-center justify-between px-5 pt-4 pb-0">
            <div className="flex items-center gap-2.5 flex-1 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: zoneColor }} />
              <select value={activeRegionCod} onChange={e => setActiveRegionCod(e.target.value)}
                className="text-sm font-semibold text-white bg-white/10 border border-white/20 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 max-w-[280px]">
                {REGIONS.map(r => (
                  <option key={r.cod} value={r.cod} className="text-gray-900 bg-white">{r.nombre}</option>
                ))}
              </select>
              <span className="text-gray-400 text-xs flex-shrink-0">· Dashboard Regional</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded" aria-label="Cerrar">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 2l12 12M14 2L2 14" /></svg>
            </button>
          </div>

          <nav className="flex mt-3 px-2 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2.5 font-medium transition-colors whitespace-nowrap border-b-2 rounded-t-md ${
                  activeTab === t.id ? 'text-white border-white bg-white/10' : 'text-gray-400 border-transparent hover:text-gray-200 hover:bg-white/5'
                }`}>
                <span>{t.label}</span>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/10 text-gray-400 font-normal">{t.badge}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="p-6">
              {activeTab === 'pulso'       && <PulsoTab {...tabProps} />}
              {activeTab === 'economico'   && <EconomicoTab {...tabProps} />}
              {activeTab === 'social'      && <SocialTab {...tabProps} />}
              {activeTab === 'demografico' && <DemograficoTab {...tabProps} />}
              {activeTab === 'salud_edu'   && <SaludEduTab {...tabProps} />}
              {activeTab === 'seguridad'   && <SeguridadTab {...tabProps} />}
              {activeTab === 'ambiente'    && <AmbienteTab {...tabProps} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
