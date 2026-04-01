'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { GeoJsonObject } from 'geojson'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import { REGIONS, ZONA_COLORS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'
import ProjectsPanel from './ProjectsPanel'

const ChileMap = dynamic(() => import('./ChileMap'), { ssr: false })

type Props = {
  projects: Project[]
  geoData: GeoJsonObject
}

export default function WorkOSApp({ projects, geoData }: Props) {
  const [selectedRegion, setSelectedRegion] = useState<Region | null>(null)

  const projectsByRegion: Record<string, Project[]> = {}
  for (const p of projects) {
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

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 h-14 bg-slate-900 flex items-center justify-between px-6 shadow-md z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-500 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="white" strokeWidth="1.8">
                <path d="M2 2h4v4H2zM8 2h4v4H8zM2 8h4v4H2zM8 8h4v4H8z" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="text-white font-bold text-sm tracking-wide">Work OS</span>
          </div>
          <span className="text-slate-500 text-sm">|</span>
          <span className="text-slate-300 text-sm">Prioridades Territoriales 2026–2028</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-slate-400 text-xs">
            {projects.length} prioridades · 16 regiones
          </div>
        </div>
      </header>

      {/* Main content */}
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
          <div className="w-[420px] flex-shrink-0 overflow-hidden shadow-xl z-[999]">
            <ProjectsPanel
              region={selectedRegion}
              projects={selectedProjects}
              onClose={() => setSelectedRegion(null)}
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
                const alta = (projectsByRegion[region.nombre] ?? []).filter(p => p.prioridad === 'Alta').length
                return (
                  <button
                    key={region.cod}
                    onClick={() => handleSelectRegion(region.nombre, region.cod)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-50 transition-colors"
                  >
                    <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-800 truncate">{region.nombre}</div>
                      <div className="text-xs text-gray-400">{region.capital}</div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <div className="text-xs font-bold text-gray-700">{count}</div>
                      {alta > 0 && (
                        <div className="text-xs text-red-500">{alta} alta</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
