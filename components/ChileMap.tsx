'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'

type Props = {
  geoData: GeoJsonObject
  selectedCod: string | null
  projectCounts: Record<string, number>
  onSelect: (regionName: string, cod: string) => void
}

function getCod(feature: Feature): string {
  return feature.properties?.codregion ?? ''
}

function getName(feature: Feature): string {
  return feature.properties?.Region ?? ''
}

export default function ChileMap({ geoData, selectedCod, projectCounts, onSelect }: Props) {
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
      const color = getRegionColor(name)
      ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(
        buildStyle(color, isSelected)
      )
    })
  }, [selectedCod])

  function buildStyle(color: string, isSelected: boolean): PathOptions {
    return {
      fillColor: color,
      fillOpacity: isSelected ? 0.92 : 0.55,
      color: isSelected ? '#1e293b' : '#fff',
      weight: isSelected ? 2.5 : 0.8,
    }
  }

  function onEachFeature(feature: Feature, layer: Layer) {
    const name = getName(feature)
    const cod  = getCod(feature)
    const color = getRegionColor(name)
    const count = projectCounts[name] ?? 0

    // Initial style
    ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(
      buildStyle(color, cod === selectedCod)
    )

    layer.on({
      mouseover(e: LeafletMouseEvent) {
        if (cod === selectedCod) return
        e.target.setStyle({ fillOpacity: 0.80, weight: 1.5 })
      },
      mouseout(e: LeafletMouseEvent) {
        if (cod === selectedCod) return
        e.target.setStyle(buildStyle(color, false))
      },
      click() {
        onSelect(name, cod)
      },
    })

    // Tooltip
    layer.bindTooltip(
      `<div style="font-size:12px;font-weight:600;line-height:1.4">${name}<br>
       <span style="color:#6b7280;font-weight:400">${count} prioridades</span></div>`,
      { sticky: true, opacity: 0.95 }
    )
  }

  return (
    <MapContainer
      center={[-35.5, -71.5]}
      zoom={4}
      className="h-full w-full"
      zoomControl={true}
      attributionControl={true}
    >
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
