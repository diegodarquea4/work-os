'use client'

import { useState, useMemo } from 'react'
import type { Project } from '@/lib/projects'
import { REGIONS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'
import * as XLSX from 'xlsx'

const SEMAFORO_CONFIG = {
  verde: { dot: 'bg-green-500', label: 'En verde',    badge: 'bg-green-50 text-green-700 ring-1 ring-green-200'  },
  ambar: { dot: 'bg-amber-400', label: 'En revisión', badge: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  },
  rojo:  { dot: 'bg-red-500',   label: 'Bloqueado',   badge: 'bg-red-50 text-red-700 ring-1 ring-red-200'        },
  gris:  { dot: 'bg-gray-300',  label: 'Sin evaluar', badge: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'    },
} as const

const SEMAFORO_ORDER = { rojo: 0, ambar: 1, verde: 2, gris: 3 }

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

type SemaforoKey = keyof typeof SEMAFORO_CONFIG
type SortCol = 'n' | 'region' | 'eje' | 'semaforo' | 'avance' | 'prioridad' | 'actividad'
type SortDir = 'asc' | 'desc'

type Props = {
  projects: Project[]
  actividad: Record<number, string | null>
  onUpdatePrioridad: (n: number, patch: Partial<Pick<Project, 'estado_semaforo' | 'pct_avance' | 'responsable'>>) => void
}

const EJES = Array.from(new Set(
  ['Seguridad y Orden Público', 'Infraestructura y Conectividad', 'Desarrollo Económico y Empleo',
   'Vivienda y Urbanismo', 'Energía y Transición Energética', 'Medio Ambiente y Territorio',
   'Desarrollo Social y Familia', 'Modernización e Innovación']
))

function diasSinActividad(lastIso: string | null | undefined): number | null {
  if (!lastIso) return null
  return Math.floor((Date.now() - new Date(lastIso).getTime()) / (1000 * 60 * 60 * 24))
}

export default function NationalDashboard({ projects, actividad, onUpdatePrioridad }: Props) {
  const [search, setSearch]                   = useState('')
  const [filterRegion, setFilterRegion]       = useState('todas')
  const [filterEje, setFilterEje]             = useState('todos')
  const [filterSemaforo, setFilterSemaforo]   = useState<SemaforoKey | 'todos'>('todos')
  const [filterPrioridad, setFilterPrioridad] = useState<'Alta' | 'Media' | 'todas'>('todas')
  const [sortCol, setSortCol]                 = useState<SortCol>('semaforo')
  const [sortDir, setSortDir]                 = useState<SortDir>('asc')
  const [selected, setSelected]               = useState<Project | null>(null)

  // Sync selected when projects update (after modal saves)
  const selectedSynced = selected
    ? (projects.find(p => p.n === selected.n) ?? selected)
    : null

  const rojo   = projects.filter(p => p.estado_semaforo === 'rojo').length
  const ambar  = projects.filter(p => p.estado_semaforo === 'ambar').length
  const verde  = projects.filter(p => p.estado_semaforo === 'verde').length
  const gris   = projects.filter(p => p.estado_semaforo === 'gris').length
  const avgPct = projects.length
    ? Math.round(projects.reduce((s, p) => s + p.pct_avance, 0) / projects.length)
    : 0

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }

  const filtered = useMemo(() => {
    let list = projects.filter(p => {
      if (search) {
        const q = search.toLowerCase()
        if (!p.meta.toLowerCase().includes(q) &&
            !p.region.toLowerCase().includes(q) &&
            !p.ministerios.some(m => m.toLowerCase().includes(q))) return false
      }
      if (filterRegion !== 'todas' && p.region !== filterRegion) return false
      if (filterEje !== 'todos' && p.eje !== filterEje) return false
      if (filterSemaforo !== 'todos' && p.estado_semaforo !== filterSemaforo) return false
      if (filterPrioridad !== 'todas' && p.prioridad !== filterPrioridad) return false
      return true
    })

    list = [...list].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'n')         cmp = a.n - b.n
      if (sortCol === 'region')    cmp = a.region.localeCompare(b.region)
      if (sortCol === 'eje')       cmp = a.eje.localeCompare(b.eje)
      if (sortCol === 'semaforo')  cmp = SEMAFORO_ORDER[a.estado_semaforo] - SEMAFORO_ORDER[b.estado_semaforo]
      if (sortCol === 'avance')    cmp = a.pct_avance - b.pct_avance
      if (sortCol === 'prioridad') cmp = (a.prioridad === 'Alta' ? 0 : 1) - (b.prioridad === 'Alta' ? 0 : 1)
      if (sortCol === 'actividad') {
        const da = actividad[a.n] ? new Date(actividad[a.n]!).getTime() : 0
        const db = actividad[b.n] ? new Date(actividad[b.n]!).getTime() : 0
        cmp = da - db
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [projects, search, filterRegion, filterEje, filterSemaforo, filterPrioridad, sortCol, sortDir])

  function clearFilters() {
    setSearch(''); setFilterRegion('todas'); setFilterEje('todos')
    setFilterSemaforo('todos'); setFilterPrioridad('todas')
  }

  function exportExcel() {
    const rows = filtered.map(p => ({
      '#': p.n,
      Región: p.region,
      Capital: p.capital,
      Zona: p.zona,
      Eje: p.eje,
      Meta: p.meta,
      Ministerios: p.ministerios.join('; '),
      Prioridad: p.prioridad,
      Plazo: p.plazo,
      Semáforo: SEMAFORO_CONFIG[p.estado_semaforo]?.label ?? p.estado_semaforo,
      'Avance (%)': p.pct_avance,
      Responsable: p.responsable ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Prioridades')
    const fecha = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `prioridades-territoriales-${fecha}.xlsx`)
  }

  const hasFilters = search || filterRegion !== 'todas' || filterEje !== 'todos' ||
    filterSemaforo !== 'todos' || filterPrioridad !== 'todas'

  function ColHeader({ col, label }: { col: SortCol; label: string }) {
    const active = sortCol === col
    return (
      <th
        onClick={() => handleSort(col)}
        className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:text-gray-900 select-none whitespace-nowrap"
      >
        <span className="flex items-center gap-1">
          {label}
          <span className={`text-gray-300 ${active ? 'text-gray-600' : ''}`}>
            {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
          </span>
        </span>
      </th>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Summary bar ── */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <SummaryCard label="Total" value={projects.length.toString()} color="text-gray-800" bg="bg-gray-50" />
          <SummaryCard label="Bloqueadas" value={rojo.toString()} color="text-red-700" bg="bg-red-50" dot="bg-red-500" />
          <SummaryCard label="En revisión" value={ambar.toString()} color="text-amber-700" bg="bg-amber-50" dot="bg-amber-400" />
          <SummaryCard label="En verde" value={verde.toString()} color="text-green-700" bg="bg-green-50" dot="bg-green-500" />
          <SummaryCard label="Sin evaluar" value={gris.toString()} color="text-gray-600" bg="bg-gray-100" dot="bg-gray-300" />
          <div className="ml-auto flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-500">Avance promedio</span>
            <span className="text-lg font-bold text-slate-700">{avgPct}%</span>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-gray-100 bg-white space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400">
              <circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l2.5 2.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar meta, región, ministerio..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white w-64 text-gray-800"
            />
          </div>

          {/* Region */}
          <select
            value={filterRegion}
            onChange={e => setFilterRegion(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
          >
            <option value="todas">Todas las regiones</option>
            {REGIONS.map(r => <option key={r.cod} value={r.nombre}>{r.nombre}</option>)}
          </select>

          {/* Eje */}
          <select
            value={filterEje}
            onChange={e => setFilterEje(e.target.value)}
            className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300 max-w-[200px]"
          >
            <option value="todos">Todos los ejes</option>
            {EJES.map(e => <option key={e} value={e}>{e}</option>)}
          </select>

          {/* Semáforo chips */}
          <div className="flex items-center gap-1">
            {(['todos', 'rojo', 'ambar', 'verde', 'gris'] as const).map(s => (
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
          </div>

          {/* Prioridad chips */}
          <div className="flex items-center gap-1">
            {(['todas', 'Alta', 'Media'] as const).map(p => (
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
          </div>

          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">
              Limpiar
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">{filtered.length} prioridades</span>
            <button
              onClick={exportExcel}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors font-medium"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 9h8M6 2v6M3.5 5.5L6 8l2.5-2.5"/>
              </svg>
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
            <tr>
              <ColHeader col="n" label="#" />
              <ColHeader col="region" label="Región" />
              <ColHeader col="eje" label="Eje" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Meta</th>
              <ColHeader col="semaforo" label="Estado" />
              <ColHeader col="avance" label="Avance" />
              <ColHeader col="prioridad" label="Prioridad" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
              <ColHeader col="actividad" label="Actividad" />
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Plazo</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-6 py-16 text-center text-gray-400 text-sm">
                  Sin prioridades con estos filtros.{' '}
                  <button onClick={clearFilters} className="underline text-slate-600">Limpiar filtros</button>
                </td>
              </tr>
            ) : filtered.map(p => {
              const sem = SEMAFORO_CONFIG[p.estado_semaforo]
              const ejeColor = EJE_COLORS[p.eje] ?? 'bg-gray-100 text-gray-600'
              return (
                <tr
                  key={p.n}
                  onClick={() => setSelected(p)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors"
                >
                  <td className="px-3 py-3 text-xs text-gray-500 font-mono">{p.n}</td>
                  <td className="px-3 py-3">
                    <div className="text-xs font-medium text-gray-800 whitespace-nowrap">{p.region}</div>
                    <div className="text-xs text-gray-500">{p.capital}</div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${ejeColor}`}>
                      {p.eje}
                    </span>
                  </td>
                  <td className="px-3 py-3 max-w-[320px]">
                    <p className="text-xs text-gray-800 line-clamp-2 leading-snug">{p.meta}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {p.ministerios.slice(0, 2).map((m, i) => (
                        <span key={i} className="text-xs text-gray-500">{m}{i < Math.min(p.ministerios.length, 2) - 1 ? ',' : ''}</span>
                      ))}
                      {p.ministerios.length > 2 && <span className="text-xs text-gray-400">+{p.ministerios.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${sem.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sem.dot}`}/>
                      {sem.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                        <div
                          className={`h-1.5 rounded-full ${
                            p.estado_semaforo === 'rojo'  ? 'bg-red-400' :
                            p.estado_semaforo === 'ambar' ? 'bg-amber-400' :
                            p.estado_semaforo === 'verde' ? 'bg-green-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${p.pct_avance}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-8 text-right">{p.pct_avance}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                      p.prioridad === 'Alta' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>
                      {p.prioridad}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap max-w-[120px]">
                    {p.responsable
                      ? <span className="truncate block">{p.responsable}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {(() => {
                      const dias = diasSinActividad(actividad[p.n])
                      if (dias === null) return <span className="text-xs text-red-500 font-medium">Sin actividad</span>
                      if (dias > 15)    return <span className="text-xs text-red-500">Hace {dias}d</span>
                      if (dias > 7)     return <span className="text-xs text-amber-600">Hace {dias}d</span>
                      return <span className="text-xs text-gray-500">{dias === 0 ? 'Hoy' : `Hace ${dias}d`}</span>
                    })()}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{p.plazo}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
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

function SummaryCard({ label, value, color, bg, dot }: {
  label: string; value: string; color: string; bg: string; dot?: string
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${bg}`}>
      {dot && <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dot}`}/>}
      <div>
        <div className="text-xs text-gray-500 leading-tight">{label}</div>
        <div className={`text-lg font-bold leading-tight ${color}`}>{value}</div>
      </div>
    </div>
  )
}
