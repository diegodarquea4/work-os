'use client'

import { useMemo, useState } from 'react'
import type { SeiaProject } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function estadoBadge(estado: string | null): { bg: string; text: string } {
  if (!estado) return { bg: 'bg-gray-100', text: 'text-gray-500' }
  const e = estado.toLowerCase()
  if (e.includes('aprobado')) return { bg: 'bg-green-100', text: 'text-green-700' }
  if (e.includes('rechazado') || e.includes('desistido')) return { bg: 'bg-red-100', text: 'text-red-700' }
  if (e.includes('calificaci') || e.includes('revisi') || e.includes('admisibilidad'))
    return { bg: 'bg-amber-100', text: 'text-amber-700' }
  return { bg: 'bg-blue-100', text: 'text-blue-700' }
}

function fmtInversion(mm: number | null): string {
  if (mm === null) return '—'
  if (mm >= 1000) return `$ ${(mm / 1000).toFixed(1)} MM MM$`
  return `$ ${mm.toFixed(1)} MM$`
}

function fmtInversionCompact(mm: number): string {
  if (mm >= 1000) return `$${(mm / 1000).toFixed(1)}B`
  return `$${mm.toFixed(0)}MM`
}

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(d)
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function isEnCalificacion(estado: string | null): boolean {
  if (!estado) return false
  const e = estado.toLowerCase()
  return e.includes('calificaci') || e.includes('admisibilidad') || e.includes('revisi')
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const today = new Date().toLocaleDateString('en-CA')
  const diff = new Date(iso).getTime() - new Date(today).getTime()
  return Math.round(diff / (1000 * 60 * 60 * 24))
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function SeiaProjectDetail({ proyecto, onClose }: { proyecto: SeiaProject; onClose: () => void }) {
  const badge = estadoBadge(proyecto.estado)
  return (
    <div className="absolute inset-0 z-20 bg-white overflow-y-auto" style={{ top: 0, left: 0, right: 0, bottom: 0 }}>
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ficha SEIA</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2">{proyecto.nombre}</h3>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
            {proyecto.estado ?? 'Sin estado'}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <DetailField label="Tipo" value={proyecto.tipo} />
          <DetailField label="Titular" value={proyecto.titular} />
          <DetailField label="Inversión" value={fmtInversion(proyecto.inversion_mm)} />
          <DetailField label="Presentación" value={fmtFecha(proyecto.fecha_presentacion)} />
          <DetailField label="Plazo resolución" value={fmtFecha(proyecto.fecha_plazo)} />
          {proyecto.actividad_actual && (
            <div className="col-span-2">
              <dt className="text-gray-400 font-medium mb-0.5">Actividad actual</dt>
              <dd className="text-gray-800">{proyecto.actividad_actual}</dd>
            </div>
          )}
        </dl>

        {proyecto.url_ficha && (
          <a href={proyecto.url_ficha} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors">
            Ver ficha oficial en SEIA
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 9L9 2M5 2h4v4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-400 font-medium mb-0.5">{label}</dt>
      <dd className="text-gray-800">{value || '—'}</dd>
    </div>
  )
}

// ── KPI tile ──────────────────────────────────────────────────────────────────

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'amber' | 'red' }) {
  const accentClass = accent === 'amber' ? 'text-amber-700'
    : accent === 'red' ? 'text-red-700'
    : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold leading-tight">{label}</p>
      <p className={`text-base font-bold tabular-nums leading-tight mt-1 ${accentClass}`}>{value}</p>
    </div>
  )
}

// ── Main list ─────────────────────────────────────────────────────────────────

type Props = {
  proyectos: SeiaProject[]
  total: number
  loading: boolean
  error: string | null
  regionId: number
}

type SortBy = 'inversion' | 'fecha' | 'nombre'

export default function SeiaProjectsList({ proyectos, total, loading, error }: Props) {
  const [selected, setSelected]           = useState<SeiaProject | null>(null)
  const [search, setSearch]               = useState('')
  const [filterEstado, setFilterEstado]   = useState<Set<string>>(new Set())
  const [filterTipo, setFilterTipo]       = useState<Set<string>>(new Set())
  const [minInversion, setMinInversion]   = useState<number>(0)
  const [soloPlazoCorto, setSoloPlazoCorto] = useState(false)
  const [sortBy, setSortBy]               = useState<SortBy>('inversion')

  const seiaSearchUrl = `https://seia.sea.gob.cl/busqueda/buscarProyectoResumen.php`

  // KPIs — operan sobre el conjunto completo (no afectados por filtros)
  const kpis = useMemo(() => {
    const totalInv = proyectos.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
    const enCalif  = proyectos.filter(p => isEnCalificacion(p.estado)).length
    const plazoCorto = proyectos.filter(p => {
      const d = daysUntil(p.fecha_plazo)
      return d !== null && d >= 0 && d <= 30
    }).length
    return { totalInv, totalCount: proyectos.length, enCalif, plazoCorto }
  }, [proyectos])

  // Catálogos para filtros (top 8 por frecuencia para no inundar)
  const { estadosDisponibles, tiposDisponibles } = useMemo(() => {
    const eCount: Record<string, number> = {}
    const tCount: Record<string, number> = {}
    for (const p of proyectos) {
      if (p.estado) eCount[p.estado] = (eCount[p.estado] ?? 0) + 1
      if (p.tipo)   tCount[p.tipo]   = (tCount[p.tipo]   ?? 0) + 1
    }
    return {
      estadosDisponibles: Object.entries(eCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]),
      tiposDisponibles:   Object.entries(tCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]),
    }
  }, [proyectos])

  // Filtrado + orden
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    const pool = proyectos.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.titular ?? '').toLowerCase().includes(q)) return false
      if (filterEstado.size > 0 && (!p.estado || !filterEstado.has(p.estado))) return false
      if (filterTipo.size > 0   && (!p.tipo   || !filterTipo.has(p.tipo)))     return false
      if (minInversion > 0 && (p.inversion_mm ?? 0) < minInversion) return false
      if (soloPlazoCorto) {
        const d = daysUntil(p.fecha_plazo)
        if (d === null || d < 0 || d > 30) return false
      }
      return true
    })
    return pool.sort((a, b) => {
      if (sortBy === 'inversion') return (b.inversion_mm ?? 0) - (a.inversion_mm ?? 0)
      if (sortBy === 'fecha')     return (b.fecha_presentacion ?? '').localeCompare(a.fecha_presentacion ?? '')
      return a.nombre.localeCompare(b.nombre)
    })
  }, [proyectos, search, filterEstado, filterTipo, minInversion, soloPlazoCorto, sortBy])

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) {
    setter(prev => {
      const next = new Set(prev)
      next.has(val) ? next.delete(val) : next.add(val)
      return next
    })
  }

  const filtersActive = search !== '' || filterEstado.size > 0 || filterTipo.size > 0 || minInversion > 0 || soloPlazoCorto

  function clearFilters() {
    setSearch(''); setFilterEstado(new Set()); setFilterTipo(new Set()); setMinInversion(0); setSoloPlazoCorto(false)
  }

  if (loading) {
    return (
      <div className="px-5 pb-3 space-y-2 animate-pulse">
        <div className="grid grid-cols-4 gap-2 mb-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 px-3 py-2.5">
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="flex gap-2"><div className="h-2.5 bg-gray-100 rounded w-1/4" /><div className="h-2.5 bg-gray-100 rounded w-1/5" /></div>
          </div>
        ))}
      </div>
    )
  }

  if (error) return <p className="px-5 pb-3 text-xs text-red-500">Error cargando proyectos SEIA.</p>
  if (proyectos.length === 0) return <p className="px-5 pb-3 text-xs text-gray-400">Sin proyectos registrados en SEIA para esta región.</p>

  return (
    <div className="relative">
      {selected && <SeiaProjectDetail proyecto={selected} onClose={() => setSelected(null)} />}

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-3 grid grid-cols-4 gap-2">
        <KpiTile label="Inversión total" value={fmtInversionCompact(kpis.totalInv)} />
        <KpiTile label="Proyectos" value={kpis.totalCount.toLocaleString('es-CL')} />
        <KpiTile label="En calificación" value={kpis.enCalif.toLocaleString('es-CL')} accent={kpis.enCalif > 0 ? 'amber' : undefined} />
        <KpiTile label="Plazo ≤ 30d" value={kpis.plazoCorto.toLocaleString('es-CL')} accent={kpis.plazoCorto > 0 ? 'red' : undefined} />
      </div>

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-2 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="relative flex-1 min-w-[120px]">
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <circle cx="5.5" cy="5.5" r="4"/><path d="M9 9l2.5 2.5" strokeLinecap="round"/>
            </svg>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..."
              className="w-full pl-7 pr-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
            />
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
          >
            <option value="inversion">Inversión ↓</option>
            <option value="fecha">Fecha ↓</option>
            <option value="nombre">Nombre A-Z</option>
          </select>

          <button
            onClick={() => setSoloPlazoCorto(prev => !prev)}
            className={`text-[10px] px-1.5 py-1 rounded font-medium transition-colors whitespace-nowrap ${
              soloPlazoCorto ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            Plazo ≤ 30d
          </button>

          {filtersActive && (
            <button onClick={clearFilters} className="text-[10px] text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {estadosDisponibles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 mr-0.5">Estado:</span>
            {estadosDisponibles.map(e => {
              const active = filterEstado.has(e)
              const c = estadoBadge(e)
              return (
                <button key={e} onClick={() => toggleSet(setFilterEstado, e)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${active ? `${c.bg} ${c.text} ring-1 ring-current` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {truncate(e, 22)}
                </button>
              )
            })}
          </div>
        )}

        {tiposDisponibles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 mr-0.5">Tipo:</span>
            {tiposDisponibles.map(t => {
              const active = filterTipo.has(t)
              return (
                <button key={t} onClick={() => toggleSet(setFilterTipo, t)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${active ? 'bg-slate-200 text-slate-800 ring-1 ring-slate-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {truncate(t, 24)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Conteo + lista ─────────────────────────────────────────────────── */}
      <div className="px-5 pb-1">
        <p className="text-[10px] text-gray-400 mb-1.5">
          {filtered.length.toLocaleString('es-CL')} de {proyectos.length.toLocaleString('es-CL')}
          {total > proyectos.length && <span className="text-gray-300"> · de {total.toLocaleString('es-CL')} en BD</span>}
        </p>
        <div className="space-y-1.5">
          {filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin proyectos que coincidan con los filtros</p>
          ) : (
            filtered.map(p => {
              const badge = estadoBadge(p.estado)
              const dias = daysUntil(p.fecha_plazo)
              const plazoUrgente = dias !== null && dias >= 0 && dias <= 30
              return (
                <button key={p.id} onClick={() => setSelected(p)}
                  className="w-full text-left bg-white rounded-lg border border-gray-100 px-3 py-2.5 hover:border-gray-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-medium text-gray-800 leading-snug" title={p.nombre}>
                    {truncate(p.nombre, 65)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {p.tipo && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                        {truncate(p.tipo, 30)}
                      </span>
                    )}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}>
                      {p.estado ?? 'Sin estado'}
                    </span>
                    {plazoUrgente && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-semibold">
                        Plazo {dias}d
                      </span>
                    )}
                    {p.inversion_mm !== null && (
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {fmtInversion(p.inversion_mm)}
                      </span>
                    )}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pt-2 pb-3">
        <a href={seiaSearchUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors">
          Ver los {total.toLocaleString('es-CL')} proyectos de esta región en SEIA
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 8L8 2M5 2h3v3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
