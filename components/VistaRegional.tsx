'use client'

import { useState, useEffect, useMemo } from 'react'
import { perCapita } from '@/lib/indicatorUtils'
import { useSeiaProjects } from '@/lib/hooks/useSeiaProjects'
import { useMopProjects } from '@/lib/hooks/useMopProjects'
import { getSupabase } from '@/lib/supabase'
import { REGIONS } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { PregoRow } from '@/lib/types'
import { PREGO_FASES, PREGO_ESTADO_CONFIG } from '@/lib/types'
import type { UserProfile } from '@/lib/apiAuth'
import dynamic from 'next/dynamic'
import ProposeImportModal from './ProposeImportModal'
import MyProposalsList from './MyProposalsList'
import MetricasEjeDrawer from './MetricasEjeDrawer'
import RegionEjesPanel from './RegionEjesPanel'
import AlertCard from './AlertCard'
import MetricasClaveSection, { MetricCard } from './MetricasClaveSection'
import { useCanEditAny, useCanEditOperational } from '@/lib/context/UserContext'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import {
  diasSinActividad,
  diasHastaHito,
  ejeBreakdownFor,
} from '@/lib/regionSummary'

const IndicadoresModalV2 = dynamic(() => import('./IndicadoresModalV2'))

// ── Main component ────────────────────────────────────────────────────────────

type Props = {
  iniciativas: Iniciativa[]
  actividad: Record<number, string | null>
  profile: UserProfile | null
  // Región activa (state global) — sincronizada con Kanban/Atención/Mapa.
  activeRegionName: string
  onActiveRegionChange: (regionName: string) => void
}

// Ver comentario junto a su uso en la Sección 4 (Métricas clave).
const SHOW_INVERSION_CARD = false

export default function VistaRegional({ iniciativas, actividad, profile, activeRegionName, onActiveRegionChange }: Props) {
  // Determine accessible region codes for this user
  const allowedCods: string[] = useMemo(() => {
    if (!profile) return []
    if (profile.role === 'admin' || profile.role === 'editor') return REGIONS.map(r => r.cod)
    if (profile.region_cods.length > 0) return profile.region_cods
    return REGIONS.map(r => r.cod)
  }, [profile])

  // selectedCod deriva del state global. Si activeRegionName no está en las
  // allowedCods del usuario (ej. user regional con permisos acotados), caemos
  // a la primera permitida.
  const selectedCod = useMemo<string | null>(() => {
    if (!profile) return null
    const fromActive = REGIONS.find(r => r.nombre === activeRegionName)?.cod ?? null
    if (fromActive && allowedCods.includes(fromActive)) return fromActive
    return allowedCods[0] ?? null
  }, [activeRegionName, allowedCods, profile])

  // Sincronizar arriba si caímos a un fallback (ej. activeRegion no permitida).
  // Esto evita que el global quede desincronizado con lo que el user está viendo.
  useEffect(() => {
    if (!selectedCod) return
    const r = REGIONS.find(R => R.cod === selectedCod)
    if (r && r.nombre !== activeRegionName) {
      onActiveRegionChange(r.nombre)
    }
  }, [selectedCod, activeRegionName, onActiveRegionChange])

  const [indicadoresOpen, setIndicadoresOpen] = useState(false)
  const [proposeModalOpen, setProposeModalOpen] = useState(false)
  // Bump al recibir confirmación de upload exitoso para que MyProposalsList recargue.
  const [proposalsRefreshKey, setProposalsRefreshKey] = useState(0)
  // Eje seleccionado en la grid de avance → abre drawer lateral con sus métricas.
  const [selectedEjeIdForMetrics, setSelectedEjeIdForMetrics] = useState<number | null>(null)
  // Modal de gestión del catálogo de ejes de la región (solo admin/editor DCI).
  const [manageEjesOpen, setManageEjesOpen] = useState(false)
  const canEditAny      = useCanEditAny()
  const canPropose      = useCanEditOperational()
  const [downloadingMinuta, setDownloadingMinuta] = useState(false)
  const [downloadingTipo, setDownloadingTipo] = useState<'ejecutiva' | 'ficha' | null>(null)
  const [minutaMenuOpen, setMinutaMenuOpen] = useState(false)
  const [minutaCache, setMinutaCache] = useState<Record<'ejecutiva' | 'ficha', { cached: boolean; generated_at: string | null; generated_by: string | null }>>({
    ejecutiva: { cached: false, generated_at: null, generated_by: null },
    ficha:     { cached: false, generated_at: null, generated_by: null },
  })
  // Preview de la versión guardada: PDF embebido inline. `url` es un objectURL del
  // blob que también se reutiliza para el botón Descargar (sin segundo POST).
  const [minutaPreview, setMinutaPreview] = useState<{
    tipo: 'ejecutiva' | 'ficha'; url: string; generatedAt: string | null; generatedBy: string | null
  } | null>(null)
  // Solo admin genera/regenera; el resto solo previsualiza/descarga lo guardado.
  const isAdmin = profile?.role === 'admin'
  // Contexto Regional pide un N° de Minuta DCI antes de generar/regenerar.
  // window.prompt() no funciona en este entorno (sandbox) — modal propio.
  // `numeroForce` distingue "generar la primera versión" de "regenerar" (force).
  const [numeroModalOpen, setNumeroModalOpen] = useState(false)
  const [numeroForce, setNumeroForce] = useState(false)
  const [numeroInput, setNumeroInput] = useState('')
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [prego, setPrego] = useState<PregoRow | null>(null)

  // (El default de región ahora viene del state global activeRegionName,
  // sincronizado en WorkOSApp y persistido en localStorage. El useMemo de
  // selectedCod arriba ya hace el fallback a allowedCods[0] si activeRegion
  // no está permitida para este usuario.)

  // Fetch PREGO for selected region
  useEffect(() => {
    if (!selectedCod) return
    setPrego(null)
    getSupabase()
      .from('prego_monitoreo')
      .select('*')
      .eq('region_cod', selectedCod)
      .maybeSingle()
      .then(({ data }) => setPrego(data as PregoRow | null))
  }, [selectedCod])

  // Fetch cache status for both minuta types when region changes
  useEffect(() => {
    if (!selectedCod) return
    Promise.all([
      fetch(`/api/minuta?region_cod=${selectedCod}&tipo=ejecutiva`).then(r => r.ok ? r.json() : null),
      fetch(`/api/minuta?region_cod=${selectedCod}&tipo=ficha`).then(r => r.ok ? r.json() : null),
    ]).then(([ej, ficha]) => {
      setMinutaCache({
        ejecutiva: ej    ?? { cached: false, generated_at: null, generated_by: null },
        ficha:     ficha ?? { cached: false, generated_at: null, generated_by: null },
      })
    }).catch(() => {})
  }, [selectedCod])

  // Close minuta dropdown on outside click
  useEffect(() => {
    if (!minutaMenuOpen) return
    function close(e: MouseEvent) {
      if (!(e.target as Element).closest('[data-minuta-menu]')) setMinutaMenuOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [minutaMenuOpen])

  const region: Region | null = REGIONS.find(r => r.cod === selectedCod) ?? null

  // Catálogo de ejes de la región activa (migración 015). `refresh` se llama
  // desde RegionEjesPanel cuando admin agrega/edita/elimina un eje.
  const { ejes: regionEjes, refresh: refreshRegionEjes } = useRegionEjes(selectedCod)

  // Initiatives for this region
  const regionIniciativas = useMemo(
    () => selectedCod ? iniciativas.filter(p => p.cod === selectedCod) : [],
    [iniciativas, selectedCod]
  )

  // External data hooks
  const { proyectos: seiaProjects, total: seiaTotal } = useSeiaProjects(selectedCod ?? '')
  const { proyectos: mopProjects, total: mopTotal } = useMopProjects(selectedCod ?? '')

  // Población de la región activa (para Inversión per cápita) — misma tabla
  // que usa la pestaña Métricas para el PIB per cápita.
  const [poblacionRegion, setPoblacionRegion] = useState<number | null>(null)
  useEffect(() => {
    if (!selectedCod) { setPoblacionRegion(null); return }
    let cancelled = false
    getSupabase()
      .from('region_metrics')
      .select('poblacion_total')
      .eq('region_cod', selectedCod)
      .single()
      .then(({ data }) => {
        if (cancelled) return
        setPoblacionRegion(data ? (data as { poblacion_total: number | null }).poblacion_total : null)
      })
    return () => { cancelled = true }
  }, [selectedCod])

  // ── Computed values ──────────────────────────────────────────────────────────

  const avgPct = regionIniciativas.length > 0
    ? Math.round(regionIniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / regionIniciativas.length)
    : 0

  const semaforoCount = {
    verde: regionIniciativas.filter(p => p.estado_semaforo === 'verde').length,
    ambar: regionIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
    rojo:  regionIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
    gris:  regionIniciativas.filter(p => p.estado_semaforo === 'gris').length,
  }

  const pregoCompletadas = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'completado').length
    : 0

  // Alert: sin actividad
  const alertaSinActividad = regionIniciativas.filter(p => {
    const dias = diasSinActividad(actividad[p.n])
    return dias === null || dias > 15
  })

  // Alert: hitos en <= 7 días o vencidos
  const alertaHitos = regionIniciativas
    .filter(p => {
      const dias = diasHastaHito(p.fecha_proximo_hito)
      return dias !== null && dias <= 7
    })
    .sort((a, b) => (diasHastaHito(a.fecha_proximo_hito) ?? 999) - (diasHastaHito(b.fecha_proximo_hito) ?? 999))

  // Alert: en rojo
  const alertaRojo = regionIniciativas.filter(p => p.estado_semaforo === 'rojo')

  // Alert: PREGO bloqueado
  const alertaPregoFases = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'bloqueado')
    : []

  // Eje breakdown — extraído a lib/regionSummary.ts::ejeBreakdownFor para
  // compartir con el preview del Mapa (RegionPreviewPanel). Iteramos el
  // catálogo `region_ejes` (no los strings libres) y agregamos las iniciativas
  // matcheadas por `eje_id`. Las sin `eje_id` quedan fuera del breakdown —
  // si admin las ve faltar en los totales, las edita y les asigna eje.
  const ejeData = useMemo(
    () => selectedCod ? ejeBreakdownFor(selectedCod, iniciativas, regionEjes) : [],
    [selectedCod, iniciativas, regionEjes],
  )

  const invTotal = regionIniciativas.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
  // Solo iniciativas con monto asignado cuentan en el total mostrado en la tarjeta.
  const regionIniciativasConMonto = regionIniciativas.filter(p => p.inversion_mm != null && p.inversion_mm > 0)
  const invPerCapita = perCapita(invTotal > 0 ? invTotal : null, poblacionRegion)
  // Mostramos el selector cada vez que el usuario tiene acceso a más de una
  // región. Vale para admin/editor (todas), viewer sin asignaciones (todas),
  // regional con varias regiones, y viewer con varias asignadas.
  const showRegionSelector = allowedCods.length > 1

  // ── Minuta handler ───────────────────────────────────────────────────────────

  // Contexto Regional lleva "Minuta DCI N°XX" en el encabezado — el número se
  // pide con un modal propio (numeroModalOpen) antes de llamar a esta función,
  // no con window.prompt() (bloqueado por el sandbox de este entorno).
  // Genera/reusa la minuta y la abre en el modal de PREVIEW (no descarga directo).
  // - Sin `force` y con versión guardada → cache-hit: el server reusa lo guardado.
  // - Con `force` o sin versión → genera (solo admin; el server también lo valida).
  async function openMinuta(tipo: 'ejecutiva' | 'ficha' = 'ejecutiva', force = false, numero?: string) {
    if (!region || downloadingMinuta) return
    setDownloadingMinuta(true)
    setDownloadingTipo(tipo)
    setMinutaMenuOpen(false)
    // Al regenerar reemplazamos el PDF del modal: liberamos el objectURL anterior.
    if (minutaPreview?.url) URL.revokeObjectURL(minutaPreview.url)
    try {
      const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                     'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      const now = new Date()
      const fecha = `${meses[now.getMonth()]} ${now.getFullYear()}`
      const res = await fetch('/api/minuta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ region, fecha, tipo, ...(numero ? { numero } : {}), ...(force ? { force: true } : {}) }),
      })
      if (!res.ok) {
        // El server devuelve JSON {error, detalle?} en 4xx/5xx. Leerlo para
        // mostrar el mensaje real en lugar del "Error genérico" que oculta
        // la causa (RLS, AI timeout, PDF render fallido, etc).
        let detalle = ''
        try {
          const err = await res.json()
          const base = err?.error ?? ''
          detalle = err?.hint ? `${base} (${err.hint})` : (base || '')
        } catch { /* body no era JSON */ }
        throw new Error(detalle ? `${res.status}: ${detalle}` : `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      // Si generamos/regeneramos, la fecha es ahora; si fue cache-hit, la fecha
      // guardada que ya teníamos en el estado.
      const genero = force || !minutaCache[tipo].cached
      const generatedAt = genero ? new Date().toISOString() : minutaCache[tipo].generated_at
      const generatedBy = genero
        ? (profile?.full_name || profile?.email || null)
        : minutaCache[tipo].generated_by
      setMinutaPreview({ tipo, url, generatedAt, generatedBy })
      setMinutaCache(prev => ({ ...prev, [tipo]: { cached: true, generated_at: generatedAt, generated_by: generatedBy } }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[VistaRegional] openMinuta error:', err)
      setToastMsg(`No se pudo abrir la minuta: ${msg}`)
      setTimeout(() => setToastMsg(null), 8000)
    } finally {
      setDownloadingMinuta(false)
      setDownloadingTipo(null)
    }
  }

  function downloadPreview() {
    if (!minutaPreview || !region) return
    const a = document.createElement('a')
    a.href = minutaPreview.url
    a.download = `minuta-${region.nombre.toLowerCase().replace(/\s+/g, '-')}-${minutaPreview.tipo}.pdf`
    a.click()
  }

  function closeMinutaPreview() {
    if (minutaPreview?.url) URL.revokeObjectURL(minutaPreview.url)
    setMinutaPreview(null)
  }

  // Abre el modal de N° DCI antes de generar/regenerar Contexto Regional.
  function openNumeroModal(force = false) {
    setNumeroInput('')
    setNumeroForce(force)
    setNumeroModalOpen(true)
  }

  function confirmNumeroModal() {
    const numero = numeroInput.trim() || undefined
    const force = numeroForce
    setNumeroModalOpen(false)
    openMinuta('ficha', force, numero)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!profile) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Cargando...</div>
  }

  if (allowedCods.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Sin región asignada.</div>
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-[min(72rem,90vw)] mx-auto px-6 py-5">

        {/* Toast */}
        {toastMsg && (
          <div className="fixed top-24 right-4 z-50 bg-red-600 text-white px-4 py-2 rounded-lg text-sm shadow-lg">
            {toastMsg}
          </div>
        )}

        {/* IndicadoresModal — self-contained overlay */}
        {indicadoresOpen && region && (
          <IndicadoresModalV2 region={region} onClose={() => setIndicadoresOpen(false)} />
        )}

        {/* ProposeImportModal — para mandar propuesta de actualización a DCI.
            Solo se monta si hay región activa: el botón que lo abre también
            está gateado por `region`, así que en la práctica siempre estará. */}
        {region && (
          <ProposeImportModal
            open={proposeModalOpen}
            onClose={() => setProposeModalOpen(false)}
            regionName={region.nombre}
            iniciativas={regionIniciativas}
            regionEjes={regionEjes}
            onSubmitted={() => setProposalsRefreshKey(k => k + 1)}
          />
        )}

        {/* El panel de métricas por eje se renderiza ahora inline dentro de
            la sección "Avance por eje" — split en dos columnas. Ver más abajo. */}

        {/* RegionEjesPanel — modal para gestionar el catálogo de ejes de la
            región. Solo admin/editor (RLS lo refuerza). Se abre desde el
            botón "Gestionar ejes" junto al título de "Avance por eje". */}
        {region && (
          <RegionEjesPanel
            open={manageEjesOpen}
            onClose={() => setManageEjesOpen(false)}
            region={region}
            onSaved={refreshRegionEjes}
          />
        )}

        {/* Region selector */}
        {showRegionSelector && (
          <div className="mb-4 flex items-center gap-3">
            <label className="text-xs text-gray-500 font-medium shrink-0">Región:</label>
            <select
              value={selectedCod ?? ''}
              onChange={e => {
                const cod = e.target.value
                const r = REGIONS.find(R => R.cod === cod)
                if (r) onActiveRegionChange(r.nombre)
              }}
              className="text-sm text-slate-900 border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {allowedCods.map(cod => {
                const r = REGIONS.find(r => r.cod === cod)
                return <option key={cod} value={cod}>{r?.nombre ?? cod}</option>
              })}
            </select>
          </div>
        )}

        {/* ── Sección 1: Header strip ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 mb-4">
          <div className="flex items-start justify-between gap-6">
            {/* Left: region name + progress + semáforo */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-3 mb-0.5">
                <h2 className="text-fluid-2xl font-bold text-slate-900 truncate">{region?.nombre ?? '—'}</h2>
                <span className="text-xs text-gray-400 shrink-0">{region?.zona}</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">{regionIniciativas.length} iniciativas · {region?.capital}</p>

              {/* Avance bar */}
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 max-w-xs bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full bg-blue-500 transition-all"
                    style={{ width: `${avgPct}%` }}
                  />
                </div>
                <span className="text-fluid-3xl font-bold text-slate-800 tabular-nums">{avgPct}%</span>
                <span className="text-xs text-gray-400">avance promedio</span>
              </div>

              {/* Semáforo breakdown */}
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"/>
                  <span className="text-green-700 font-semibold">{semaforoCount.verde}</span>
                  <span className="text-gray-400">verde</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400"/>
                  <span className="text-amber-700 font-semibold">{semaforoCount.ambar}</span>
                  <span className="text-gray-400">revisión</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500"/>
                  <span className="text-red-700 font-semibold">{semaforoCount.rojo}</span>
                  <span className="text-gray-400">bloqueado</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-gray-300"/>
                  <span className="text-gray-500 font-semibold">{semaforoCount.gris}</span>
                  <span className="text-gray-400">sin evaluar</span>
                </span>
              </div>
            </div>

            {/* Right: PREGO + action buttons */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {/* PREGO fases */}
              <div className="text-right">
                <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">PREGO</p>
                <div className="flex items-center gap-1">
                  {PREGO_FASES.map((f) => {
                    const estado = prego?.[f.key] ?? 'pendiente'
                    const cfg = PREGO_ESTADO_CONFIG[estado]
                    return (
                      <div
                        key={f.key}
                        title={`${f.label} ${f.sublabel}: ${cfg.label}`}
                        className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold transition-colors ${cfg.pill}`}
                      >
                        {cfg.dot}
                      </div>
                    )
                  })}
                  <span className="text-xs text-gray-400 ml-1">{pregoCompletadas}/{PREGO_FASES.length}</span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex items-center gap-2">
                {region && canPropose && (
                  <button
                    onClick={() => setProposeModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    title="Subir un Excel con cambios para que DCI los revise y apruebe"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9V2M3 5l3-3 3 3M2 10h8"/>
                    </svg>
                    Proponer actualización
                  </button>
                )}
                {region && (
                  <button
                    onClick={() => setIndicadoresOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M1 9l3-3 2 2 3-4 2 2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Indicadores
                  </button>
                )}
                {/* Minuta split button */}
                <div className="relative" data-minuta-menu="true">
                  <div className="flex items-center gap-1">
                    <div className="flex rounded-lg overflow-hidden border border-slate-700 bg-slate-900">
                      <button
                        onClick={() => openMinuta('ejecutiva', false)}
                        disabled={downloadingMinuta || !region || (!isAdmin && !minutaCache.ejecutiva.cached)}
                        title={!isAdmin && !minutaCache.ejecutiva.cached ? 'Aún no hay versión generada. Un administrador debe generarla.' : undefined}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-white text-xs font-medium hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {downloadingMinuta && downloadingTipo === 'ejecutiva' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                              <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                            </svg>
                            {minutaCache.ejecutiva.cached ? 'Abriendo...' : 'Generando...'}
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                              <path d="M2 2h5l3 3v5H2V2z"/><path d="M6 2v4h4"/>
                            </svg>
                            {minutaCache.ejecutiva.cached ? 'Ver Avance PREGO' : 'Generar Avance PREGO'}
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => setMinutaMenuOpen(v => !v)}
                        disabled={downloadingMinuta || !region}
                        className="px-2 py-1.5 text-white hover:bg-slate-700 disabled:opacity-50 transition-colors border-l border-slate-700"
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M2 3.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  {minutaMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg min-w-max py-1">
                      <button
                        onClick={() => minutaCache.ficha.cached ? openMinuta('ficha', false) : openNumeroModal(false)}
                        disabled={downloadingMinuta || (!isAdmin && !minutaCache.ficha.cached)}
                        title={!isAdmin && !minutaCache.ficha.cached ? 'Aún no hay versión generada. Un administrador debe generarla.' : undefined}
                        className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {downloadingMinuta && downloadingTipo === 'ficha' ? (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                              <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4" />
                            </svg>
                            {minutaCache.ficha.cached ? 'Abriendo...' : 'Generando...'}
                          </>
                        ) : (
                          <>
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="6" cy="6" r="4.5"/><line x1="6" y1="3" x2="6" y2="6"/><line x1="6" y1="6" x2="8" y2="7"/>
                            </svg>
                            {minutaCache.ficha.cached ? 'Ver Contexto Regional' : 'Generar Contexto Regional'}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Mis propuestas: estado de cargas enviadas a DCI ────────────────── */}
        <MyProposalsList
          refreshKey={proposalsRefreshKey}
          regionName={region?.nombre}
          onRetry={() => setProposeModalOpen(true)}
        />

        {/* ── Sección 2: Alertas ───────────────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Alertas activas</h3>
          {alertaSinActividad.length === 0 && alertaHitos.length === 0 && alertaRojo.length === 0 && alertaPregoFases.length === 0 ? (
            <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-center gap-3">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#22C55E" strokeWidth="2" strokeLinecap="round">
                <circle cx="9" cy="9" r="7"/>
                <path d="M6 9l2 2 4-4"/>
              </svg>
              <span className="text-sm text-green-700 font-medium">Todo en orden — sin alertas activas</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {alertaRojo.length > 0 && (
                <AlertCard
                  icon="🔴"
                  title={`${alertaRojo.length} iniciativa${alertaRojo.length !== 1 ? 's' : ''} bloqueada${alertaRojo.length !== 1 ? 's' : ''}`}
                  color="red"
                  items={alertaRojo.map(p => ({
                    label: p.nombre,
                    sub: `${p.ministerio ?? 'Sin asignar'} · ${p.pct_avance ?? 0}% avance`,
                  }))}
                />
              )}
              {alertaHitos.length > 0 && (
                <AlertCard
                  icon="📅"
                  title={`${alertaHitos.length} hito${alertaHitos.length !== 1 ? 's' : ''} próximo${alertaHitos.length !== 1 ? 's' : ''} (≤7 días)`}
                  color="amber"
                  items={alertaHitos.map(p => {
                    const dias = diasHastaHito(p.fecha_proximo_hito)
                    const subLabel = dias !== null && dias < 0
                      ? `Vencido hace ${Math.abs(dias)}d`
                      : dias === 0
                      ? 'Hoy'
                      : `En ${dias}d — ${p.proximo_hito ?? ''}`
                    return { label: p.nombre, sub: subLabel, isUrgent: dias !== null && dias <= 0 }
                  })}
                />
              )}
              {alertaSinActividad.length > 0 && (
                <AlertCard
                  icon="🕐"
                  title={`${alertaSinActividad.length} sin actividad (+15 días)`}
                  color="gray"
                  items={alertaSinActividad.map(p => {
                    const dias = diasSinActividad(actividad[p.n])
                    return {
                      label: p.nombre,
                      sub: dias === null ? 'Sin actividad registrada' : `Hace ${dias} días`,
                    }
                  })}
                />
              )}
              {alertaPregoFases.length > 0 && (
                <AlertCard
                  icon="🚧"
                  title={`PREGO: ${alertaPregoFases.length} fase${alertaPregoFases.length !== 1 ? 's' : ''} bloqueada${alertaPregoFases.length !== 1 ? 's' : ''}`}
                  color="red"
                  items={alertaPregoFases.map(f => ({ label: `${f.label}: ${f.sublabel}`, sub: 'Estado: bloqueado' }))}
                />
              )}
            </div>
          )}
        </div>

        {/* ── Sección 3: Avance por eje (con split lateral cuando se selecciona uno) ──
            Render incondicional para que el botón "Gestionar ejes" siga visible
            aunque la región no tenga catálogo todavía (caso región nueva, sin
            iniciativas todavía cargadas). */}
        {region && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avance por eje estratégico</h3>
              {canEditAny && (
                <button
                  onClick={() => setManageEjesOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-slate-700 transition-colors"
                  title="Gestionar catálogo de ejes de la región"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <circle cx="6" cy="6" r="1.6"/>
                    <path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M2.46 2.46l1.06 1.06M8.48 8.48l1.06 1.06M2.46 9.54l1.06-1.06M8.48 3.52l1.06-1.06" strokeLinecap="round"/>
                  </svg>
                  Gestionar ejes
                </button>
              )}
            </div>

            {ejeData.length === 0 && (
              <p className="text-xs text-gray-400 italic">
                {regionEjes.length === 0
                  ? 'Esta región aún no tiene ejes en el catálogo.'
                  : 'El catálogo está definido pero no hay iniciativas asociadas todavía.'}
                {canEditAny && regionEjes.length === 0 && ' Definí los ejes desde "Gestionar ejes".'}
              </p>
            )}
            {/* Container flex — la transición real ocurre en los hijos (ancho,
                opacidad, layout interno). Duración larga + ease-out para que
                el paso de "modo general" a "modo detalle" se sienta como un
                respiro y no como un corte. */}
            {ejeData.length > 0 && (
              <div className="flex flex-col lg:flex-row gap-3">
                {/* Grid de ejes: a full width sin selección, se comprime a una col al abrir el panel.
                    Bajo lg (<1024px), el grid y el drawer apilan vertical en lugar de splitearse 40/60. */}
                <div
                  className={`transition-all duration-300 ease-out ${
                    selectedEjeIdForMetrics
                      ? 'w-full lg:w-2/5 grid grid-cols-1 gap-2'
                      : 'w-full grid grid-cols-2 lg:grid-cols-3 gap-3'
                  }`}
                >
                  {ejeData.map(({ ejeId, numero, nombre, avgPct: ejePct, total, verde, ambar, rojo, invSum }) => {
                    const barColor = ejePct >= 70 ? 'bg-green-500' : ejePct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                    const isSelected = selectedEjeIdForMetrics === ejeId
                    // En modo split usamos cards más compactas (menos padding, layout horizontal).
                    const compact = !!selectedEjeIdForMetrics
                    return (
                      <div
                        key={ejeId}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedEjeIdForMetrics(isSelected ? null : ejeId)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedEjeIdForMetrics(isSelected ? null : ejeId) } }}
                        className={`group bg-white rounded-xl shadow-sm text-left cursor-pointer hover:shadow-md transition-all duration-300 ease-out relative ${
                          compact ? 'p-3' : 'p-4'
                        } ${isSelected
                            ? 'border-2 border-dashed border-green-400 bg-green-50/30'
                            : 'border border-gray-100 hover:border-slate-300'}`}
                        title={isSelected ? 'Click para cerrar métricas' : 'Ver métricas de este eje'}
                      >
                        <div className={compact ? 'flex items-center gap-3' : ''}>
                          <div className={compact ? 'flex-shrink-0' : ''}>
                            <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 ${compact ? '' : 'mb-2'}`}>
                              Eje {numero}
                            </span>
                          </div>
                          <div className={compact ? 'flex-1 min-w-0' : ''}>
                            {!compact && (
                              <p className="text-xs font-semibold text-slate-700 mb-3 leading-tight line-clamp-2">{nombre}</p>
                            )}
                            {compact && (
                              <p className="text-xs font-semibold text-slate-700 leading-tight line-clamp-1 mb-1">{nombre}</p>
                            )}
                            <div className="flex items-center gap-2 mb-1">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                                <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${ejePct}%` }} />
                              </div>
                              <span className="text-xs font-bold text-slate-800 tabular-nums">{ejePct}%</span>
                            </div>
                            {!compact && (
                              <>
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                  <div className="flex items-center gap-1.5">
                                    {rojo  > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-red-500"/>{rojo}</span>}
                                    {ambar > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>{ambar}</span>}
                                    {verde > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500"/>{verde}</span>}
                                  </div>
                                  <span>{total} init.</span>
                                </div>
                                {invSum > 0 && (
                                  <p className="text-[10px] text-gray-400 mt-1.5">
                                    ${Math.round(invSum).toLocaleString('es-CL')} MM inversión
                                  </p>
                                )}
                              </>
                            )}
                            {compact && (
                              <p className="text-[10px] text-gray-400">{total} init.{invSum > 0 ? ` · $${Math.round(invSum).toLocaleString('es-CL')} MM` : ''}</p>
                            )}
                          </div>
                          {!compact && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="absolute top-3 right-3 text-gray-300 group-hover:text-slate-500 transition-colors">
                              <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Panel lateral: se monta solo cuando hay eje seleccionado.
                    El drawer internamente entra con fade + slide para que el
                    reflow de la grid de la izquierda no compita con su aparición. */}
                {selectedEjeIdForMetrics != null && region && (() => {
                  const selectedEje = regionEjes.find(e => e.id === selectedEjeIdForMetrics)
                  if (!selectedEje) return null
                  return (
                    <div className="w-full lg:w-3/5">
                      <MetricasEjeDrawer
                        region={region}
                        eje={selectedEje}
                        onClose={() => setSelectedEjeIdForMetrics(null)}
                      />
                    </div>
                  )
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── Sección 4: Métricas clave ────────────────────────────────────────── */}
        <div className="mb-4">
          <MetricasClaveSection region={region} />
          {/* Tarjeta "Inversión" — deshabilitada visualmente (se sacó de Métricas
              clave al unificar con la pestaña Métricas), pero se deja lista por si
              se decide reincorporarla: solo hay que cambiar SHOW_INVERSION_CARD. */}
          {SHOW_INVERSION_CARD && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mt-3">
              <MetricCard
                title="Inversión"
                subtitle="Iniciativas región"
                value={invTotal > 0 ? `$${Math.round(invTotal).toLocaleString('es-CL')} MM` : '—'}
                comparisonLabel={invPerCapita != null ? `$${Math.round(invPerCapita).toLocaleString('es-CL')} per cápita · ${regionIniciativasConMonto.length} iniciativas` : `${regionIniciativasConMonto.length} iniciativas`}
                trend={null}
                trendDown={false}
              />
            </div>
          )}
        </div>

        {/* ── Sección 5: Pipeline externo ──────────────────────────────────────── */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Pipeline externo</h3>
          <div className="grid grid-cols-2 gap-3">
            {/* SEIA */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🌿</span>
                <span className="text-xs font-semibold text-gray-700">SEIA — Evaluación Ambiental</span>
              </div>
              <p className="text-fluid-2xl font-bold text-slate-800 tabular-nums">{seiaTotal}</p>
              <p className="text-xs text-gray-400 mt-0.5">proyectos en evaluación</p>
              {seiaProjects.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  Inversión: ${Math.round(
                    seiaProjects.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
                  ).toLocaleString('es-CL')} MM
                </p>
              )}
              <p className="text-[10px] text-gray-300 mt-3">Sync: lunes 8am UTC</p>
            </div>

            {/* MOP */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">🏗</span>
                <span className="text-xs font-semibold text-gray-700">MOP — Obras Públicas</span>
              </div>
              <p className="text-fluid-2xl font-bold text-slate-800 tabular-nums">{mopTotal}</p>
              <p className="text-xs text-gray-400 mt-0.5">proyectos de infraestructura</p>
              {mopProjects.length > 0 && (() => {
                const etapas: Record<string, number> = {}
                for (const p of mopProjects) {
                  if (p.etapa) etapas[p.etapa] = (etapas[p.etapa] ?? 0) + 1
                }
                const top2 = Object.entries(etapas).sort((a, b) => b[1] - a[1]).slice(0, 2)
                return top2.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {top2.map(([etapa, n]) => (
                      <span key={etapa} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        {etapa} ({n})
                      </span>
                    ))}
                  </div>
                ) : null
              })()}
              <p className="text-[10px] text-gray-300 mt-3">Sync: lunes 9am UTC</p>
            </div>
          </div>
        </div>

      </div>

      {/* ── Modal: N° de Minuta DCI (Contexto Regional) ────────────────────── */}
      {numeroModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setNumeroModalOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-gray-900 mb-1">N° de Minuta DCI</h3>
            <p className="text-xs text-gray-500 mb-3">Aparece en el encabezado como &quot;Minuta DCI N°XX&quot;.</p>
            <input
              type="text"
              autoFocus
              value={numeroInput}
              onChange={e => setNumeroInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') confirmNumeroModal() }}
              placeholder="Ej: 61"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setNumeroModalOpen(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={confirmNumeroModal}
                className="px-3 py-1.5 text-xs text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-medium"
              >
                {numeroForce ? 'Regenerar' : 'Generar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: preview de la minuta guardada (PDF embebido) ────────────── */}
      {minutaPreview && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={closeMinutaPreview}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[88vh] mx-4 flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Encabezado: título + fecha de generación */}
            <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {minutaPreview.tipo === 'ficha' ? 'Contexto Regional' : 'Avance PREGO'}
                  {region ? ` · ${region.nombre}` : ''}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {minutaPreview.generatedAt
                    ? `Generada el ${new Date(minutaPreview.generatedAt).toLocaleString('es-CL', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}${minutaPreview.generatedBy ? ` · ${minutaPreview.generatedBy}` : ''}`
                    : 'Versión guardada'}
                </p>
              </div>
              <button
                onClick={closeMinutaPreview}
                title="Cerrar"
                className="p-1 text-gray-400 hover:text-gray-700 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8"/>
                </svg>
              </button>
            </div>
            {/* PDF embebido */}
            <div className="flex-1 bg-gray-100">
              <iframe src={minutaPreview.url} title="Previsualización de minuta" className="w-full h-full" />
            </div>
            {/* Acciones */}
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-gray-200">
              <span className="text-[11px] text-gray-400">
                {isAdmin
                  ? 'Versión guardada. Puedes descargarla o regenerarla.'
                  : 'Versión guardada. Solo un administrador puede regenerarla.'}
              </span>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => minutaPreview.tipo === 'ficha' ? openNumeroModal(true) : openMinuta('ejecutiva', true)}
                    disabled={downloadingMinuta}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 6a5 5 0 1 0 1-3"/><path d="M1 1v3h3"/>
                    </svg>
                    Regenerar
                  </button>
                )}
                <button
                  onClick={downloadPreview}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 1v7M3 5l3 3 3-3M1 11h10"/>
                  </svg>
                  Descargar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Minuta loading overlay ─────────────────────────────────────────── */}
      {downloadingMinuta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xs mx-4 px-6 py-8 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1a2744" strokeWidth="2" className="animate-spin mx-auto mb-4">
              <circle cx="12" cy="12" r="10" strokeDasharray="31" strokeDashoffset="10" strokeLinecap="round" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">
              {minutaCache[downloadingTipo ?? 'ejecutiva']?.cached
                ? 'Abriendo minuta...'
                : 'Generando minuta con IA...'}
            </h3>
            <p className="text-xs text-gray-500">
              {minutaCache[downloadingTipo ?? 'ejecutiva']?.cached
                ? 'Cargando la versión guardada.'
                : downloadingTipo === 'ficha'
                  ? 'Compilando datos regionales para el Contexto Regional. Esto toma unos segundos.'
                  : 'Analizando datos regionales y generando el Avance PREGO. Esto puede tomar hasta 20 segundos.'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
