'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRegionIndicadores } from '@/lib/hooks/useRegionIndicadores'
import { useColegaSeguridadRegion } from '@/lib/hooks/useColegaSeguridad'
import { useSeiaProjects } from '@/lib/hooks/useSeiaProjects'
import { useMopProjects } from '@/lib/hooks/useMopProjects'
import { getSupabase } from '@/lib/supabase'
import { REGIONS } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { PregoRow } from '@/lib/types'
import { PREGO_FASES, PREGO_ESTADO_CONFIG } from '@/lib/types'
import { EJE_COLORS } from '@/lib/config'
import type { UserProfile } from '@/lib/apiAuth'
import dynamic from 'next/dynamic'

const IndicadoresModal = dynamic(() => import('./IndicadoresModal'))

// ── Helpers ───────────────────────────────────────────────────────────────────

function diasSinActividad(lastIso: string | null | undefined): number | null {
  if (!lastIso) return null
  return Math.floor((Date.now() - new Date(lastIso).getTime()) / (1000 * 60 * 60 * 24))
}

function diasHastaHito(fechaStr: string | null): number | null {
  if (!fechaStr) return null
  const hoy = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local timezone
  const diff = new Date(fechaStr).getTime() - new Date(hoy).getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color = '#3B82F6', height = 30 }: { data: number[]; color?: string; height?: number }) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const W = 72
  const pad = 2
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (W - pad * 2)
    const y = pad + ((max - v) / range) * (height - pad * 2)
    return `${x},${y}`
  })
  return (
    <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="overflow-visible flex-shrink-0">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

// ── AlertCard ─────────────────────────────────────────────────────────────────

type AlertItem = { label: string; sub: string; isUrgent?: boolean }

function AlertCard({ icon, title, color, items }: {
  icon: string
  title: string
  color: 'red' | 'amber' | 'gray'
  items: AlertItem[]
}) {
  const [expanded, setExpanded] = useState(false)
  const borderCls = color === 'red'   ? 'border-red-100 bg-red-50'
                  : color === 'amber' ? 'border-amber-100 bg-amber-50'
                  :                     'border-gray-100 bg-gray-50'
  const titleCls  = color === 'red'   ? 'text-red-700'
                  : color === 'amber' ? 'text-amber-700'
                  :                     'text-gray-600'
  const visible   = expanded ? items : items.slice(0, 3)

  return (
    <div className={`rounded-xl border p-3 ${borderCls}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold flex items-center gap-1.5 ${titleCls}`}>
          <span>{icon}</span>{title}
        </span>
        {items.length > 3 && (
          <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-gray-400 hover:text-gray-600">
            {expanded ? 'Ver menos' : `+${items.length - 3} más`}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {visible.map((item, i) => (
          <div key={i} className="flex flex-col">
            <span className={`text-xs font-medium leading-tight truncate ${item.isUrgent ? 'text-red-700' : 'text-slate-700'}`}>
              {item.label}
            </span>
            <span className="text-[10px] text-gray-400 truncate">{item.sub}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MetricCard ────────────────────────────────────────────────────────────────

function MetricCard({ title, subtitle, value, valueNote, trend, trendLabel, trendDown, trendSuffix = 'pp', sparkData, sparkColor, extra, period }: {
  title: string
  subtitle: string
  value: string
  valueNote?: string
  trend: number | null
  trendLabel: string
  trendDown: boolean      // true = going down is good (desocupación, criminalidad)
  trendSuffix?: string
  sparkData?: number[]
  sparkColor?: string
  extra?: string
  period?: string
}) {
  const trendGood = trend === null ? null : (trendDown ? trend < 0 : trend > 0)
  const trendIcon = trend === null ? null : trend > 0 ? '↑' : trend < 0 ? '↓' : '→'
  const trendCls  = trendGood === null ? '' : trendGood ? 'text-green-600' : 'text-red-600'

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-700 truncate">{title}</p>
          <p className="text-[10px] text-gray-400 truncate">{subtitle}</p>
        </div>
        {sparkData && sparkData.length >= 2 && (
          <Sparkline data={sparkData} color={sparkColor} />
        )}
      </div>
      <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      {valueNote && <p className="text-[10px] text-gray-400">{valueNote}</p>}
      {trend !== null && (
        <p className={`text-xs mt-1 ${trendCls}`}>
          {trendIcon} {Math.abs(trend).toFixed(1)}{trendSuffix} {trendLabel}
        </p>
      )}
      {extra && <p className="text-[10px] text-gray-400 mt-1 truncate">{extra}</p>}
      {period && <p className="text-[10px] text-gray-300 mt-1">{period.slice(0, 7)}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  iniciativas: Iniciativa[]
  actividad: Record<number, string | null>
  profile: UserProfile | null
}

export default function VistaRegional({ iniciativas, actividad, profile }: Props) {
  // Determine accessible region codes for this user
  const allowedCods: string[] = useMemo(() => {
    if (!profile) return []
    if (profile.role === 'admin' || profile.role === 'editor') return REGIONS.map(r => r.cod)
    if (profile.region_cods.length > 0) return profile.region_cods
    return REGIONS.map(r => r.cod)
  }, [profile])

  const [selectedCod, setSelectedCod] = useState<string | null>(null)
  const [indicadoresOpen, setIndicadoresOpen] = useState(false)
  const [downloadingMinuta, setDownloadingMinuta] = useState(false)
  const [downloadingTipo, setDownloadingTipo] = useState<'ejecutiva' | 'completo' | null>(null)
  const [minutaMenuOpen, setMinutaMenuOpen] = useState(false)
  const [minutaCache, setMinutaCache] = useState<Record<'ejecutiva' | 'completo', { cached: boolean; generated_at: string | null }>>({
    ejecutiva: { cached: false, generated_at: null },
    completo:  { cached: false, generated_at: null },
  })
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [prego, setPrego] = useState<PregoRow | null>(null)
  const [pibNacional, setPibNacional] = useState<{ period: string; value: number }[]>([])

  // Fetch national PIB series (stored as pib_nacional, region_id=0)
  useEffect(() => {
    getSupabase()
      .from('regional_metrics')
      .select('period, value')
      .eq('region_id', 0)
      .eq('metric_name', 'pib_nacional')
      .order('period', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setPibNacional(data as { period: string; value: number }[])
      })
  }, [])

  // Set default region when profile loads
  useEffect(() => {
    if (allowedCods.length > 0 && !selectedCod) {
      setSelectedCod(allowedCods[0])
    }
  }, [allowedCods]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch PREGO for selected region
  useEffect(() => {
    if (!selectedCod) return
    setPrego(null)
    getSupabase()
      .from('prego_monitoreo')
      .select('*')
      .eq('region_cod', selectedCod)
      .maybeSingle()
      .then(({ data }) => setPrego(data as PregoRow | null))
  }, [selectedCod])

  // Fetch cache status for both minuta types when region changes
  useEffect(() => {
    if (!selectedCod) return
    Promise.all([
      fetch(`/api/minuta?region_cod=${selectedCod}&tipo=ejecutiva`).then(r => r.ok ? r.json() : null),
      fetch(`/api/minuta?region_cod=${selectedCod}&tipo=completo`).then(r => r.ok ? r.json() : null),
    ]).then(([ej, comp]) => {
      setMinutaCache({
        ejecutiva: ej ?? { cached: false, generated_at: null },
        completo:  comp ?? { cached: false, generated_at: null },
      })
    }).catch(() => {})
  }, [selectedCod])

  // Close minuta dropdown on outside click
  useEffect(() => {
    if (!minutaMenuOpen) return
    function close(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-minuta-menu]')) setMinutaMenuOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [minutaMenuOpen])

  const region: Region | null = REGIONS.find(r => r.cod === selectedCod) ?? null

  // Initiatives for this region
  const regionIniciativas = useMemo(
    () => selectedCod ? iniciativas.filter(p => p.cod === selectedCod) : [],
    [iniciativas, selectedCod]
  )

  // External data hooks
  const { timeSeries, loading: metricsLoading } = useRegionIndicadores(selectedCod ?? '')
  const { history: leystopHistory } = useColegaSeguridadRegion(selectedCod ?? '')
  const leystop = leystopHistory.at(-1) ?? null
  const { proyectos: seiaProjects, total: seiaTotal } = useSeiaProjects(selectedCod ?? '')
  const { proyectos: mopProjects, total: mopTotal } = useMopProjects(selectedCod ?? '')

  // ── Computed values ──────────────────────────────────────────────────────────

  const avgPct = regionIniciativas.length > 0
    ? Math.round(regionIniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / regionIniciativas.length)
    : 0

  const semaforoCount = {
    verde: regionIniciativas.filter(p => p.estado_semaforo === 'verde').length,
    ambar: regionIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
    rojo:  regionIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
    gris:  regionIniciativas.filter(p => p.estado_semaforo === 'gris').length,
  }

  const pregoCompletadas = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'completado').length
    : 0

  // Alert: sin actividad
  const alertaSinActividad = regionIniciativas.filter(p => {
    const dias = diasSinActividad(actividad[p.n])
    return dias === null || dias > 15
  })

  // Alert: hitos en <= 7 días o vencidos
  const alertaHitos = regionIniciativas
    .filter(p => {
      const dias = diasHastaHito(p.fecha_proximo_hito)
      return dias !== null && dias <= 7
    })
    .sort((a, b) => (diasHastaHito(a.fecha_proximo_hito) ?? 999) - (diasHastaHito(b.fecha_proximo_hito) ?? 999))

  // Alert: en rojo
  const alertaRojo = regionIniciativas.filter(p => p.estado_semaforo === 'rojo')

  // Alert: PREGO bloqueado
  const alertaPregoFases = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'bloqueado')
    : []

  // Eje breakdown
  const ejeData = useMemo(() => {
    const map: Record<string, { total: number; pctSum: number; verde: number; ambar: number; rojo: number; invSum: number }> = {}
    for (const p of regionIniciativas) {
      if (!map[p.eje]) map[p.eje] = { total: 0, pctSum: 0, verde: 0, ambar: 0, rojo: 0, invSum: 0 }
      map[p.eje].total++
      map[p.eje].pctSum += p.pct_avance ?? 0
      if (p.estado_semaforo === 'verde') map[p.eje].verde++
      if (p.estado_semaforo === 'ambar') map[p.eje].ambar++
      if (p.estado_semaforo === 'rojo')  map[p.eje].rojo++
      map[p.eje].invSum += p.inversion_mm ?? 0
    }
    return Object.entries(map)
      .map(([eje, d]) => ({ eje, avgPct: Math.round(d.pctSum / d.total), ...d }))
      .sort((a, b) => a.eje.localeCompare(b.eje))
  }, [regionIniciativas])

  // Metric series
  const desempleo    = timeSeries.find(s => s.metric_name === 'tasa_desocupacion')
  const pibSeries    = timeSeries.find(s => s.metric_name === 'pib_regional')
  const lastDesempleo = desempleo?.data.at(-1)
  const prevDesempleo = desempleo?.data.at(-2)
  const lastPib       = pibSeries?.data.at(-1)
  const prevPib       = pibSeries?.data.at(-2)

  // % of national PIB for the same quarter
  const pibPctNacional: number | null = (() => {
    if (!lastPib) return null
    const nat = pibNacional.find(r => r.period === lastPib.period)
    if (!nat || nat.value === 0) return null
    return (lastPib.value / nat.value) * 100
  })()

  const invTotal = regionIniciativas.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)

  const showRegionSelector =
    profile?.role === 'admin' ||
    profile?.role === 'editor' ||
    (profile?.region_cods?.length ?? 0) > 1

  // ── Minuta handler ───────────────────────────────────────────────────────────

  async function handleMinuta(tipo: 'ejecutiva' | 'completo' = 'ejecutiva', force = false) {
    if (!region || downloadingMinuta) return
    setDownloadingMinuta(true)
    setDownloadingTipo(tipo)
    setMinutaMenuOpen(false)
    try {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const now = new Date()
      const fecha = `${meses[now.getMonth()]} ${now.getFullYear()}`
      const res = await fetch('/api/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, fecha, tipo, ...(force ? { force: true } : {}) }),
      })
      if (!res.ok) throw new Error('Error generando minuta')
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `minuta-${region.nombre.toLowerCase().replace(/\s+/g, '-')}-${tipo}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      // Update local cache state so buttons reflect new status immediately
      setMinutaCache(prev => ({ ...prev, [tipo]: { cached: true, generated_at: new Date().toISOString() } }))
    } catch {
      setToastMsg('Error al generar la minuta. Inténtalo de nuevo.')
      setTimeout(() => setToastMsg(null), 4000)
    } finally {
      setDownloadingMinuta(false)
      setDownloadingTipo(null)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!profile) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
  }

  if (allowedCods.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin región asignada.</div>
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-5">

        {/* Toast */}
        {toastMsg && (
          <div className="fixed top-24 right-4 z-50 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
            {toastMsg}
          </div>
        )}

        {/* IndicadoresModal — self-contained overlay */}
        {indicadoresOpen && region && (
          <IndicadoresModal region={region} onClose={() => setIndicadoresOpen(false)} />
        )}

        {/* Region selector */}
        {showRegionSelector && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-gray-500 font-medium shrink-0">Región:</label>
            <select
              value={selectedCod ?? ''}
              onChange={e => setSelectedCod(e.target.value)}
              className="text-sm text-slate-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allowedCods.map(cod => {
                const r = REGIONS.find(r => r.cod === cod)
                return <option key={cod} value={cod}>{r?.nombre ?? cod}</option>
              })}
            </select>
          </div>
        )}

        {/* ── Sección 1: Header strip ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-6">
            {/* Left: region name + progress + semáforo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 mb-0.5">
                <h2 className="text-xl font-bold text-slate-900 truncate">{region?.nombre ?? '—'}</h2>
                <span className="text-xs text-gray-400 shrink-0">{region?.zona}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{regionIniciativas.length} iniciativas · {region?.capital}</p>

              {/* Avance bar */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${avgPct}%` }}
                  />
                </div>
                <span className="text-2xl font-bold text-slate-800 tabular-nums">{avgPct}%</span>
                <span className="text-xs text-gray-400">avance promedio</span>
              </div>

              {/* Semáforo breakdown */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"/>
                  <span className="text-green-700 font-semibold">{semaforoCount.verde}</span>
                  <span className="text-gray-400">verde</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"/>
                  <span className="text-amber-700 font-semibold">{semaforoCount.ambar}</span>
                  <span className="text-gray-400">revisión</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"/>
                  <span className="text-red-700 font-semibold">{semaforoCount.rojo}</span>
                  <span className="text-gray-400">bloqueado</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300"/>
                  <span className="text-gray-500 font-semibold">{semaforoCount.gris}</span>
                  <span className="text-gray-400">sin evaluar</span>
                </span>
              </div>
            </div>

            {/* Right: PREGO + action buttons */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {/* PREGO fases */}
              <div className="text-right">
                <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">PREGO</p>
                <div className="flex items-center gap-1">
                  {PREGO_FASES.map((f) => {
                    const estado = prego?.[f.key] ?? 'pendiente'
                    const cfg = PREGO_ESTADO_CONFIG[estado]
                    return (
                      <div
                        key={f.key}
                        title={`${f.label} ${f.sublabel}: ${cfg.label}`}
                        className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold transition-colors ${cfg.pill}`}
                      >
                        {cfg.dot}
                      </div>
                    )
                  })}
                  <span className="text-xs text-gray-400 ml-1">{pregoCompletadas}/{PREGO_FASES.length}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {region && (
                  <button
                    onClick={() => setIndicadoresOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1 9l3-3 2 2 3-4 2 2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Indicadores
                  </button>
                )}
                {/* Minuta split button */}
                <div className="relative" data-minuta-menu="true">
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                      <button
                        onClick={() => handleMinuta('ejecutiva')}
                        disabled={downloadingMinuta || !region}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {downloadingMinuta && downloadingTipo === 'ejecutiva' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                              <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                            </svg>
                            {minutaCache.ejecutiva.cached ? 'Descargando...' : 'Generando...'}
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <path d="M2 2h5l3 3v5H2V2z"/><path d="M6 2v4h4"/>
                            </svg>
                            {minutaCache.ejecutiva.cached ? 'Descargar ejecutiva' : 'Generar ejecutiva'}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setMinutaMenuOpen(v => !v)}
                        disabled={downloadingMinuta || !region}
                        className="px-2 py-1.5 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors border-l border-slate-700"
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                    {/* Force regenerate — admin/editor only, visible when cached */}
                    {(profile?.role === 'admin' || profile?.role === 'editor') && minutaCache.ejecutiva.cached && (
                      <button
                        onClick={() => handleMinuta('ejecutiva', true)}
                        disabled={downloadingMinuta || !region}
                        title="Regenerar con IA (fuerza nueva generación)"
                        className="p-1.5 text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 6a5 5 0 1 0 1-3"/>
                          <path d="M1 1v3h3"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {minutaMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-max py-1">
                      <button
                        onClick={() => handleMinuta('completo')}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        {downloadingMinuta && downloadingTipo === 'completo' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                              <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                            </svg>
                            {minutaCache.completo.cached ? 'Descargando...' : 'Generando...'}
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="1" width="8" height="10" rx="1"/><line x1="4" y1="4" x2="8" y2="4"/><line x1="4" y1="6" x2="8" y2="6"/><line x1="4" y1="8" x2="6" y2="8"/>
                            </svg>
                            {minutaCache.completo.cached ? 'Descargar Reporte Completo' : 'Generar Reporte Completo'}
                          </>
                        )}
                      </button>
                      {(profile?.role === 'admin' || profile?.role === 'editor') && minutaCache.completo.cached && (
                        <button
                          onClick={() => handleMinuta('completo', true)}
                          className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 6a5 5 0 1 0 1-3"/>
                            <path d="M1 1v3h3"/>
                          </svg>
                          Regenerar con IA
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Sección 2: Alertas ───────────────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Alertas activas</h3>
          {alertaSinActividad.length === 0 && alertaHitos.length === 0 && alertaRojo.length === 0 && alertaPregoFases.length === 0 ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
                <circle cx="9" cy="9" r="7"/>
                <path d="M6 9l2 2 4-4"/>
              </svg>
              <span className="text-sm text-green-700 font-medium">Todo en orden — sin alertas activas</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {alertaRojo.length > 0 && (
                <AlertCard
                  icon="🔴"
                  title={`${alertaRojo.length} iniciativa${alertaRojo.length !== 1 ? 's' : ''} bloqueada${alertaRojo.length !== 1 ? 's' : ''}`}
                  color="red"
                  items={alertaRojo.map(p => ({
                    label: p.nombre,
                    sub: `${p.ministerio} · ${p.pct_avance ?? 0}% avance`,
                  }))}
                />
              )}
              {alertaHitos.length > 0 && (
                <AlertCard
                  icon="📅"
                  title={`${alertaHitos.length} hito${alertaHitos.length !== 1 ? 's' : ''} próximo${alertaHitos.length !== 1 ? 's' : ''} (≤7 días)`}
                  color="amber"
                  items={alertaHitos.map(p => {
                    const dias = diasHastaHito(p.fecha_proximo_hito)
                    const subLabel = dias !== null && dias < 0
                      ? `Vencido hace ${Math.abs(dias)}d`
                      : dias === 0
                      ? 'Hoy'
                      : `En ${dias}d — ${p.proximo_hito ?? ''}`
                    return { label: p.nombre, sub: subLabel, isUrgent: dias !== null && dias <= 0 }
                  })}
                />
              )}
              {alertaSinActividad.length > 0 && (
                <AlertCard
                  icon="🕐"
                  title={`${alertaSinActividad.length} sin actividad (+15 días)`}
                  color="gray"
                  items={alertaSinActividad.map(p => {
                    const dias = diasSinActividad(actividad[p.n])
                    return {
                      label: p.nombre,
                      sub: dias === null ? 'Sin actividad registrada' : `Hace ${dias} días`,
                    }
                  })}
                />
              )}
              {alertaPregoFases.length > 0 && (
                <AlertCard
                  icon="🚧"
                  title={`PREGO: ${alertaPregoFases.length} fase${alertaPregoFases.length !== 1 ? 's' : ''} bloqueada${alertaPregoFases.length !== 1 ? 's' : ''}`}
                  color="red"
                  items={alertaPregoFases.map(f => ({ label: `${f.label}: ${f.sublabel}`, sub: 'Estado: bloqueado' }))}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Sección 3: Avance por eje ────────────────────────────────────────── */}
        {ejeData.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Avance por eje estratégico</h3>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {ejeData.map(({ eje, avgPct: ejePct, total, verde, ambar, rojo, invSum }) => {
                const colorCls = EJE_COLORS[eje] ?? 'bg-gray-100 text-gray-700'
                const barColor = ejePct >= 70 ? 'bg-green-500' : ejePct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                const ejeNum   = eje.match(/^Eje \d+/)?.[0] ?? 'Eje'
                const shortName = eje.replace(/^Eje \d+:\s*/, '')
                return (
                  <div key={eje} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 ${colorCls}`}>
                      {ejeNum}
                    </span>
                    <p className="text-xs font-semibold text-slate-700 mb-3 leading-tight line-clamp-2">{shortName}</p>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${ejePct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">{ejePct}%</span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <div className="flex items-center gap-1.5">
                        {rojo  > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>{rojo}</span>}
                        {ambar > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>{ambar}</span>}
                        {verde > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"/>{verde}</span>}
                      </div>
                      <span>{total} init.</span>
                    </div>
                    {invSum > 0 && (
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        ${Math.round(invSum).toLocaleString('es-CL')} MM inversión
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Sección 4: Métricas clave ────────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Métricas clave</h3>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard
              title="Desocupación"
              subtitle="BCCh mensual"
              value={lastDesempleo ? `${lastDesempleo.value.toFixed(1)}%` : metricsLoading ? '…' : 'N/D'}
              trend={lastDesempleo && prevDesempleo ? lastDesempleo.value - prevDesempleo.value : null}
              trendLabel="vs mes anterior"
              trendDown={true}
              sparkData={desempleo?.data.slice(-8).map(d => d.value)}
              sparkColor="#EF4444"
              period={lastDesempleo?.period}
            />
            <MetricCard
              title="Seguridad"
              subtitle={leystop ? `Sem. ${leystop.semana ?? ''}` : 'Semanal LeyStop'}
              value={leystop ? `${leystop.tasa_registro?.toFixed(1) ?? '—'}/100k` : metricsLoading ? '…' : 'N/D'}
              trend={leystop?.var_ultima_semana ?? null}
              trendLabel="var. semana"
              trendDown={true}
              sparkData={undefined}
              extra={[leystop?.mayor_registro_1, leystop?.mayor_registro_2].filter(Boolean).join(' · ') || undefined}
            />
            <MetricCard
              title="PIB Regional"
              subtitle="BCCh trimestral"
              value={lastPib ? `$${Math.round(lastPib.value).toLocaleString('es-CL')} MM${pibPctNacional !== null ? ` (${pibPctNacional.toFixed(1)}%)` : ''}` : metricsLoading ? '…' : 'N/D'}
              valueNote="del PIB nacional · miles de MM CLP"
              trend={lastPib && prevPib ? ((lastPib.value - prevPib.value) / prevPib.value) * 100 : null}
              trendLabel="var. trim."
              trendSuffix="%"
              trendDown={false}
              sparkData={pibSeries?.data.slice(-6).map(d => d.value)}
              sparkColor="#3B82F6"
              period={lastPib?.period}
            />
            <MetricCard
              title="Inversión"
              subtitle="Iniciativas región"
              value={invTotal > 0 ? `$${Math.round(invTotal).toLocaleString('es-CL')} MM` : '—'}
              valueNote={`${regionIniciativas.length} iniciativas`}
              trend={null}
              trendLabel=""
              trendDown={false}
            />
          </div>
        </div>

        {/* ── Sección 5: Pipeline externo ──────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pipeline externo</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* SEIA */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🌿</span>
                <span className="text-xs font-semibold text-gray-700">SEIA — Evaluación Ambiental</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{seiaTotal}</p>
              <p className="text-xs text-gray-400 mt-0.5">proyectos en evaluación</p>
              {seiaProjects.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Inversión: ${Math.round(
                    seiaProjects.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
                  ).toLocaleString('es-CL')} MM
                </p>
              )}
              <p className="text-[10px] text-gray-300 mt-3">Sync: lunes 8am UTC</p>
            </div>

            {/* MOP */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🏗</span>
                <span className="text-xs font-semibold text-gray-700">MOP — Obras Públicas</span>
              </div>
              <p className="text-2xl font-bold text-slate-800 tabular-nums">{mopTotal}</p>
              <p className="text-xs text-gray-400 mt-0.5">proyectos de infraestructura</p>
              {mopProjects.length > 0 && (() => {
                const etapas: Record<string, number> = {}
                for (const p of mopProjects) {
                  if (p.etapa) etapas[p.etapa] = (etapas[p.etapa] ?? 0) + 1
                }
                const top2 = Object.entries(etapas).sort((a, b) => b[1] - a[1]).slice(0, 2)
                return top2.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {top2.map(([etapa, n]) => (
                      <span key={etapa} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {etapa} ({n})
                      </span>
                    ))}
                  </div>
                ) : null
              })()}
              <p className="text-[10px] text-gray-300 mt-3">Sync: lunes 9am UTC</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
