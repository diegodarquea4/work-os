'use client'

import { useMemo, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { REGIONS } from '@/lib/regions'
import { SEMAFORO_CONFIG, prioridadColor, ejeGobColor, EJE_COLORS } from '@/lib/config'
import { useCanEditAny } from '@/lib/context/UserContext'
import { getSupabase } from '@/lib/supabase'
import ProjectTrackerModal from './ProjectTrackerModal'
import { FlagIcon } from './icons/FlagIcon'

type Props = {
  projects: Iniciativa[]
  actividad: Record<number, string | null>
  actividadLoading: boolean
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
  // Región activa (state global) — el select solo lo ve admin/editor; el filtro
  // se aplica siempre. 'todas' significa sin filtrar.
  activeRegionName: string
  onActiveRegionChange: (regionName: string) => void
  // Lista de nombres de regiones que el usuario puede ver. null = sin restricción
  // (mostrar las 16). Permite que aparezcan regiones sin iniciativas en el selector.
  allowedRegionNames: string[] | null
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
  activeRegionName, onActiveRegionChange,
  allowedRegionNames,
}: Props) {
  const canEditAny = useCanEditAny()

  // Filters
  const [search, setSearch]                     = useState('')
  const filterRegion = activeRegionName || 'todas'
  const setFilterRegion = onActiveRegionChange
  const [filterEjeGob, setFilterEjeGob]         = useState<Set<string>>(new Set())
  const [filterPrioridad, setFilterPrioridad]   = useState<Set<string>>(new Set())

  // UI
  const [showSugerencias, setShowSugerencias]   = useState(false)
  const [collapsed, setCollapsed]               = useState<Record<string, boolean>>({})
  const [selectedIniciativa, setSelectedIniciativa] = useState<Iniciativa | null>(null)

  // Selector: TODAS las regiones visibles para el usuario (no solo las que tienen
  // iniciativas). Si el usuario es regional/viewer con region_cods, se restringe
  // a lo permitido.
  const regions = useMemo(() => {
    const all = REGIONS.map(r => r.nombre)
    const filtered = allowedRegionNames ? all.filter(n => allowedRegionNames.includes(n)) : all
    return filtered.sort()
  }, [allowedRegionNames])

  const filtersActive = search !== '' || filterRegion !== 'todas' || filterEjeGob.size > 0 || filterPrioridad.size > 0

  function clearFilters() {
    setSearch(''); setFilterRegion('todas'); setFilterEjeGob(new Set()); setFilterPrioridad(new Set())
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  const { enFoco, sugHitoVencido, sugBloqueadas, sugSinActividad, sugHitoProximo, sugAvanceBajo, sugUniqueCount } = useMemo(() => {
    const q = search.toLowerCase()
    const TODAY = new Date().toLocaleDateString('en-CA')

    const pool = projects
      .filter(p => !q || p.nombre.toLowerCase().includes(q) || (p.ministerio ?? '').toLowerCase().includes(q))
      .filter(p => filterRegion === 'todas' || p.region === filterRegion)
      .filter(p => filterEjeGob.size === 0 || filterEjeGob.has(p.eje_gobierno ?? ''))
      .filter(p => filterPrioridad.size === 0 || filterPrioridad.has(p.prioridad))

    // Sección principal: iniciativas con flag activo, ordenadas por urgencia de hito
    const enFoco = pool
      .filter(p => p.en_foco === true)
      .sort((a, b) => {
        const aFecha = a.fecha_proximo_hito ?? '9999-12-31'
        const bFecha = b.fecha_proximo_hito ?? '9999-12-31'
        const aVencido = aFecha < TODAY
        const bVencido = bFecha < TODAY
        if (aVencido !== bVencido) return aVencido ? -1 : 1
        return aFecha.localeCompare(bFecha)
      })

    // Sugerencias: misma lógica que antes, pero excluyendo lo que ya está en foco
    const noFoco = pool.filter(p => p.en_foco !== true)

    const sugHitoVencido = noFoco
      .filter(p => p.fecha_proximo_hito && p.fecha_proximo_hito < TODAY && p.estado_semaforo !== 'verde')
      .sort((a, b) => (a.fecha_proximo_hito ?? '').localeCompare(b.fecha_proximo_hito ?? ''))

    const sugBloqueadas = noFoco
      .filter(p => p.estado_semaforo === 'rojo')
      .sort((a, b) => (diasSinActividad(b.n, actividad) ?? 9999) - (diasSinActividad(a.n, actividad) ?? 9999))

    const sugSinActividad = noFoco
      .filter(p => {
        if (p.estado_semaforo === 'rojo') return false
        const dias = diasSinActividad(p.n, actividad)
        return dias === null || dias > 15
      })
      .sort((a, b) => (diasSinActividad(b.n, actividad) ?? 9999) - (diasSinActividad(a.n, actividad) ?? 9999))

    const sugHitoProximo = noFoco
      .filter(p => {
        if (!p.fecha_proximo_hito || p.estado_semaforo === 'verde') return false
        const dias = diasHastaHito(p.fecha_proximo_hito)
        return dias !== null && dias >= 0 && dias <= 14
      })
      .sort((a, b) => (a.fecha_proximo_hito ?? '').localeCompare(b.fecha_proximo_hito ?? ''))

    const sugAvanceBajo = noFoco
      .filter(p => (p.pct_avance ?? 0) < 30 && p.estado_semaforo !== 'rojo')
      .sort((a, b) => (a.pct_avance ?? 0) - (b.pct_avance ?? 0))

    const sugUniqueCount = new Set(
      [...sugHitoVencido, ...sugBloqueadas, ...sugSinActividad, ...sugHitoProximo, ...sugAvanceBajo].map(p => p.n)
    ).size

    return { enFoco, sugHitoVencido, sugBloqueadas, sugSinActividad, sugHitoProximo, sugAvanceBajo, sugUniqueCount }
  }, [projects, actividad, search, filterRegion, filterEjeGob, filterPrioridad])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleToggleFoco(n: number, next: boolean) {
    // Optimistic update
    onUpdatePrioridad(n, { en_foco: next })
    if (selectedIniciativa?.n === n) {
      setSelectedIniciativa(prev => prev ? { ...prev, en_foco: next } : null)
    }

    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .update({ en_foco: next })
      .eq('n', n)
      .select('n, en_foco')

    const failed = !!error || !data || data.length === 0
    if (failed) {
      onUpdatePrioridad(n, { en_foco: !next })
      if (selectedIniciativa?.n === n) {
        setSelectedIniciativa(prev => prev ? { ...prev, en_foco: !next } : null)
      }
      const msg = error
        ? `Error guardando foco: ${error.message}`
        : 'No se pudo guardar el foco (0 filas actualizadas — probable RLS / permisos).'
      console.error('[AttentionTray] handleToggleFoco:', { n, next, error, data })
      window.alert(msg)
    } else {
      console.log('[AttentionTray] Foco guardado:', data)
    }
  }

  function handleUpdateAndRefresh(n: number, patch: Partial<Iniciativa>) {
    onUpdatePrioridad(n, patch)
    if (selectedIniciativa?.n === n) setSelectedIniciativa(prev => prev ? { ...prev, ...patch } : null)
  }

  // ── Inner components ───────────────────────────────────────────────────────

  function IniciativaFocoRow({ p }: { p: Iniciativa }) {
    const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
    const pc  = prioridadColor(p.prioridad)
    const dias = diasHastaHito(p.fecha_proximo_hito)
    const hitoUrgent = dias !== null && dias <= 7

    return (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50/40 transition-colors border-b border-gray-50 last:border-b-0">
        <button
          onClick={(e) => { e.stopPropagation(); handleToggleFoco(p.n, false) }}
          className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-all duration-500 ease-out p-1 -m-1 rounded"
          title="Quitar del foco"
        >
          <FlagIcon filled className="w-4 h-4 transition-all duration-500" />
        </button>

        <button
          onClick={() => setSelectedIniciativa(p)}
          className="flex-1 text-left flex items-center gap-3 min-w-0 group"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sem.dot}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 line-clamp-1 group-hover:text-slate-900">
              {p.nombre}
            </p>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
              <span className="truncate max-w-[200px]">{p.ministerio ?? 'Sin asignar'}</span>
              <span className={`text-xs px-1.5 py-0 rounded-full font-medium ${EJE_COLORS[p.eje] ?? 'bg-gray-100 text-gray-600'}`}>
                {p.eje}
              </span>
              {p.responsable && <span className="truncate max-w-[140px]">· {p.responsable}</span>}
              {canEditAny && filterRegion === 'todas' && (
                <span className="text-gray-400">· {p.region}</span>
              )}
            </div>
          </div>

          <div className="flex-shrink-0 w-24 text-right">
            <div className="text-xs font-semibold text-gray-700 tabular-nums">{p.pct_avance ?? 0}%</div>
            {p.fecha_proximo_hito && (
              <div className={`text-xs ${hitoUrgent ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                {dias !== null && dias < 0
                  ? `Vencido ${Math.abs(dias)}d`
                  : dias === 0 ? 'Hoy' : `En ${dias}d`}
              </div>
            )}
          </div>

          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${pc.bg} ${pc.text}`}>
            {p.prioridad}
          </span>
        </button>
      </div>
    )
  }

  function SugerenciaSection({
    id, label, badgeClass, iconColor, items, icon, metricFor,
  }: {
    id: string
    label: string
    badgeClass: string
    iconColor: string
    items: Iniciativa[]
    icon: React.ReactNode
    metricFor: (p: Iniciativa) => { text: string; color: string }
  }) {
    const isOpen = !collapsed[id]
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden bg-white">
        <button
          onClick={() => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
        >
          <span className={`flex-shrink-0 ${iconColor}`}>{icon}</span>
          <span className="text-sm font-semibold text-gray-700 flex-1">{label}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${items.length === 0 ? 'bg-gray-100 text-gray-400' : badgeClass}`}>
            {items.length}
          </span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>
        {isOpen && items.length > 0 && (
          <div className="border-t border-gray-100">
            {items.map(p => {
              const m = metricFor(p)
              return <SugerenciaRow key={p.n} p={p} metricText={m.text} metricColor={m.color} />
            })}
          </div>
        )}
        {isOpen && items.length === 0 && (
          <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-400 text-center">
            Sin iniciativas en esta categoría
          </div>
        )}
      </div>
    )
  }

  function SugerenciaRow({ p, metricText, metricColor }: { p: Iniciativa; metricText: string; metricColor: string }) {
    const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
    return (
      <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-b-0 transition-colors">
        <button
          onClick={() => handleToggleFoco(p.n, true)}
          className="flex-shrink-0 text-gray-300 hover:text-amber-400 transition-all duration-500 ease-out p-1 -m-1 rounded"
          title="Marcar en foco"
        >
          <FlagIcon className="w-4 h-4 transition-all duration-500" />
        </button>
        <button onClick={() => setSelectedIniciativa(p)} className="flex-1 text-left min-w-0 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sem.dot}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-700 line-clamp-1">{p.nombre}</p>
            <p className="text-xs text-gray-400 truncate">
              {p.ministerio ?? 'Sin asignar'} · {p.eje}
              {p.eje_gobierno && (
                <span className={`ml-1 px-1 rounded ${ejeGobColor(p.eje_gobierno)}`}>{p.eje_gobierno}</span>
              )}
              {canEditAny && filterRegion === 'todas' && ` · ${p.region}`}
            </p>
          </div>
        </button>
        <span className={`text-xs flex-shrink-0 text-right min-w-[90px] ${metricColor}`}>{metricText}</span>
      </div>
    )
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
            <p className="text-sm text-gray-500 mt-0.5">Iniciativas marcadas como foco del equipo</p>
          </div>
          {!loading && (
            <span className={`text-sm font-semibold px-3 py-1 rounded-full flex items-center gap-1.5 ${
              enFoco.length === 0 ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-800'
            }`}>
              <FlagIcon filled={enFoco.length > 0} className="w-3.5 h-3.5" />
              {enFoco.length === 0 ? 'Sin foco' : `${enFoco.length} en foco`}
            </span>
          )}
        </div>

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
          <div className="space-y-5">

            {/* ── SECCIÓN PRINCIPAL: En foco ─────────────────────────────── */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <FlagIcon filled className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-bold text-gray-800">En foco</h3>
                <span className="text-xs text-gray-400">— iniciativas que el equipo está revisando</span>
              </div>

              {enFoco.length === 0 ? (
                <div className="text-center py-10 px-6 bg-white rounded-xl border border-gray-100">
                  <FlagIcon className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 mb-1 font-medium">Sin iniciativas en foco</p>
                  <p className="text-xs text-gray-400 max-w-sm mx-auto">
                    Marcá iniciativas con la bandera desde el Kanban o el panel de detalle para verlas acá.
                    {sugUniqueCount > 0 && ' Mientras tanto, revisá las sugerencias automáticas abajo.'}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {enFoco.map(p => <IniciativaFocoRow key={p.n} p={p} />)}
                </div>
              )}
            </div>

            {/* ── SECCIÓN SECUNDARIA: Sugerencias automáticas ─────────────── */}
            <div>
              <button
                onClick={() => setShowSugerencias(prev => !prev)}
                className="w-full flex items-center gap-2 px-1 py-1 text-left hover:bg-gray-100/60 rounded transition-colors"
              >
                <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showSugerencias ? 'rotate-90' : ''}`}
                  viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 1l4 4-4 4"/>
                </svg>
                <h3 className="text-sm font-semibold text-gray-600">Sugerencias automáticas</h3>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-semibold">
                  {sugUniqueCount}
                </span>
                <span className="text-xs text-gray-400">— iniciativas que podrías querer marcar en foco</span>
              </button>

              {showSugerencias && (
                <div className="space-y-2 mt-2">
                  <SugerenciaSection
                    id="sug-hito-vencido" label="Hito vencido"
                    badgeClass="bg-red-100 text-red-700" iconColor="text-red-500"
                    items={sugHitoVencido}
                    icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3M8 11v.5"/></svg>}
                    metricFor={p => {
                      const dias = Math.abs(diasHastaHito(p.fecha_proximo_hito) ?? 0)
                      return { text: `Vencido ${dias}d`, color: 'text-red-600 font-semibold' }
                    }}
                  />
                  <SugerenciaSection
                    id="sug-bloqueadas" label="Bloqueadas (semáforo rojo)"
                    badgeClass="bg-red-100 text-red-700" iconColor="text-red-500"
                    items={sugBloqueadas}
                    icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M5 5l6 6M11 5l-6 6"/></svg>}
                    metricFor={p => fmtDias(diasSinActividad(p.n, actividad))}
                  />
                  <SugerenciaSection
                    id="sug-sin-actividad" label="Sin actividad reciente (+15 días)"
                    badgeClass="bg-amber-100 text-amber-700" iconColor="text-amber-500"
                    items={sugSinActividad}
                    icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>}
                    metricFor={p => fmtDias(diasSinActividad(p.n, actividad))}
                  />
                  <SugerenciaSection
                    id="sug-hito-proximo" label="Hito próximo (14 días)"
                    badgeClass="bg-blue-100 text-blue-700" iconColor="text-blue-500"
                    items={sugHitoProximo}
                    icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2.5 1.5"/></svg>}
                    metricFor={p => {
                      const dias = diasHastaHito(p.fecha_proximo_hito) ?? 0
                      const label = dias === 0 ? 'Hoy' : `En ${dias}d`
                      const color = dias <= 3 ? 'text-amber-600 font-semibold' : 'text-blue-600'
                      return { text: label, color }
                    }}
                  />
                  <SugerenciaSection
                    id="sug-avance-bajo" label="Avance bajo (menos del 30%)"
                    badgeClass="bg-gray-100 text-gray-600" iconColor="text-gray-400"
                    items={sugAvanceBajo}
                    icon={<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 12l4-4 3 3 5-6"/></svg>}
                    metricFor={p => ({ text: `${p.pct_avance ?? 0}%`, color: 'text-gray-500' })}
                  />
                </div>
              )}
            </div>

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
