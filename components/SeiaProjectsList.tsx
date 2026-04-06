'use client'

import { useState } from 'react'
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

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso + 'T12:00:00')
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(d)
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Detail modal ─────────────────────────────────────────────────────────────

function SeiaProjectDetail({ proyecto, onClose }: { proyecto: SeiaProject; onClose: () => void }) {
  const badge = estadoBadge(proyecto.estado)
  return (
    <div
      className="absolute inset-0 z-20 bg-white overflow-y-auto"
      style={{ top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3 flex items-center justify-between z-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Ficha SEIA</p>
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
        {/* Nombre + estado */}
        <div>
          <h3 className="text-sm font-bold text-gray-900 leading-snug mb-2">{proyecto.nombre}</h3>
          <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
            {proyecto.estado ?? 'Sin estado'}
          </span>
        </div>

        {/* Fields */}
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

        {/* CTA */}
        {proyecto.url_ficha && (
          <a
            href={proyecto.url_ficha}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 w-full justify-center px-3 py-2 rounded-lg border border-blue-200 text-blue-600 text-xs font-medium hover:bg-blue-50 transition-colors"
          >
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

// ── Main list ─────────────────────────────────────────────────────────────────

type Props = {
  proyectos: SeiaProject[]
  total: number
  loading: boolean
  error: string | null
  regionId: number
}

export default function SeiaProjectsList({ proyectos, total, loading, error, regionId }: Props) {
  const [selected, setSelected] = useState<SeiaProject | null>(null)

  const seiaSearchUrl = `https://seia.sea.gob.cl/busqueda/buscarProyectoResumen.php`

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
    return (
      <p className="px-5 pb-3 text-xs text-red-500">Error cargando proyectos SEIA.</p>
    )
  }

  if (proyectos.length === 0) {
    return (
      <p className="px-5 pb-3 text-xs text-gray-400">Sin proyectos registrados en SEIA para esta región.</p>
    )
  }

  return (
    <div className="relative">
      {selected && (
        <SeiaProjectDetail proyecto={selected} onClose={() => setSelected(null)} />
      )}

      <div className="px-5 pb-1 space-y-1.5">
        {proyectos.map(p => {
          const badge = estadoBadge(p.estado)
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="w-full text-left bg-white rounded-lg border border-gray-100 px-3 py-2.5 hover:border-gray-200 hover:shadow-sm transition-all"
            >
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
                {p.inversion_mm !== null && (
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {fmtInversion(p.inversion_mm)}
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
          href={seiaSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[11px] text-blue-500 hover:text-blue-700 font-medium transition-colors"
        >
          Ver los {total.toLocaleString('es-CL')} proyectos de esta región en SEIA
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M2 8L8 2M5 2h3v3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
