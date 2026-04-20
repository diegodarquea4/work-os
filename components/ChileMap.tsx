'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvent } from 'react-leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'

// Bounding box de Chile continental + extremos (Arica al norte, Cabo de Hornos al sur)
const CHILE_BOUNDS: [[number, number], [number, number]] = [[-56, -76], [-17, -66]]
// Márgenes holgados para restringir paneo sin que se sienta asfixiante
const MAX_BOUNDS: [[number, number], [number, number]] = [[-62, -82], [-14, -60]]

function MapController() {
  const map = useMap()
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
    // Espera a que el ajuste termine y congela ese zoom como mínimo
    map.once('moveend', () => { map.setMinZoom(map.getZoom()) })
  }, [map])

  // Re-ajusta Chile cuando el contenedor cambia de tamaño
  useMapEvent('resize', () => { map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] }) })

  return null
}

type Props = {
  geoData: GeoJsonObject
  selectedCod: string | null
  projectCounts: Record<string, number>
  onSelect: (regionName: string, cod: string) => void
  lockedRegions?: string[]  // cods the current user cannot open
}

function getCod(feature: Feature): string {
  return feature.properties?.codregion ?? ''
}

function getName(feature: Feature): string {
  return feature.properties?.Region ?? ''
}

export default function ChileMap({ geoData, selectedCod, projectCounts, onSelect, lockedRegions = [] }: Props) {
  const geoJsonRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  // Re-style all layers when selection changes
  useEffect(() => {
    if (!geoJsonRef.current) return
    geoJsonRef.current.eachLayer((layer) => {
      const f = (layer as { feature?: Feature }).feature
      if (!f) return
      const cod = getCod(f)
      const name = getName(f)
      const isSelected = cod === selectedCod
      const isLocked = lockedRegions.includes(cod)
      const color = getRegionColor(name)
      ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(
        buildStyle(color, isSelected, isLocked)
      )
    })
  }, [selectedCod, lockedRegions])

  function buildStyle(color: string, isSelected: boolean, isLocked: boolean): PathOptions {
    return {
      fillColor: color,
      fillOpacity: isLocked ? 0.25 : isSelected ? 0.92 : 0.55,
      color: isSelected ? '#1e293b' : '#fff',
      weight: isSelected ? 2.5 : 0.8,
    }
  }

  function onEachFeature(feature: Feature, layer: Layer) {
    const name   = getName(feature)
    const cod    = getCod(feature)
    const color  = getRegionColor(name)
    const count  = projectCounts[name] ?? 0
    const locked = lockedRegions.includes(cod)

    // Initial style
    ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(
      buildStyle(color, cod === selectedCod, locked)
    )

    layer.on({
      mouseover(e: LeafletMouseEvent) {
        if (cod === selectedCod || locked) return
        e.target.setStyle({ fillOpacity: 0.80, weight: 1.5 })
      },
      mouseout(e: LeafletMouseEvent) {
        if (cod === selectedCod || locked) return
        e.target.setStyle(buildStyle(color, false, false))
      },
      click() {
        if (locked) return
        onSelect(name, cod)
      },
    })

    // Tooltip
    layer.bindTooltip(
      `<div style="font-size:12px;font-weight:600;line-height:1.4">${name}<br>
       <span style="color:#6b7280;font-weight:400">${count} iniciativas</span></div>`,
      { sticky: true, opacity: 0.95 }
    )
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
    >
      <MapController />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        key={selectedCod ?? 'none'}
        data={geoData}
        onEachFeature={onEachFeature}
        ref={geoJsonRef as never}
      />
      {/* City labels layer on top */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
        attribution=""
        pane="shadowPane"
      />
    </MapContainer>
  )
}
