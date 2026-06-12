'use client'

/**
 * Sidebar derecho del Mapa cuando NO hay región seleccionada. Reemplaza el
 * bloque "Situación general" que vivía inline en WorkOSApp.tsx — la versión
 * vieja era una lista plana de 16 filas que solo mostraba progreso/RAG y la
 * única acción era "Click en otra región del mapa". Esta versión es accionable:
 * cada fila muestra avance + RAG + última actividad + count de alertas
 * críticas, y al click abre el preview de la región (mismo handler que el
 * polígono del mapa). Hover sobre la fila resalta el polígono correspondiente.
 *
 * Orden por defecto: geográfico (norte-sur, como el array REGIONS). Toggle a
 * "por urgencia" pone las más rezagadas arriba — útil para decidir dónde mirar
 * primero. No es un cambio de paradigma: el usuario que conoce el mapa de
 * memoria mantiene su orden mental.
 */

import { useMemo, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import { getRegionColor } from '@/lib/regionColors'
import {
  criticalAlertCountFor,
  diasDesdeUltimaActividad,
} from '@/lib/regionSummary'

type RagCounts = { rojo: number; ambar: number; verde: number; gris?: number }

type Props = {
  projects:        Iniciativa[]
  actividad:       Record<number, string | null>
  projectCounts:   Record<string, number>
  globalAvgPct:    number
  globalRag:       RagCounts
  totalIniciativas: number
  lockedRegions?:  string[]
  ragFor:          (regionName: string) => { rojo: number; ambar: number; verde: number }
  avgPctFor:       (regionName: string) => number
  onSelectRegion:  (regionName: string, cod: string) => void
  /** Opcional: notifica al mapa qué cod está hover para que resalte el polígono. */
  onHoverRegion?:  (cod: string | null) => void
  /** Ancho actual del sidebar en píxeles. Lo controla WorkOSApp para persistir
   *  la preferencia del usuario entre sesiones. */
  width:           number
  /** Handler del drag para el resize. Si null, no se renderiza el handle. */
  onResizeStart?:  (e: React.PointerEvent<HTMLDivElement>) => void
}

type SortMode = 'geografico' | 'urgencia'

export default function MapaSummarySidebar({
  projects,
  actividad,
  projectCounts,
  globalAvgPct,
  globalRag,
  totalIniciativas,
  lockedRegions = [],
  ragFor,
  avgPctFor,
  onSelectRegion,
  onHoverRegion,
  width,
  onResizeStart,
}: Props) {
  const [sortMode, setSortMode] = useState<SortMode>('geografico')

  // Pre-calculamos todas las métricas por región una vez. La lista de 16 es
  // chica pero el orderBy depende de avgPct y queremos evitar recomputar en
  // cada render del hover (que es alto-frecuencia).
  const filas = useMemo(() => {
    const base = REGIONS.map(region => ({
      region,
      count:    projectCounts[region.nombre] ?? 0,
      avgPct:   avgPctFor(region.nombre),
      rag:      ragFor(region.nombre),
      alertas:  criticalAlertCountFor(region.cod, projects, actividad),
      dias:     diasDesdeUltimaActividad(region.cod, projects, actividad),
      isLocked: lockedRegions.includes(region.cod),
    }))
    if (sortMode === 'urgencia') {
      // Locked al final, después por avance ASC (rezagadas arriba), desempate
      // por alertas DESC.
      return [...base].sort((a, b) => {
        if (a.isLocked !== b.isLocked) return a.isLocked ? 1 : -1
        if (a.avgPct !== b.avgPct) return a.avgPct - b.avgPct
        return b.alertas - a.alertas
      })
    }
    return base
  }, [projects, actividad, projectCounts, ragFor, avgPctFor, lockedRegions, sortMode])

  return (
    <div
      className="flex-shrink-0 bg-white border-l border-gray-200 flex flex-col overflow-hidden relative"
      style={{ width }}
    >
      {/* Resize handle (borde izquierdo) — arrastrar para ajustar ancho */}
      {onResizeStart && (
        <div
          onPointerDown={onResizeStart}
          className="absolute left-0 top-0 bottom-0 w-1.5 z-10 cursor-ew-resize group touch-none"
          title="Arrastra para ajustar el ancho"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-transparent group-hover:bg-blue-400 group-active:bg-blue-500 transition-colors" />
        </div>
      )}

      {/* Header con resumen nacional + toggle de orden */}
      <div className="px-5 py-4 border-b border-gray-100 bg-slate-50">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado por región</h3>
          <span className="text-xs text-gray-400">16 regiones</span>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${globalAvgPct}%` }}
            />
          </div>
          <span className="text-sm font-bold text-slate-700 w-10 text-right tabular-nums">{globalAvgPct}%</span>
        </div>
        <div className="flex items-center gap-3 text-xs mb-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"/><span className="text-red-600 font-medium">{globalRag.rojo}</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400"/><span className="text-amber-600 font-medium">{globalRag.ambar}</span></span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"/><span className="text-green-600 font-medium">{globalRag.verde}</span></span>
          <span className="ml-auto text-gray-400">{totalIniciativas} iniciativas</span>
        </div>

        {/* Toggle de orden */}
        <div className="flex items-center gap-1 text-[11px]">
          <span className="text-gray-400">Ordenar:</span>
          <button
            onClick={() => setSortMode('geografico')}
            className={`px-2 py-0.5 rounded transition-colors ${
              sortMode === 'geografico'
                ? 'bg-slate-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Geográfico
          </button>
          <button
            onClick={() => setSortMode('urgencia')}
            className={`px-2 py-0.5 rounded transition-colors ${
              sortMode === 'urgencia'
                ? 'bg-slate-900 text-white'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            Por urgencia
          </button>
        </div>
      </div>

      {/* Lista de filas accionables */}
      <div className="flex-1 overflow-y-auto">
        {filas.map(({ region, count, avgPct, rag, alertas, dias, isLocked }) => (
          <RegionRow
            key={region.cod}
            region={region}
            count={count}
            avgPct={avgPct}
            rag={rag}
            alertas={alertas}
            dias={dias}
            isLocked={isLocked}
            onSelect={onSelectRegion}
            onHover={onHoverRegion}
          />
        ))}
      </div>
    </div>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────

type RowProps = {
  region:   Region
  count:    number
  avgPct:   number
  rag:      { rojo: number; ambar: number; verde: number }
  alertas:  number
  dias:     number | null
  isLocked: boolean
  onSelect: (regionName: string, cod: string) => void
  onHover?: (cod: string | null) => void
}

function RegionRow({ region, count, avgPct, rag, alertas, dias, isLocked, onSelect, onHover }: RowProps) {
  const color    = getRegionColor(region.nombre)
  const barColor = avgPct === 100 ? 'bg-green-500'
                 : avgPct >= 60   ? 'bg-blue-500'
                 : avgPct >= 30   ? 'bg-amber-400'
                 : avgPct > 0     ? 'bg-red-400'
                 :                  'bg-gray-200'

  const ultimaActividad = dias === null
    ? 'Sin actividad'
    : dias === 0
      ? 'Hoy'
      : dias === 1
        ? 'Ayer'
        : `Hace ${dias} días`

  return (
    <button
      onClick={() => !isLocked && onSelect(region.nombre, region.cod)}
      onMouseEnter={() => onHover?.(region.cod)}
      onMouseLeave={() => onHover?.(null)}
      disabled={isLocked}
      className={`w-full px-5 py-3 text-left border-b border-gray-100 transition-colors group ${
        isLocked ? 'opacity-40 cursor-not-allowed' : 'hover:bg-blue-50/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="w-3 h-3 rounded-sm flex-shrink-0 mt-1" style={{ backgroundColor: color }} />
        <div className="flex-1 min-w-0">
          {/* Línea 1: nombre + count + avance */}
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div className="text-sm font-semibold text-gray-800 truncate">{region.nombre}</div>
            <div className="flex items-baseline gap-2 flex-shrink-0">
              <span className="text-xs text-gray-400 tabular-nums">{count}</span>
              <span className="text-sm font-bold text-gray-700 tabular-nums w-9 text-right">{avgPct}%</span>
            </div>
          </div>

          {/* Barra avance */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${avgPct}%` }} />
            </div>
          </div>

          {/* Línea 2: RAG breakdown + última actividad */}
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-2">
              {rag.verde > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500"/>
                  <span className="text-green-700 font-medium">{rag.verde}</span>
                </span>
              )}
              {rag.ambar > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400"/>
                  <span className="text-amber-700 font-medium">{rag.ambar}</span>
                </span>
              )}
              {rag.rojo > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"/>
                  <span className="text-red-700 font-medium">{rag.rojo}</span>
                </span>
              )}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-400 truncate">{ultimaActividad}</span>
          </div>

          {/* Línea 3: alertas críticas + CTA */}
          <div className="flex items-center justify-between mt-1.5">
            {alertas > 0 ? (
              <span className="text-[11px] text-red-600 font-medium">
                {alertas} {alertas === 1 ? 'alerta crítica' : 'alertas críticas'}
              </span>
            ) : (
              <span className="text-[11px] text-gray-400">Sin alertas</span>
            )}
            {!isLocked && (
              <span className="text-[11px] text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                Ver detalle →
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  )
}
