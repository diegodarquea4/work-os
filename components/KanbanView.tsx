'use client'

import { useMemo, useState, useTransition, useLayoutEffect, useRef } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { SEMAFORO_CONFIG, EJE_COLORS, prioridadColor, ejeGobHeaderColor } from '@/lib/config'
import ProjectTrackerModal from './ProjectTrackerModal'

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

const GOB_ORDER = ['Economía', 'Social', 'Seguridad', 'Sin clasificar'] as const
type GobKey = typeof GOB_ORDER[number]

function toggleSet<T>(setter: React.Dispatch<React.SetStateAction<Set<T>>>, val: T) {
  setter(prev => { const next = new Set(prev); next.has(val) ? next.delete(val) : next.add(val); return next })
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  projects: Iniciativa[]
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
  onDeletePrioridad?: (n: number) => void
}

// ── EjeCard — card for eje mode ───────────────────────────────────────────────

function EjeCard({ p, onSelect }: { p: Iniciativa; onSelect: (p: Iniciativa) => void }) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pc  = prioridadColor(p.prioridad)
  return (
    <button
      onClick={() => onSelect(p)}
      className="w-full text-left border border-gray-200 bg-white rounded-xl p-3 hover:shadow-md transition-all group"
    >
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

// ── Main component ────────────────────────────────────────────────────────────

export default function KanbanView({ projects, onUpdatePrioridad, onDeletePrioridad }: Props) {
  const [selected, setSelected]         = useState<Iniciativa | null>(null)
  const [filterRegion, setFilterRegion] = useState('todas')
  const [filterEjeGob, setFilterEjeGob] = useState<Set<string>>(new Set())
  const [isPending, startTransition]    = useTransition()
  const [viewMode, setViewMode]         = useState<'kanban' | 'mosaico'>('kanban')
  const [showSmall, setShowSmall]       = useState(false)
  const [cellSize, setCellSize]         = useState(56)
  const gridRef                         = useRef<HTMLDivElement>(null)

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

  const isEjeMode = viewMode === 'kanban' && filterRegion !== 'todas'

  const regions = useMemo(() => Array.from(new Set(projects.map(p => p.region))).sort(), [projects])

  const filtered = useMemo(() => projects.filter(p => {
    if (filterRegion !== 'todas' && p.region !== filterRegion) return false
    if (filterEjeGob.size > 0 && !filterEjeGob.has(p.eje_gobierno ?? '')) return false
    return true
  }), [projects, filterRegion, filterEjeGob])

  // ── Eje layout ─────────────────────────────────────────────────────────────
  const ejeLayout = useMemo(() => {
    if (!isEjeMode) return null
    const grupos: Record<GobKey, string[]> = {
      'Economía': [], 'Social': [], 'Seguridad': [], 'Sin clasificar': []
    }
    const allEjes = Array.from(new Set(filtered.map(p => p.eje).filter(Boolean))).sort()
    for (const eje of allEjes) {
      const eg = filtered.find(p => p.eje === eje)?.eje_gobierno
      const bucket: GobKey =
        eg === 'Economía' || eg === 'Social' || eg === 'Seguridad' ? eg : 'Sin clasificar'
      grupos[bucket].push(eje)
    }
    const activeGobs = GOB_ORDER.filter(g => grupos[g].length > 0)
    const columns = activeGobs.flatMap(gob =>
      grupos[gob].map(eje => ({
        eje, gob,
        cards: filtered.filter(p => p.eje === eje),
        semCounts: {
          rojo:  filtered.filter(p => p.eje === eje && p.estado_semaforo === 'rojo').length,
          ambar: filtered.filter(p => p.eje === eje && p.estado_semaforo === 'ambar').length,
          verde: filtered.filter(p => p.eje === eje && p.estado_semaforo === 'verde').length,
        },
      }))
    )
    const spans = activeGobs.map(g => ({ gob: g, count: grupos[g].length }))
    return { columns, spans, totalCols: columns.length }
  }, [filtered, isEjeMode])

  // ── Estado mode byCol ──────────────────────────────────────────────────────
  const byCol: Record<string, Iniciativa[]> = { rojo: [], ambar: [], verde: [], gris: [] }
  if (!isEjeMode && viewMode === 'kanban') {
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
          <option value="todas">Todas las regiones</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        {/* [A] Eje gobierno toggles — visible in both kanban and mosaico (but not eje mode) */}
        {(viewMode === 'mosaico' || !isEjeMode) && (
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

        {isEjeMode && (
          <span className="text-xs text-gray-500 font-medium">
            Vista por ejes · {filtered.length} iniciativas
          </span>
        )}

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
      {isEjeMode && ejeLayout && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div
            className="grid h-full px-6"
            style={{
              gridTemplateRows: 'auto 1fr',
              gridTemplateColumns: `repeat(${ejeLayout.totalCols}, 18rem)`,
              columnGap: '1rem',
            }}
          >
            {ejeLayout.spans.map(({ gob, count }) => (
              <div
                key={gob}
                style={{ gridColumn: `span ${count}` }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl mt-4 mb-1 ${ejeGobHeaderColor(gob)}`}
              >
                <span className="text-xs font-bold">{gob}</span>
                <span className="text-xs opacity-60">{count} eje{count !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {ejeLayout.columns.map(({ eje, cards, semCounts }) => (
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
                    cards.map(p => <EjeCard key={p.n} p={p} onSelect={setSelected} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Estado mode: 4 semáforo columns ──────────────────────────────────── */}
      {viewMode === 'kanban' && !isEjeMode && (
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
    </div>
  )
}
