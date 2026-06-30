'use client'

/**
 * Preview compacto del Dashboard regional. Se muestra al hacer click sobre
 * una región del Mapa. Reemplaza al ProjectsPanel viejo (que era un Kanban
 * con polígonos arriba) — ahora es síntesis ejecutiva con perspectiva nacional.
 *
 * Estructura:
 *   1. Header: nombre + zona + capital + N iniciativas + barra avance con
 *      delta vs promedio nacional + 4 chips RAG + PREGO dots + label de
 *      fase actual.
 *   2. 3 KPI cards: Atención (suma de alertas) / Próximo hito ≤7d /
 *      Última actividad (con nombre de iniciativa).
 *   3. Avance por eje (TODOS los ejes en barras horizontales) — sin cutoff
 *      a top 3 para no esconder problemas.
 *   4. Footer con CTAs: "Ver N iniciativas en Kanban" + "Ver Mi Región".
 *
 * Sin botones de escritura — todo es lectura. El usuario que quiera actuar
 * usa el CTA "Ver Mi Región" para saltar al dashboard completo (VistaRegional).
 *
 * El ancho lo controla WorkOSApp (CSS var `--preview-pct`) para que el drag
 * right-to-left desde el borde izquierdo pueda expandirlo hasta disparar el
 * switch a `vista-regional`.
 */

import { useEffect, useState, useMemo } from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { PregoRow, PregoEstado } from '@/lib/types'
import { PREGO_FASES, PREGO_ESTADO_CONFIG } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { useRegionEjes } from '@/lib/hooks/useRegionEjes'
import {
  diasHastaHito,
  iniciativasDeRegion,
  iniciativasEnRojo,
  iniciativasConHitoCritico,
  iniciativasSinActividad,
  ejeBreakdownFor,
  ultimaActividadConIniciativa,
} from '@/lib/regionSummary'

type Props = {
  region:           Region
  projects:         Iniciativa[]
  actividad:        Record<number, string | null>
  /** Promedio nacional de avance — usado para mostrar delta vs región. */
  nationalAvgPct:   number
  onClose:          () => void
  onGoToKanban:     () => void
  onGoToDashboard:  () => void
}

// ── PREGO helper ──────────────────────────────────────────────────────────────

/**
 * Fase actual del PREGO según prioridad: primer bloqueado, después primer
 * en_curso, después primer pendiente. Si todas están completadas, devuelve
 * "Todo completo". Si no hay info, null.
 */
function pregoFaseActual(prego: PregoRow | null): { fase: string; estado: PregoEstado | 'todo_completo' } | null {
  if (!prego) return null
  const buscar = (estado: PregoEstado) => {
    for (const f of PREGO_FASES) {
      if (prego[f.key] === estado) return f
    }
    return null
  }
  const bloqueado = buscar('bloqueado')
  if (bloqueado) return { fase: `${bloqueado.label} ${bloqueado.sublabel}`, estado: 'bloqueado' }
  const enCurso = buscar('en_curso')
  if (enCurso) return { fase: `${enCurso.label} ${enCurso.sublabel}`, estado: 'en_curso' }
  const pendiente = buscar('pendiente')
  if (pendiente) return { fase: `${pendiente.label} ${pendiente.sublabel}`, estado: 'pendiente' }
  return { fase: 'Todo completo', estado: 'todo_completo' }
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function RegionPreviewPanel({
  region,
  projects,
  actividad,
  nationalAvgPct,
  onClose,
  onGoToKanban,
  onGoToDashboard,
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
  const deltaPct = avgPct - nationalAvgPct  // positivo = región va mejor que el promedio

  const semaforo = useMemo(() => ({
    verde: regionIniciativas.filter(p => p.estado_semaforo === 'verde').length,
    ambar: regionIniciativas.filter(p => p.estado_semaforo === 'ambar').length,
    rojo:  regionIniciativas.filter(p => p.estado_semaforo === 'rojo').length,
    gris:  regionIniciativas.filter(p => p.estado_semaforo === 'gris').length,
  }), [regionIniciativas])

  const pregoCompletadas = prego
    ? PREGO_FASES.filter(f => prego[f.key] === 'completado').length
    : 0
  const faseActual = pregoFaseActual(prego)

  // Alertas (counts agregados para la KPI card de Atención).
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
  const totalAlertas = alertaRojo.length + alertaHitos.length + alertaSinActividad.length

  // Próximo hito más urgente (primero en la lista ordenada por urgencia ASC).
  const proximoHito = alertaHitos[0] ?? null
  const proximoHitoDias = proximoHito ? diasHastaHito(proximoHito.fecha_proximo_hito) : null

  // Última actividad con nombre de iniciativa.
  const ultimaActividad = useMemo(
    () => ultimaActividadConIniciativa(region.cod, projects, actividad),
    [region.cod, projects, actividad],
  )

  // Breakdown completo de ejes (TODOS, no cutoff a 3). Ordenado por número
  // ascendente para mantener el orden estructural del catálogo.
  const ejes = useMemo(
    () => ejeBreakdownFor(region.cod, projects, regionEjes),
    [region.cod, projects, regionEjes],
  )

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative h-full bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header strip */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h2 className="text-fluid-xl font-bold text-slate-900 truncate">{region.nombre}</h2>
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

        {/* Avance bar + delta vs nacional */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 bg-gray-100 rounded-full h-2.5">
            <div
              className="h-2.5 rounded-full bg-blue-500 transition-all"
              style={{ width: `${avgPct}%` }}
            />
          </div>
          <span className="text-fluid-xl font-bold text-slate-800 tabular-nums w-12 text-right">{avgPct}%</span>
        </div>
        <div className="flex items-center gap-2 mb-3 text-[11px]">
          <DeltaBadge delta={deltaPct} />
          <span className="text-gray-400">vs nacional {nationalAvgPct}%</span>
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

        {/* PREGO pills + label fase actual */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider mr-1">PREGO</span>
            {PREGO_FASES.map((f) => {
              const estado = prego?.[f.key] ?? 'pendiente'
              const cfg = PREGO_ESTADO_CONFIG[estado]
              return (
                <div
                  key={f.key}
                  title={`${f.label} ${f.sublabel}: ${cfg.label}`}
                  className={`w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold ${cfg.pill}`}
                >
                  {cfg.dot}
                </div>
              )
            })}
            <span className="text-[11px] text-gray-400 ml-1 tabular-nums">{pregoCompletadas}/{PREGO_FASES.length}</span>
          </div>
          {faseActual && (
            <span className="text-[11px] text-gray-500 truncate">
              <span className="text-gray-400">Fase actual:</span>{' '}
              <span className={`font-medium ${
                faseActual.estado === 'bloqueado' ? 'text-red-700'
                : faseActual.estado === 'en_curso' ? 'text-amber-700'
                : faseActual.estado === 'todo_completo' ? 'text-green-700'
                : 'text-slate-700'
              }`}>
                {faseActual.fase}
                {faseActual.estado === 'bloqueado' && ' (bloqueada)'}
                {faseActual.estado === 'en_curso' && ' (en curso)'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Cuerpo scrolleable */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* 3 KPI cards */}
        <section className="grid grid-cols-3 gap-2">
          {/* KPI 1: Atención */}
          <div className="rounded-xl border border-gray-100 bg-slate-50/60 p-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Atención</p>
            <p className={`text-fluid-2xl font-bold tabular-nums leading-none ${totalAlertas > 0 ? 'text-red-700' : 'text-slate-400'}`}>
              {totalAlertas}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              {totalAlertas === 0
                ? 'Sin alertas'
                : `${alertaRojo.length}R · ${alertaHitos.length}H · ${alertaSinActividad.length}SA`}
            </p>
          </div>

          {/* KPI 2: Próximo hito */}
          <div className="rounded-xl border border-gray-100 bg-slate-50/60 p-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Próximo hito</p>
            {proximoHito && proximoHitoDias !== null ? (
              <>
                <p className={`text-fluid-2xl font-bold tabular-nums leading-none ${
                  proximoHitoDias < 0 ? 'text-red-700'
                  : proximoHitoDias <= 2 ? 'text-amber-700'
                  : 'text-slate-700'
                }`}>
                  {proximoHitoDias < 0 ? `-${Math.abs(proximoHitoDias)}d` : `${proximoHitoDias}d`}
                </p>
                <p className="text-[10px] text-gray-500 mt-1 truncate" title={proximoHito.nombre}>
                  {proximoHito.nombre}
                </p>
              </>
            ) : (
              <>
                <p className="text-fluid-2xl font-bold tabular-nums leading-none text-slate-400">—</p>
                <p className="text-[10px] text-gray-400 mt-1">Sin hitos próximos</p>
              </>
            )}
          </div>

          {/* KPI 3: Última actividad */}
          <div className="rounded-xl border border-gray-100 bg-slate-50/60 p-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Última actividad</p>
            {ultimaActividad ? (
              <>
                <p className="text-fluid-2xl font-bold tabular-nums leading-none text-slate-700">
                  {ultimaActividad.dias === 0 ? 'Hoy' : ultimaActividad.dias === 1 ? '1d' : `${ultimaActividad.dias}d`}
                </p>
                <p className="text-[10px] text-gray-500 mt-1 truncate" title={ultimaActividad.iniciativa.nombre}>
                  {ultimaActividad.iniciativa.nombre}
                </p>
              </>
            ) : (
              <>
                <p className="text-fluid-2xl font-bold tabular-nums leading-none text-slate-400">—</p>
                <p className="text-[10px] text-gray-400 mt-1">Sin registros</p>
              </>
            )}
          </div>
        </section>

        {/* Avance por eje — TODOS los ejes */}
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avance por eje</h3>
            <span className="text-[11px] text-gray-400">{ejes.length}</span>
          </div>
          {ejes.length === 0 ? (
            <div className="text-xs text-gray-400 italic px-2 py-3">
              Esta región todavía no tiene ejes catalogados.
            </div>
          ) : (
            <div className="space-y-1.5">
              {ejes.map(e => {
                const necesitaAtencion = e.total > 0 && e.avgPct < 30
                const barColor = e.total === 0 ? 'bg-gray-200'
                              : e.avgPct >= 60 ? 'bg-blue-500'
                              : e.avgPct >= 30 ? 'bg-amber-400'
                              : 'bg-red-400'
                return (
                  <div
                    key={e.ejeId}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    {/* Número + nombre del eje */}
                    <div className="flex items-baseline gap-1.5 w-32 min-w-0 shrink-0">
                      <span className="text-gray-400 tabular-nums w-3 text-right">{e.numero}</span>
                      <span className={`truncate ${e.total === 0 ? 'text-gray-400' : 'text-slate-700 font-medium'}`} title={e.nombre}>
                        {e.nombre}
                      </span>
                    </div>
                    {/* Barra */}
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 min-w-0">
                      <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${e.avgPct}%` }} />
                    </div>
                    {/* % + count + RAG */}
                    <span className="tabular-nums w-8 text-right text-slate-700 font-semibold">
                      {e.avgPct}%
                    </span>
                    <span className="tabular-nums text-gray-400 w-3 text-right">{e.total}</span>
                    {necesitaAtencion && (
                      <span className="text-red-600 font-medium text-[10px] shrink-0">atención</span>
                    )}
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
          <span>Ver {regionIniciativas.length} {regionIniciativas.length === 1 ? 'iniciativa' : 'iniciativas'} en Gabinete</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 3l4 4-4 4"/>
          </svg>
        </button>
        <button
          onClick={onGoToDashboard}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
        >
          <span>Ver Mi Región</span>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M5 3l4 4-4 4"/>
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── DeltaBadge ────────────────────────────────────────────────────────────────

/** Badge de delta vs nacional. Color verde si la región va mejor (positivo
 *  con `betterIsHigher` true), rojo si va peor. Gris si delta == 0. */
function DeltaBadge({ delta }: { delta: number }) {
  const rounded = Math.round(delta)
  if (rounded === 0) {
    return <span className="text-gray-500 font-medium">= nacional</span>
  }
  const isUp = rounded > 0
  const color = isUp ? 'text-green-700' : 'text-red-700'
  const arrow = isUp ? '↑' : '↓'
  return (
    <span className={`font-semibold ${color}`}>
      {arrow} {Math.abs(rounded)}pp
    </span>
  )
}
