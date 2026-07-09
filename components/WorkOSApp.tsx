'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import type { GeoJsonObject } from 'geojson'
import type { Iniciativa } from '@/lib/projects'
import type { Region } from '@/lib/regions'
import { REGIONS } from '@/lib/regions'
import MapaSummarySidebar from './MapaSummarySidebar'
import RegionPreviewPanel from './RegionPreviewPanel'
import { useInactivityLogout } from '@/lib/hooks/useInactivityLogout'
import { getSupabase } from '@/lib/supabase'
import type { UserProfile } from '@/lib/apiAuth'
import { UserProvider } from '@/lib/context/UserContext'

const ChileMap         = dynamic(() => import('./ChileMap'),         { ssr: false })
const NationalDashboard = dynamic(() => import('./NationalDashboard'))
const AttentionTray    = dynamic(() => import('./AttentionTray'))
const KanbanView       = dynamic(() => import('./KanbanView'))
const PregoView        = dynamic(() => import('./PregoView'))
const DesalojosView    = dynamic(() => import('./DesalojosView'))

type View = 'mapa' | 'dashboard' | 'atencion' | 'kanban' | 'prego' | 'usuarios' | 'vista-regional' | 'desalojos'

type Props = {
  projects: Iniciativa[]
  geoData: GeoJsonObject
}

const AdminUsersView  = dynamic(() => import('./AdminUsersView'))
const VistaRegional   = dynamic(() => import('./VistaRegional'))
const AyudaModal      = dynamic(() => import('./AyudaModal'))

export default function WorkOSApp({ projects, geoData }: Props) {
  const { warning, secondsLeft, extend } = useInactivityLogout()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [ayudaOpen, setAyudaOpen] = useState(false)

  useEffect(() => {
    fetch('/api/me').then(r => r.ok ? r.json() : null).then(setProfile).catch(() => null)
  }, [])

  // Atajo global `?` (Shift+/) abre el Centro de Ayuda. Lo ignoramos si el
  // foco está en un input/textarea/contenteditable para no pisar la tecla
  // mientras se escribe.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '?') return
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) return
      e.preventDefault()
      setAyudaOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Solo admin/editor pueden mutar datos en línea desde el panel. Regional y
  // viewer son solo lectura — su camino para proponer cambios es el modal
  // "Proponer actualización" en Mi Región, que pasa por revisión del admin.
  const canEditRegion = useCallback((_regionNombreOrCod: string): boolean => {
    if (!profile) return false
    return profile.role === 'admin' || profile.role === 'editor'
  }, [profile])

  // Cods that regional/filtered-viewer users cannot open
  const lockedRegions: string[] =
    (profile?.role === 'regional' || (profile?.role === 'viewer' && profile.region_cods.length > 0))
      ? REGIONS.filter(r => !profile!.region_cods.includes(r.cod)).map(r => r.cod)
      : []

  const [view, setView]                       = useState<View>('mapa')
  const [viewDropOpen, setViewDropOpen]        = useState(false)
  const [dropPos, setDropPos]                  = useState({ top: 0, left: 0 })
  const viewDropRef                            = useRef<HTMLDivElement>(null)
  const viewDropBtnRef                         = useRef<HTMLButtonElement>(null)
  const [selectedRegion, setSelectedRegion]   = useState<Region | null>(null)

  // Región activa global compartida entre Kanban/Atención/Mi Región. Persiste
  // entre cambios de pestaña y entre recargas (localStorage). El default es la
  // primera región alfabética disponible; se sobreescribe en el primer effect
  // si localStorage tiene un valor válido.
  const [activeRegionName, setActiveRegionName] = useState<string>(() => {
    const sorted = Array.from(new Set(projects.map(p => p.region))).sort()
    return sorted[0] ?? ''
  })

  // Restaurar view + activeRegion desde localStorage al primer render del
  // cliente. Hacemos esto en useEffect (no en el initializer) porque
  // localStorage no existe en SSR y el initial paint sale del servidor.
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    try {
      const storedView   = localStorage.getItem('workos:view')
      const storedRegion = localStorage.getItem('workos:activeRegion')
      const validViews: View[] = ['mapa', 'dashboard', 'atencion', 'kanban', 'prego', 'usuarios', 'vista-regional', 'desalojos']
      if (storedView && (validViews as string[]).includes(storedView)) {
        setView(storedView as View)
      }
      if (storedRegion) {
        const exists = projects.some(p => p.region === storedRegion)
        if (exists) setActiveRegionName(storedRegion)
      }
    } catch {
      // localStorage puede estar bloqueado (privacidad / cookies). Sin fallback —
      // simplemente arrancamos con los defaults de useState.
    } finally {
      setHydrated(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Persistir cambios de view después de la hidratación. Saltamos el primer
  // render para no sobreescribir lo que acabamos de leer.
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('workos:view', view) } catch { /* noop */ }
  }, [view, hydrated])

  useEffect(() => {
    if (!hydrated || !activeRegionName) return
    try { localStorage.setItem('workos:activeRegion', activeRegionName) } catch { /* noop */ }
  }, [activeRegionName, hydrated])

  // Al transicionar a la vista Mapa desde otra vista, abrir el panel de la
  // región activa global. Solo en la transición — clicks toggling el panel
  // mientras se está EN mapa siguen respetando la lógica de handleSelectRegion.
  const prevViewRef = useRef<View>(view)
  useEffect(() => {
    const prev = prevViewRef.current
    prevViewRef.current = view
    if (prev !== view && view === 'mapa' && activeRegionName) {
      const r = REGIONS.find(R => R.nombre === activeRegionName)
      if (r && r.cod !== selectedRegion?.cod) setSelectedRegion(r)
    }
  }, [view, activeRegionName, selectedRegion?.cod])

  // Mapa: sincronizar `mapaMode` con la presencia de región seleccionada. Sin
  // este effect el modo quedaría desfasado cuando el usuario abre/cierra el
  // preview clickeando el polígono o la X. No tocamos `previewWidthPct` acá
  // — eso lo maneja el drag.
  useEffect(() => {
    if (view !== 'mapa') return
    setMapaMode(selectedRegion ? 'preview' : 'summary')
  }, [selectedRegion, view])

  // Regiones que el usuario puede ver. null = sin restricción (admin/editor/viewer
  // sin region_cods); array = lista exacta de nombres permitidos. Se pasa a los
  // selectores de Kanban/Atención para que muestren TODAS las regiones aunque
  // estén vacías, respetando la restricción de visibilidad.
  const allowedRegionNames: string[] | null = useMemo(() => {
    if (profile?.role === 'regional' || (profile?.role === 'viewer' && profile.region_cods.length > 0)) {
      return REGIONS.filter(r => profile!.region_cods.includes(r.cod)).map(r => r.nombre)
    }
    return null
  }, [profile])

  const GROUPED_VIEWS: { key: View; label: string; adminOnly?: boolean }[] = [
    { key: 'dashboard',      label: 'Dashboard' },
    { key: 'atencion',       label: 'Atención'  },
    { key: 'kanban',         label: 'Gabinete'  },
    { key: 'vista-regional', label: 'Mi Región' },
    { key: 'desalojos',      label: 'Desalojos', adminOnly: true },
  ]
  const visibleGroupedViews = GROUPED_VIEWS.filter(v => !v.adminOnly || profile?.role === 'admin')
  const isGroupedActive  = visibleGroupedViews.some(v => v.key === view)
  const activeGroupLabel = visibleGroupedViews.find(v => v.key === view)?.label ?? 'Seguimiento'

  function handleViewDropToggle() {
    if (!viewDropOpen && viewDropBtnRef.current) {
      const rect = viewDropBtnRef.current.getBoundingClientRect()
      setDropPos({ top: rect.bottom + 4, left: rect.left })
    }
    setViewDropOpen(prev => !prev)
  }
  const [localIniciativas, setLocalIniciativas]     = useState<Iniciativa[]>(projects)

  // ── Mapa: modo ─────────────────────────────────────────────────────────────
  // El Mapa tiene dos modos visuales según haya región seleccionada:
  //   - 'summary': sidebar derecho con 16 filas accionables (default).
  //   - 'preview': preview compacto del Dashboard regional con CTA "Ver Mi
  //                Región" para saltar al dashboard completo.
  // `previewWidthPct` controla el ancho del preview. Default 48%; al click
  // del CTA "Ver Mi Región" anima a 100% antes de hacer setView.
  type MapaMode = 'summary' | 'preview'
  const [mapaMode, setMapaMode]                 = useState<MapaMode>('summary')
  const [previewWidthPct, setPreviewWidthPct]   = useState<number>(48)
  // Highlight cruzado entre sidebar y mapa: hover sobre una fila del sidebar
  // resalta el polígono correspondiente.
  const [hoveredCod, setHoveredCod]             = useState<string | null>(null)
  // Ancho del sidebar default (mapaMode === 'summary'). Persistido en
  // localStorage. Min 280 (legibilidad), max 450 para que en monitores
  // grandes (≥1920) el sidebar no se vea diminuto. El default inicial se
  // calcula proporcional al viewport en el effect de hidratación: ~22% del
  // ancho, clamped a [280, 450]. El usuario puede achicar con drag.
  const SUMMARY_MIN = 280
  const SUMMARY_MAX = 450
  const [summarySidebarWidth, setSummarySidebarWidth] = useState<number>(384)
  const summaryDragStart = useRef<{ x: number; w: number } | null>(null)

  // Restaurar el ancho del sidebar default desde localStorage al hidratar.
  // Si no hay valor persistido, calcular un default proporcional al viewport.
  useEffect(() => {
    try {
      const stored = localStorage.getItem('workos:summarySidebarWidth')
      if (stored) {
        const n = parseInt(stored, 10)
        if (Number.isFinite(n) && n >= SUMMARY_MIN && n <= SUMMARY_MAX) {
          setSummarySidebarWidth(n)
          return
        }
      }
      // Sin preferencia stored — proporcional al viewport actual.
      const proportional = Math.round(Math.min(SUMMARY_MAX, Math.max(SUMMARY_MIN, window.innerWidth * 0.22)))
      setSummarySidebarWidth(proportional)
    } catch { /* noop */ }
  }, [])

  // Persistir cambios del ancho. setState dispara muchos renders durante el drag
  // pero localStorage es síncrono y barato para un número.
  useEffect(() => {
    if (!hydrated) return
    try { localStorage.setItem('workos:summarySidebarWidth', String(summarySidebarWidth)) } catch { /* noop */ }
  }, [summarySidebarWidth, hydrated])

  const [actividad, setActividad]             = useState<Record<number, string | null>>({})
  const [actividadLoading, setActividadLoading] = useState(true)

  useEffect(() => {
    fetch('/api/actividad/all')
      .then(r => r.ok ? r.json() : {})
      .then(data => { setActividad(data); setActividadLoading(false) })
      .catch(() => setActividadLoading(false))
  }, [])

  // Initiatives visible to this user (regional + filtered-viewer only see assigned regions)
  const needsRegionFilter =
    profile?.role === 'regional' ||
    (profile?.role === 'viewer' && profile.region_cods.length > 0)

  const visibleIniciativas: Iniciativa[] = needsRegionFilter
    ? localIniciativas.filter(p => {
        const r = REGIONS.find(r => r.nombre === p.region)
        return r ? profile!.region_cods.includes(r.cod) : profile!.region_cods.includes(p.region)
      })
    : localIniciativas

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        viewDropRef.current && !viewDropRef.current.contains(target) &&
        viewDropBtnRef.current && !viewDropBtnRef.current.contains(target)
      ) {
        setViewDropOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  // Auto-select region for single-region users (regional or filtered viewer)
  // Also auto-redirect to vista-regional for single-region users
  useEffect(() => {
    if (needsRegionFilter && profile!.region_cods.length === 1 && !selectedRegion) {
      const r = REGIONS.find(r => r.cod === profile!.region_cods[0])
      if (r) setSelectedRegion(r)
    }
    if (profile?.role === 'regional' && (profile.region_cods.length ?? 0) >= 1) {
      setView('vista-regional')
    }
  }, [profile]) // eslint-disable-line react-hooks/exhaustive-deps
  // Resize del sidebar default. Pointer Events cubre mouse + touch.
  // Listeners en window porque el cursor puede salir del handle durante el drag.
  function handleSummaryResizeStart(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    summaryDragStart.current = { x: e.clientX, w: summarySidebarWidth }
    function onMove(ev: PointerEvent) {
      const start = summaryDragStart.current
      if (!start) return
      // Drag a la izquierda agranda; drag a la derecha achica.
      const dx = start.x - ev.clientX
      const next = Math.min(SUMMARY_MAX, Math.max(SUMMARY_MIN, start.w + dx))
      setSummarySidebarWidth(next)
    }
    function onUp() {
      summaryDragStart.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // useCallback con deps vacías: la identidad es estable entre renders (el setter
  // de useState lo es). Clave para que las vistas memoizadas (p.ej. las tarjetas
  // del Kanban) no re-rendericen todas cuando WorkOSApp actualiza estado.
  const handleUpdatePrioridad = useCallback((n: number, patch: Partial<Iniciativa>) => {
    setLocalIniciativas(prev => prev.map(p => p.n === n ? { ...p, ...patch } : p))
  }, [])

  const handleDeletePrioridad = useCallback((n: number) => {
    setLocalIniciativas(prev => prev.filter(p => p.n !== n))
  }, [])

  // Agregados por región + globales. Se recalculaban en CADA render de WorkOSApp
  // (incluso al arrastrar el sidebar o abrir un dropdown). Ahora se memoizan por
  // `localIniciativas` — solo se rehacen cuando cambian los datos, y estabilizan
  // las props que bajan a ChileMap / MapaSummarySidebar.
  const { projectsByRegion, projectCounts, globalAvgPct, globalRag } = useMemo(() => {
    const byRegion: Record<string, Iniciativa[]> = {}
    for (const p of localIniciativas) {
      if (!byRegion[p.region]) byRegion[p.region] = []
      byRegion[p.region].push(p)
    }
    const counts: Record<string, number> = {}
    for (const [region, list] of Object.entries(byRegion)) counts[region] = list.length

    const avg = localIniciativas.length > 0
      ? Math.round(localIniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / localIniciativas.length)
      : 0
    const rag = {
      rojo:  localIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
      ambar: localIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
      verde: localIniciativas.filter(p => p.estado_semaforo === 'verde').length,
    }
    return { projectsByRegion: byRegion, projectCounts: counts, globalAvgPct: avg, globalRag: rag }
  }, [localIniciativas])

  const selectedIniciativas = useMemo(
    () => selectedRegion ? (projectsByRegion[selectedRegion.nombre] ?? []) : [],
    [selectedRegion, projectsByRegion],
  )

  function handleSelectRegion(regionName: string, cod: string) {
    const found = REGIONS.find(r => r.cod === cod)
    if (!found) return
    // Toggle del panel del mapa, pero NO toggle del filtro global: al clickear
    // siempre actualizamos activeRegionName (para que las otras vistas hereden).
    setSelectedRegion(prev => prev?.cod === cod ? null : found)
    setActiveRegionName(found.nombre)
  }

  // RAG counts per region (for sidebar). useCallback keyed on projectsByRegion
  // para que MapaSummarySidebar (que llama ragFor/avgPctFor por las 16 regiones)
  // no re-renderice por identidad de función en cada render.
  const ragFor = useCallback((regionName: string) => {
    const list = projectsByRegion[regionName] ?? []
    return {
      rojo:  list.filter(p => p.estado_semaforo === 'rojo').length,
      ambar: list.filter(p => p.estado_semaforo === 'ambar').length,
      verde: list.filter(p => p.estado_semaforo === 'verde').length,
    }
  }, [projectsByRegion])

  const avgPctFor = useCallback((regionName: string): number => {
    const list = projectsByRegion[regionName] ?? []
    if (!list.length) return 0
    return Math.round(list.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / list.length)
  }, [projectsByRegion])

  return (
    <UserProvider
      canEditRegion={canEditRegion}
      canEditAny={profile?.role === 'admin' || profile?.role === 'editor'}
      // viewer pasa a solo lectura estricta a partir de etapa 2 de la
      // consolidación backend. RLS también lo bloquea en BD.
      canEditOperational={!!profile && profile.role !== 'viewer'}
      isAdmin={profile?.role === 'admin'}
      userEmail={profile?.email ?? ''}
    >
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 h-20 bg-slate-900 flex items-center justify-between px-8 shadow-md z-10">
        <div className="flex items-center gap-4">
          <img src="/logo-ministerio.jpg" alt="Ministerio del Interior" className="h-14 w-auto rounded-lg shadow-sm" />
          <div className="flex flex-col">
            <span className="text-white font-bold text-fluid-base tracking-wide leading-tight">PSG</span>
            <span className="text-slate-400 text-fluid-sm leading-tight">Panel Seguimiento Gubernamental — Regiones</span>
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
            {/* Grouped views dropdown trigger */}
            <div ref={viewDropRef}>
              <button
                ref={viewDropBtnRef}
                onClick={handleViewDropToggle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isGroupedActive ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
                }`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M1 1h4v4H1zM7 1h4v4H7zM1 7h4v4H1zM7 7h4v4H7z" strokeLinejoin="round"/>
                </svg>
                {activeGroupLabel}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" style={{ transform: viewDropOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M2 4l3 3 3-3"/>
                </svg>
              </button>
            </div>
            {(profile?.role === 'admin' || profile?.role === 'editor') && (
            <button
              onClick={() => setView('prego')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors animate-in fade-in duration-300 ${
                view === 'prego' ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="1" y="1" width="10" height="10" rx="1"/>
                <path d="M1 4h10M1 7h10M4 4v7" strokeLinecap="round"/>
              </svg>
              PREGO
            </button>
            )}
            {profile?.role === 'admin' && (
              <button
                onClick={() => setView('usuarios')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors animate-in fade-in duration-300 ${
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

          {/* User info — logout siempre visible, email/rol aparece al cargar perfil */}
          <div className="flex items-center gap-3">
            {profile ? (
              <div className="text-right animate-in fade-in duration-300">
                <div className="text-xs text-white font-medium leading-tight">{profile.email}</div>
                <div className="text-xs text-slate-400 leading-tight capitalize">{profile.role}</div>
              </div>
            ) : (
              <div className="w-28 h-7 rounded bg-slate-800 animate-pulse" />
            )}
            <button
              onClick={() => setAyudaOpen(true)}
              className="text-slate-400 hover:text-white transition-colors"
              title="Centro de Ayuda (?)"
              aria-label="Abrir Centro de Ayuda"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="6.5"/>
                <path d="M6.3 6a1.8 1.8 0 0 1 3.5 0c0 1.1-1.7 1.4-1.7 2.4"/>
                <circle cx="8" cy="11.4" r=".4" fill="currentColor"/>
              </svg>
            </button>
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
        </div>
      </header>

      {/* Dashboard view */}
      {view === 'dashboard' && (
        <div className="flex-1 overflow-hidden">
          <NationalDashboard
            projects={visibleIniciativas}
            actividad={actividad}
            actividadLoading={actividadLoading}
            onUpdatePrioridad={handleUpdatePrioridad}
            onDeletePrioridad={handleDeletePrioridad}
          />
        </div>
      )}

      {/* Kanban view */}
      {view === 'kanban' && (
        <div className="flex-1 overflow-hidden flex flex-col">
          <KanbanView
            projects={visibleIniciativas}
            onUpdatePrioridad={handleUpdatePrioridad}
            onDeletePrioridad={handleDeletePrioridad}
            activeRegionName={activeRegionName}
            onActiveRegionChange={setActiveRegionName}
            allowedRegionNames={allowedRegionNames}
          />
        </div>
      )}

      {/* Usuarios view (admin only) */}
      {view === 'usuarios' && (
        <div className="flex-1 overflow-hidden">
          <AdminUsersView />
        </div>
      )}

      {/* PREGO view — admin/editor only */}
      {view === 'prego' && (profile?.role === 'admin' || profile?.role === 'editor') && (
        <div className="flex-1 overflow-hidden">
          <PregoView canEditRegion={canEditRegion} />
        </div>
      )}

      {/* Desalojos view — admin only. Doble check (botón + render) para
          que un user que manualmente cambie `view` via devtools no vea
          contenido. La protección real es por RLS + check server-side en
          las API routes. */}
      {view === 'desalojos' && profile?.role === 'admin' && (
        <div className="flex-1 overflow-hidden">
          <DesalojosView
            projects={visibleIniciativas}
            onUpdatePrioridad={handleUpdatePrioridad}
          />
        </div>
      )}

      {/* Atención view */}
      {view === 'atencion' && (
        <div className="flex-1 overflow-hidden flex">
          <AttentionTray
            projects={visibleIniciativas}
            actividad={actividad}
            actividadLoading={actividadLoading}
            onUpdatePrioridad={handleUpdatePrioridad}
            onDeletePrioridad={handleDeletePrioridad}
            activeRegionName={activeRegionName}
            onActiveRegionChange={setActiveRegionName}
            allowedRegionNames={allowedRegionNames}
          />
        </div>
      )}

      {/* Vista Regional */}
      {view === 'vista-regional' && (
        <div className="flex-1 overflow-hidden flex">
          <VistaRegional
            iniciativas={visibleIniciativas}
            actividad={actividad}
            profile={profile}
            activeRegionName={activeRegionName}
            onActiveRegionChange={setActiveRegionName}
          />
        </div>
      )}

      {/* Map view — entrada geográfica al Dashboard regional.
         Sin región: MapaSummarySidebar con 16 filas accionables.
         Con región: RegionPreviewPanel (preview compacto) + CTA "Ver Mi
         Región" para saltar al dashboard completo. La transition CSS se
         activa cuando previewWidthPct cambia (e.g. al click del CTA, que
         anima 48% → 100% antes del setView). */}
      {view === 'mapa' && (
        <div className="flex flex-1 overflow-hidden">
          {/* Mapa */}
          <div
            className="relative min-w-0 transition-[flex-basis] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              flexGrow:   mapaMode === 'summary' ? 1 : 0,
              flexShrink: 1,
              flexBasis:  mapaMode === 'summary' ? 'auto' : `calc(100% - min(${previewWidthPct}vw, 900px))`,
            }}
          >
            <ChileMap
              geoData={geoData}
              selectedCod={selectedRegion?.cod ?? hoveredCod}
              projectCounts={projectCounts}
              onSelect={handleSelectRegion}
              lockedRegions={lockedRegions}
            />
          </div>

          {/* Preview regional */}
          {mapaMode === 'preview' && selectedRegion && (
            <div
              className="flex-shrink-0 z-[1100] relative overflow-hidden shadow-xl transition-[flex-basis] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
              style={{ flexBasis: `min(${previewWidthPct}vw, 900px)` }}
            >
              <RegionPreviewPanel
                region={selectedRegion}
                projects={selectedIniciativas}
                actividad={actividad}
                nationalAvgPct={globalAvgPct}
                onClose={() => setSelectedRegion(null)}
                onGoToKanban={() => setView('kanban')}
                onGoToDashboard={() => setView('vista-regional')}
              />
            </div>
          )}

          {/* Sidebar resumen (default) */}
          {mapaMode === 'summary' && (
            <MapaSummarySidebar
              projects={localIniciativas}
              actividad={actividad}
              projectCounts={projectCounts}
              globalAvgPct={globalAvgPct}
              globalRag={globalRag}
              totalIniciativas={localIniciativas.length}
              lockedRegions={lockedRegions}
              ragFor={ragFor}
              avgPctFor={avgPctFor}
              onSelectRegion={handleSelectRegion}
              onHoverRegion={setHoveredCod}
              width={summarySidebarWidth}
              onResizeStart={handleSummaryResizeStart}
            />
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

      {/* View dropdown — rendered at root level to escape header stacking context */}
      {viewDropOpen && (
        <div
          ref={viewDropRef}
          style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999, minWidth: 140 }}
          className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          {visibleGroupedViews.map(v => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setViewDropOpen(false) }}
              className={`block w-full px-3.5 py-2 text-xs text-left transition-colors ${
                view === v.key
                  ? 'font-semibold text-slate-900 bg-slate-100'
                  : 'font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      )}
    </div>
    <AyudaModal open={ayudaOpen} onClose={() => setAyudaOpen(false)} />
    </UserProvider>
  )
}
