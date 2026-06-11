'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, GeoJSON, CircleMarker, Tooltip, useMap, useMapEvent } from 'react-leaflet'
import type { GeoJsonObject } from 'geojson'
import 'leaflet/dist/leaflet.css'
import type { Iniciativa } from '@/lib/projects'
import type {
  DesalojoCapa,
  DesalojoFaseEstado,
  SemaforoDimension,
} from '@/lib/types'
import { FASES_CON_SEMAFORO, SEV_ORDER, aplicaFase } from '@/lib/desalojos'

/**
 * Mapa de casos de desalojo priorizados por la Mesa. Un círculo por capa
 * activa con coordenadas (`capa.lat`/`capa.lng` set, ya sea manualmente o
 * heredados al vincular folio MINVU).
 *
 * Color del círculo = peor semáforo de las fases con semáforo de la capa
 * (rojo > ámbar > gris > verde). Tamaño escalado por personas o hogares.
 *
 * Las capas SIN coords aparecen en un panel lateral con CTA para vincular.
 *
 * Importarlo con `next/dynamic({ ssr: false })` desde el padre — Leaflet no
 * soporta SSR.
 */

const CHILE_BOUNDS: [[number, number], [number, number]] = [[-56, -76], [-17, -66]]
const MAX_BOUNDS:   [[number, number], [number, number]] = [[-62, -82], [-14, -60]]

type Caso = {
  prioridad_id: number
  capas:        DesalojoCapa[]
  fases_estado: DesalojoFaseEstado[]
}

type Props = {
  cases:    Iniciativa[]
  casosByN: Map<number, Caso>
  /** Callback al click en un pin del mapa — abre la ficha del caso. */
  onSelectCaso: (n: number) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────

type Pin = {
  capa:       DesalojoCapa
  iniciativa: Iniciativa
  lat:        number
  lng:        number
  worstSev:   number    // peor severidad (0..3)
  worstColor: string    // hex del color del peor semáforo
}

const SEV_COLOR: Record<SemaforoDimension, string> = {
  verde: '#10b981', // emerald-500
  ambar: '#f59e0b', // amber-500
  rojo:  '#dc2626', // red-600
  gris:  '#9ca3af', // gray-400
}

function worstFase(capa: DesalojoCapa, fases_estado: DesalojoFaseEstado[]): { sev: number; color: string } {
  let worst: SemaforoDimension = 'gris'
  let worstSev = 0
  for (const f of FASES_CON_SEMAFORO) {
    if (!aplicaFase(capa, f)) continue
    const e = fases_estado.find(x => x.capa_id === capa.id && x.fase === f)
    const v = e?.semaforo ?? 'gris'
    const sev = SEV_ORDER[v]
    if (sev > worstSev) { worstSev = sev; worst = v }
  }
  return { sev: worstSev, color: SEV_COLOR[worst] }
}

function radioFromTamaño(capa: DesalojoCapa): number {
  // Escala con personas o hogares; clamp 7..16.
  const n = capa.personas ?? (capa.hogares != null ? capa.hogares * 3.5 : null)
  if (n == null) return 8
  const r = Math.sqrt(n) * 0.6
  return Math.max(7, Math.min(16, r))
}

// ── MapController ──────────────────────────────────────────────────────────

function MapController({ pinsCount }: { pinsCount: number }) {
  const map = useMap()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
    map.once('moveend', () => { map.setMinZoom(map.getZoom()) })
  }, [map])

  useMapEvent('resize', () => { map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] }) })

  // Re-fit cuando el conjunto de pins cambia drásticamente (cambio de filtros).
  useEffect(() => {
    if (!initialized.current) return
    map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
  }, [pinsCount, map])

  return null
}

// ── Componente principal ───────────────────────────────────────────────────

export default function DesalojoMapaCasos({ cases, casosByN, onSelectCaso }: Props) {
  const [geo, setGeo] = useState<GeoJsonObject | null>(null)

  // Cargar el geojson de Chile una vez.
  useEffect(() => {
    let cancelled = false
    fetch('/chile-regiones.geojson')
      .then(r => r.json())
      .then(data => { if (!cancelled) setGeo(data) })
      .catch(() => { /* sin geo, el mapa funciona igual */ })
    return () => { cancelled = true }
  }, [])

  // Pins de capas con coords resueltas + lista de capas sin coords.
  const { pins, sinCoords } = useMemo(() => {
    const pins:      Pin[] = []
    const sinCoords: Array<{ iniciativa: Iniciativa; capa: DesalojoCapa }> = []
    for (const ini of cases) {
      const caso  = casosByN.get(ini.n)
      const capas = (caso?.capas ?? []).filter(c => c.activa)
      const fases = caso?.fases_estado ?? []
      for (const capa of capas) {
        if (capa.lat != null && capa.lng != null) {
          const w = worstFase(capa, fases)
          pins.push({
            capa,
            iniciativa: ini,
            lat:        capa.lat,
            lng:        capa.lng,
            worstSev:   w.sev,
            worstColor: w.color,
          })
        } else {
          sinCoords.push({ iniciativa: ini, capa })
        }
      }
    }
    // Pins ordenados por severidad asc → los rojos quedan dibujados ARRIBA.
    pins.sort((a, b) => a.worstSev - b.worstSev)
    return { pins, sinCoords }
  }, [cases, casosByN])

  return (
    <div>
      <div className="flex gap-4 items-start">
        {/* Mapa */}
        <div className="flex-1 min-w-0 bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 280px)', minHeight: 500 }}>
          <MapContainer
            bounds={CHILE_BOUNDS}
            maxBounds={MAX_BOUNDS}
            maxBoundsViscosity={0.8}
            scrollWheelZoom
            style={{ height: '100%', width: '100%', background: '#f9fafb' }}
          >
            <MapController pinsCount={pins.length} />
            {geo && (
              <GeoJSON
                data={geo}
                style={() => ({
                  fillColor:   '#e5e7eb',
                  fillOpacity: 0.4,
                  weight:      0.8,
                  color:       '#9ca3af',
                  opacity:     0.6,
                })}
                interactive={false}
              />
            )}
            {pins.map(pin => (
              <CircleMarker
                key={pin.capa.id}
                center={[pin.lat, pin.lng]}
                radius={radioFromTamaño(pin.capa)}
                pathOptions={{
                  color:       pin.worstColor,
                  weight:      2,
                  fillColor:   pin.worstColor,
                  fillOpacity: 0.55,
                }}
                eventHandlers={{
                  click: () => onSelectCaso(pin.iniciativa.n),
                }}
              >
                <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
                  <div className="text-xs leading-tight">
                    <p className="font-bold text-gray-900">{pin.iniciativa.nombre}</p>
                    <p className="text-gray-600">{pin.capa.nombre}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {pin.iniciativa.region}
                      {pin.capa.personas != null && <> · {pin.capa.personas} personas</>}
                      {pin.capa.hogares  != null && <> · {pin.capa.hogares} hogares</>}
                    </p>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Panel lateral: capas sin coords */}
        <aside className="w-72 shrink-0 space-y-3">
          <section className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">En mapa</p>
            <p className="text-2xl font-bold tabular-nums text-slate-900">{pins.length}</p>
            <p className="text-xs text-gray-500">capa{pins.length === 1 ? '' : 's'} con coords</p>
          </section>

          {sinCoords.length > 0 && (
            <section className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold">Sin coordenadas</p>
              <p className="text-2xl font-bold tabular-nums text-amber-900">{sinCoords.length}</p>
              <p className="text-xs text-amber-700 leading-snug">
                Vinculá un folio MINVU en Avance para heredar las coords y verlas en el mapa.
              </p>
              <ul className="mt-2 space-y-1.5 max-h-72 overflow-y-auto text-xs">
                {sinCoords.map(({ iniciativa, capa }) => (
                  <li key={capa.id}>
                    <button
                      type="button"
                      onClick={() => onSelectCaso(iniciativa.n)}
                      className="w-full text-left px-2 py-1 rounded hover:bg-amber-100 transition-colors"
                    >
                      <p className="font-semibold text-amber-900 leading-tight">{iniciativa.nombre}</p>
                      <p className="text-[11px] text-amber-700 leading-tight">{capa.nombre}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Leyenda */}
          <section className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold mb-2">Color del pin</p>
            <ul className="space-y-1 text-xs">
              <li className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: SEV_COLOR.rojo  }} />
                <span className="text-gray-700">Crítico — al menos un semáforo en rojo</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: SEV_COLOR.ambar }} />
                <span className="text-gray-700">Atención — al menos un ámbar (ningún rojo)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: SEV_COLOR.gris  }} />
                <span className="text-gray-700">Sin evaluar</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full" style={{ background: SEV_COLOR.verde }} />
                <span className="text-gray-700">Todo verde</span>
              </li>
            </ul>
            <p className="text-[10px] text-gray-400 mt-2 leading-snug">El tamaño del pin escala con el catastro de personas/hogares de la capa.</p>
          </section>
        </aside>
      </div>
    </div>
  )
}
