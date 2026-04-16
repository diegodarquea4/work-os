'use client'

import { useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import ProjectTrackerModal from './ProjectTrackerModal'

const COLUMNS = [
  { key: 'rojo',  label: 'Bloqueadas',   bg: 'bg-red-50',    border: 'border-red-200',   dot: 'bg-red-500',   header: 'bg-red-100 text-red-800'   },
  { key: 'ambar', label: 'En revisión',  bg: 'bg-amber-50',  border: 'border-amber-200', dot: 'bg-amber-400', header: 'bg-amber-100 text-amber-800' },
  { key: 'verde', label: 'En verde',     bg: 'bg-green-50',  border: 'border-green-200', dot: 'bg-green-500', header: 'bg-green-100 text-green-800' },
  { key: 'gris',  label: 'Sin evaluar',  bg: 'bg-gray-50',   border: 'border-gray-200',  dot: 'bg-gray-300',  header: 'bg-gray-100 text-gray-600'   },
] as const

const EJE_COLORS: Record<string, string> = {
  'Seguridad y Orden Público':       'bg-red-100 text-red-700',
  'Infraestructura y Conectividad':  'bg-blue-100 text-blue-700',
  'Desarrollo Económico y Empleo':   'bg-green-100 text-green-700',
  'Vivienda y Urbanismo':            'bg-orange-100 text-orange-700',
  'Energía y Transición Energética': 'bg-yellow-100 text-yellow-700',
  'Medio Ambiente y Territorio':     'bg-teal-100 text-teal-700',
  'Desarrollo Social y Familia':     'bg-pink-100 text-pink-700',
  'Modernización e Innovación':      'bg-purple-100 text-purple-700',
}

type Props = {
  projects: Iniciativa[]
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
}

export default function KanbanView({ projects, onUpdatePrioridad }: Props) {
  const [selected, setSelected]     = useState<Iniciativa | null>(null)
  const [filterRegion, setFilterRegion] = useState('todas')
  const [filterEje, setFilterEje]   = useState('todos')

  const regions = Array.from(new Set(projects.map(p => p.region))).sort()
  const ejes    = Array.from(new Set(projects.map(p => p.eje))).sort()

  const filtered = projects.filter(p => {
    if (filterRegion !== 'todas' && p.region !== filterRegion) return false
    if (filterEje    !== 'todos' && p.eje    !== filterEje)    return false
    return true
  })

  const byCol: Record<string, Iniciativa[]> = { rojo: [], ambar: [], verde: [], gris: [] }
  for (const p of filtered) {
    byCol[p.estado_semaforo]?.push(p)
  }

  const selectedSynced = selected
    ? (projects.find(p => p.n === selected.n) ?? selected)
    : null

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Filter bar ── */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-white flex items-center gap-3 flex-wrap">
        <select
          value={filterRegion}
          onChange={e => setFilterRegion(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
        >
          <option value="todas">Todas las regiones</option>
          {regions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>

        <select
          value={filterEje}
          onChange={e => setFilterEje(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300 max-w-[200px]"
        >
          <option value="todos">Todos los ejes</option>
          {ejes.map(e => <option key={e} value={e}>{e}</option>)}
        </select>

        <span className="text-xs text-gray-400 ml-auto">{filtered.length} iniciativas</span>
      </div>

      {/* ── Kanban board ── */}
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
                        <span className={`text-xs font-semibold flex-shrink-0 px-1.5 py-0.5 rounded-full ${
                          p.prioridad === 'Alta' ? 'bg-red-100 text-red-700' : p.prioridad === 'Media' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                        }`}>
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

      {/* Modal */}
      {selectedSynced && (
        <ProjectTrackerModal
          prioridad={selectedSynced}
          onClose={() => setSelected(null)}
          onUpdatePrioridad={onUpdatePrioridad}
        />
      )}
    </div>
  )
}
