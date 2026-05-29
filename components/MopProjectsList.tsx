'use client'

import { useMemo, useState } from 'react'
import type { MopProject } from '@/lib/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function etapaBadge(etapa: string | null): { bg: string; text: string } {
  if (!etapa) return { bg: 'bg-gray-100', text: 'text-gray-500' }
  const e = etapa.toLowerCase()
  if (e.includes('ejec'))    return { bg: 'bg-green-100',  text: 'text-green-700' }
  if (e.includes('diseño') || e.includes('diseno')) return { bg: 'bg-blue-100', text: 'text-blue-700' }
  if (e.includes('term') || e.includes('cerr')) return { bg: 'bg-gray-100', text: 'text-gray-500' }
  return { bg: 'bg-amber-100', text: 'text-amber-700' }
}

function fmtInversion(miles: number | null): string {
  if (miles === null) return '—'
  if (miles >= 1_000_000) return `$ ${(miles / 1_000_000).toFixed(1)} MM MM$`
  if (miles >= 1_000)     return `$ ${(miles / 1_000).toFixed(0)} M MM$`
  return `$ ${miles.toLocaleString('es-CL')} miles`
}

// Compacto para KPIs: miles → "$XX MM" o "$X.X B" (B = mil millones)
function fmtInversionCompact(miles: number): string {
  if (miles >= 1_000_000) return `$${(miles / 1_000_000).toFixed(1)}B`
  if (miles >= 1_000)     return `$${(miles / 1_000).toFixed(0)}MM`
  return `$${miles}k`
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function isEjecucion(etapa: string | null): boolean {
  return !!etapa && etapa.toLowerCase().includes('ejec')
}

function shortServicio(s: string): string {
  return s.replace('Dirección de ', 'Dir. ').replace('Subdirección de ', 'Sub. ')
}

// ── Detail overlay ────────────────────────────────────────────────────────────

function MopProjectDetail({ proyecto, onClose }: { proyecto: MopProject; onClose: () => void }) {
  const badge = etapaBadge(proyecto.etapa)
  const mopUrl = `https://proyectos.mop.gob.cl/proyecto.asp?cod_p=${proyecto.cod_p}`

  return (
    <div className="absolute inset-0 z-20 bg-white overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ficha MOP</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors" aria-label="Cerrar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2">{proyecto.nombre}</h3>
          {proyecto.etapa && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
              {proyecto.etapa}
            </span>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <DetailField label="Código BIP"     value={proyecto.bip} />
          <DetailField label="Servicio"       value={proyecto.servicio} />
          <DetailField label="Financiamiento" value={proyecto.financiamiento} />
          <DetailField label="Inversión"      value={fmtInversion(proyecto.inversion_miles)} />
          {proyecto.provincias && <DetailField label="Provincia(s)" value={proyecto.provincias} />}
          {proyecto.comunas    && <DetailField label="Comuna(s)"    value={proyecto.comunas}    />}
          {proyecto.programa   && (
            <div className="col-span-2">
              <dt className="text-gray-400 font-medium mb-0.5">Programa</dt>
              <dd className="text-gray-800">{proyecto.programa}</dd>
            </div>
          )}
          {proyecto.planes && (
            <div className="col-span-2">
              <dt className="text-gray-400 font-medium mb-0.5">Plan(es)</dt>
              <dd className="text-gray-800">{proyecto.planes}</dd>
            </div>
          )}
          {proyecto.descripcion && (
            <div className="col-span-2">
              <dt className="text-gray-400 font-medium mb-0.5">Descripción</dt>
              <dd className="text-gray-800 leading-relaxed">{proyecto.descripcion}</dd>
            </div>
          )}
        </dl>

        <a href={mopUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors">
          Ver ficha oficial en MOP
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 9L9 2M5 2h4v4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
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

function KpiTile({ label, value, accent }: { label: string; value: string; accent?: 'green' | 'blue' }) {
  const accentClass = accent === 'green' ? 'text-green-700'
    : accent === 'blue' ? 'text-blue-700'
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
  proyectos: MopProject[]
  total:     number
  loading:   boolean
  error:     string | null
}

type SortBy = 'inversion' | 'nombre' | 'servicio'

export default function MopProjectsList({ proyectos, total, loading, error }: Props) {
  const [selected, setSelected]           = useState<MopProject | null>(null)
  const [search, setSearch]               = useState('')
  const [filterServicio, setFilterServicio] = useState<Set<string>>(new Set())
  const [filterEtapa, setFilterEtapa]     = useState<Set<string>>(new Set())
  const [comunaSearch, setComunaSearch]   = useState('')
  const [sortBy, setSortBy]               = useState<SortBy>('inversion')

  // KPIs
  const kpis = useMemo(() => {
    const totalInv = proyectos.reduce((s, p) => s + (p.inversion_miles ?? 0), 0)
    const enEjec   = proyectos.filter(p => isEjecucion(p.etapa)).length
    const servicios = new Set(proyectos.map(p => p.servicio).filter(Boolean))
    return { totalInv, totalCount: proyectos.length, enEjec, servicios: servicios.size }
  }, [proyectos])

  // Catálogos para filtros (top 8 por frecuencia)
  const { serviciosDisponibles, etapasDisponibles } = useMemo(() => {
    const sCount: Record<string, number> = {}
    const eCount: Record<string, number> = {}
    for (const p of proyectos) {
      if (p.servicio) sCount[p.servicio] = (sCount[p.servicio] ?? 0) + 1
      if (p.etapa)    eCount[p.etapa]    = (eCount[p.etapa]    ?? 0) + 1
    }
    return {
      serviciosDisponibles: Object.entries(sCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]),
      etapasDisponibles:    Object.entries(eCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]),
    }
  }, [proyectos])

  // Filtrado + orden
  const filtered = useMemo(() => {
    const q  = search.toLowerCase()
    const cq = comunaSearch.toLowerCase()
    const pool = proyectos.filter(p => {
      if (q && !p.nombre.toLowerCase().includes(q) && !(p.servicio ?? '').toLowerCase().includes(q)) return false
      if (filterServicio.size > 0 && (!p.servicio || !filterServicio.has(p.servicio))) return false
      if (filterEtapa.size > 0    && (!p.etapa    || !filterEtapa.has(p.etapa)))       return false
      if (cq && !(p.comunas ?? '').toLowerCase().includes(cq)) return false
      return true
    })
    return pool.sort((a, b) => {
      if (sortBy === 'inversion') return (b.inversion_miles ?? 0) - (a.inversion_miles ?? 0)
      if (sortBy === 'servicio')  return (a.servicio ?? '').localeCompare(b.servicio ?? '')
      return a.nombre.localeCompare(b.nombre)
    })
  }, [proyectos, search, filterServicio, filterEtapa, comunaSearch, sortBy])

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, val: string) {
    setter(prev => {
      const next = new Set(prev)
      next.has(val) ? next.delete(val) : next.add(val)
      return next
    })
  }

  const filtersActive = search !== '' || filterServicio.size > 0 || filterEtapa.size > 0 || comunaSearch !== ''
  function clearFilters() {
    setSearch(''); setFilterServicio(new Set()); setFilterEtapa(new Set()); setComunaSearch('')
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

  if (error) return <p className="px-5 pb-3 text-xs text-red-500">Error cargando proyectos MOP.</p>
  if (proyectos.length === 0) return <p className="px-5 pb-3 text-xs text-gray-400">Sin proyectos registrados en MOP para esta región.</p>

  return (
    <div className="relative">
      {selected && <MopProjectDetail proyecto={selected} onClose={() => setSelected(null)} />}

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="px-5 pb-3 grid grid-cols-4 gap-2">
        <KpiTile label="Inversión total" value={fmtInversionCompact(kpis.totalInv)} />
        <KpiTile label="Proyectos" value={kpis.totalCount.toLocaleString('es-CL')} />
        <KpiTile label="En ejecución" value={kpis.enEjec.toLocaleString('es-CL')} accent={kpis.enEjec > 0 ? 'green' : undefined} />
        <KpiTile label="Servicios" value={kpis.servicios.toLocaleString('es-CL')} accent="blue" />
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
              placeholder="Buscar nombre o servicio..."
              className="w-full pl-7 pr-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
            />
          </div>

          <input
            type="text" value={comunaSearch} onChange={e => setComunaSearch(e.target.value)}
            placeholder="Comuna..."
            className="w-24 px-2 py-1 text-[11px] border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-300 bg-white"
          />

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="text-[11px] border border-gray-200 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-slate-300"
          >
            <option value="inversion">Inversión ↓</option>
            <option value="servicio">Servicio A-Z</option>
            <option value="nombre">Nombre A-Z</option>
          </select>

          {filtersActive && (
            <button onClick={clearFilters} className="text-[10px] text-gray-400 hover:text-gray-700 px-1.5 py-1 rounded hover:bg-gray-100 transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {serviciosDisponibles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 mr-0.5">Servicio:</span>
            {serviciosDisponibles.map(s => {
              const active = filterServicio.has(s)
              return (
                <button key={s} onClick={() => toggleSet(setFilterServicio, s)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${active ? 'bg-slate-200 text-slate-800 ring-1 ring-slate-400' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {truncate(shortServicio(s), 24)}
                </button>
              )
            })}
          </div>
        )}

        {etapasDisponibles.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[10px] text-gray-400 mr-0.5">Etapa:</span>
            {etapasDisponibles.map(e => {
              const active = filterEtapa.has(e)
              const c = etapaBadge(e)
              return (
                <button key={e} onClick={() => toggleSet(setFilterEtapa, e)}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${active ? `${c.bg} ${c.text} ring-1 ring-current` : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {truncate(e, 22)}
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
              const badge = etapaBadge(p.etapa)
              return (
                <button key={p.cod_p} onClick={() => setSelected(p)}
                  className="w-full text-left bg-white rounded-lg border border-gray-100 px-3 py-2.5 hover:border-gray-200 hover:shadow-sm transition-all">
                  <p className="text-xs font-medium text-gray-800 leading-snug" title={p.nombre}>
                    {truncate(p.nombre, 65)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                    {p.servicio && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                        {truncate(shortServicio(p.servicio), 28)}
                      </span>
                    )}
                    {p.etapa && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badge.bg} ${badge.text}`}>
                        {p.etapa}
                      </span>
                    )}
                    {p.inversion_miles !== null && (
                      <span className="text-[10px] text-gray-400 ml-auto">
                        {fmtInversion(p.inversion_miles)}
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
        <a href="https://proyectos.mop.gob.cl/Default.asp?buscar=true" target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors">
          Ver los {total.toLocaleString('es-CL')} proyectos de esta región en MOP
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 8L8 2M5 2h3v3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
