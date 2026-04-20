'use client'

import { useState, useEffect } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import { ZONA_COLORS, REGIONS } from '@/lib/regions'
import { useRegionMetrics } from '@/lib/hooks/useRegionMetrics'
import { useSeiaProjects } from '@/lib/hooks/useSeiaProjects'
import { useMopProjects } from '@/lib/hooks/useMopProjects'
import { usePibSectorial } from '@/lib/hooks/usePibSectorial'
import { INE_CODE } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import RegionMetricsChart from './RegionMetricsChart'
import RegionComparisonModal from './RegionComparisonModal'
import SeiaProjectsList from './SeiaProjectsList'
import MopProjectsList from './MopProjectsList'
import PibSectorialChart from './PibSectorialChart'
import CollapsibleSection from './CollapsibleSection'
import { SEMAFORO_CONFIG, EJE_COLORS, prioridadColor } from '@/lib/config'

// ── Regional trend config ────────────────────────────────────────────────────
// Add new entries here as more series are synced. name must match metric_name in regional_metrics.
const TREND_CONFIG = [
  { name: 'tasa_desocupacion', label: 'Desocupación', yFmt: (v: number) => `${v.toLocaleString('es-CL')}%` },
  { name: 'pib_regional',      label: 'PIB Regional', yFmt: (v: number) => `${v.toFixed(0)} MM$` },
] as const

// Stable array for hook dependency — module-level to avoid re-renders.
const ALL_TREND_METRIC_NAMES = TREND_CONFIG.map(m => m.name)

const SEMAFORO_ORDER = { rojo: 0, ambar: 1, verde: 2, gris: 3 }

function ejeColor(eje: string) {
  return EJE_COLORS[eje] ?? 'bg-gray-100 text-gray-600'
}

function diasSinActividad(lastIso: string | null | undefined): number | null {
  if (!lastIso) return null
  const diff = Date.now() - new Date(lastIso).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

type FilterSemaforo = keyof typeof SEMAFORO_CONFIG | 'todos'
type FilterPrioridad = 'Alta' | 'Media' | 'Baja' | 'todas'
type SortBy = 'semaforo' | 'prioridad' | 'avance' | 'actividad'

type Props = {
  region: Region
  projects: Iniciativa[]
  onClose: () => void
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
}

export default function IniciativasPanel({ region, projects, onClose, onUpdatePrioridad }: Props) {
  const zoneColor = ZONA_COLORS[region.zona] ?? '#6B7280'
  const [downloading, setDownloading]       = useState(false)
  const [selectedPrioridad, setSelectedPrioridad] = useState<Iniciativa | null>(null)
  const [actividad, setActividad]           = useState<Record<number, string | null>>({})
  const [actividadLoading, setActividadLoading] = useState(false)
  const [toast, setToast]                   = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [trendOpen, setTrendOpen]           = useState(false)
  const [activeMetric, setActiveMetric]     = useState<string>(TREND_CONFIG[0].name)
  const [comparisonOpen, setComparisonOpen] = useState(false)
  const [seiaModalOpen, setSeiaModalOpen]       = useState(false)
  const [mopModalOpen, setMopModalOpen]         = useState(false)
  const [seiaModalRegion, setSeiaModalRegion]   = useState(region)
  const [mopModalRegion, setMopModalRegion]     = useState(region)
  const [pibOpen, setPibOpen]                   = useState(false)

  const trendData     = useRegionMetrics(region.cod, ALL_TREND_METRIC_NAMES)
  const seiaData      = useSeiaProjects(region.cod)
  const mopData       = useMopProjects(region.cod)
  const pibData       = usePibSectorial(region.cod)
  const seiaModalData = useSeiaProjects(seiaModalRegion.cod)
  const mopModalData  = useMopProjects(mopModalRegion.cod)

  const availableTabs = TREND_CONFIG.filter(m =>
    trendData.data.some(s => s.metric_name === m.name)
  )
  const activeSeries = trendData.data.filter(s => s.metric_name === activeMetric)
  const activeConfig = TREND_CONFIG.find(m => m.name === activeMetric) ?? TREND_CONFIG[0]

  // Filters
  const [search, setSearch]                     = useState('')
  const [filterSemaforo, setFilterSemaforo]     = useState<FilterSemaforo>('todos')
  const [filterPrioridad, setFilterPrioridad]   = useState<FilterPrioridad>('todas')
  const [sortBy, setSortBy]                     = useState<SortBy>('semaforo')

  useEffect(() => {
    setSeiaModalRegion(region)
    setMopModalRegion(region)
  }, [region.cod])

  useEffect(() => {
    setActividad({})
    setActividadLoading(true)
    fetch(`/api/actividad/${region.cod}`)
      .then(r => r.ok ? r.json() : {})
      .then(data => setActividad(data))
      .catch(() => setActividad({}))
      .finally(() => setActividadLoading(false))
  }, [region.cod])

  // RAG counts
  const verde        = projects.filter(p => p.estado_semaforo === 'verde').length
  const ambar        = projects.filter(p => p.estado_semaforo === 'ambar').length
  const rojo         = projects.filter(p => p.estado_semaforo === 'rojo').length
  const sinEvaluar   = projects.filter(p => p.estado_semaforo === 'gris').length
  const alta         = projects.filter(p => p.prioridad === 'Alta').length
  const media        = projects.filter(p => p.prioridad === 'Media').length

  // Filter + sort
  const filteredIniciativas = projects
    .filter(p => {
      if (search) {
        const q = search.toLowerCase()
        const inNombre = p.nombre.toLowerCase().includes(q)
        const inMin    = p.ministerio.toLowerCase().includes(q)
        if (!inNombre && !inMin) return false
      }
      if (filterSemaforo !== 'todos' && p.estado_semaforo !== filterSemaforo) return false
      if (filterPrioridad !== 'todas' && p.prioridad !== filterPrioridad) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'semaforo')  return SEMAFORO_ORDER[a.estado_semaforo] - SEMAFORO_ORDER[b.estado_semaforo]
      if (sortBy === 'prioridad') return (a.prioridad === 'Alta' ? 0 : 1) - (b.prioridad === 'Alta' ? 0 : 1)
      if (sortBy === 'avance')    return a.pct_avance - b.pct_avance
      if (sortBy === 'actividad') {
        // nulls (never updated) go first — they are the most stale
        const da = actividad[a.n] ? new Date(actividad[a.n]!).getTime() : 0
        const db = actividad[b.n] ? new Date(actividad[b.n]!).getTime() : 0
        return da - db
      }
      return 0
    })

  async function handleDownload() {
    setDownloading(true)
    try {
      const now = new Date()
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const fecha = `${meses[now.getMonth()]} ${now.getFullYear()}`
      const res = await fetch('/api/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, fecha }),
      })
      if (!res.ok) throw new Error('Error generando minuta')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minuta-${region.nombre.toLowerCase().replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      setToast({ type: 'error', msg: 'Error al generar la minuta. Inténtalo de nuevo.' })
      setTimeout(() => setToast(null), 4000)
    } finally {
      setDownloading(false)
    }
  }

  // Sync selectedPrioridad when projects update (after modal saves semaforo/pct)
  useEffect(() => {
    if (selectedPrioridad) {
      const updated = projects.find(p => p.n === selectedPrioridad.n)
      if (updated) setSelectedPrioridad(updated)
    }
  }, [projects])

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100" style={{ borderTop: `4px solid ${zoneColor}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: zoneColor }}>
                {region.zona}
              </span>
              <span className="text-xs text-gray-500">Región {region.cod}</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{region.nombre}</h2>
            <p className="text-sm text-gray-600 mt-0.5">Capital: {region.capital}</p>
            <button
              onClick={() => setComparisonOpen(true)}
              className="flex items-center gap-1.5 mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
              title="Ver comparativa de las 16 regiones"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8">
                <polyline points="1,10 4,5 7,7 10,2 12,4"/>
                <line x1="1" y1="12" x2="12" y2="12"/>
              </svg>
              Comparar 16 regiones
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Descargar minuta en PDF"
            >
              {downloading ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                    <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Minuta PDF
                </>
              )}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cerrar">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap gap-2 mt-3">
          <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
            <span className="text-sm font-bold text-gray-900">{projects.length}</span>
            <span className="text-xs text-gray-500">total</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"/>
            <span className="text-sm font-bold text-red-700">{alta}</span>
            <span className="text-xs text-red-400">alta</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"/>
            <span className="text-sm font-bold text-amber-700">{media}</span>
            <span className="text-xs text-amber-400">media</span>
          </div>
          {rojo > 0 && (
            <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0 ring-2 ring-red-200"/>
              <span className="text-sm font-bold text-red-700">{rojo}</span>
            </div>
          )}
          {ambar > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-2.5 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 flex-shrink-0 ring-2 ring-amber-200"/>
              <span className="text-sm font-bold text-amber-700">{ambar}</span>
            </div>
          )}
          {verde > 0 && (
            <div className="flex items-center gap-1.5 bg-green-50 rounded-lg px-2.5 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0 ring-2 ring-green-200"/>
              <span className="text-sm font-bold text-green-700">{verde}</span>
            </div>
          )}
          {sinEvaluar > 0 && (
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0"/>
              <span className="text-sm font-bold text-gray-500">{sinEvaluar}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Filtros (sticky) ── */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 space-y-2">
        <div className="relative">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
            <circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l2.5 2.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por meta o ministerio..."
            className="w-full pl-8 pr-3 py-1.5 text-xs text-gray-800 placeholder:text-gray-400 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l8 8M10 2L2 10" strokeLinecap="round"/>
              </svg>
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['todos', 'rojo', 'ambar', 'verde', 'gris'] as FilterSemaforo[]).map(s => (
            <button
              key={s}
              onClick={() => setFilterSemaforo(s)}
              className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                filterSemaforo === s ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {s !== 'todos' && <span className={`w-2 h-2 rounded-full ${SEMAFORO_CONFIG[s].dot}`}/>}
              {s === 'todos' ? 'Todos' : SEMAFORO_CONFIG[s].label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 mx-0.5"/>
          {(['todas', 'Alta', 'Media', 'Baja'] as FilterPrioridad[]).map(p => (
            <button
              key={p}
              onClick={() => setFilterPrioridad(p)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                filterPrioridad === p ? 'bg-slate-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {p === 'todas' ? 'Todas' : p}
            </button>
          ))}
          <div className="ml-auto">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortBy)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="semaforo">↑ Semáforo</option>
              <option value="prioridad">↑ Alta primero</option>
              <option value="avance">↑ Menor avance</option>
              <option value="actividad">↑ Sin actividad</option>
            </select>
          </div>
        </div>
      </div>

      {/* ── Single scroll area: contexto + iniciativas ── */}
      <div className="flex-1 overflow-y-auto">

        {/* Tendencia de Indicadores */}
        {(trendData.loading || trendData.data.length > 0) && (
          <CollapsibleSection
            title="Tendencia de Indicadores"
            isOpen={trendOpen}
            onToggle={() => setTrendOpen(o => !o)}
            loading={trendData.loading}
          >
            <div className="px-5 pb-4">
              {availableTabs.length > 1 && (
                <div className="flex gap-1 mb-3 border-b border-gray-200">
                  {availableTabs.map(m => (
                    <button
                      key={m.name}
                      onClick={() => setActiveMetric(m.name)}
                      className={`text-xs px-3 py-1.5 font-medium transition-colors border-b-2 -mb-px ${
                        activeMetric === m.name
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              )}
              <RegionMetricsChart
                series={activeSeries}
                loading={trendData.loading}
                error={trendData.error}
                metricLabels={{ [activeMetric]: activeConfig.label }}
                yFormatter={activeConfig.yFmt}
              />
            </div>
          </CollapsibleSection>
        )}

        {/* PIB Sectorial */}
        {(pibData.loading || pibData.data.length > 0) && (
          <CollapsibleSection
            title="PIB Sectorial"
            isOpen={pibOpen}
            onToggle={() => setPibOpen(o => !o)}
            loading={pibData.loading}
          >
            <PibSectorialChart
              data={pibData.data}
              latestPeriod={pibData.latestPeriod}
              loading={pibData.loading}
              error={pibData.error}
            />
          </CollapsibleSection>
        )}

        {/* SEIA + MOP — acceso rápido */}
        {(seiaData.loading || seiaData.proyectos.length > 0 || mopData.loading || mopData.proyectos.length > 0) && (
          <div className="px-4 py-3 flex gap-2 border-b border-gray-100">
            {(seiaData.loading || seiaData.proyectos.length > 0) && (
              <button
                onClick={() => setSeiaModalOpen(true)}
                className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-teal-50 border border-teal-100 hover:bg-teal-100 hover:border-teal-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M6 1v5M3.5 3.5L6 1l2.5 2.5"/><path d="M2 7v3h8V7"/>
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-teal-900 leading-tight">Proyectos SEIA</p>
                    {seiaData.total > 0 && <p className="text-xs text-teal-600">{seiaData.total} proyectos</p>}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-teal-400 flex-shrink-0">
                  <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            {(mopData.loading || mopData.proyectos.length > 0) && (
              <button
                onClick={() => setMopModalOpen(true)}
                className="flex-1 flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 hover:border-blue-200 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                      <rect x="1" y="3" width="10" height="7" rx="1"/><path d="M4 3V2a1 1 0 011-1h2a1 1 0 011 1v1"/>
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-blue-900 leading-tight">Proyectos MOP</p>
                    {mopData.total > 0 && <p className="text-xs text-blue-600">{mopData.total} proyectos</p>}
                  </div>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-blue-400 flex-shrink-0">
                  <path d="M3 7h8M7.5 3.5L11 7l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Iniciativas */}
        <div className="px-4 py-3 space-y-3">
          {filteredIniciativas.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">Sin iniciativas con estos filtros</p>
              <button
                onClick={() => { setSearch(''); setFilterSemaforo('todos'); setFilterPrioridad('todas') }}
                className="mt-2 text-xs text-slate-600 underline"
              >
                Limpiar filtros
              </button>
            </div>
          ) : (
            filteredIniciativas.map(p => {
              const sem = SEMAFORO_CONFIG[p.estado_semaforo]
              return (
                <div
                  key={p.n}
                  onClick={() => setSelectedPrioridad(p)}
                  className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label}/>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full truncate ${ejeColor(p.eje)}`}>
                        {p.eje}
                      </span>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${prioridadColor(p.prioridad).bg} ${prioridadColor(p.prioridad).text}`}>
                      {p.prioridad}
                    </span>
                  </div>
                  <p className="text-sm text-gray-800 leading-snug mb-3">{p.nombre}</p>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"/>
                    <span className="text-xs text-gray-700">{p.ministerio}</span>
                  </div>
                  <div className="pt-3 border-t border-gray-50">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                          <rect x="1" y="2" width="10" height="9" rx="1.5"/><path d="M4 1v2M8 1v2M1 5h10"/>
                        </svg>
                        <span className="text-xs text-gray-600">{p.fecha_proximo_hito ?? '—'}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-600">{p.pct_avance}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          p.estado_semaforo === 'rojo'  ? 'bg-red-400' :
                          p.estado_semaforo === 'ambar' ? 'bg-amber-400' :
                          p.estado_semaforo === 'verde' ? 'bg-green-500' : 'bg-gray-300'
                        }`}
                        style={{ width: `${p.pct_avance}%` }}
                      />
                    </div>
                    {actividadLoading ? (
                      <div className="mt-1.5 h-3 bg-gray-100 rounded animate-pulse w-28" />
                    ) : (() => {
                      const dias = diasSinActividad(actividad[p.n])
                      if (dias === null) return <p className="text-xs text-red-500 mt-1.5 font-medium">Sin actividad registrada</p>
                      if (dias > 15)    return <p className="text-xs text-red-500 mt-1.5">Sin actividad hace <span className="font-semibold">{dias} días</span></p>
                      if (dias > 7)     return <p className="text-xs text-amber-600 mt-1.5">Última actividad hace {dias} días</p>
                      return <p className="text-xs text-gray-500 mt-1.5">Última actividad hace {dias === 0 ? 'hoy' : `${dias} día${dias > 1 ? 's' : ''}`}</p>
                    })()}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {comparisonOpen && (
        <RegionComparisonModal onClose={() => setComparisonOpen(false)} />
      )}

      {/* ── Modal SEIA fullscreen ── */}
      {seiaModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 1v5M3.5 3.5L6 1l2.5 2.5"/><path d="M2 7v3h8V7"/>
                </svg>
              </span>
              <div>
                <h2 className="text-base font-bold text-gray-900">Proyectos SEIA</h2>
                <p className="text-xs text-gray-500">Sistema de Evaluación de Impacto Ambiental</p>
              </div>
            </div>
            <select
              value={seiaModalRegion.cod}
              onChange={e => {
                const r = REGIONS.find(r => r.cod === e.target.value)
                if (r) setSeiaModalRegion(r)
              }}
              className="ml-4 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {REGIONS.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
            </select>
            {seiaModalData.total > 0 && (
              <span className="text-sm text-gray-500">{seiaModalData.total} proyectos</span>
            )}
            <button
              onClick={() => setSeiaModalOpen(false)}
              className="ml-auto text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16"/>
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto relative">
            <SeiaProjectsList
              proyectos={seiaModalData.proyectos}
              total={seiaModalData.total}
              loading={seiaModalData.loading}
              error={seiaModalData.error}
              regionId={INE_CODE[seiaModalRegion.cod] ?? 0}
            />
          </div>
        </div>
      )}

      {/* ── Modal MOP fullscreen ── */}
      {mopModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 flex items-center gap-4">
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round">
                  <rect x="1" y="3" width="10" height="7" rx="1"/><path d="M4 3V2a1 1 0 011-1h2a1 1 0 011 1v1"/>
                </svg>
              </span>
              <div>
                <h2 className="text-base font-bold text-gray-900">Proyectos MOP</h2>
                <p className="text-xs text-gray-500">Ministerio de Obras Públicas</p>
              </div>
            </div>
            <select
              value={mopModalRegion.cod}
              onChange={e => {
                const r = REGIONS.find(r => r.cod === e.target.value)
                if (r) setMopModalRegion(r)
              }}
              className="ml-4 text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              {REGIONS.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
            </select>
            {mopModalData.total > 0 && (
              <span className="text-sm text-gray-500">{mopModalData.total} proyectos</span>
            )}
            <button
              onClick={() => setMopModalOpen(false)}
              className="ml-auto text-gray-400 hover:text-gray-700 transition-colors"
            >
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16"/>
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto relative">
            <MopProjectsList
              proyectos={mopModalData.proyectos}
              total={mopModalData.total}
              loading={mopModalData.loading}
              error={mopModalData.error}
            />
          </div>
        </div>
      )}

      {selectedPrioridad && (
        <ProjectTrackerModal
          prioridad={selectedPrioridad}
          onClose={() => setSelectedPrioridad(null)}
          onUpdatePrioridad={onUpdatePrioridad}
        />
      )}

      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-1 opacity-70 hover:opacity-100">✕</button>
        </div>
      )}
    </div>
  )
}
