'use client'

import { useState } from 'react'
import type { Project } from '@/lib/projects'
import ProjectTrackerModal from './ProjectTrackerModal'

type Props = {
  projects: Project[]
  actividad: Record<number, string | null>
  actividadLoading: boolean
  onUpdatePrioridad: (n: number, patch: Partial<Pick<Project, 'estado_semaforo' | 'pct_avance' | 'responsable'>>) => void
}

const SEMAFORO_DOT: Record<string, string> = {
  verde: 'bg-green-500',
  ambar: 'bg-amber-400',
  rojo:  'bg-red-500',
  gris:  'bg-gray-300',
}

export default function AttentionTray({ projects, actividad, actividadLoading: loading, onUpdatePrioridad }: Props) {
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [collapsed, setCollapsed]           = useState<Record<string, boolean>>({})

  function diasSinActividad(n: number): number | null {
    const last = actividad[n]
    if (!last) return null
    return Math.floor((Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24))
  }

  // Group 1: Bloqueadas — semáforo rojo
  const bloqueadas = projects.filter(p => p.estado_semaforo === 'rojo')

  // Group 2: Sin actividad — NOT rojo AND (never OR >15 días)
  const bloqueadasIds = new Set(bloqueadas.map(p => p.n))
  const sinActividad = projects.filter(p => {
    if (bloqueadasIds.has(p.n)) return false
    const dias = diasSinActividad(p.n)
    return dias === null || dias > 15
  })

  // Group 3: Avance bajo — NOT in groups 1 or 2, pct_avance < 30
  const sinActividadIds = new Set(sinActividad.map(p => p.n))
  const avanceBajo = projects.filter(p => {
    if (bloqueadasIds.has(p.n) || sinActividadIds.has(p.n)) return false
    return (p.pct_avance ?? 0) < 30
  })

  const total = bloqueadas.length + sinActividad.length + avanceBajo.length

  function toggleSection(key: string) {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleUpdateAndRefresh(n: number, patch: Partial<Pick<Project, 'estado_semaforo' | 'pct_avance'>>) {
    onUpdatePrioridad(n, patch)
    if (selectedProject?.n === n) {
      setSelectedProject(prev => prev ? { ...prev, ...patch } : null)
    }
  }

  function fmtDias(dias: number | null): { text: string; color: string } {
    if (dias === null) return { text: 'Sin actividad registrada', color: 'text-red-500' }
    if (dias === 0)   return { text: 'Actividad hoy', color: 'text-green-600' }
    if (dias <= 7)    return { text: `Hace ${dias} día${dias > 1 ? 's' : ''}`, color: 'text-gray-500' }
    if (dias <= 15)   return { text: `Hace ${dias} días`, color: 'text-amber-600' }
    return { text: `Hace ${dias} días`, color: 'text-red-500' }
  }

  function ProjectRow({ p }: { p: Project }) {
    const dias  = diasSinActividad(p.n)
    const fmt   = fmtDias(dias)
    const sem   = p.estado_semaforo ?? 'gris'
    return (
      <button
        onClick={() => setSelectedProject(p)}
        className="w-full flex items-start gap-3 px-5 py-3 text-left hover:bg-gray-50 border-b border-gray-50 transition-colors group"
      >
        <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0 ${SEMAFORO_DOT[sem] ?? 'bg-gray-300'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 leading-snug line-clamp-2 group-hover:text-slate-900">{p.meta}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-xs text-gray-500">{p.region}</span>
            <span className="text-gray-300">·</span>
            <span className="text-xs text-gray-500">{p.eje}</span>
            {(p.pct_avance ?? 0) > 0 && (
              <>
                <span className="text-gray-300">·</span>
                <span className="text-xs text-gray-500">{p.pct_avance}%</span>
              </>
            )}
          </div>
        </div>
        <span className={`text-xs flex-shrink-0 mt-1 ${fmt.color}`}>{fmt.text}</span>
      </button>
    )
  }

  function Section({
    id, label, color, count, icon, children,
  }: {
    id: string
    label: string
    color: string
    count: number
    icon: React.ReactNode
    children: React.ReactNode
  }) {
    const isOpen = !collapsed[id]
    return (
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full flex items-center gap-3 px-5 py-3.5 bg-white hover:bg-gray-50 transition-colors text-left"
        >
          <span className={`flex-shrink-0 ${color}`}>{icon}</span>
          <span className="text-sm font-semibold text-gray-800 flex-1">{label}</span>
          <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
            count === 0 ? 'bg-gray-100 text-gray-400'
            : id === 'bloqueadas' ? 'bg-red-100 text-red-700'
            : id === 'sinactividad' ? 'bg-amber-100 text-amber-700'
            : 'bg-blue-100 text-blue-700'
          }`}>{count}</span>
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          >
            <path d="M4 6l4 4 4-4"/>
          </svg>
        </button>
        {isOpen && count > 0 && (
          <div className="border-t border-gray-100">
            {children}
          </div>
        )}
        {isOpen && count === 0 && (
          <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-400 text-center">Sin prioridades en esta categoría</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bandeja de atención</h2>
            <p className="text-sm text-gray-500 mt-0.5">Prioridades que requieren acción inmediata</p>
          </div>
          {!loading && (
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${
              total === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
            }`}>
              {total === 0 ? 'Sin alertas' : `${total} alerta${total > 1 ? 's' : ''}`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Calculando...</div>
        ) : (
          <div className="space-y-3">

            {/* En rojo */}
            <Section
              id="bloqueadas"
              label="Bloqueadas (semáforo rojo)"
              color="text-red-500"
              count={bloqueadas.length}
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5v3M8 11v.5"/>
                </svg>
              }
            >
              {bloqueadas.map(p => <ProjectRow key={p.n} p={p} />)}
            </Section>

            {/* Sin actividad */}
            <Section
              id="sinactividad"
              label="Sin actividad reciente (+15 días)"
              color="text-amber-500"
              count={sinActividad.length}
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6"/>
                  <path d="M8 5v3l2 2"/>
                </svg>
              }
            >
              {sinActividad
                .sort((a, b) => {
                  const da = diasSinActividad(a.n) ?? 9999
                  const db = diasSinActividad(b.n) ?? 9999
                  return db - da
                })
                .map(p => <ProjectRow key={p.n} p={p} />)}
            </Section>

            {/* Avance bajo */}
            <Section
              id="avancebajo"
              label="Avance bajo (menos del 30%)"
              color="text-blue-500"
              count={avanceBajo.length}
              icon={
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 12l4-4 3 3 5-6"/>
                </svg>
              }
            >
              {avanceBajo
                .sort((a, b) => (a.pct_avance ?? 0) - (b.pct_avance ?? 0))
                .map(p => <ProjectRow key={p.n} p={p} />)}
            </Section>

          </div>
        )}
      </div>

      {/* Modal */}
      {selectedProject && (
        <ProjectTrackerModal
          prioridad={selectedProject}
          onClose={() => setSelectedProject(null)}
          onUpdatePrioridad={handleUpdateAndRefresh}
        />
      )}
    </div>
  )
}
