'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { GeoJsonObject } from 'geojson'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'
import ProjectsPanel from './ProjectsPanel'
import { useInactivityLogout } from '@/lib/hooks/useInactivityLogout'
import { getSupabase } from '@/lib/supabase'
import type { UserProfile } from '@/lib/apiAuth'
import { UserProvider } from '@/lib/context/UserContext'

const ChileMap         = dynamic(() => import('./ChileMap'),         { ssr: false })
const NationalDashboard = dynamic(() => import('./NationalDashboard'))
const AttentionTray    = dynamic(() => import('./AttentionTray'))
const KanbanView       = dynamic(() => import('./KanbanView'))
const PregoView        = dynamic(() => import('./PregoView'))

type View = 'mapa' | 'dashboard' | 'atencion' | 'kanban' | 'prego' | 'usuarios'

type Props = {
  projects: Iniciativa[]
  geoData: GeoJsonObject
}

const AdminUsersView = dynamic(() => import('./AdminUsersView'))

export default function WorkOSApp({ projects, geoData }: Props) {
  const { warning, secondsLeft, extend } = useInactivityLogout()

  const [profile, setProfile] = useState<UserProfile | null>(null)

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(setProfile).catch(() => null)
  }, [])

  const canEditRegion = useCallback((regionNombreOrCod: string): boolean => {
    if (!profile) return false
    if (profile.role === 'admin' || profile.role === 'editor') return true
    if (profile.role === 'regional') {
      if (profile.region_cods.includes(regionNombreOrCod)) return true
      const r = REGIONS.find(r => r.nombre === regionNombreOrCod)
      return r ? profile.region_cods.includes(r.cod) : false
    }
    return false
  }, [profile])

  // Cods that regional users cannot open (all regions not in their list)
  const lockedRegions: string[] = profile?.role === 'regional'
    ? REGIONS.filter(r => !profile.region_cods.includes(r.cod)).map(r => r.cod)
    : []

  const [view, setView]                       = useState<View>('mapa')
  const [selectedRegion, setSelectedRegion]   = useState<Region | null>(null)
  const [localIniciativas, setLocalIniciativas]     = useState<Iniciativa[]>(projects)
  const [panelWidth, setPanelWidth]           = useState(420)
  const [actividad, setActividad]             = useState<Record<number, string | null>>({})
  const [actividadLoading, setActividadLoading] = useState(true)

  useEffect(() => {
    fetch('/api/actividad/all')
      .then(r => r.ok ? r.json() : {})
      .then(data => { setActividad(data); setActividadLoading(false) })
      .catch(() => setActividadLoading(false))
  }, [])

  // Auto-select region for regional users with exactly one region assigned
  useEffect(() => {
    if (profile?.role === 'regional' && profile.region_cods.length === 1 && !selectedRegion) {
      const r = REGIONS.find(r => r.cod === profile.region_cods[0])
      if (r) setSelectedRegion(r)
    }
  }, [profile])
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

  function handleUpdatePrioridad(n: number, patch: Partial<Iniciativa>) {
    setLocalIniciativas(prev => prev.map(p => p.n === n ? { ...p, ...patch } : p))
  }

  const projectsByRegion: Record<string, Iniciativa[]> = {}
  for (const p of localIniciativas) {
    if (!projectsByRegion[p.region]) projectsByRegion[p.region] = []
    projectsByRegion[p.region].push(p)
  }

  const projectCounts: Record<string, number> = {}
  for (const [region, list] of Object.entries(projectsByRegion)) {
    projectCounts[region] = list.length
  }

  const selectedIniciativas = selectedRegion ? (projectsByRegion[selectedRegion.nombre] ?? []) : []

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

  function avgPctFor(regionName: string): number {
    const list = projectsByRegion[regionName] ?? []
    if (!list.length) return 0
    return Math.round(list.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / list.length)
  }

  const globalAvgPct = localIniciativas.length > 0
    ? Math.round(localIniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / localIniciativas.length)
    : 0
  const globalRag = {
    rojo:  localIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
    ambar: localIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
    verde: localIniciativas.filter(p => p.estado_semaforo === 'verde').length,
  }

  return (
    <UserProvider canEditRegion={canEditRegion} canEditAny={profile?.role === 'admin' || profile?.role === 'editor'}>
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 h-20 bg-slate-900 flex items-center justify-between px-8 shadow-md z-10">
        <div className="flex items-center gap-4">
          <img src="/logo-ministerio.jpg" alt="Ministerio del Interior" className="h-14 w-auto rounded-lg shadow-sm" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-base tracking-wide leading-tight">PSG</span>
            <span className="text-slate-400 text-sm leading-tight">Panel Seguimiento Gubernamental — Regiones</span>
          </div>
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
            <button
              onClick={() => setView('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'kanban' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="1" y="1" width="3" height="10" rx="0.8"/>
                <rect x="5" y="1" width="3" height="7" rx="0.8"/>
                <rect x="9" y="1" width="2" height="5" rx="0.8"/>
              </svg>
              Kanban
            </button>
            <button
              onClick={() => setView('prego')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                view === 'prego' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="1" y="1" width="10" height="10" rx="1"/>
                <path d="M1 4h10M1 7h10M4 4v7" strokeLinecap="round"/>
              </svg>
              PREGO
            </button>
            {profile?.role === 'admin' && (
              <button
                onClick={() => setView('usuarios')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'usuarios' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="4.5" cy="3.5" r="2"/>
                  <path d="M1 10c0-2 1.5-3.5 3.5-3.5S8 8 8 10"/>
                  <circle cx="9" cy="4" r="1.5"/>
                  <path d="M9 7.5c1.5 0 2.5 1 2.5 2.5"/>
                </svg>
                Usuarios
              </button>
            )}
          </div>

          {/* User info */}
          {profile && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-xs text-white font-medium leading-tight">{profile.email}</div>
                <div className="text-xs text-slate-400 leading-tight capitalize">{profile.role}</div>
              </div>
              <button
                onClick={async () => { await getSupabase().auth.signOut(); window.location.href = '/login' }}
                className="text-slate-400 hover:text-white transition-colors"
                title="Cerrar sesión"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
                  <path d="M11 11l3-3-3-3"/>
                  <path d="M14 8H6"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Dashboard view */}
      {view === 'dashboard' && (
        <div className="flex-1 overflow-hidden">
          <NationalDashboard
            projects={localIniciativas}
            actividad={actividad}
            actividadLoading={actividadLoading}
            onUpdatePrioridad={handleUpdatePrioridad}
          />
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <KanbanView
            projects={localIniciativas}
            onUpdatePrioridad={handleUpdatePrioridad}
          />
        </div>
      )}

      {/* Usuarios view (admin only) */}
      {view === 'usuarios' && (
        <div className="flex-1 overflow-hidden">
          <AdminUsersView />
        </div>
      )}

      {/* PREGO view */}
      {view === 'prego' && (
        <div className="flex-1 overflow-hidden">
          <PregoView canEditRegion={canEditRegion} />
        </div>
      )}

      {/* Atención view */}
      {view === 'atencion' && (
        <div className="flex-1 overflow-hidden flex">
          <AttentionTray
            projects={localIniciativas}
            actividad={actividad}
            actividadLoading={actividadLoading}
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
              lockedRegions={lockedRegions}
            />

            {!selectedRegion && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm rounded-full px-4 py-2 shadow-md text-xs text-gray-600 pointer-events-none z-[1000]">
                Haz clic en una región para ver sus iniciativas
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
                projects={selectedIniciativas}
                onClose={() => setSelectedRegion(null)}
                onUpdatePrioridad={handleUpdatePrioridad}
              />
            </div>
          )}

          {/* Region list sidebar */}
          {!selectedRegion && (
            <div className="w-80 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
              {/* Summary header */}
              <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Situación general</h3>
                  <span className="text-xs text-gray-400">16 regiones</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${globalAvgPct}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold text-slate-700 w-10 text-right">{globalAvgPct}%</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/><span className="text-red-600 font-medium">{globalRag.rojo}</span></span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/><span className="text-amber-600 font-medium">{globalRag.ambar}</span></span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"/><span className="text-green-600 font-medium">{globalRag.verde}</span></span>
                  <span className="ml-auto text-gray-400">{localIniciativas.length} iniciativas</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {REGIONS.map(region => {
                  const count  = projectCounts[region.nombre] ?? 0
                  const color  = getRegionColor(region.nombre)
                  const rag    = ragFor(region.nombre)
                  const avgPct = avgPctFor(region.nombre)
                  const barColor = avgPct === 100 ? 'bg-green-500' : avgPct >= 60 ? 'bg-blue-500' : avgPct >= 30 ? 'bg-amber-400' : avgPct > 0 ? 'bg-red-400' : 'bg-gray-200'
                  const isLocked = lockedRegions.includes(region.cod)
                  return (
                    <button
                      key={region.cod}
                      onClick={() => !isLocked && handleSelectRegion(region.nombre, region.cod)}
                      disabled={isLocked}
                      className={`w-full px-5 py-3.5 text-left border-b border-gray-100 transition-colors ${isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="w-3 h-3 rounded-sm flex-shrink-0 mt-1" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="text-sm font-semibold text-gray-800 truncate">{region.nombre}</div>
                            <div className="flex-shrink-0 text-right">
                              <span className="text-sm font-bold text-gray-700">{count}</span>
                              <span className="text-xs text-gray-400 ml-1">init.</span>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">{region.capital}</div>
                          {/* Progress bar */}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${avgPct}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-8 text-right">{avgPct}%</span>
                          </div>
                          {/* RAG indicators */}
                          <div className="flex items-center gap-2">
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
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {/* Inactivity warning */}
      {warning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-sm mx-4 overflow-hidden">
            <div className="bg-amber-500 px-6 py-4 flex items-center gap-3">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M10 3L17.5 17H2.5L10 3z"/>
                <path d="M10 9v4M10 14.5v.5"/>
              </svg>
              <span className="text-white font-semibold text-sm">Sesión por expirar</span>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-gray-700">
                Por inactividad, la sesión se cerrará en{' '}
                <span className="font-bold text-amber-600">{secondsLeft}</span> segundos.
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Haz clic en "Continuar" para mantener la sesión activa.
              </p>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button
                onClick={extend}
                className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 transition-colors"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </UserProvider>
  )
}
