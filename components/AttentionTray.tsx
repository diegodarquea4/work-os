'use client'

import { useMemo, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { SEMAFORO_CONFIG, prioridadColor, ejeGobColor } from '@/lib/config'
import { useCanEditAny } from '@/lib/context/UserContext'
import ProjectTrackerModal from './ProjectTrackerModal'

type Props = {
  projects: Iniciativa[]
  actividad: Record<number, string | null>
  actividadLoading: boolean
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function diasSinActividad(n: number, actividad: Record<number, string | null>): number | null {
  const last = actividad[n]
  if (!last) return null
  return Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
}

function diasHastaHito(fechaStr: string | null): number | null {
  if (!fechaStr) return null
  const hoy = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD en timezone local
  const diff = new Date(fechaStr).getTime() - new Date(hoy).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

function fmtDias(dias: number | null): { text: string; color: string } {
  if (dias === null) return { text: 'Sin actividad registrada', color: 'text-red-500' }
  if (dias === 0)    return { text: 'Actividad hoy',            color: 'text-green-600' }
  if (dias <= 7)     return { text: `Hace ${dias} día${dias > 1 ? 's' : ''}`, color: 'text-gray-500' }
  if (dias <= 15)    return { text: `Hace ${dias} días`,        color: 'text-amber-600' }
  return                    { text: `Hace ${dias} días`,        color: 'text-red-500' }
}

function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, val: T) {
  setter(prev => {
    const next = new Set(prev)
    next.has(val) ? next.delete(val) : next.add(val)
    return next
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttentionTray({
  projects, actividad, actividadLoading: loading,
  onUpdatePrioridad, onDeletePrioridad,
}: Props) {
  const canEditAny = useCanEditAny()

  // Filters
  const [search, setSearch]                     = useState('')
  const [filterRegion, setFilterRegion]         = useState('todas')
  const [filterEjeGob, setFilterEjeGob]         = useState<Set<string>>(new Set())
  const [filterPrioridad, setFilterPrioridad]   = useState<Set<string>>(new Set())

  // UI
  const [collapsed, setCollapsed]               = useState<Record<string, boolean>>({})
  const [selectedIniciativa, setSelectedIniciativa] = useState<Iniciativa | null>(null)

  const regions = useMemo(() => Array.from(new Set(projects.map(p => p.region))).sort(), [projects])

  const filtersActive = search !== '' || filterRegion !== 'todas' || filterEjeGob.size > 0 || filterPrioridad.size > 0

  function clearFilters() {
    setSearch(''); setFilterRegion('todas'); setFilterEjeGob(new Set()); setFilterPrioridad(new Set())
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  const { hitoVencido, bloqueadas, sinActividad, hitoProximo, avanceBajo, uniqueCount } = useMemo(() => {
    const q = search.toLowerCase()
    const TODAY = new Date().toLocaleDateString('en-CA')

    const pool = projects
      .filter(p => !q || p.nombre.toLowerCase().includes(q) || p.ministerio.toLowerCase().includes(q))
      .filter(p => filterRegion === 'todas' || p.region === filterRegion)
      .filter(p => filterEjeGob.size === 0 || filterEjeGob.has(p.eje_gobierno ?? ''))
      .filter(p => filterPrioridad.size === 0 || filterPrioridad.has(p.prioridad))

    const hitoVencido = pool
      .filter(p => p.fecha_proximo_hito && p.fecha_proximo_hito < TODAY && p.estado_semaforo !== 'verde')
      .sort((a, b) => (a.fecha_proximo_hito ?? '').localeCompare(b.fecha_proximo_hito ?? ''))

    const bloqueadas = pool
      .filter(p => p.estado_semaforo === 'rojo')
      .sort((a, b) => (diasSinActividad(b.n, actividad) ?? 9999) - (diasSinActividad(a.n, actividad) ?? 9999))

    const sinActividad = pool
      .filter(p => {
        if (p.estado_semaforo === 'rojo') return false
        const dias = diasSinActividad(p.n, actividad)
        return dias === null || dias > 15
      })
      .sort((a, b) => (diasSinActividad(b.n, actividad) ?? 9999) - (diasSinActividad(a.n, actividad) ?? 9999))

    const hitoProximo = pool
      .filter(p => {
        if (!p.fecha_proximo_hito || p.estado_semaforo === 'verde') return false
        const dias = diasHastaHito(p.fecha_proximo_hito)
        return dias !== null && dias >= 0 && dias <= 14
      })
      .sort((a, b) => (a.fecha_proximo_hito ?? '').localeCompare(b.fecha_proximo_hito ?? ''))

    const avanceBajo = pool
      .filter(p => (p.pct_avance ?? 0) < 30 && p.estado_semaforo !== 'rojo')
      .sort((a, b) => (a.pct_avance ?? 0) - (b.pct_avance ?? 0))

    const uniqueCount = new Set(
      [...hitoVencido, ...bloqueadas, ...sinActividad, ...hitoProximo, ...avanceBajo].map(p => p.n)
    ).size

    return { hitoVencido, bloqueadas, sinActividad, hitoProximo, avanceBajo, uniqueCount }
  }, [projects, actividad, search, filterRegion, filterEjeGob, filterPrioridad])

  // ── Inner components ───────────────────────────────────────────────────────

  function Section({
    id, label, badgeClass, iconColor, count, icon, children,
  }: {
    id: string; label: string; badgeClass: string; iconColor: string
    count: number; icon: React.ReactNode; children: React.ReactNode
  }) {
    const isOpen = !collapsed[id]
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))}
          className="w-full flex items-center gap-3 px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors text-left"
        >
          <span className={`flex-shrink-0 ${iconColor}`}>{icon}</span>
          <span className="text-sm font-semibold text-gray-800 flex-1">{label}</span>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${count === 0 ? 'bg-gray-100 text-gray-400' : badgeClass}`}>
            {count}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>
        {isOpen && (
          <div className="border-t border-gray-100">
            {count === 0
              ? <div className="px-5 py-4 text-sm text-gray-400 text-center">Sin iniciativas en esta categoría</div>
              : children
            }
          </div>
        )}
      </div>
    )
  }

  function IniciativaRow({ p, metricText, metricColor }: { p: Iniciativa; metricText: string; metricColor: string }) {
    const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
    const pc  = prioridadColor(p.prioridad)
    return (
      <button
        onClick={() => setSelectedIniciativa(p)}
        className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 border-b border-gray-50 last:border-b-0 transition-colors group"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} />
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${pc.bg} ${pc.text}`}>
          {p.prioridad}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2 group-hover:text-slate-900">
            {p.nombre}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-500">{p.ministerio}</span>
            {p.eje_gobierno && (
              <span className={`text-xs px-1.5 py-0 rounded-full font-medium ${ejeGobColor(p.eje_gobierno)}`}>
                {p.eje_gobierno}
              </span>
            )}
            {canEditAny && filterRegion === 'todas' && (
              <span className="text-xs text-gray-400">{p.region}</span>
            )}
          </div>
        </div>
        <span className={`text-xs flex-shrink-0 text-right min-w-[100px] ${metricColor}`}>{metricText}</span>
      </button>
    )
  }

  function handleUpdateAndRefresh(n: number, patch: Partial<Iniciativa>) {
    onUpdatePrioridad(n, patch)
    if (selectedIniciativa?.n === n) setSelectedIniciativa(prev => prev ? { ...prev, ...patch } : null)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const EJE_GOB_OPTIONS = ['Economía', 'Social', 'Seguridad'] as const
  const PRIORIDAD_OPTIONS = ['Alta', 'Media', 'Baja'] as const

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bandeja de atención</h2>
            <p className="text-sm text-gray-500 mt-0.5">Iniciativas que requieren acción inmediata</p>
          </div>
          {!loading && (
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
              uniqueCount === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {uniqueCount === 0 ? 'Sin alertas' : `${uniqueCount} alerta${uniqueCount > 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {/* Summary pills */}
        {!loading && uniqueCount > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs text-gray-600">
            {hitoVencido.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0"/>
                <span className="font-semibold text-red-700">{hitoVencido.length}</span> hitos vencidos
              </span>
            )}
            {bloqueadas.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"/>
                <span className="font-semibold text-red-600">{bloqueadas.length}</span> bloqueadas
              </span>
            )}
            {sinActividad.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"/>
                <span className="font-semibold text-amber-700">{sinActividad.length}</span> sin actividad
              </span>
            )}
            {hitoProximo.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0"/>
                <span className="font-semibold text-blue-700">{hitoProximo.length}</span> hitos próximos
              </span>
            )}
            {avanceBajo.length > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0"/>
                <span className="font-semibold text-gray-600">{avanceBajo.length}</span> avance bajo
              </span>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-5 flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l2.5 2.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar iniciativa o ministerio..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-gray-50 focus:bg-white"
            />
          </div>

          {/* Region — admin/editor only */}
          {canEditAny && (
            <select
              value={filterRegion}
              onChange={e => setFilterRegion(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
            >
              <option value="todas">Todas las regiones</option>
              {regions.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {/* Eje gobierno toggles */}
          <div className="flex items-center gap-1">
            {EJE_GOB_OPTIONS.map(eg => {
              const active = filterEjeGob.has(eg)
              const activeClass = eg === 'Economía' ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                                : eg === 'Social'   ? 'bg-purple-100 text-purple-800 ring-1 ring-purple-300'
                                :                    'bg-red-100 text-red-800 ring-1 ring-red-300'
              return (
                <button key={eg} onClick={() => toggleSet(setFilterEjeGob, eg as string)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors font-medium ${
                    active ? activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {eg}
                </button>
              )
            })}
          </div>

          {/* Prioridad toggles */}
          <div className="flex items-center gap-1">
            {PRIORIDAD_OPTIONS.map(p => {
              const active = filterPrioridad.has(p)
              const pc = prioridadColor(p as 'Alta' | 'Media' | 'Baja')
              return (
                <button key={p} onClick={() => toggleSet(setFilterPrioridad, p as string)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors font-semibold ${
                    active ? `${pc.bg} ${pc.text} ring-1` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {p}
                </button>
              )
            })}
          </div>

          {/* Clear */}
          {filtersActive && (
            <button onClick={clearFilters}
              className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors ml-auto">
              Limpiar
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Calculando...</div>
        ) : (
          <div className="space-y-3">

            {/* Hito vencido */}
            <Section
              id="hito-vencido" label="Hito vencido" badgeClass="bg-red-100 text-red-700"
              iconColor="text-red-500" count={hitoVencido.length}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11v.5"/></svg>}
            >
              {hitoVencido.map(p => {
                const dias = Math.abs(diasHastaHito(p.fecha_proximo_hito) ?? 0)
                return <IniciativaRow key={p.n} p={p}
                  metricText={`Vencido hace ${dias} día${dias !== 1 ? 's' : ''}`}
                  metricColor="text-red-600 font-semibold"
                />
              })}
            </Section>

            {/* Bloqueadas */}
            <Section
              id="bloqueadas" label="Bloqueadas (semáforo rojo)" badgeClass="bg-red-100 text-red-700"
              iconColor="text-red-500" count={bloqueadas.length}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M5 5l6 6M11 5l-6 6"/></svg>}
            >
              {bloqueadas.map(p => {
                const fmt = fmtDias(diasSinActividad(p.n, actividad))
                return <IniciativaRow key={p.n} p={p} metricText={fmt.text} metricColor={fmt.color} />
              })}
            </Section>

            {/* Sin actividad */}
            <Section
              id="sin-actividad" label="Sin actividad reciente (+15 días)" badgeClass="bg-amber-100 text-amber-700"
              iconColor="text-amber-500" count={sinActividad.length}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>}
            >
              {sinActividad.map(p => {
                const fmt = fmtDias(diasSinActividad(p.n, actividad))
                return <IniciativaRow key={p.n} p={p} metricText={fmt.text} metricColor={fmt.color} />
              })}
            </Section>

            {/* Hito próximo */}
            <Section
              id="hito-proximo" label="Hito próximo (14 días)" badgeClass="bg-blue-100 text-blue-700"
              iconColor="text-blue-500" count={hitoProximo.length}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2.5 1.5"/></svg>}
            >
              {hitoProximo.map(p => {
                const dias = diasHastaHito(p.fecha_proximo_hito) ?? 0
                const label = dias === 0 ? 'Hoy' : `En ${dias} día${dias !== 1 ? 's' : ''}`
                const color = dias <= 3 ? 'text-amber-600 font-semibold' : 'text-blue-600'
                return <IniciativaRow key={p.n} p={p} metricText={label} metricColor={color} />
              })}
            </Section>

            {/* Avance bajo */}
            <Section
              id="avance-bajo" label="Avance bajo (menos del 30%)" badgeClass="bg-gray-100 text-gray-600"
              iconColor="text-gray-400" count={avanceBajo.length}
              icon={<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12l4-4 3 3 5-6"/></svg>}
            >
              {avanceBajo.map(p => (
                <IniciativaRow key={p.n} p={p}
                  metricText={`${p.pct_avance ?? 0}%`}
                  metricColor="text-gray-500"
                />
              ))}
            </Section>

          </div>
        )}
      </div>

      {/* Modal */}
      {selectedIniciativa && (
        <ProjectTrackerModal
          prioridad={selectedIniciativa}
          onClose={() => setSelectedIniciativa(null)}
          onUpdatePrioridad={handleUpdateAndRefresh}
          onDeletePrioridad={onDeletePrioridad}
        />
      )}
    </div>
  )
}
