'use client'

import { useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import type { GeoJsonObject } from 'geojson'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'
import ProjectsPanel from './ProjectsPanel'
import NationalDashboard from './NationalDashboard'
import AttentionTray from './AttentionTray'

const ChileMap = dynamic(() => import('./ChileMap'), { ssr: false })

type View = 'mapa' | 'dashboard' | 'atencion'

type Props = {
  projects: Project[]
  geoData: GeoJsonObject
}

export default function WorkOSApp({ projects, geoData }: Props) {
  const [view, setView]                       = useState<View>('mapa')
  const [selectedRegion, setSelectedRegion]   = useState<Region | null>(null)
  const [localProjects, setLocalProjects]     = useState<Project[]>(projects)
  const [panelWidth, setPanelWidth]           = useState(420)
  const isDragging                            = useRef(false)
  const dragStartX                            = useRef(0)
  const dragStartWidth                        = useRef(420)

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    isDragging.current = true
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current) return
      const delta = dragStartX.current - ev.clientX
      const newWidth = Math.min(Math.max(320, dragStartWidth.current + delta), 900)
      setPanelWidth(newWidth)
    }

    function onMouseUp() {
      isDragging.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function handleUpdatePrioridad(n: number, patch: Partial<Pick<Project, 'estado_semaforo' | 'pct_avance'>>) {
    setLocalProjects(prev => prev.map(p => p.n === n ? { ...p, ...patch } : p))
  }

  const projectsByRegion: Record<string, Project[]> = {}
  for (const p of localProjects) {
    if (!projectsByRegion[p.region]) projectsByRegion[p.region] = []
    projectsByRegion[p.region].push(p)
  }

  const projectCounts: Record<string, number> = {}
  for (const [region, list] of Object.entries(projectsByRegion)) {
    projectCounts[region] = list.length
  }

  const selectedProjects = selectedRegion ? (projectsByRegion[selectedRegion.nombre] ?? []) : []

  function handleSelectRegion(regionName: string, cod: string) {
    const found = REGIONS.find(r => r.cod === cod)
    if (!found) return
    setSelectedRegion(prev => prev?.cod === cod ? null : found)
  }

  // RAG counts per region (for sidebar)
  function ragFor(regionName: string) {
    const list = projectsByRegion[regionName] ?? []
    return {
      rojo:  list.filter(p => p.estado_semaforo === 'rojo').length,
      ambar: list.filter(p => p.estado_semaforo === 'ambar').length,
      verde: list.filter(p => p.estado_semaforo === 'verde').length,
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 h-14 bg-slate-900 flex items-center justify-between px-6 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M2 2h4v4H2zM8 2h4v4H8zM2 8h4v4H8z" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-white font-bold text-sm tracking-wide">Work OS</span>
          </div>
          <span className="text-slate-600 text-sm">|</span>
          <span className="text-slate-300 text-sm">Prioridades Territoriales 2026–2028</span>
        </div>

        <div className="flex items-center gap-4">
          {/* View toggle */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView('mapa')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'mapa' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M1 4l4-2 2 2 4-2v6l-4 2-2-2-4 2V4z" strokeLinejoin="round"/>
              </svg>
              Mapa
            </button>
            <button
              onClick={() => setView('dashboard')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'dashboard' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z" strokeLinejoin="round"/>
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => setView('atencion')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'atencion' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="6" cy="6" r="5"/>
                <path d="M6 3.5v3M6 8v.5" strokeLinecap="round"/>
              </svg>
              Atención
            </button>
          </div>

          <div className="text-slate-400 text-xs">
            {localProjects.length} prioridades · 16 regiones
          </div>
        </div>
      </header>

      {/* Dashboard view */}
      {view === 'dashboard' && (
        <div className="flex-1 overflow-hidden">
          <NationalDashboard
            projects={localProjects}
            onUpdatePrioridad={handleUpdatePrioridad}
          />
        </div>
      )}

      {/* Atención view */}
      {view === 'atencion' && (
        <div className="flex-1 overflow-hidden flex">
          <AttentionTray
            projects={localProjects}
            onUpdatePrioridad={handleUpdatePrioridad}
          />
        </div>
      )}

      {/* Map view */}
      {view === 'mapa' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Map */}
          <div className="flex-1 relative">
            <ChileMap
              geoData={geoData}
              selectedCod={selectedRegion?.cod ?? null}
              projectCounts={projectCounts}
              onSelect={handleSelectRegion}
            />

            {!selectedRegion && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs text-gray-600 pointer-events-none z-[1000]">
                Haz clic en una región para ver sus prioridades
              </div>
            )}
          </div>

          {/* Side panel — projects */}
          {selectedRegion && (
            <div
              className="flex-shrink-0 overflow-hidden shadow-xl z-[999] relative"
              style={{ width: panelWidth }}
            >
              {/* Resize handle */}
              <div
                onMouseDown={handleResizeStart}
                className="absolute left-0 top-0 bottom-0 w-1.5 z-10 cursor-col-resize group"
              >
                <div className="absolute inset-0 group-hover:bg-blue-400/30 group-active:bg-blue-400/50 transition-colors" />
              </div>
              <ProjectsPanel
                region={selectedRegion}
                projects={selectedProjects}
                onClose={() => setSelectedRegion(null)}
                onUpdatePrioridad={handleUpdatePrioridad}
              />
            </div>
          )}

          {/* Region list sidebar */}
          {!selectedRegion && (
            <div className="w-64 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Regiones</h3>
              </div>
              <div className="flex-1 overflow-y-auto">
                {REGIONS.map(region => {
                  const count = projectCounts[region.nombre] ?? 0
                  const color = getRegionColor(region.nombre)
                  const rag   = ragFor(region.nombre)
                  return (
                    <button
                      key={region.cod}
                      onClick={() => handleSelectRegion(region.nombre, region.cod)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 transition-colors"
                    >
                      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{region.nombre}</div>
                        <div className="text-xs text-gray-600">{region.capital}</div>
                        {/* RAG mini-indicators */}
                        <div className="flex items-center gap-1.5 mt-1">
                          {rag.rojo > 0 && (
                            <span className="flex items-center gap-0.5">
                              <span className="w-2 h-2 rounded-full bg-red-500"/>
                              <span className="text-xs text-red-600 font-medium">{rag.rojo}</span>
                            </span>
                          )}
                          {rag.ambar > 0 && (
                            <span className="flex items-center gap-0.5">
                              <span className="w-2 h-2 rounded-full bg-amber-400"/>
                              <span className="text-xs text-amber-600 font-medium">{rag.ambar}</span>
                            </span>
                          )}
                          {rag.verde > 0 && (
                            <span className="flex items-center gap-0.5">
                              <span className="w-2 h-2 rounded-full bg-green-500"/>
                              <span className="text-xs text-green-600 font-medium">{rag.verde}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <div className="text-xs font-bold text-gray-700">{count}</div>
                        <div className="text-xs text-gray-500">prioridades</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
