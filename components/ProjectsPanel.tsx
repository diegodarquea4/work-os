'use client'

import { useState, useEffect } from 'react'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import type { RegionMetrics } from '@/lib/types'
import { ZONA_COLORS } from '@/lib/regions'
import ProjectTrackerModal from './ProjectTrackerModal'

const EJE_COLORS: Record<string, string> = {
  'Seguridad y Orden Público':      'bg-red-100 text-red-700',
  'Infraestructura y Conectividad': 'bg-blue-100 text-blue-700',
  'Desarrollo Económico y Empleo':  'bg-green-100 text-green-700',
  'Vivienda y Urbanismo':           'bg-orange-100 text-orange-700',
  'Energía y Transición Energética':'bg-yellow-100 text-yellow-700',
  'Medio Ambiente y Territorio':    'bg-teal-100 text-teal-700',
  'Desarrollo Social y Familia':    'bg-pink-100 text-pink-700',
  'Modernización e Innovación':     'bg-purple-100 text-purple-700',
}

function ejeColor(eje: string) {
  return EJE_COLORS[eje] ?? 'bg-gray-100 text-gray-600'
}

function pct(val: number | null | undefined) {
  if (val === null || val === undefined) return '—'
  return `${String(val).replace('.', ',')}%`
}

function num(val: number | null | undefined) {
  if (val === null || val === undefined) return '—'
  return val.toLocaleString('es-CL')
}

type Props = {
  region: Region
  projects: Project[]
  onClose: () => void
}

export default function ProjectsPanel({ region, projects, onClose }: Props) {
  const zoneColor = ZONA_COLORS[region.zona] ?? '#6B7280'
  const alta  = projects.filter(p => p.prioridad === 'Alta').length
  const media = projects.filter(p => p.prioridad === 'Media').length
  const [downloading, setDownloading] = useState(false)
  const [metrics, setMetrics] = useState<Partial<RegionMetrics> | null>(null)
  const [selectedPrioridad, setSelectedPrioridad] = useState<Project | null>(null)

  useEffect(() => {
    setMetrics(null)
    fetch(`/api/metrics/${region.cod}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => setMetrics(data))
      .catch(() => setMetrics(null))
  }, [region.cod])

  async function handleDownload() {
    setDownloading(true)
    try {
      const now = new Date()
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const fecha = `${meses[now.getMonth()]} ${now.getFullYear()}`

      const res = await fetch('/api/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, fecha }),
      })
      if (!res.ok) throw new Error('Error generando minuta')

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `minuta-${region.nombre.toLowerCase().replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error(e)
      alert('Error al generar la minuta. Inténtalo de nuevo.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-gray-100" style={{ borderTop: `4px solid ${zoneColor}` }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: zoneColor }}>
                {region.zona}
              </span>
              <span className="text-xs text-gray-400">Región {region.cod}</span>
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{region.nombre}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Capital: {region.capital}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Descargar minuta en PDF"
            >
              {downloading ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                    <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                  </svg>
                  Generando...
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 1v7M3 5l3 3 3-3M1 9v1a1 1 0 001 1h8a1 1 0 001-1V9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Minuta PDF
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Priority stats */}
        <div className="flex gap-3 mt-3">
          <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-3 py-1.5">
            <span className="text-sm font-bold text-gray-900">{projects.length}</span>
            <span className="text-xs text-gray-500">prioridades</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
            <span className="text-sm font-bold text-red-700">{alta}</span>
            <span className="text-xs text-red-500">alta</span>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-50 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-sm font-bold text-amber-700">{media}</span>
            <span className="text-xs text-amber-500">media</span>
          </div>
        </div>
      </div>

      {/* Metrics summary */}
      {metrics && (
        <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contexto Regional</p>
          <div className="grid grid-cols-2 gap-2">
            <MetricCard label="Población" value={num(metrics.poblacion_total)} />
            <MetricCard label="Pobreza ingresos" value={pct(metrics.pct_pobreza_ingresos)} />
            <MetricCard label="Desempleo" value={pct(metrics.tasa_desocupacion)} />
            <MetricCard label="PIB (% nacional)" value={pct(metrics.pct_pib_nacional)} />
            <MetricCard label="FONASA" value={pct(metrics.pct_fonasa)} />
            <MetricCard label="Lista espera" value={num(metrics.lista_espera_n)} />
            <MetricCard label="Escolaridad" value={metrics.anios_escolaridad_promedio != null ? `${metrics.anios_escolaridad_promedio} años` : '—'} />
            <MetricCard label="Internet hogares" value={pct(metrics.pct_hogares_internet)} />
          </div>
          {metrics.vocacion_regional && (
            <p className="text-xs text-gray-500 mt-2 leading-snug">
              <span className="font-medium text-gray-600">Vocación: </span>
              {metrics.vocacion_regional}
            </p>
          )}
        </div>
      )}

      {/* Projects list */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {projects.length === 0 ? (
          <p className="text-gray-400 text-sm text-center mt-8">Sin prioridades registradas</p>
        ) : (
          projects.map(p => (
            <div key={p.n} onClick={() => setSelectedPrioridad(p)} className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 hover:shadow-sm transition-all cursor-pointer">
              {/* Eje + prioridad */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ejeColor(p.eje)}`}>
                  {p.eje}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  p.prioridad === 'Alta'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {p.prioridad}
                </span>
              </div>

              {/* Meta */}
              <p className="text-sm text-gray-800 leading-snug mb-3">{p.meta}</p>

              {/* Ministerios */}
              <div className="space-y-1">
                {p.ministerios.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-gray-300 flex-shrink-0"></span>
                    <span className="text-xs text-gray-500">{m}</span>
                  </div>
                ))}
              </div>

              {/* Plazo */}
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-gray-400">
                  <rect x="1" y="2" width="10" height="9" rx="1.5" />
                  <path d="M4 1v2M8 1v2M1 5h10" />
                </svg>
                <span className="text-xs text-gray-400">{p.plazo}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedPrioridad && (
        <ProjectTrackerModal
          prioridad={selectedPrioridad}
          onClose={() => setSelectedPrioridad(null)}
        />
      )}
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg px-3 py-2 border border-gray-100">
      <div className="text-xs text-gray-400 leading-tight">{label}</div>
      <div className="text-sm font-bold text-gray-800 mt-0.5">{value}</div>
    </div>
  )
}
