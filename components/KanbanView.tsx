'use client'

import { useMemo, useState, useTransition, useLayoutEffect, useRef, useEffect } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { SEMAFORO_CONFIG, EJE_COLORS, prioridadColor, ejeGobHeaderColor, splitMinisterios } from '@/lib/config'
import { getSupabase } from '@/lib/supabase'
import { REGIONS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import { FlagIcon } from './icons/FlagIcon'

// ── Mosaic helpers ────────────────────────────────────────────────────────────

const MOSAIC_BG: Record<string, string> = {
  verde: 'bg-green-500',
  ambar: 'bg-amber-400',
  rojo:  'bg-red-500',
  gris:  'bg-slate-400',
}

function mosaicBg(sem: string | null) {
  return MOSAIC_BG[sem ?? 'gris'] ?? MOSAIC_BG.gris
}

function daysUntil(isoDate: string | null): number | null {
  if (!isoDate) return null
  const diff = new Date(isoDate).getTime() - Date.now()
  return Math.ceil(diff / 86_400_000)
}

// estado_termino_gobierno → icon type
function terminoIcon(val: string | null): 'check' | 'warn' | null {
  if (!val) return null
  const lower = val.toLowerCase()
  if (lower.includes('seguro') || lower.includes('probable') && !lower.includes('poco')) return 'check'
  return 'warn'
}

// "Eje 3: Salud y Servicios Básicos" → 3. Sin número → 999 (queda al final).
function ejeNumber(eje: string): number {
  const m = eje.match(/^Eje\s+(\d+)/)
  return m ? parseInt(m[1], 10) : 999
}

// Helper local que envuelve splitMinisterios para dar el fallback 'Sin ministerio'
// cuando el campo es null. La lógica canónica de split vive en lib/config.ts.
function ministeriosOrFallback(raw: string | null | undefined): string[] {
  const list = splitMinisterios(raw)
  return list.length > 0 ? list : ['Sin ministerio']
}

// ── SVG icons (inline, no dep) ────────────────────────────────────────────────

function IconKanban() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="4" height="14" rx="1"/>
      <rect x="6" y="1" width="4" height="10" rx="1"/>
      <rect x="11" y="1" width="4" height="12" rx="1"/>
    </svg>
  )
}

function IconMosaic() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="1" y="1" width="8" height="8" rx="1"/>
      <rect x="10" y="1" width="5" height="8" rx="1"/>
      <rect x="1" y="10" width="5" height="5" rx="1"/>
      <rect x="7" y="10" width="8" height="5" rx="1"/>
    </svg>
  )
}

function IconCheck() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="1.5,5 4,7.5 8.5,2.5"/>
    </svg>
  )
}

function IconWarn() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="2" x2="5" y2="6"/>
      <circle cx="5" cy="8.2" r="0.8" fill="currentColor" strokeWidth="0"/>
    </svg>
  )
}

// ── Estado mode: 4 fixed semáforo columns ────────────────────────────────────

const COLUMNS = [
  { key: 'rojo',  label: 'Bloqueadas',   bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500',   header: 'bg-red-100 text-red-800'   },
  { key: 'ambar', label: 'En revisión',  bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-400', header: 'bg-amber-100 text-amber-800' },
  { key: 'verde', label: 'En verde',     bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500', header: 'bg-green-100 text-green-800' },
  { key: 'gris',  label: 'Sin evaluar',  bg: 'bg-gray-50',   border: 'border-gray-200',  dot: 'bg-gray-300',  header: 'bg-gray-100 text-gray-600'   },
] as const

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

function EjeCard({ p, onSelect, onToggleFoco }: {
  p: Iniciativa
  onSelect: (p: Iniciativa) => void
  onToggleFoco: (n: number, next: boolean) => void
}) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pc  = prioridadColor(p.prioridad)
  const enFoco = p.en_foco === true
  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full text-left border bg-white rounded-xl p-3 hover:shadow-md transition-all group relative ${
        enFoco ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
      }`}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFoco(p.n, !enFoco) }}
        className={`absolute top-2 right-2 p-1 rounded transition-colors ${
          enFoco ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-500'
        }`}
        title={enFoco ? 'Quitar del foco' : 'Marcar en foco'}
      >
        <FlagIcon filled={enFoco} className="w-3.5 h-3.5" />
      </button>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${sem.dot}`} />
        <span className="text-xs text-gray-600 font-medium">{sem.label}</span>
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

function MinistryRow({ p, onSelect, onToggleFoco }: {
  p: Iniciativa
  onSelect: (p: Iniciativa) => void
  onToggleFoco: (n: number, next: boolean) => void
}) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pc  = prioridadColor(p.prioridad)
  const dias = daysUntil(p.fecha_proximo_hito)
  const hitoUrgent = dias !== null && dias <= 7 && (p.estado_semaforo === 'rojo' || p.estado_semaforo === 'ambar')
  const enFoco = p.en_foco === true
  // "Eje 3: Salud y Servicios Básicos" → "Eje 3" (compacto en chip horizontal)
  const ejeShort = p.eje.match(/^Eje\s+\d+/)?.[0] ?? p.eje
  // "diego.darquea@gmail.com" → "diego.darquea" (más legible en reunión)
  const responsableShort = p.responsable?.split('@')[0] ?? null

  return (
    <button
      onClick={() => onSelect(p)}
      className={`w-full text-left px-3 py-2.5 bg-white border rounded-xl hover:shadow-sm transition-all flex items-center gap-3 ${
        enFoco ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      {/* Flag */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFoco(p.n, !enFoco) }}
        className={`flex-shrink-0 p-1 -m-1 rounded transition-colors ${
          enFoco ? 'text-amber-500 hover:text-amber-700' : 'text-gray-300 hover:text-amber-500'
        }`}
        title={enFoco ? 'Quitar del foco' : 'Marcar en foco'}
      >
        <FlagIcon filled={enFoco} className="w-3.5 h-3.5" />
      </button>

      {/* Semáforo */}
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />

      {/* Nombre */}
      <p className="text-sm font-medium text-slate-800 line-clamp-1 flex-1 min-w-0">
        {p.nombre}
      </p>

      {/* Eje chip (compacto) */}
      <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${EJE_COLORS[p.eje] ?? 'bg-gray-100 text-gray-600'}`}>
        {ejeShort}
      </span>

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
  const [selected, setSelected]         = useState<Iniciativa | null>(null)
  // Región filtrada controlada por el state global (WorkOSApp). Fallback a la
  // primera región alfabética si llega vacío (ej. arranque antes de hidratar).
  const filterRegion = useMemo(() => {
    if (activeRegionName) return activeRegionName
    const sorted = Array.from(new Set(projects.map(p => p.region))).sort()
    return sorted[0] ?? 'todas'
  }, [activeRegionName, projects])
  const setFilterRegion = onActiveRegionChange
  const [filterEjeGob, setFilterEjeGob] = useState<Set<string>>(new Set())
  const [isPending, startTransition]    = useTransition()
  const [viewMode, setViewMode]         = useState<'kanban' | 'mosaico'>('kanban')
  // Default 'ministerio': es la vista que se usa más en reuniones (cartera por
  // SEREMI). 'eje' queda disponible vía el toggle de la filter bar.
  const [groupBy, setGroupBy]           = useState<'eje' | 'ministerio'>('ministerio')
  const [showSmall, setShowSmall]       = useState(false)
  const [cellSize, setCellSize]         = useState(56)
  const gridRef                         = useRef<HTMLDivElement>(null)
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
  async function handleToggleFoco(n: number, next: boolean) {
    onUpdatePrioridad(n, { en_foco: next })
    const { data, error } = await getSupabase()
      .from('prioridades_territoriales')
      .update({ en_foco: next })
      .eq('n', n)
      .select('n, en_foco')
    const failed = !!error || !data || data.length === 0
    if (failed) {
      onUpdatePrioridad(n, { en_foco: !next })
      const msg = error
        ? `Error guardando foco: ${error.message}`
        : 'No se pudo guardar el foco (0 filas actualizadas — probable RLS / permisos).'
      console.error('[KanbanView] handleToggleFoco:', { n, next, error, data })
      window.alert(msg)
    } else {
      console.log('[KanbanView] Foco guardado:', data)
    }
  }

  // Make grid cells square: measure actual px width of 1 column unit
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el || viewMode !== 'mosaico') return
    const COLS = 12, GAP = 6, PAD = 48
    const update = () => {
      const colW = Math.floor((el.clientWidth - PAD - GAP * (COLS - 1)) / COLS)
      setCellSize(Math.max(28, Math.floor(colW * 0.5)))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [viewMode])

  // Modo "agrupado": kanban con una región filtrada. Sub-modos por `groupBy`:
  //   - 'eje'        → columnas planas 1→6
  //   - 'ministerio' → secciones verticales estilo Monday
  const isGroupedMode = viewMode === 'kanban' && filterRegion !== 'todas'

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
    if (filterEjeGob.size > 0 && !filterEjeGob.has(p.eje_gobierno ?? '')) return false
    return true
  }), [projects, filterRegion, filterEjeGob])

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

  // ── Modo "por ministerio": secciones verticales (Monday) ──────────────────
  // Una iniciativa con multi-ministerio aparece en cada grupo (decisión del usuario).
  // Por eso no mostramos contadores en los headers.
  const ministerioGroups = useMemo(() => {
    if (!isGroupedMode || groupBy !== 'ministerio') return null
    const expanded = filtered.flatMap(p =>
      ministeriosOrFallback(p.ministerio).map(min => ({ p, min }))
    )
    const allMin = Array.from(new Set(expanded.map(e => e.min))).sort()
    return allMin.map(min => ({
      nombre: min,
      iniciativas: expanded.filter(e => e.min === min).map(e => e.p),
    }))
  }, [filtered, isGroupedMode, groupBy])

  // ── Estado mode byCol ──────────────────────────────────────────────────────
  const byCol: Record<string, Iniciativa[]> = { rojo: [], ambar: [], verde: [], gris: [] }
  if (!isGroupedMode && viewMode === 'kanban') {
    for (const p of filtered) byCol[p.estado_semaforo]?.push(p)
  }

  // ── Mosaic items ───────────────────────────────────────────────────────────
  // [B] Aspect ratio: pick variant whose raw area is closest to target (within 30-200%),
  //     then use p.n for variety among similarly-sized items.
  // [3] Urgency: dias_al_hito computed here for pulse border.
  const mosaicItems = useMemo(() => {
    if (viewMode !== 'mosaico') return []
    const sorted = [...filtered].sort((a, b) => (b.inversion_mm ?? 0) - (a.inversion_mm ?? 0))
    const maxInv = sorted[0]?.inversion_mm ?? 1

    const VARIANTS: [number, number][] = [
      [1, 1],  [2, 1],  [1, 2],  [3, 1],  [1, 3],
      [3, 2],  [2, 3],  [4, 1],  [1, 4],  [4, 2],
      [2, 4],  [5, 2],  [2, 5],  [6, 2],  [2, 6],
      [4, 3],  [3, 4],  [5, 3],  [3, 5],  [6, 3],
    ]

    return sorted.map(p => {
      const inv  = p.inversion_mm ?? 0
      const area = inv > 0 ? Math.max(4, Math.round((inv / maxInv) * 18)) : 4

      // Pick variants whose raw area is within 30–200% of target, then vary by p.n
      const eligible = VARIANTS.filter(([rw, rh]) => {
        const raw = rw * rh
        return raw >= area * 0.3 && raw <= area * 2
      })
      const pool    = eligible.length > 0 ? eligible : VARIANTS
      const [rw, rh] = pool[p.n % pool.length]
      const scale   = Math.sqrt(area / (rw * rh))
      const colSpan = Math.min(12, Math.max(2, Math.round(rw * scale)))
      const rowSpan = Math.min(6,  Math.max(1, Math.round(rh * scale)))
      const isSmall = inv === 0 || (colSpan * rowSpan) <= 4

      // [3] Urgency: hito within 30 days AND semáforo is rojo/ambar
      const dias        = daysUntil(p.fecha_proximo_hito)
      const isUrgent    = dias !== null && dias <= 30 && (p.estado_semaforo === 'rojo' || p.estado_semaforo === 'ambar')
      const isCritical  = dias !== null && dias <= 7  && (p.estado_semaforo === 'rojo' || p.estado_semaforo === 'ambar')

      return { ...p, colSpan, rowSpan, isSmall, isUrgent, isCritical }
    })
  }, [filtered, viewMode])

  const mainItems  = useMemo(() => mosaicItems.filter(i => !i.isSmall), [mosaicItems])
  const smallItems = useMemo(() => mosaicItems.filter(i =>  i.isSmall), [mosaicItems])

  // [2] Mosaic summary: MM$ and count per semáforo
  const mosaicSummary = useMemo(() => {
    if (viewMode !== 'mosaico') return null
    const total = filtered.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
    return (['rojo', 'ambar', 'verde', 'gris'] as const).map(sem => {
      const items = filtered.filter(p => (p.estado_semaforo ?? 'gris') === sem)
      const inv   = items.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
      const pct   = total > 0 ? Math.round(inv / total * 100) : 0
      return { sem, count: items.length, inv, pct }
    }).filter(s => s.count > 0)
  }, [filtered, viewMode])

  const selectedSynced = selected ? (projects.find(p => p.n === selected.n) ?? selected) : null

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full overflow-hidden">

      {/* Filter bar */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
        <select
          value={filterRegion}
          onChange={e => { const v = e.target.value; startTransition(() => { setFilterRegion(v); setFilterEjeGob(new Set()) }) }}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
        >
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* [A] Eje gobierno toggles — visible cuando no hay agrupación (mosaico o "todas las regiones") */}
        {(viewMode === 'mosaico' || !isGroupedMode) && (
          <div className="flex items-center gap-1">
            {(['Economía', 'Social', 'Seguridad'] as const).map(eg => {
              const active = filterEjeGob.has(eg)
              return (
                <button key={eg} onClick={() => toggleSet(setFilterEjeGob, eg as string)}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    active ? ejeGobHeaderColor(eg) + ' ring-1' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  {eg}
                </button>
              )
            })}
          </div>
        )}

        {/* Toggle "Por eje / Por ministerio" — solo visible con región filtrada en Kanban */}
        {isGroupedMode && (
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setGroupBy('eje')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'eje' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Por eje
            </button>
            <button
              onClick={() => setGroupBy('ministerio')}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                groupBy === 'ministerio' ? 'bg-slate-200 text-slate-800' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Por ministerio
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

        {/* Region chip in mosaico mode */}
        {viewMode === 'mosaico' && filterRegion !== 'todas' && (
          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
            {filterRegion}
          </span>
        )}

        {/* View mode toggle */}
        <div className="flex items-center gap-1 ml-auto border border-gray-200 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('kanban')}
            title="Vista Kanban"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'kanban' ? 'bg-slate-200 text-slate-800' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <IconKanban />
          </button>
          <button
            onClick={() => setViewMode('mosaico')}
            title="Vista Mosaico"
            className={`p-1.5 rounded-md transition-colors ${viewMode === 'mosaico' ? 'bg-slate-200 text-slate-800' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <IconMosaic />
          </button>
        </div>

        <span className="text-xs text-gray-400">{filtered.length} iniciativas</span>
      </div>

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
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex justify-center">
          <div
            className="grid h-full px-6 pt-4 flex-shrink-0"
            style={{
              gridTemplateColumns: `repeat(${ejeColumns.length}, 22rem)`,
              columnGap: '1rem',
            }}
          >
            {ejeColumns.map(({ eje, cards, semCounts }) => (
              <div key={eje} className="flex flex-col overflow-hidden pb-4">
                <div className={`px-3 py-2.5 rounded-xl mb-3 ${EJE_COLORS[eje] ?? 'bg-gray-100 text-gray-600'}`}>
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
                    cards.map(p => <EjeCard key={p.n} p={p} onSelect={setSelected} onToggleFoco={handleToggleFoco} />)
                  )}
                </div>
              </div>
            ))}
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
                <div className="bg-slate-50 p-3 space-y-2">
                  {group.iniciativas.map(p => (
                    <MinistryRow key={`${group.nombre}-${p.n}`} p={p} onSelect={setSelected} onToggleFoco={handleToggleFoco} />
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      )}

      {/* ── Estado mode: 4 semáforo columns ──────────────────────────────────── */}
      {viewMode === 'kanban' && !isGroupedMode && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 px-6 py-4 min-w-max">
            {COLUMNS.map(col => {
              const cards = byCol[col.key] ?? []
              return (
                <div key={col.key} className="flex flex-col w-72 flex-shrink-0">
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${col.header}`}>
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
                    <span className="text-sm font-semibold flex-1">{col.label}</span>
                    <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {cards.length === 0 && (
                      <div className={`border-2 border-dashed ${col.border} rounded-xl p-4 text-center text-xs text-gray-400`}>
                        Sin iniciativas
                      </div>
                    )}
                    {cards.map(p => (
                      <button
                        key={p.n}
                        onClick={() => setSelected(p)}
                        className={`w-full text-left border ${col.border} ${col.bg} rounded-xl p-3 hover:shadow-md transition-all group`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full truncate max-w-[160px] ${EJE_COLORS[p.eje] ?? 'bg-gray-100 text-gray-600'}`}>
                            {p.eje}
                          </span>
                          <span className={`text-xs font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full ${prioridadColor(p.prioridad).bg} ${prioridadColor(p.prioridad).text}`}>
                            {p.prioridad}
                          </span>
                        </div>
                        <p className="text-xs text-gray-800 leading-snug line-clamp-3 mb-2 group-hover:text-slate-900">
                          {p.nombre}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/60">
                          <span className="text-xs text-gray-500 truncate max-w-[140px]">{p.region}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <div className="w-10 h-1 bg-white/80 rounded-full overflow-hidden">
                              <div
                                className={`h-1 rounded-full ${
                                  col.key === 'rojo' ? 'bg-red-400' :
                                  col.key === 'ambar' ? 'bg-amber-400' :
                                  col.key === 'verde' ? 'bg-green-500' : 'bg-gray-300'
                                }`}
                                style={{ width: `${p.pct_avance}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-600">{p.pct_avance}%</span>
                          </div>
                        </div>
                        {p.responsable && (
                          <p className="text-xs text-gray-400 mt-1 truncate">{p.responsable}</p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Mosaico mode ──────────────────────────────────────────────────────── */}
      {viewMode === 'mosaico' && (
        <div className="flex-1 overflow-y-auto pb-12">
          {mosaicItems.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-sm text-gray-400">
              Sin iniciativas para mostrar
            </div>
          ) : (
            <div
              ref={gridRef}
              className="grid gap-1.5 px-6 py-4"
              style={{ gridTemplateColumns: 'repeat(12, 1fr)', gridAutoRows: `${cellSize}px`, gridAutoFlow: 'dense' }}
            >
              {/* Main items — significant investment */}
              {mainItems.map(item => {
                const icon = terminoIcon(item.estado_termino_gobierno ?? null)
                return (
                  <button
                    key={item.n}
                    style={{ gridColumn: `span ${item.colSpan}`, gridRow: `span ${item.rowSpan}` }}
                    onClick={() => setSelected(item)}
                    className={[
                      mosaicBg(item.estado_semaforo),
                      'rounded-xl p-3 text-white text-left hover:brightness-110 transition-all',
                      'flex flex-col justify-between overflow-hidden relative',
                      // [3] Urgency border
                      item.isCritical ? 'ring-2 ring-white animate-pulse' :
                      item.isUrgent  ? 'ring-2 ring-white/70' : '',
                    ].join(' ')}
                  >
                    {/* [4] Estado término gobierno icon */}
                    {icon && (
                      <span className={`absolute top-1.5 right-1.5 opacity-80 ${icon === 'warn' ? 'text-white' : 'text-white/70'}`}>
                        {icon === 'check' ? <IconCheck /> : <IconWarn />}
                      </span>
                    )}

                    <p className="text-xs font-bold line-clamp-2 leading-snug pr-4">{item.nombre}</p>

                    {/* [D] Footer: region + prioridad + inversión */}
                    <div>
                      <p className="text-xs opacity-75 truncate mb-1">{item.region}</p>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold opacity-90">
                          {item.inversion_mm ? `MM$ ${item.inversion_mm.toLocaleString('es-CL')}` : '—'}
                        </span>
                        <span className="text-xs font-semibold bg-white/20 px-1 py-0.5 rounded">
                          {item.prioridad}
                        </span>
                      </div>
                      {/* [1] Micro-barra de avance */}
                      <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                        <div className="h-1 bg-white/70 rounded-full transition-all" style={{ width: `${item.pct_avance ?? 0}%` }} />
                      </div>
                    </div>
                  </button>
                )
              })}

              {/* [C] Group card for small/no-investment items — contained, not exploded */}
              {smallItems.length > 0 && (
                <div
                  style={{
                    gridColumn: showSmall ? 'span 4' : 'span 3',
                    gridRow: showSmall ? `span ${Math.min(8, Math.ceil(smallItems.length / 2) + 2)}` : 'span 2',
                  }}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col overflow-hidden"
                >
                  <button
                    onClick={() => setShowSmall(s => !s)}
                    className="flex items-center justify-between mb-2 hover:bg-slate-100 rounded-lg px-1 py-0.5 transition-colors w-full text-left"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {(['rojo','ambar','verde','gris'] as const).map(s => {
                        const count = smallItems.filter(i => (i.estado_semaforo ?? 'gris') === s).length
                        if (!count) return null
                        return (
                          <span key={s} className="flex items-center gap-0.5">
                            <span className={`w-2 h-2 rounded-full ${MOSAIC_BG[s]}`} />
                            <span className="text-xs font-semibold text-slate-600">{count}</span>
                          </span>
                        )
                      })}
                    </div>
                    <span className="text-xs font-bold text-slate-500 ml-1 flex-shrink-0">
                      {smallItems.length} sin inv. {showSmall ? '−' : '+'}
                    </span>
                  </button>
                  {showSmall && (
                    <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-1">
                      {smallItems.map(item => (
                        <button
                          key={item.n}
                          onClick={() => setSelected(item)}
                          className={`${mosaicBg(item.estado_semaforo)} rounded-lg px-2 py-1.5 text-white text-left text-xs font-medium line-clamp-2 hover:brightness-110 transition-all`}
                        >
                          {item.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* [2] Mosaic summary sticky bar */}
      {viewMode === 'mosaico' && mosaicSummary && mosaicSummary.length > 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-6 py-2 flex items-center gap-3 flex-wrap z-10">
          {mosaicSummary.map(({ sem, count, inv, pct }) => (
            <span key={sem} className="flex items-center gap-1.5 text-xs">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${MOSAIC_BG[sem]}`} />
              <span className="font-semibold text-gray-700">
                {pct}% · MM$ {inv.toLocaleString('es-CL')}
              </span>
              <span className="text-gray-400">{count} iniciativas</span>
            </span>
          ))}
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
