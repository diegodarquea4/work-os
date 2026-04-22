'use client'

import { useMemo, useState, useTransition } from 'react'
import type { Iniciativa } from '@/lib/projects'
import { SEMAFORO_CONFIG, EJE_COLORS, prioridadColor, ejeGobHeaderColor } from '@/lib/config'
import ProjectTrackerModal from './ProjectTrackerModal'

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
      {/* Semáforo prominente */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${sem.dot}`} />
        <span className="text-xs text-gray-600 font-medium">{sem.label}</span>
      </div>

      {/* Nombre */}
      <p className="text-xs font-semibold text-gray-800 line-clamp-2 mb-2 group-hover:text-slate-900">
        {p.nombre}
      </p>

      {/* Etapa */}
      {p.etapa_actual && (
        <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded mb-1.5 inline-block">
          {p.etapa_actual}
        </span>
      )}

      {/* Footer */}
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

  const isEjeMode = filterRegion !== 'todas'

  const regions = useMemo(() => Array.from(new Set(projects.map(p => p.region))).sort(), [projects])

  const filtered = useMemo(() => projects.filter(p => {
    if (filterRegion !== 'todas' && p.region !== filterRegion) return false
    if (filterEjeGob.size > 0 && !filterEjeGob.has(p.eje_gobierno ?? '')) return false
    return true
  }), [projects, filterRegion, filterEjeGob])

  // ── Eje layout — only computed in eje mode ─────────────────────────────────
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
  if (!isEjeMode) {
    for (const p of filtered) byCol[p.estado_semaforo]?.push(p)
  }

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

        {/* Eje gobierno toggles — national mode only (eje mode shows hierarchy in columns) */}
        {!isEjeMode && (
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

        <span className="text-xs text-gray-400 ml-auto">{filtered.length} iniciativas</span>
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
            {/* Row 1: eje_gobierno spanning headers */}
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

            {/* Row 2: eje columns + cards */}
            {ejeLayout.columns.map(({ eje, cards, semCounts }) => (
              <div key={eje} className="flex flex-col overflow-hidden pb-4">
                {/* Column header L2 */}
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

                {/* Cards L3 */}
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
      {!isEjeMode && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full gap-4 px-6 py-4 min-w-max">
            {COLUMNS.map(col => {
              const cards = byCol[col.key] ?? []
              return (
                <div key={col.key} className="flex flex-col w-72 flex-shrink-0">
                  {/* Column header */}
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3 ${col.header}`}>
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${col.dot}`} />
                    <span className="text-sm font-semibold flex-1">{col.label}</span>
                    <span className="text-xs font-bold bg-white/60 px-2 py-0.5 rounded-full">{cards.length}</span>
                  </div>

                  {/* Cards */}
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
                        {/* Eje badge */}
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

                        {/* Footer */}
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
