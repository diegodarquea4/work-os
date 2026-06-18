'use client'

import { useMemo, useState } from 'react'
import type { Iniciativa, Capa } from '@/lib/projects'
import { REGIONS } from '@/lib/regions'
import { SEMAFORO_CONFIG, prioridadColor, ejeGobColor } from '@/lib/config'
import { useCanEditAny, useCanEditOperational, useIsAdmin } from '@/lib/context/UserContext'
import { getSupabase } from '@/lib/supabase'
import ProjectTrackerModal from './ProjectTrackerModal'
import TagChips from './TagChips'
import { FlagIcon } from './icons/FlagIcon'
import DesalojoBadge from './DesalojoBadge'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip, stringChip, type ActiveChip } from './ActiveFiltersBar'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import { composeEjeLabel } from '@/lib/ejes'
import { formatResponsableDisplay } from '@/lib/responsable'

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

/** Comuna multi-valor en BD se separa con `;`. Helper para filtrar por
 *  intersección — una iniciativa "Antofagasta;Calama" matchea si filtras
 *  por cualquiera de las dos. */
function splitComuna(s: string | null | undefined): string[] {
  if (!s) return []
  return s.split(';').map(c => c.trim()).filter(Boolean)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttentionTray({
  projects, actividad, actividadLoading: loading,
  onUpdatePrioridad, onDeletePrioridad,
  activeRegionName, onActiveRegionChange,
  allowedRegionNames,
}: Props) {
  const canEditAny = useCanEditAny()
  const canEditFoco = useCanEditOperational()
  const isAdmin    = useIsAdmin()

  // ── Filters state ─────────────────────────────────────────────────────────
  // Mismo patrón que Dashboard: todos multi-select Set<string>. Región queda
  // como string (state GLOBAL, viene de props) — single-select via <select>.
  const [search, setSearch]                     = useState('')
  const filterRegion    = activeRegionName || 'todas'
  const setFilterRegion = onActiveRegionChange
  const [filterEje, setFilterEje]               = useState<Set<string>>(new Set())
  const [filterEjeGob, setFilterEjeGob]         = useState<Set<string>>(new Set())
  const [filterSemaforo, setFilterSemaforo]     = useState<Set<string>>(new Set())
  const [filterPrioridad, setFilterPrioridad]   = useState<Set<string>>(new Set())
  const [filterEtapa, setFilterEtapa]           = useState<Set<string>>(new Set())
  const [filterRat, setFilterRat]               = useState<Set<string>>(new Set())
  const [filterFuente, setFilterFuente]         = useState<Set<string>>(new Set())
  const [filterComuna, setFilterComuna]         = useState<Set<string>>(new Set())
  const [filterOrigen, setFilterOrigen]         = useState<Set<string>>(new Set())
  const [filterTags, setFilterTags]             = useState<Set<string>>(new Set())
  const [filterResponsable, setFilterResponsable] = useState<Set<string>>(new Set())
  // Toggle "Solo desalojos" — admin only. El chip se oculta para el resto
  // de roles (no pueden ver la marca). La lógica del filtro queda igual.
  const [filterDesalojo, setFilterDesalojo]     = useState<boolean>(false)
  // Capa de importancia (migración 024). Multi-select 'l'|'ll'|'lll'.
  const [filterCapa, setFilterCapa]             = useState<Set<Capa>>(new Set())

  // UI
  const [showSecondaryFilters, setShowSecondaryFilters] = useState(false)
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

  // Catálogo de ejes per-región para alimentar el popover de Eje Regional con
  // los labels canónicos cuando hay una región seleccionada.
  const regionCodActive = useMemo(() => {
    if (filterRegion === 'todas') return null
    return REGIONS.find(r => r.nombre === filterRegion)?.cod ?? null
  }, [filterRegion])
  const { ejes: regionEjesCat } = useRegionEjes(regionCodActive)
  const availableEjesLabels = useMemo(() => {
    if (regionCodActive && regionEjesCat.length > 0) {
      return regionEjesCat.map(re => composeEjeLabel(re.numero, re.nombre))
    }
    return Array.from(new Set(projects.map(p => p.eje).filter(Boolean))).sort()
  }, [regionCodActive, regionEjesCat, projects])

  const filtersActive =
    search !== '' || filterRegion !== 'todas' ||
    filterEje.size > 0 || filterEjeGob.size > 0 || filterSemaforo.size > 0 ||
    filterPrioridad.size > 0 || filterEtapa.size > 0 || filterRat.size > 0 ||
    filterFuente.size > 0 || filterComuna.size > 0 || filterOrigen.size > 0 ||
    filterTags.size > 0 || filterResponsable.size > 0 || filterDesalojo ||
    filterCapa.size > 0

  // Contador para el badge "Más filtros (N)". Región y semáforo viven en la
  // fila primaria; los demás en la secundaria.
  const secondaryFilterCount =
    (filterEje.size > 0          ? 1 : 0) +
    (filterEjeGob.size > 0       ? 1 : 0) +
    (filterPrioridad.size > 0    ? 1 : 0) +
    (filterEtapa.size > 0        ? 1 : 0) +
    (filterRat.size > 0          ? 1 : 0) +
    (filterFuente.size > 0       ? 1 : 0) +
    (filterComuna.size > 0       ? 1 : 0) +
    (filterOrigen.size > 0       ? 1 : 0) +
    (filterTags.size > 0         ? 1 : 0) +
    (filterResponsable.size > 0  ? 1 : 0)

  function clearFilters() {
    setSearch('')
    setFilterRegion('todas')
    setFilterEje(new Set())
    setFilterEjeGob(new Set())
    setFilterSemaforo(new Set())
    setFilterPrioridad(new Set())
    setFilterEtapa(new Set())
    setFilterRat(new Set())
    setFilterFuente(new Set())
    setFilterComuna(new Set())
    setFilterOrigen(new Set())
    setFilterTags(new Set())
    setFilterResponsable(new Set())
    setFilterDesalojo(false)
    setFilterCapa(new Set())
  }

  // ── Pool base + availables ────────────────────────────────────────────────
  // Mismo patrón que Dashboard: basePool(excluding) devuelve iniciativas que
  // pasan todos los filtros EXCEPTO el indicado, para que las opciones de cada
  // popover se recalculen sin "auto-canibalizarse".
  type FilterKey =
    | 'region' | 'eje' | 'ejeGob' | 'semaforo' | 'prioridad'
    | 'etapa'  | 'rat' | 'fuente' | 'comuna' | 'origen'
    | 'tags'   | 'responsable' | 'desalojo' | 'capa' | null

  function basePool(excluding: FilterKey) {
    const q = search.toLowerCase()
    return projects.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.ministerio ?? '').toLowerCase().includes(q)) return false
      if (excluding !== 'region'       && filterRegion !== 'todas' && p.region !== filterRegion)                                                   return false
      if (excluding !== 'eje'          && filterEje.size       > 0 && !filterEje.has(p.eje))                                                       return false
      if (excluding !== 'ejeGob'       && filterEjeGob.size    > 0 && !(p.eje_gobierno && filterEjeGob.has(p.eje_gobierno)))                       return false
      if (excluding !== 'semaforo'     && filterSemaforo.size  > 0 && !filterSemaforo.has(p.estado_semaforo))                                      return false
      if (excluding !== 'prioridad'    && filterPrioridad.size > 0 && !filterPrioridad.has(p.prioridad))                                           return false
      if (excluding !== 'etapa'        && filterEtapa.size     > 0 && !(p.etapa_actual && filterEtapa.has(p.etapa_actual)))                        return false
      if (excluding !== 'rat'          && filterRat.size       > 0 && !(p.rat && filterRat.has(p.rat)))                                            return false
      if (excluding !== 'fuente'       && filterFuente.size    > 0 && !(p.fuente_financiamiento && filterFuente.has(p.fuente_financiamiento)))     return false
      if (excluding !== 'comuna'       && filterComuna.size    > 0 && !splitComuna(p.comuna).some(c => filterComuna.has(c)))                       return false
      if (excluding !== 'origen'       && filterOrigen.size    > 0 && !(p.origen && filterOrigen.has(p.origen)))                                   return false
      if (excluding !== 'tags'         && filterTags.size      > 0 && !(p.tags ?? []).some(t => filterTags.has(t)))                                return false
      if (excluding !== 'responsable'  && filterResponsable.size > 0 && !(p.responsable && filterResponsable.has(p.responsable)))                  return false
      if (excluding !== 'desalojo'     && filterDesalojo            && p.es_desalojo !== true)                                                     return false
      if (excluding !== 'capa'         && filterCapa.size > 0       && !filterCapa.has(p.capa))                                                    return false
      return true
    })
  }

  function countByField<T extends string | null | undefined>(
    pool: Iniciativa[],
    getValue: (p: Iniciativa) => T | T[],
  ): FilterOption[] {
    const counts = new Map<string, number>()
    for (const p of pool) {
      const v = getValue(p)
      const arr = Array.isArray(v) ? v : v ? [v] : []
      for (const val of arr) {
        if (!val || (typeof val === 'string' && !val.trim())) continue
        counts.set(val, (counts.get(val) ?? 0) + 1)
      }
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }

  const baseDeps = [
    projects, search,
    filterRegion, filterEje, filterEjeGob, filterSemaforo, filterPrioridad,
    filterEtapa, filterRat, filterFuente, filterComuna, filterOrigen,
    filterTags, filterResponsable, filterDesalojo, filterCapa,
  ]

  /* eslint-disable react-hooks/exhaustive-deps */
  const availableEjes = useMemo(() => {
    const pool   = basePool('eje')
    const counts = new Map<string, number>()
    for (const p of pool) if (p.eje) counts.set(p.eje, (counts.get(p.eje) ?? 0) + 1)
    const universe = availableEjesLabels.length > 0
      ? availableEjesLabels
      : Array.from(counts.keys())
    return universe
      .map(label => ({ value: label, label, count: counts.get(label) ?? 0 }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [...baseDeps, availableEjesLabels])
  const availableEjesGob      = useMemo(() => countByField(basePool('ejeGob'),     p => p.eje_gobierno),                                             baseDeps)
  const availableEtapas       = useMemo(() => countByField(basePool('etapa'),      p => p.etapa_actual),                                             baseDeps)
  const availableRats         = useMemo(() => countByField(basePool('rat'),        p => p.rat),                                                      baseDeps)
  const availableFuentes      = useMemo(() => countByField(basePool('fuente'),     p => p.fuente_financiamiento),                                    baseDeps)
  const availableComunas      = useMemo(() => countByField(basePool('comuna'),     p => splitComuna(p.comuna)),                                      baseDeps)
  const availableOrigenes     = useMemo(() => countByField(basePool('origen'),     p => p.origen),                                                   baseDeps)
  const availableTags         = useMemo(() => countByField(basePool('tags'),       p => p.tags ?? []),                                               baseDeps)
  const availableResponsables = useMemo(() => {
    const pool   = basePool('responsable')
    const counts = new Map<string, number>()
    for (const p of pool) {
      const r = p.responsable
      if (!r || !r.trim()) continue
      counts.set(r, (counts.get(r) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({
        value,
        label:    formatResponsableDisplay(value),
        sublabel: value.includes('@') ? value : undefined,
        count,
      }))
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label))
  }, baseDeps)
  // Capa: orden fijo I → II → III (no por counts) — la jerarquía importa más
  // que la frecuencia.
  const availableCapas = useMemo(() => {
    const pool = basePool('capa')
    const counts: Record<Capa, number> = { l: 0, ll: 0, lll: 0 }
    for (const p of pool) counts[p.capa] += 1
    return [
      { value: 'l',   label: 'Capa I',   sublabel: 'Las prioridades', count: counts.l   },
      { value: 'll',  label: 'Capa II',  sublabel: 'Más importante',  count: counts.ll  },
      { value: 'lll', label: 'Capa III', sublabel: 'Cartera regular', count: counts.lll },
    ] satisfies FilterOption[]
  }, baseDeps)
  /* eslint-enable react-hooks/exhaustive-deps */

  // ── Groups ────────────────────────────────────────────────────────────────

  const { enFoco, sugHitoVencido, sugBloqueadas, sugSinActividad, sugHitoProximo, sugAvanceBajo, sugUniqueCount } = useMemo(() => {
    const TODAY = new Date().toLocaleDateString('en-CA')

    // Pool ya filtrado por TODOS los filtros activos. Reutilizamos basePool
    // pasando null (no excluir ninguno).
    const pool = basePool(null)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...baseDeps, actividad])

  // ── Handlers ──────────────────────────────────────────────────────────────

  // Etapa 5: mutamos por id (PK estable) en vez de n. n sigue como key del
  // estado local en WorkOSApp.handleUpdatePrioridad.
  async function handleToggleFoco(n: number, id: number, next: boolean) {
    // Optimistic update
    onUpdatePrioridad(n, { en_foco: next })
    if (selectedIniciativa?.n === n) {
      setSelectedIniciativa(prev => prev ? { ...prev, en_foco: next } : null)
    }

    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .update({ en_foco: next })
      .eq('id', id)
      .select('id, en_foco')

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
        {canEditFoco ? (
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleFoco(p.n, p.id, false) }}
            className="flex-shrink-0 text-amber-500 hover:text-amber-700 transition-all duration-500 ease-out p-1 -m-1 rounded"
            title="Quitar del foco"
          >
            <FlagIcon filled className="w-4 h-4 transition-all duration-500" />
          </button>
        ) : (
          <span className="flex-shrink-0 text-amber-500 p-1 -m-1" title="En foco">
            <FlagIcon filled className="w-4 h-4" />
          </span>
        )}

        <button
          onClick={() => setSelectedIniciativa(p)}
          className="flex-1 text-left flex items-center gap-3 min-w-0 group"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sem.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {p.es_desalojo && <DesalojoBadge size="sm" />}
              <p className="text-sm font-semibold text-gray-800 line-clamp-1 group-hover:text-slate-900">
                {p.nombre}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
              <span className="truncate max-w-[200px]">{p.ministerio ?? 'Sin asignar'}</span>
              <span className="text-xs px-1.5 py-0 rounded-full font-medium bg-gray-100 text-gray-600">
                {p.eje}
              </span>
              <TagChips tags={p.tags} max={2} />
              {p.responsable && (
                <span className="truncate max-w-[140px]" title={p.responsable}>· {formatResponsableDisplay(p.responsable)}</span>
              )}
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
        {canEditFoco ? (
          <button
            onClick={() => handleToggleFoco(p.n, p.id, true)}
            className="flex-shrink-0 text-gray-300 hover:text-amber-400 transition-all duration-500 ease-out p-1 -m-1 rounded"
            title="Marcar en foco"
          >
            <FlagIcon className="w-4 h-4 transition-all duration-500" />
          </button>
        ) : (
          <span className="flex-shrink-0 w-4 h-4" aria-hidden />
        )}
        <button onClick={() => setSelectedIniciativa(p)} className="flex-1 text-left min-w-0 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${sem.dot}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {p.es_desalojo && <DesalojoBadge size="sm" />}
              <p className="text-sm text-gray-700 line-clamp-1">{p.nombre}</p>
            </div>
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

  const PRIORIDAD_OPTIONS = ['Alta', 'Media', 'Baja'] as const
  const SEMAFORO_OPTIONS  = ['rojo', 'ambar', 'verde', 'gris'] as const

  // Bar de filtros activos — chips de qué se está filtrando. Misma API que
  // Dashboard, usando los helpers `setChip` (multi) y `stringChip` (region
  // global). Cada chip dispara su deselect puntual; "Limpiar todo" resetea.
  const activeChips: ActiveChip[] = [
    search ? { key: 'search', label: 'Búsqueda', value: search, onClear: () => setSearch('') } : null,
    canEditAny ? stringChip('Región', filterRegion, () => setFilterRegion('todas')) : null,
    setChip('Eje Regional', filterEje,         () => setFilterEje(new Set())),
    setChip('Eje Gobierno', filterEjeGob,      () => setFilterEjeGob(new Set())),
    setChip('Semáforo',     filterSemaforo,    () => setFilterSemaforo(new Set())),
    setChip('Prioridad',    filterPrioridad,   () => setFilterPrioridad(new Set())),
    setChip('Etapa',        filterEtapa,       () => setFilterEtapa(new Set())),
    setChip('RAT',          filterRat,         () => setFilterRat(new Set())),
    setChip('Fuente',       filterFuente,      () => setFilterFuente(new Set())),
    setChip('Comuna',       filterComuna,      () => setFilterComuna(new Set())),
    setChip('Origen',       filterOrigen,      () => setFilterOrigen(new Set())),
    setChip('Etiquetas',    filterTags,        () => setFilterTags(new Set())),
    setChip('Responsable',  filterResponsable, () => setFilterResponsable(new Set()), formatResponsableDisplay),
    filterDesalojo
      ? { key: 'desalojo', label: '🏚 Desalojos', onClear: () => setFilterDesalojo(false) }
      : null,
    filterCapa.size > 0
      ? {
          key: 'capa',
          label: 'Capa',
          value: Array.from(filterCapa).map(v => v === 'l' ? 'I' : v === 'll' ? 'II' : 'III').join(', '),
          onClear: () => setFilterCapa(new Set()),
        }
      : null,
  ].filter((c): c is ActiveChip => c !== null)

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-[min(48rem,90vw)] mx-auto px-6 py-6">

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

        {/* Filter block — mismo patrón que Dashboard: chips de filtros activos
            arriba, fila primaria siempre visible, fila secundaria detrás del
            toggle "Más filtros (N)". */}
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-5 space-y-2">

          {filtersActive && (
            <ActiveFiltersBar chips={activeChips} clearFilters={clearFilters} />
          )}

          {/* Primary row: búsqueda + región + 4 chips semáforo + Más filtros */}
          <div className="flex items-center gap-2 flex-wrap">
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

            {/* Región — single-select global (viene de props). Solo admin/editor
                la ve; regional/viewer tiene su región fija. */}
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

            {/* Semáforo chips inline — patrón Dashboard. */}
            <div className="flex items-center gap-1">
              {SEMAFORO_OPTIONS.map(s => {
                const active = filterSemaforo.has(s)
                const activeClass =
                  s === 'rojo'  ? 'bg-red-100 text-red-700 ring-1 ring-red-300'       :
                  s === 'ambar' ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300' :
                  s === 'verde' ? 'bg-green-100 text-green-700 ring-1 ring-green-300' :
                                  'bg-gray-200 text-gray-700 ring-1 ring-gray-400'
                return (
                  <button
                    key={s}
                    onClick={() => toggleSet(setFilterSemaforo, s as string)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full transition-colors ${
                      active ? activeClass : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_CONFIG[s].dot}`}/>
                    {SEMAFORO_CONFIG[s].label}
                  </button>
                )
              })}
            </div>

            {/* Solo desalojos — admin only. Filtra los casos de la Mesa
                Interministerial. Color slate distinto al amber de foco. */}
            {isAdmin && (
              <button
                onClick={() => setFilterDesalojo(v => !v)}
                className={`text-xs px-2 py-1 rounded-full transition-colors font-medium flex items-center gap-1 ${
                  filterDesalojo
                    ? 'bg-slate-700 text-white ring-1 ring-slate-800'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title="Filtrar solo iniciativas marcadas como caso de desalojo"
              >
                <span className="text-[10px]">🏚</span>
                Desalojos
              </button>
            )}

            {/* Más filtros toggle — badge numérico de filtros secundarios. */}
            <button
              onClick={() => setShowSecondaryFilters(v => !v)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                showSecondaryFilters || secondaryFilterCount > 0
                  ? 'bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <span>Más filtros</span>
              {secondaryFilterCount > 0 && (
                <span className="bg-slate-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-px min-w-[18px] text-center leading-none">
                  {secondaryFilterCount}
                </span>
              )}
              <span className="text-gray-400 text-[10px]">{showSecondaryFilters ? '▴' : '▾'}</span>
            </button>
          </div>

          {/* Secondary row (collapsible) — popovers multi-select + chips de
              Prioridad inline. Mismo patrón que Dashboard. */}
          {showSecondaryFilters && (
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <FilterPopover label="Eje Regional"  options={availableEjes}        selected={filterEje}         onChange={setFilterEje} />
              <FilterPopover label="Eje Gobierno"  options={availableEjesGob}     selected={filterEjeGob}      onChange={setFilterEjeGob} />

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

              <FilterPopover label="Etapa"        options={availableEtapas}       selected={filterEtapa}       onChange={setFilterEtapa} />
              <FilterPopover label="RAT"          options={availableRats}         selected={filterRat}         onChange={setFilterRat} />
              <FilterPopover label="Fuente"       options={availableFuentes}      selected={filterFuente}      onChange={setFilterFuente} />
              <FilterPopover label="Comuna"       options={availableComunas}      selected={filterComuna}      onChange={setFilterComuna} />
              <FilterPopover label="Origen"       options={availableOrigenes}     selected={filterOrigen}      onChange={setFilterOrigen} />
              <FilterPopover label="Etiquetas"    options={availableTags}         selected={filterTags}        onChange={setFilterTags} />
              <FilterPopover label="Responsable"  options={availableResponsables} selected={filterResponsable} onChange={setFilterResponsable} />
              <FilterPopover
                label="Capa"
                options={availableCapas}
                selected={filterCapa as Set<string>}
                onChange={(next) => setFilterCapa(new Set(Array.from(next).filter((v): v is Capa => v === 'l' || v === 'll' || v === 'lll')))}
              />
            </div>
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
