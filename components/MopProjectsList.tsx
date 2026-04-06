'use client'

import { useState } from 'react'
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

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Detail overlay ────────────────────────────────────────────────────────────

function MopProjectDetail({ proyecto, onClose }: { proyecto: MopProject; onClose: () => void }) {
  const badge = etapaBadge(proyecto.etapa)
  const mopUrl = `https://proyectos.mop.gob.cl/proyecto.asp?cod_p=${proyecto.cod_p}`

  return (
    <div className="absolute inset-0 z-20 bg-white overflow-y-auto">
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ficha MOP</p>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l12 12M15 3L3 15" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Nombre + etapa */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2">{proyecto.nombre}</h3>
          {proyecto.etapa && (
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
              {proyecto.etapa}
            </span>
          )}
        </div>

        {/* Fields */}
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

        {/* CTA */}
        <a
          href={mopUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
        >
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

// ── Main list ─────────────────────────────────────────────────────────────────

type Props = {
  proyectos: MopProject[]
  total:     number
  loading:   boolean
  error:     string | null
}

export default function MopProjectsList({ proyectos, total, loading, error }: Props) {
  const [selected, setSelected] = useState<MopProject | null>(null)

  if (loading) {
    return (
      <div className="px-5 pb-3 space-y-2 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 px-3 py-2.5">
            <div className="h-3 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="flex gap-2">
              <div className="h-2.5 bg-gray-100 rounded w-1/4" />
              <div className="h-2.5 bg-gray-100 rounded w-1/5" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <p className="px-5 pb-3 text-xs text-red-500">Error cargando proyectos MOP.</p>
  }

  if (proyectos.length === 0) {
    return <p className="px-5 pb-3 text-xs text-gray-400">Sin proyectos registrados en MOP para esta región.</p>
  }

  return (
    <div className="relative">
      {selected && (
        <MopProjectDetail proyecto={selected} onClose={() => setSelected(null)} />
      )}

      <div className="px-5 pb-1 space-y-1.5">
        {proyectos.map(p => {
          const badge = etapaBadge(p.etapa)
          return (
            <button
              key={p.cod_p}
              onClick={() => setSelected(p)}
              className="w-full text-left bg-white rounded-lg border border-gray-100 px-3 py-2.5 hover:border-gray-200 hover:shadow-sm transition-all"
            >
              <p className="text-xs font-medium text-gray-800 leading-snug" title={p.nombre}>
                {truncate(p.nombre, 65)}
              </p>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                {p.servicio && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">
                    {truncate(p.servicio.replace('Dirección de ', 'Dir. ').replace('Subdirección de ', 'Sub. '), 28)}
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
        })}
      </div>

      {/* Footer */}
      <div className="px-5 pt-2 pb-3">
        <a
          href="https://proyectos.mop.gob.cl/Default.asp?buscar=true"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
        >
          Ver los {total.toLocaleString('es-CL')} proyectos de esta región en MOP
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 8L8 2M5 2h3v3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
