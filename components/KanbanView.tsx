'use client'

import { useMemo, useState, useTransition, useRef, useEffect } from 'react'
import type { Iniciativa, Capa } from '@/lib/projects'
import { SEMAFORO_CONFIG, prioridadColor, splitMinisterios } from '@/lib/config'
import FilterPopover, { type FilterOption } from './FilterPopover'
import { getSupabase } from '@/lib/supabase'
import { REGIONS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import TagChips from './TagChips'
import { FlagIcon } from './icons/FlagIcon'
import DesalojoBadge from './DesalojoBadge'
import { CapaBadge } from './CapaBadge'
import { useCanEditOperational } from '@/lib/context/UserContext'
import { normalizeMinisterio } from '@/lib/ministerios'
import { compareCarteras } from '@/lib/cartera'

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null
  const diff = new Date(isoDate).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

// "Eje 3: Salud y Servicios Básicos" → 3. Acepta "Eje", "EJE", "eje" — la data
// real en producción usa varios casings. Sin número → 999 (queda al final).
// Nota: este parser convive con el del catálogo formal de ejes (migración 015)
// mientras KanbanView no consume `eje_id` directamente. Fase 5 lo deprecia.
function ejeNumber(eje: string): number {
  const m = eje.match(/^\s*eje\s+(\d+)/i)
  return m ? parseInt(m[1], 10) : 999
}

// Envuelve splitMinisterios + normalizeMinisterio para agrupar por cartera
// canónica (consolida variantes: 'Min. Salud' + 'MINSAL' + 'Ministerio de
// Salud' caen en la misma cartera). Fallback 'Sin asignar' cuando el campo
// está vacío — coherente con el bucket de lib/ministerios.
function carterasNormalizadas(raw: string | null | undefined): string[] {
  const list = splitMinisterios(raw).map(normalizeMinisterio)
  return list.length > 0 ? list : ['Sin asignar']
}

function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, val: T) {
  setter(prev => { const next = new Set(prev); next.has(val) ? next.delete(val) : next.add(val); return next })
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  projects: Iniciativa[]
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
  // Región activa (state global del panel — persiste entre vistas y recargas).
  // Si está vacía el componente cae a la primera región alfabética de projects.
  activeRegionName: string
  onActiveRegionChange: (regionName: string) => void
  // Nombres de regiones que el usuario puede ver. null = sin restricción.
  // Permite mostrar TODAS las regiones en el selector aunque estén vacías.
  allowedRegionNames: string[] | null
}

// ── EjeCard — card for eje mode ───────────────────────────────────────────────

function EjeCard({ p, onSelect, onToggleFoco, canEditFoco }: {
  p: Iniciativa
  onSelect: (p: Iniciativa) => void
  onToggleFoco: (n: number, next: boolean) => void
  canEditFoco: boolean
}) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pc  = prioridadColor(p.prioridad)
  const enFoco     = p.en_foco === true
  const esDesalojo = p.es_desalojo === true
  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full text-left border rounded-xl p-3 hover:shadow-md transition-all duration-500 ease-out group relative ${
        enFoco ? 'border-amber-200 bg-amber-50/40' : 'border-gray-200 bg-white'
      }`}
    >
      {canEditFoco ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFoco(p.n, !enFoco) }}
          className={`absolute top-2 right-2 p-1 rounded transition-all duration-500 ease-out ${
            enFoco ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-400'
          }`}
          title={enFoco ? 'Quitar del foco' : 'Marcar en foco'}
        >
          <FlagIcon filled={enFoco} className="w-3.5 h-3.5 transition-all duration-500" />
        </button>
      ) : enFoco ? (
        <span className="absolute top-2 right-2 p-1 text-amber-500" title="En foco">
          <FlagIcon filled className="w-3.5 h-3.5" />
        </span>
      ) : null}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${sem.dot}`} />
        <span className="text-xs text-gray-600 font-medium">{sem.label}</span>
        <CapaBadge value={p.capa} size="sm" hideDefault />
        {esDesalojo && <DesalojoBadge size="sm" />}
      </div>
      <p className="text-xs font-semibold text-gray-800 line-clamp-2 mb-2 group-hover:text-slate-900">
        {p.nombre}
      </p>
      {p.etapa_actual && (
        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mb-1.5 inline-block">
          {p.etapa_actual}
        </span>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>
          {p.prioridad}
        </span>
        <div className="flex items-center gap-1.5">
          <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-1 rounded-full ${sem.dot}`} style={{ width: `${p.pct_avance}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-600">{p.pct_avance}%</span>
        </div>
      </div>
      {p.responsable && (
        <p className="text-xs text-gray-400 mt-1 truncate">{p.responsable}</p>
      )}
    </button>
  )
}

// ── MinistryRow — fila compacta para vista Monday por ministerio ──────────────

function MinistryRow({ p, onSelect, onToggleFoco, canEditFoco }: {
  p: Iniciativa
  onSelect: (p: Iniciativa) => void
  onToggleFoco: (n: number, next: boolean) => void
  canEditFoco: boolean
}) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pc  = prioridadColor(p.prioridad)
  const dias = daysUntil(p.fecha_proximo_hito)
  const hitoUrgent = dias !== null && dias <= 7 && (p.estado_semaforo === 'rojo' || p.estado_semaforo === 'ambar')
  const enFoco     = p.en_foco === true
  const esDesalojo = p.es_desalojo === true
  // "Eje 3: Salud y Servicios Básicos" / "EJE 3 — ..." → "Eje 3" (compacto).
  // Normalizamos casing para que el chip siempre se vea uniforme.
  const ejeShort = (() => {
    const m = p.eje.match(/^\s*eje\s+(\d+)/i)
    return m ? `Eje ${m[1]}` : p.eje
  })()
  // "diego.darquea@gmail.com" → "diego.darquea" (más legible en reunión)
  const responsableShort = p.responsable?.split('@')[0] ?? null

  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full text-left px-3 py-2.5 border rounded-xl hover:shadow-sm transition-all duration-500 ease-out flex items-center gap-3 ${
        enFoco ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {/* Flag */}
      {canEditFoco ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFoco(p.n, !enFoco) }}
          className={`flex-shrink-0 p-1 -m-1 rounded transition-all duration-500 ease-out ${
            enFoco ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-400'
          }`}
          title={enFoco ? 'Quitar del foco' : 'Marcar en foco'}
        >
          <FlagIcon filled={enFoco} className="w-3.5 h-3.5 transition-all duration-500" />
        </button>
      ) : enFoco ? (
        <span className="flex-shrink-0 p-1 -m-1 text-amber-500" title="En foco">
          <FlagIcon filled className="w-3.5 h-3.5" />
        </span>
      ) : (
        <span className="flex-shrink-0 w-3.5 h-3.5" aria-hidden />
      )}

      {/* Semáforo */}
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />

      {/* Badge desalojo — inline, antes del nombre, solo si está marcado */}
      {esDesalojo && <DesalojoBadge size="sm" className="flex-shrink-0" />}

      {/* Badge capa — solo si no es lll (default), para no saturar */}
      <CapaBadge value={p.capa} size="sm" hideDefault className="flex-shrink-0" />

      {/* Nombre */}
      <p className="text-sm font-medium text-slate-800 line-clamp-1 flex-1 min-w-0">
        {p.nombre}
      </p>

      {/* Eje chip (compacto) */}
      <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 bg-gray-100 text-gray-600">
        {ejeShort}
      </span>

      {/* Tags — máximo 1 visible en la card horizontal para no romper layout */}
      <TagChips tags={p.tags} max={1} className="flex-shrink-0" />

      {/* Responsable (sin @domain) */}
      {responsableShort && (
        <span className="text-xs text-gray-500 truncate max-w-[140px] flex-shrink-0">
          {responsableShort}
        </span>
      )}

      {/* Avance */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-28">
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className={`h-1 rounded-full ${sem.dot}`} style={{ width: `${p.pct_avance ?? 0}%` }} />
        </div>
        <span className="text-xs font-semibold text-gray-600 tabular-nums w-8 text-right">
          {p.pct_avance ?? 0}%
        </span>
      </div>

      {/* Próximo hito */}
      <div className={`text-xs flex-shrink-0 w-20 text-right ${hitoUrgent ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
        {p.fecha_proximo_hito
          ? (dias !== null && dias < 0
              ? `Vencido ${Math.abs(dias)}d`
              : dias === 0
                ? 'Hoy'
                : `En ${dias}d`)
          : '—'}
      </div>

      {/* Prioridad pill */}
      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 ${pc.bg} ${pc.text}`}>
        {p.prioridad}
      </span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KanbanView({ projects, onUpdatePrioridad, onDeletePrioridad, activeRegionName, onActiveRegionChange, allowedRegionNames }: Props) {
  const canEditFoco = useCanEditOperational()
  const [selected, setSelected]         = useState<Iniciativa | null>(null)
  // Región filtrada controlada por el state global (WorkOSApp). Fallback a la
  // primera región alfabética si llega vacío (ej. arranque antes de hidratar).
  const filterRegion = useMemo(() => {
    if (activeRegionName) return activeRegionName
    const sorted = Array.from(new Set(projects.map(p => p.region))).sort()
    return sorted[0] ?? 'todas'
  }, [activeRegionName, projects])
  const setFilterRegion = onActiveRegionChange
  // Filtros del panel "Filtros" — solo los que tienen uso real en la mesa
  // de Gabinete: estado del compromiso (semáforo), prioridad, capa de
  // importancia, etapa actual, etiquetas y "en foco". Eliminados respecto
  // de versión anterior: eje gobierno (Economía/Social/Seguridad) — el
  // SEREMI piensa por cartera, no por eje gobierno transversal.
  const [filterSemaforo,  setFilterSemaforo]  = useState<Set<string>>(new Set())
  const [filterPrioridad, setFilterPrioridad] = useState<Set<string>>(new Set())
  const [filterCapa,      setFilterCapa]      = useState<Set<Capa>>(new Set())
  const [filterEtapa,     setFilterEtapa]     = useState<Set<string>>(new Set())
  const [filterTags,      setFilterTags]      = useState<Set<string>>(new Set())
  const [filterFoco,      setFilterFoco]      = useState<boolean>(false)
  const [showFilters,     setShowFilters]     = useState<boolean>(false)
  const [isPending, startTransition]    = useTransition()
  // Default 'ministerio': es la vista que se usa más en reuniones de Gabinete
  // (DPR recorre cartera por SEREMI). 'eje', 'tag' y 'capa' son agrupaciones
  // alternativas disponibles vía el toggle de la filter bar.
  // 'tag' (migración 016): una columna por tag único entre las iniciativas
  // filtradas. Una iniciativa con N tags aparece en N columnas (decisión del
  // usuario, igual que ya pasaba con multi-ministerio).
  // 'capa' (migración 024): tres columnas fijas (Capa I / II / III) por nivel
  // de importancia.
  const [groupBy, setGroupBy]           = useState<'eje' | 'ministerio' | 'tag' | 'capa'>('ministerio')
  const ministerioContainerRef          = useRef<HTMLDivElement>(null)

  // Expandir/colapsar todas las secciones <details> del modo ministerio.
  // Usamos la API nativa de <details> en vez de estado controlado para no
  // pelearse con el comportamiento de cada sección individual.
  function toggleAllMinisterios(open: boolean) {
    const container = ministerioContainerRef.current
    if (!container) return
    container.querySelectorAll('details').forEach(d => { d.open = open })
  }

  // Descarga de cartera por ministerio en PDF (la vista actual filtrada por
  // región). soloEnFoco=true filtra a iniciativas con la bandera.
  const [descargando, setDescargando] = useState(false)
  const [focoMenuOpen, setFocoMenuOpen] = useState(false)
  const focoMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focoMenuOpen) return
    function onClickOutside(e: MouseEvent) {
      if (focoMenuRef.current && !focoMenuRef.current.contains(e.target as Node)) {
        setFocoMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [focoMenuOpen])
  async function handleDescargarCartera(soloEnFoco: boolean) {
    if (filterRegion === 'todas') return
    const region = REGIONS.find(r => r.nombre === filterRegion)
    if (!region) return
    setDescargando(true)
    try {
      const res = await fetch('/api/cartera-pdf', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          region,
          soloEnFoco,
          fecha: new Date().toLocaleDateString('es-CL'),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'No se pudo generar el PDF' }))
        window.alert(err.error ?? 'No se pudo generar el PDF')
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `cartera-${region.cod}-${soloEnFoco ? 'foco' : 'completa'}-${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('[KanbanView] descargar cartera:', e)
      window.alert('Error de red generando el PDF')
    } finally {
      setDescargando(false)
    }
  }

  // Toggle del flag "en foco" desde cualquier card del Kanban. Optimistic +
  // rollback en error. La persistencia se hace acá porque WorkOSApp solo
  // mantiene estado local — cada componente persiste sus propios cambios.
  // Etapa 5: mutamos por id (PK estable) en vez de n. n sigue como key del
  // estado local en WorkOSApp.handleUpdatePrioridad (FK lógicas de la tabla
  // de seguimientos/documentos también apuntan a n — no se tocan).
  async function handleToggleFoco(n: number, id: number, next: boolean) {
    onUpdatePrioridad(n, { en_foco: next })
    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .update({ en_foco: next })
      .eq('id', id)
      .select('id, en_foco')
    const failed = !!error || !data || data.length === 0
    if (failed) {
      onUpdatePrioridad(n, { en_foco: !next })
      const msg = error
        ? `Error guardando foco: ${error.message}`
        : 'No se pudo guardar el foco (0 filas actualizadas — probable RLS / permisos).'
      console.error('[KanbanView] handleToggleFoco:', { n, id, next, error, data })
      window.alert(msg)
    } else {
      console.log('[KanbanView] Foco guardado:', data)
    }
  }

  // El modo "agrupado" es el único modo de la vista Gabinete: una región
  // filtrada con sub-modos por `groupBy` ('eje', 'ministerio', 'tag', 'capa').
  // Si filterRegion === 'todas' (caso técnico cuando projects está vacío al
  // arranque), se muestra un empty state — no hay vista "todas las regiones"
  // mezcladas porque rompe la metáfora de la mesa por SEREMI.
  const isGroupedMode = filterRegion !== 'todas'

  // Selector: TODAS las regiones visibles para el usuario (no solo las que tienen
  // iniciativas). Si llega allowedRegionNames, se restringe a esas; si es null
  // mostramos las 16 — coherente con que ahora "Todas las regiones" no existe.
  const regions = useMemo(() => {
    const all = REGIONS.map(r => r.nombre)
    const filtered = allowedRegionNames ? all.filter(n => allowedRegionNames.includes(n)) : all
    return filtered.sort()
  }, [allowedRegionNames])

  const filtered = useMemo(() => projects.filter(p => {
    if (filterRegion !== 'todas' && p.region !== filterRegion) return false
    if (filterSemaforo.size  > 0 && !filterSemaforo.has(p.estado_semaforo))                       return false
    if (filterPrioridad.size > 0 && !filterPrioridad.has(p.prioridad))                            return false
    if (filterCapa.size      > 0 && !filterCapa.has(p.capa))                                      return false
    if (filterEtapa.size     > 0 && !(p.etapa_actual && filterEtapa.has(p.etapa_actual)))         return false
    if (filterTags.size      > 0 && !(p.tags ?? []).some(t => filterTags.has(t)))                 return false
    if (filterFoco && p.en_foco !== true)                                                         return false
    return true
  }), [projects, filterRegion, filterSemaforo, filterPrioridad, filterCapa, filterEtapa, filterTags, filterFoco])

  // ── Modo "por eje": columnas planas ordenadas 1→6 ──────────────────────────
  const ejeColumns = useMemo(() => {
    if (!isGroupedMode || groupBy !== 'eje') return null
    const allEjes = Array.from(new Set(filtered.map(p => p.eje).filter(Boolean)))
      .sort((a, b) => ejeNumber(a) - ejeNumber(b))
    return allEjes.map(eje => ({
      eje,
      cards: filtered.filter(p => p.eje === eje),
      semCounts: {
        rojo:  filtered.filter(p => p.eje === eje && p.estado_semaforo === 'rojo').length,
        ambar: filtered.filter(p => p.eje === eje && p.estado_semaforo === 'ambar').length,
        verde: filtered.filter(p => p.eje === eje && p.estado_semaforo === 'verde').length,
      },
    }))
  }, [filtered, isGroupedMode, groupBy])

  // ── Modo "por cartera": secciones verticales (estilo Monday) ─────────────
  // Una iniciativa con multi-ministerio aparece en cada grupo (decisión del
  // usuario). Por eso no mostramos contadores en los headers.
  //
  // Las variantes raw de BD ('Min. Salud', 'MINSAL', 'Ministerio de Salud')
  // se colapsan al canon vía `normalizeMinisterio`, así no salen 3 grupos
  // distintos para la misma cartera.
  //
  // Orden = institucional (Interior → MOP → MINVU → ...) según `compareCarteras`.
  // El DPR conduce la mesa por ese orden; alfabético no refleja la conducción real.
  const ministerioGroups = useMemo(() => {
    if (!isGroupedMode || groupBy !== 'ministerio') return null
    const expanded = filtered.flatMap(p =>
      carterasNormalizadas(p.ministerio).map(min => ({ p, min }))
    )
    const allMin = Array.from(new Set(expanded.map(e => e.min))).sort(compareCarteras)
    return allMin.map(min => ({
      nombre: min,
      iniciativas: expanded.filter(e => e.min === min).map(e => e.p),
    }))
  }, [filtered, isGroupedMode, groupBy])

  // ── Modo "por tag": columnas planas, una por tag único ────────────────────
  // Iniciativa con N tags se renderiza en N columnas — refleja que pertenece
  // a todos esos grupos. Iniciativas con array vacío van a columna "Sin
  // etiquetas" al final.
  const SIN_TAG = '__sin_etiquetas__'
  const tagColumns = useMemo(() => {
    if (!isGroupedMode || groupBy !== 'tag') return null
    const allTags = Array.from(new Set(filtered.flatMap(p => p.tags ?? []))).sort()
    const cols = allTags.map(tag => ({
      tag,
      cards: filtered.filter(p => (p.tags ?? []).includes(tag)),
    }))
    const sinTags = filtered.filter(p => (p.tags ?? []).length === 0)
    if (sinTags.length > 0) cols.push({ tag: SIN_TAG, cards: sinTags })
    return cols
  }, [filtered, isGroupedMode, groupBy])

  // ── Modo "por capa" (migración 024): 3 columnas fijas I/II/III ───────────
  // Orden de importancia decreciente. Sin columna "sin capa" — la BD garantiza
  // NOT NULL DEFAULT 'lll', toda iniciativa cae en una de las tres.
  const capaColumns = useMemo(() => {
    if (!isGroupedMode || groupBy !== 'capa') return null
    const buckets: Record<Capa, Iniciativa[]> = { l: [], ll: [], lll: [] }
    for (const p of filtered) buckets[p.capa].push(p)
    return [
      { capa: 'l' as Capa,   label: 'Capa I',   sub: 'Las prioridades',  cards: buckets.l   },
      { capa: 'll' as Capa,  label: 'Capa II',  sub: 'Más importante',   cards: buckets.ll  },
      { capa: 'lll' as Capa, label: 'Capa III', sub: 'Cartera regular',  cards: buckets.lll },
    ]
  }, [filtered, isGroupedMode, groupBy])

  // Opciones del panel de Filtros — derivadas de las iniciativas de la región
  // activa (sin aplicar otros filtros, para que el usuario vea el universo
  // completo de opciones aunque ya tenga algún chip activo).
  const regionPool = useMemo(() => {
    if (filterRegion === 'todas') return [] as Iniciativa[]
    return projects.filter(p => p.region === filterRegion)
  }, [projects, filterRegion])

  const availableEtapas = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const p of regionPool) {
      if (!p.etapa_actual) continue
      counts.set(p.etapa_actual, (counts.get(p.etapa_actual) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [regionPool])

  const availableTags = useMemo<FilterOption[]>(() => {
    const counts = new Map<string, number>()
    for (const p of regionPool) {
      for (const t of p.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [regionPool])

  const availableCapas = useMemo<FilterOption[]>(() => {
    const counts: Record<Capa, number> = { l: 0, ll: 0, lll: 0 }
    for (const p of regionPool) counts[p.capa] += 1
    return [
      { value: 'l',   label: 'Capa I',   sublabel: 'Las prioridades', count: counts.l   },
      { value: 'll',  label: 'Capa II',  sublabel: 'Más importante',  count: counts.ll  },
      { value: 'lll', label: 'Capa III', sublabel: 'Cartera regular', count: counts.lll },
    ]
  }, [regionPool])

  const activeFilterCount =
    (filterSemaforo.size  > 0 ? 1 : 0) +
    (filterPrioridad.size > 0 ? 1 : 0) +
    (filterCapa.size      > 0 ? 1 : 0) +
    (filterEtapa.size     > 0 ? 1 : 0) +
    (filterTags.size      > 0 ? 1 : 0) +
    (filterFoco                ? 1 : 0)

  function clearAllFilters() {
    setFilterSemaforo(new Set())
    setFilterPrioridad(new Set())
    setFilterCapa(new Set())
    setFilterEtapa(new Set())
    setFilterTags(new Set())
    setFilterFoco(false)
  }

  const selectedSynced = selected ? (projects.find(p => p.n === selected.n) ?? selected) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full overflow-hidden">

      {/* Filter bar — flex-wrap + min-w-0 en items para que en pantallas
          chicas el contenido se pliegue sin romper el layout horizontal. */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap min-w-0">
        <select
          value={filterRegion}
          onChange={e => { const v = e.target.value; startTransition(() => { setFilterRegion(v) }) }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300 min-w-0 max-w-full"
        >
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* Botón único "Filtros" — abre panel inline con Semáforo, Foco,
            Prioridad, Capa, Etapa y Etiquetas. Sin eje gobierno: el SEREMI
            piensa por cartera, no por eje gobierno transversal. */}
        {isGroupedMode && (
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
              showFilters || activeFilterCount > 0
                ? 'bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
          >
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <span className="bg-slate-600 text-white text-[10px] font-semibold rounded-full px-1.5 py-px min-w-[18px] text-center leading-none">
                {activeFilterCount}
              </span>
            )}
            <span className="text-gray-400 text-[10px]">{showFilters ? '▴' : '▾'}</span>
          </button>
        )}

        {/* Toggle "Ejes / Ministerios / Tags" — solo visible con región filtrada en Kanban */}
        {isGroupedMode && (
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setGroupBy('eje')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'eje' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Ejes
            </button>
            <button
              onClick={() => setGroupBy('ministerio')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'ministerio' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Ministerios
            </button>
            <button
              onClick={() => setGroupBy('tag')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'tag' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Tags
            </button>
            <button
              onClick={() => setGroupBy('capa')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'capa' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Agrupar por capa de importancia (I/II/III)"
            >
              Capa
            </button>
          </div>
        )}

        {/* Expandir/colapsar todos — solo en vista por ministerio */}
        {isGroupedMode && groupBy === 'ministerio' && (
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => toggleAllMinisterios(true)}
              title="Expandir todos"
              className="p-1.5 rounded-md hover:bg-slate-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3l3 3 3-3"/>
                <path d="M3 7l3 3 3-3"/>
              </svg>
            </button>
            <button
              onClick={() => toggleAllMinisterios(false)}
              title="Colapsar todos"
              className="p-1.5 rounded-md hover:bg-slate-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5l3-3 3 3"/>
                <path d="M3 9l3-3 3 3"/>
              </svg>
            </button>
          </div>
        )}

        {isGroupedMode && (
          <span className="text-xs text-gray-500 font-medium">
            {filtered.length} iniciativas
          </span>
        )}

        {/* Descargar cartera — split button con dropdown para "solo en foco" */}
        {isGroupedMode && groupBy === 'ministerio' && (() => {
          const flaggedCount = filtered.filter(p => p.en_foco === true).length
          return (
            <div className="relative flex items-stretch ml-auto group/dl" ref={focoMenuRef}>
              <button
                onClick={() => handleDescargarCartera(false)}
                disabled={descargando || filtered.length === 0}
                title="Descargar PDF con la cartera completa de cada ministerio"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-l-md bg-white border border-gray-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50 hover:shadow-sm active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:shadow-none transition-all"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 transition-transform group-hover/dl:translate-y-0.5">
                  <path d="M8 2v9M4 7l4 4 4-4M2 14h12"/>
                </svg>
                Descargar cartera
              </button>
              <button
                onClick={() => setFocoMenuOpen(prev => !prev)}
                disabled={descargando}
                title="Más opciones de descarga"
                aria-label="Más opciones de descarga"
                className="flex items-center px-1.5 py-1.5 rounded-r-md bg-white border border-l-0 border-gray-200 text-slate-500 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-all"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${focoMenuOpen ? 'rotate-180' : ''}`}>
                  <path d="M2 4l3 3 3-3"/>
                </svg>
              </button>

              {focoMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={() => { setFocoMenuOpen(false); handleDescargarCartera(false) }}
                    disabled={descargando || filtered.length === 0}
                    className="w-full px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 border-b border-gray-100"
                  >
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-slate-700 flex-shrink-0">
                      <path d="M8 2v9M4 7l4 4 4-4M2 14h12"/>
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">Cartera completa</p>
                      <p className="text-[10px] text-gray-500">{filtered.length} iniciativas</p>
                    </div>
                  </button>
                  <button
                    onClick={() => { setFocoMenuOpen(false); handleDescargarCartera(true) }}
                    disabled={descargando || flaggedCount === 0}
                    className="w-full px-3 py-2.5 text-left hover:bg-amber-50 disabled:opacity-50 disabled:hover:bg-transparent flex items-center gap-2"
                  >
                    <FlagIcon filled className="w-3 h-3 text-amber-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800">Solo iniciativas en foco</p>
                      <p className="text-[10px] text-gray-500">
                        {flaggedCount === 0 ? 'No hay iniciativas marcadas' : `${flaggedCount} con bandera`}
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {!isGroupedMode && (
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} iniciativas</span>
        )}
      </div>

      {/* Panel inline de Filtros — solo se muestra con región seleccionada y
          cuando el botón Filtros está expandido. Mismo patrón que "Más filtros"
          del Dashboard (expand inline, sin overlay). */}
      {isGroupedMode && showFilters && (
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-slate-50/60 flex items-center gap-2 flex-wrap min-w-0">
          {/* Semáforo: chips inline (4 estados, el patrón del Dashboard). */}
          <div className="flex items-center gap-1">
            {(['rojo', 'ambar', 'verde', 'gris'] as const).map(s => {
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
                    active ? activeClass : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${SEMAFORO_CONFIG[s].dot}`} />
                  {SEMAFORO_CONFIG[s].label}
                </button>
              )
            })}
          </div>

          {/* En foco */}
          <button
            onClick={() => setFilterFoco(v => !v)}
            className={`text-xs px-2 py-1 rounded-full transition-colors font-medium flex items-center gap-1 ${
              filterFoco
                ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
                : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
            }`}
            title="Filtrar solo iniciativas en foco"
          >
            <span className="text-[10px]">⚑</span>
            En foco
          </button>

          {/* Prioridad: chips inline (3 opciones). */}
          <div className="flex items-center gap-1">
            {(['Alta', 'Media', 'Baja'] as const).map(p => {
              const active = filterPrioridad.has(p)
              const activeClass =
                p === 'Alta'  ? 'bg-red-50 text-red-700 ring-1 ring-red-200'       :
                p === 'Media' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                                'bg-gray-200 text-gray-600 ring-1 ring-gray-300'
              return (
                <button
                  key={p}
                  onClick={() => toggleSet(setFilterPrioridad, p as string)}
                  className={`text-xs px-2 py-1 rounded-full transition-colors ${
                    active ? activeClass : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  {p}
                </button>
              )
            })}
          </div>

          <FilterPopover
            label="Capa"
            options={availableCapas}
            selected={filterCapa as Set<string>}
            onChange={(next) => setFilterCapa(new Set(Array.from(next).filter((v): v is Capa => v === 'l' || v === 'll' || v === 'lll')))}
          />

          {availableEtapas.length > 0 && (
            <FilterPopover
              label="Etapa"
              options={availableEtapas}
              selected={filterEtapa}
              onChange={setFilterEtapa}
            />
          )}

          {availableTags.length > 0 && (
            <FilterPopover
              label="Etiquetas"
              options={availableTags}
              selected={filterTags}
              onChange={setFilterTags}
            />
          )}

          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              className="text-xs px-2 py-1 rounded text-gray-500 hover:text-slate-800 hover:bg-white/80 ml-auto transition-colors"
            >
              Limpiar todo
            </button>
          )}
        </div>
      )}

      {/* ── Eje mode ──────────────────────────────────────────────────────────── */}
      {isPending && (
        <div className="absolute inset-0 top-[50px] flex items-center justify-center bg-white/60 z-10 pointer-events-none">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            <span className="text-xs text-gray-600 font-medium">Cargando vista…</span>
          </div>
        </div>
      )}
      {/* ── Modo "por eje": columnas planas 1→6 ─────────────────────────────── */}
      {/*
        Wrapper externo: flex + justify-center → centra el grid en pantalla
        cuando cabe entero. overflow-x-auto + grid con flex-shrink-0 → si las
        columnas no entran (ej. 6 ejes en pantalla angosta), permite scroll.
      */}
      {isGroupedMode && groupBy === 'eje' && ejeColumns && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          {/* mx-auto + w-fit: centra cuando los ejes caben; cuando exceden el
              viewport el grid mantiene su ancho y el overflow-x-auto del
              padre permite scroll lateral alcanzando todas las columnas
              (incluyendo las que quedarían "antes del centro" con el truco
              flex justify-center anterior). */}
          <div
            className="grid h-full px-6 pt-4 mx-auto w-fit"
            style={{
              gridTemplateColumns: `repeat(${ejeColumns.length}, 22rem)`,
              columnGap: '1rem',
            }}
          >
            {ejeColumns.map(({ eje, cards, semCounts }) => (
              <div key={eje} className="flex flex-col overflow-hidden pb-4">
                <div className="px-3 py-2.5 rounded-xl mb-3 bg-gray-100 text-gray-600">
                  <p className="text-xs font-semibold line-clamp-2 mb-1.5">{eje}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {semCounts.rojo > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
                          <span className="text-xs text-red-700 font-semibold">{semCounts.rojo}</span>
                        </span>
                      )}
                      {semCounts.ambar > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
                          <span className="text-xs text-amber-700 font-semibold">{semCounts.ambar}</span>
                        </span>
                      )}
                      {semCounts.verde > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
                          <span className="text-xs text-green-700 font-semibold">{semCounts.verde}</span>
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {cards.length === 0 ? (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                      Sin iniciativas
                    </div>
                  ) : (
                    cards.map(p => <EjeCard key={p.n} p={p} onSelect={setSelected} onToggleFoco={(n, next) => handleToggleFoco(n, p.id, next)} canEditFoco={canEditFoco} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modo "por tag": columnas planas, una por tag único ──────────────── */}
      {/* Mismo layout que "por eje". Iniciativa con N tags se renderiza en N
          columnas (key compuesto con el tag para evitar reconciliación cruzada
          de React). Columna "Sin etiquetas" al final. */}
      {isGroupedMode && groupBy === 'tag' && tagColumns && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          {tagColumns.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              Esta región todavía no tiene iniciativas con etiquetas.
            </div>
          ) : (
            <div
              className="grid h-full px-6 pt-4 mx-auto w-fit"
              style={{
                gridTemplateColumns: `repeat(${tagColumns.length}, 22rem)`,
                columnGap: '1rem',
              }}
            >
              {tagColumns.map(({ tag, cards }) => (
                <div key={tag} className="flex flex-col overflow-hidden pb-4">
                  <div className="px-3 py-2.5 rounded-xl mb-3 bg-gray-100 text-gray-600">
                    <p className="text-xs font-semibold line-clamp-1 mb-1.5">
                      {tag === SIN_TAG ? 'Sin etiquetas' : tag}
                    </p>
                    <div className="flex items-center justify-end">
                      <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {cards.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                        Sin iniciativas
                      </div>
                    ) : (
                      cards.map(p => (
                        <EjeCard key={`${p.n}-${tag}`} p={p} onSelect={setSelected} onToggleFoco={(n, next) => handleToggleFoco(n, p.id, next)} canEditFoco={canEditFoco} />
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modo "por capa" (migración 024): 3 columnas fijas I/II/III ──────── */}
      {/* Header coloreado con la paleta del badge: wine, amber, gris. La columna
          III queda al final, en gris suave — donde aterriza la mayoría. */}
      {isGroupedMode && groupBy === 'capa' && capaColumns && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div
            className="grid h-full px-6 pt-4 mx-auto w-fit"
            style={{
              gridTemplateColumns: 'repeat(3, 22rem)',
              columnGap: '1rem',
            }}
          >
            {capaColumns.map(({ capa, label, sub, cards }) => {
              const headerBg =
                capa === 'l'  ? 'bg-[#6b1d2c] text-white' :
                capa === 'll' ? 'bg-amber-100 text-amber-900' :
                                'bg-gray-100 text-gray-700'
              return (
                <div key={capa} className="flex flex-col overflow-hidden pb-4">
                  <div className={`px-3 py-2.5 rounded-xl mb-3 ${headerBg}`}>
                    <p className="text-xs font-bold tracking-wide">{label}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] opacity-80">{sub}</span>
                      <span className="text-xs font-bold bg-white/40 text-current px-2 py-0.5 rounded-full">{cards.length}</span>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {cards.length === 0 ? (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">
                        Sin iniciativas en esta capa
                      </div>
                    ) : (
                      cards.map(p => (
                        <EjeCard key={`${p.n}-${capa}`} p={p} onSelect={setSelected} onToggleFoco={(n, next) => handleToggleFoco(n, p.id, next)} canEditFoco={canEditFoco} />
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Modo "por ministerio": secciones verticales tipo Monday ─────────── */}
      {isGroupedMode && groupBy === 'ministerio' && ministerioGroups && (
        <div ref={ministerioContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {ministerioGroups.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              Sin iniciativas para mostrar
            </div>
          ) : (
            ministerioGroups.map(group => (
              <details
                key={group.nombre}
                open
                className="border border-gray-200 rounded-xl overflow-hidden group"
              >
                <summary className="cursor-pointer px-4 py-3 bg-slate-100 hover:bg-slate-200/60 transition-colors flex items-center gap-3 list-none">
                  <svg
                    width="10" height="10" viewBox="0 0 10 10"
                    className="text-slate-500 transition-transform group-open:rotate-90"
                    fill="none" stroke="currentColor" strokeWidth="2"
                  >
                    <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span className="text-sm font-bold text-slate-800">{group.nombre}</span>
                </summary>
                {/* overflow-x-auto: si las filas anchas no entran en pantalla
                    chica (responsable + hito + prioridad + avance + nombre),
                    se permite scroll lateral interno en vez de cortarse. */}
                <div className="bg-slate-50 p-3 space-y-2 overflow-x-auto">
                  {group.iniciativas.map(p => (
                    <MinistryRow key={`${group.nombre}-${p.n}`} p={p} onSelect={setSelected} onToggleFoco={(n, next) => handleToggleFoco(n, p.id, next)} canEditFoco={canEditFoco} />
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      )}

      {/* Caso técnico edge: sin región seleccionada (projects vacío al arranque).
          La vista Gabinete siempre opera con una región — no hay vista "todas
          las regiones mezcladas" porque rompe la metáfora de la mesa por SEREMI. */}
      {!isGroupedMode && (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="max-w-md text-center space-y-2">
            <p className="text-sm text-gray-600 font-medium">Sin región seleccionada</p>
            <p className="text-xs text-gray-500 leading-relaxed">
              Elige una región desde el selector de arriba para ver las iniciativas
              agrupadas por cartera.
            </p>
          </div>
        </div>
      )}

      {/* Modal */}
      {selectedSynced && (
        <ProjectTrackerModal
          prioridad={selectedSynced}
          onClose={() => setSelected(null)}
          onUpdatePrioridad={onUpdatePrioridad}
          onDeletePrioridad={onDeletePrioridad}
        />
      )}

      {/* Loading modal: aparece mientras el backend renderiza el PDF (5-15s
          según volumen). Bloquea interacción para evitar dobles disparos. */}
      {descargando && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 flex items-center gap-3">
              <svg className="w-5 h-5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              <span className="text-white font-semibold text-sm">Generando cartera PDF</span>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700">
                Estamos preparando el detalle de cada ministerio con sus iniciativas y seguimientos.
              </p>
              <p className="text-xs text-gray-400 mt-2">
                Esto puede tardar unos segundos según la cantidad de iniciativas en la región.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
