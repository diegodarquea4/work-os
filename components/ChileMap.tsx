'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvent } from 'react-leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getRegionColor } from '@/lib/regionColors'
import ComunasLayer from './ComunasLayer'

// Bounding box de Chile continental + extremos (Arica al norte, Cabo de Hornos al sur)
const CHILE_BOUNDS: [[number, number], [number, number]] = [[-56, -76], [-17, -66]]
// Márgenes holgados para restringir paneo sin que se sienta asfixiante
const MAX_BOUNDS: [[number, number], [number, number]] = [[-62, -82], [-14, -60]]

// Ventana para distinguir click de doble click. El click simple (preview
// regional) se difiere este tiempo; el dblclick lo cancela y entra al drill
// comunal. Costo asumido de tener dblclick con semántica propia.
const DBLCLICK_MS = 250

function MapController({ drillActive }: { drillActive: boolean }) {
  const map = useMap()
  const initialized = useRef(false)
  const drillRef = useRef(drillActive)
  useEffect(() => { drillRef.current = drillActive })

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
    // Espera a que el ajuste termine y congela ese zoom como mínimo
    map.once('moveend', () => { map.setMinZoom(map.getZoom()) })
  }, [map])

  // Re-ajusta Chile cuando el contenedor cambia de tamaño — salvo durante el
  // drill comunal (pisaría el encuadre de la región).
  useMapEvent('resize', () => {
    if (!drillRef.current) map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
  })

  return null
}

export type MapDrillProps = {
  regionIne: number
  regionCod: string
  regionNombre: string
  selectedCut: number | null
  statsByCut: ReadonlyMap<number, { n: number; mm: number }>
  onSelectComuna: (cut: number, nombre: string) => void
}

type Props = {
  geoData: GeoJsonObject
  selectedCod: string | null
  projectCounts: Record<string, number>
  onSelect: (regionName: string, cod: string) => void
  // Doble click en una región → drill comunal (WorkOSApp decide).
  onRegionDoubleClick?: (regionName: string, cod: string) => void
  // Nivel comunal activo: monta ComunasLayer y atenúa la capa regional.
  drill?: MapDrillProps | null
  lockedRegions?: string[]  // cods the current user cannot open
}

function getCod(feature: Feature): string {
  return feature.properties?.codregion ?? ''
}

function getName(feature: Feature): string {
  return feature.properties?.Region ?? ''
}

function tooltipHtml(name: string, count: number): string {
  return `<div style="font-size:12px;font-weight:600;line-height:1.4">${name}<br>
       <span style="color:#6b7280;font-weight:400">${count} iniciativas</span></div>`
}

function buildStyle(color: string, isSelected: boolean, isLocked: boolean): PathOptions {
  return {
    fillColor: color,
    fillOpacity: isLocked ? 0.25 : isSelected ? 0.92 : 0.55,
    color: isSelected ? '#1e293b' : '#fff',
    weight: isSelected ? 2.5 : 0.8,
  }
}

// Estilo de la capa regional durante el drill: la región drilled queda casi
// invisible (las comunas la cubren; si el geojson comunal fallara, sigue
// habiendo un fantasma clickeable) y el resto se atenúa de fondo.
function buildDrillStyle(color: string, isDrilled: boolean): PathOptions {
  return {
    fillColor: color,
    fillOpacity: isDrilled ? 0.08 : 0.12,
    color: '#fff',
    weight: 0.8,
  }
}

export default function ChileMap({ geoData, selectedCod, projectCounts, onSelect, onRegionDoubleClick, drill = null, lockedRegions = [] }: Props) {
  const geoJsonRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  // Los handlers de onEachFeature se registran UNA vez (la capa no se
  // remonta) — todo lo que cambia con el tiempo se lee vía refs, que se
  // refrescan post-render (la regla react-hooks/refs prohíbe hacerlo inline).
  const onSelectRef = useRef(onSelect)
  const onDblRef = useRef(onRegionDoubleClick)
  const drillRef = useRef(drill)
  useEffect(() => {
    onSelectRef.current = onSelect
    onDblRef.current = onRegionDoubleClick
    drillRef.current = drill
  })
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
  }, [])

  function styleFor(cod: string, name: string): PathOptions {
    const color = getRegionColor(name)
    if (drillRef.current) return buildDrillStyle(color, cod === drillRef.current.regionCod)
    return buildStyle(color, cod === selectedCod, lockedRegions.includes(cod))
  }

  // Re-style all layers (y refrescar el conteo del tooltip) cuando cambia la
  // selección, los bloqueos, los conteos o el drill. Antes esto se hacía
  // remontando toda la capa GeoJSON vía `key={selectedCod}` (destruía y
  // reconstruía los 16 polígonos + handlers en cada click → flash visible).
  // Ahora se re-estila in-place; la capa se monta una sola vez.
  useEffect(() => {
    if (!geoJsonRef.current) return
    geoJsonRef.current.eachLayer((layer) => {
      const f = (layer as { feature?: Feature }).feature
      if (!f) return
      const cod = getCod(f)
      const name = getName(f)
      ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(styleFor(cod, name))
      ;(layer as { setTooltipContent?: (c: string) => void }).setTooltipContent?.(
        tooltipHtml(name, projectCounts[name] ?? 0)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCod, lockedRegions, projectCounts, drill])

  function onEachFeature(feature: Feature, layer: Layer) {
    const name   = getName(feature)
    const cod    = getCod(feature)
    const color  = getRegionColor(name)
    const count  = projectCounts[name] ?? 0
    const locked = lockedRegions.includes(cod)

    // Initial style
    ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(styleFor(cod, name))

    layer.on({
      mouseover(e: LeafletMouseEvent) {
        const d = drillRef.current
        if (d) {
          if (cod === d.regionCod) return
          e.target.setStyle({ fillOpacity: 0.3, weight: 1 })
          return
        }
        if (cod === selectedCod || locked) return
        e.target.setStyle({ fillOpacity: 0.80, weight: 1.5 })
      },
      mouseout(e: LeafletMouseEvent) {
        const d = drillRef.current
        if (d) {
          e.target.setStyle(buildDrillStyle(color, cod === d.regionCod))
          return
        }
        if (cod === selectedCod || locked) return
        e.target.setStyle(buildStyle(color, false, false))
      },
      click() {
        if (locked) return
        // Diferido para dar espacio al dblclick (drill). Si llega el segundo
        // click dentro de la ventana, este timer se cancela.
        if (clickTimerRef.current) clearTimeout(clickTimerRef.current)
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null
          onSelectRef.current(name, cod)
        }, DBLCLICK_MS)
      },
      dblclick() {
        if (clickTimerRef.current) {
          clearTimeout(clickTimerRef.current)
          clickTimerRef.current = null
        }
        if (locked) return
        onDblRef.current?.(name, cod)
      },
    })

    // Tooltip
    layer.bindTooltip(tooltipHtml(name, count), { sticky: true, opacity: 0.95 })
  }

  return (
    <MapContainer
      bounds={CHILE_BOUNDS}
      boundsOptions={{ padding: [20, 20] }}
      maxBounds={MAX_BOUNDS}
      maxBoundsViscosity={1.0}
      className="h-full w-full"
      zoomControl={true}
      attributionControl={true}
      doubleClickZoom={false}
    >
      <MapController drillActive={!!drill} />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        data={geoData}
        onEachFeature={onEachFeature}
        ref={geoJsonRef as never}
      />
      {/* Sin capa de rótulos: ni países, ni capitales, ni nombres de región
          permanentes. El nombre aparece solo en el tooltip al pasar el mouse
          (y en la barra lateral) — decisión de Diego, 2026-07-28. */}
      {drill && (
        <ComunasLayer
          key={drill.regionIne}
          regionIne={drill.regionIne}
          regionColor={getRegionColor(drill.regionNombre)}
          selectedCut={drill.selectedCut}
          statsByCut={drill.statsByCut}
          onSelectComuna={drill.onSelectComuna}
        />
      )}
    </MapContainer>
  )
}
