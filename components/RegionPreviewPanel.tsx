'use client'

/**
 * Preview compacto del Dashboard regional. Reemplaza a ProjectsPanel cuando
 * el usuario hace click sobre una región en el Mapa. Las 3 piezas de mayor
 * valor del dashboard completo:
 *
 *   1. Header strip: nombre + zona + avance + chips RAG + pills PREGO
 *   2. Alertas top 3 (rojo, hito próximo, sin actividad)
 *   3. Top 3 ejes por urgencia (avgPct ASC)
 *
 * Sin botones de escritura — todo es lectura. El usuario que quiera actuar
 * usa el CTA "Ver dashboard completo" para saltar a VistaRegional, donde sí
 * viven los botones (Proponer actualización, Generar minuta, etc.).
 *
 * El ancho lo controla WorkOSApp (state `previewWidthPct`) para que el drag
 * right-to-left pueda expandirlo hasta disparar el switch a Dashboard.
 */

import { useEffect, useState, useMemo } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { PregoRow } from '@/lib/types'
import { PREGO_FASES, PREGO_ESTADO_CONFIG } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import AlertCard, { type AlertItem } from './AlertCard'
import {
  diasSinActividad,
  diasHastaHito,
  iniciativasDeRegion,
  iniciativasEnRojo,
  iniciativasConHitoCritico,
  iniciativasSinActividad,
  ejeBreakdownFor,
  topEjesPorAtencion,
} from '@/lib/regionSummary'

type Props = {
  region:           Region
  projects:         Iniciativa[]
  actividad:        Record<number, string | null>
  onClose:          () => void
  onGoToKanban:     () => void
  onGoToDashboard:  () => void
  /** Handlers del drag desde el borde izquierdo. Si onPointerDown es null,
   *  el handle no se renderiza (sin gesto disponible). */
  onPointerDownDragHandle?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMoveDragHandle?: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUpDragHandle?:   (e: React.PointerEvent<HTMLDivElement>) => void
}

export default function RegionPreviewPanel({
  region,
  projects,
  actividad,
  onClose,
  onGoToKanban,
  onGoToDashboard,
  onPointerDownDragHandle,
  onPointerMoveDragHandle,
  onPointerUpDragHandle,
}: Props) {
  const [prego, setPrego] = useState<PregoRow | null>(null)
  const { ejes: regionEjes } = useRegionEjes(region.cod)

  // Fetch PREGO para la región — mismo patrón que VistaRegional.
  useEffect(() => {
    let cancelled = false
    setPrego(null)
    getSupabase()
      .from('prego_monitoreo')
      .select('*')
      .eq('region_cod', region.cod)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setPrego(data as PregoRow | null)
      })
    return () => { cancelled = true }
  }, [region.cod])

  // ── Cómputos ───────────────────────────────────────────────────────────────

  const regionIniciativas = useMemo(
    () => iniciativasDeRegion(region.cod, projects),
    [region.cod, projects],
  )

  const avgPct = regionIniciativas.length > 0
    ? Math.round(regionIniciativas.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / regionIniciativas.length)
    : 0

  const semaforo = useMemo(() => ({
    verde: regionIniciativas.filter(p => p.estado_semaforo === 'verde').length,
    ambar: regionIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
    rojo:  regionIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
    gris:  regionIniciativas.filter(p => p.estado_semaforo === 'gris').length,
  }), [regionIniciativas])

  const pregoCompletadas = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'completado').length
    : 0

  // Alertas (full lists para los counts; slice al renderizar las cards)
  const alertaRojo = useMemo(
    () => iniciativasEnRojo(region.cod, projects),
    [region.cod, projects],
  )
  const alertaHitos = useMemo(
    () => iniciativasConHitoCritico(region.cod, projects),
    [region.cod, projects],
  )
  const alertaSinActividad = useMemo(
    () => iniciativasSinActividad(region.cod, projects, actividad),
    [region.cod, projects, actividad],
  )

  const itemsRojo: AlertItem[] = alertaRojo.slice(0, 3).map(p => ({
    label:   p.nombre,
    sub:     p.ministerio ?? p.eje ?? '',
    isUrgent: true,
  }))
  const itemsHitos: AlertItem[] = alertaHitos.slice(0, 3).map(p => {
    const d = diasHastaHito(p.fecha_proximo_hito)
    const sub = d === null ? '' : d < 0 ? `Vencido hace ${Math.abs(d)} días` : d === 0 ? 'Hoy' : `En ${d} días`
    return { label: p.nombre, sub, isUrgent: d !== null && d <= 0 }
  })
  const itemsSinActividad: AlertItem[] = alertaSinActividad.slice(0, 3).map(p => {
    const d = diasSinActividad(actividad[p.n])
    const sub = d === null ? 'Sin actividad registrada' : `Hace ${d} días`
    return { label: p.nombre, sub }
  })

  // Top 3 ejes por urgencia
  const topEjes = useMemo(
    () => topEjesPorAtencion(ejeBreakdownFor(region.cod, projects, regionEjes), 3),
    [region.cod, projects, regionEjes],
  )

  const totalAlertas = alertaRojo.length + alertaHitos.length + alertaSinActividad.length

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Drag handle (borde izquierdo) — opcional */}
      {onPointerDownDragHandle && (
        <div
          onPointerDown={onPointerDownDragHandle}
          onPointerMove={onPointerMoveDragHandle}
          onPointerUp={onPointerUpDragHandle}
          onPointerCancel={onPointerUpDragHandle}
          className="absolute left-0 top-0 bottom-0 w-2 z-20 cursor-ew-resize group touch-none"
          title="Arrastra a la izquierda para abrir el dashboard completo"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-gray-200 group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
        </div>
      )}

      {/* Header strip */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-lg font-bold text-slate-900 truncate">{region.nombre}</h2>
              <span className="text-xs text-gray-400 shrink-0">{region.zona}</span>
            </div>
            <p className="text-xs text-gray-400">{regionIniciativas.length} iniciativas · {region.capital}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
            title="Cerrar"
            aria-label="Cerrar preview"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8"/>
            </svg>
          </button>
        </div>

        {/* Avance bar */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-blue-500 transition-all"
              style={{ width: `${avgPct}%` }}
            />
          </div>
          <span className="text-xl font-bold text-slate-800 tabular-nums w-12 text-right">{avgPct}%</span>
        </div>

        {/* Semáforo */}
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500"/>
            <span className="text-green-700 font-semibold">{semaforo.verde}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400"/>
            <span className="text-amber-700 font-semibold">{semaforo.ambar}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500"/>
            <span className="text-red-700 font-semibold">{semaforo.rojo}</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300"/>
            <span className="text-gray-500 font-semibold">{semaforo.gris}</span>
          </span>
        </div>

        {/* PREGO pills */}
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mr-1">PREGO</span>
          {PREGO_FASES.map((f) => {
            const estado = prego?.[f.key] ?? 'pendiente'
            const cfg = PREGO_ESTADO_CONFIG[estado]
            return (
              <div
                key={f.key}
                title={`${f.label} ${f.sublabel}: ${cfg.label}`}
                className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center font-bold ${cfg.pill}`}
              >
                {cfg.dot}
              </div>
            )
          })}
          <span className="text-xs text-gray-400 ml-1">{pregoCompletadas}/{PREGO_FASES.length}</span>
        </div>
      </div>

      {/* Cuerpo scrolleable: alertas + ejes */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Alertas top 3 (3 cards en grid si hay espacio) */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Alertas críticas</h3>
            {totalAlertas > 0 && (
              <span className="text-[11px] text-gray-400">{totalAlertas} en total</span>
            )}
          </div>
          {totalAlertas === 0 ? (
            <div className="text-xs text-gray-400 italic px-2 py-3">Sin alertas críticas en esta región.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {itemsRojo.length > 0 && (
                <AlertCard icon="●" title={`En rojo (${alertaRojo.length})`} color="red"   items={itemsRojo} />
              )}
              {itemsHitos.length > 0 && (
                <AlertCard icon="◐" title={`Hitos ≤ 7 días (${alertaHitos.length})`} color="amber" items={itemsHitos} />
              )}
              {itemsSinActividad.length > 0 && (
                <AlertCard icon="○" title={`Sin actividad >15d (${alertaSinActividad.length})`} color="gray"  items={itemsSinActividad} />
              )}
            </div>
          )}
        </section>

        {/* Top 3 ejes por urgencia */}
        <section>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Ejes que requieren atención</h3>
          {topEjes.length === 0 ? (
            <div className="text-xs text-gray-400 italic px-2 py-3">
              {regionEjes.length === 0
                ? 'Esta región todavía no tiene ejes catalogados.'
                : 'Sin iniciativas asignadas a los ejes del catálogo.'}
            </div>
          ) : (
            <div className="space-y-2">
              {topEjes.map(e => {
                const barColor = e.avgPct >= 60 ? 'bg-blue-500' : e.avgPct >= 30 ? 'bg-amber-400' : 'bg-red-400'
                return (
                  <div key={e.ejeId} className="rounded-lg border border-gray-100 p-3 bg-slate-50/40">
                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 truncate">
                        Eje {e.numero}: {e.nombre}
                      </span>
                      <span className="text-sm font-bold text-slate-800 tabular-nums">{e.avgPct}%</span>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                        <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${e.avgPct}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-gray-400">{e.total} {e.total === 1 ? 'iniciativa' : 'iniciativas'}</span>
                      {e.verde > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
                          <span className="text-green-700 font-medium">{e.verde}</span>
                        </span>
                      )}
                      {e.ambar > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
                          <span className="text-amber-700 font-medium">{e.ambar}</span>
                        </span>
                      )}
                      {e.rojo > 0 && (
                        <span className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
                          <span className="text-red-700 font-medium">{e.rojo}</span>
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>

      {/* Footer con CTAs */}
      <div className="border-t border-gray-100 px-5 py-3 bg-white space-y-2">
        <button
          onClick={onGoToKanban}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>Ver {regionIniciativas.length} {regionIniciativas.length === 1 ? 'iniciativa' : 'iniciativas'} en Kanban</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 3l4 4-4 4"/>
          </svg>
        </button>
        <button
          onClick={onGoToDashboard}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <span>Ver dashboard completo</span>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-300 font-normal">
            <span className="hidden md:inline">o arrastra ←</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 3l4 4-4 4"/>
            </svg>
          </span>
        </button>
      </div>
    </div>
  )
}
