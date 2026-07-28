'use client'

import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, Marker, useMap, useMapEvent } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject, Feature } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'

// Bounding box de Chile continental + extremos (Arica al norte, Cabo de Hornos al sur)
const CHILE_BOUNDS: [[number, number], [number, number]] = [[-56, -76], [-17, -66]]
// Márgenes holgados para restringir paneo sin que se sienta asfixiante
const MAX_BOUNDS: [[number, number], [number, number]] = [[-62, -82], [-14, -60]]

// Ancla de la etiqueta con el nombre de cada región: un punto interior del
// territorio CONTINENTAL, ajustado a mano. No usar el centro del feature ni
// el lat/lng de REGIONS: el primero se va al Pacífico en regiones con islas
// (Rapa Nui arrastraría "Valparaíso" mar adentro) y el segundo es la capital,
// que casi siempre está en la costa.
const LABEL_ANCHORS: Record<string, [number, number]> = {
  XV:   [-18.55, -69.60],
  I:    [-20.30, -69.30],
  II:   [-23.50, -69.10],
  III:  [-27.40, -69.95],
  IV:   [-30.65, -70.85],
  V:    [-32.75, -71.15],
  RM:   [-33.65, -70.55],
  VI:   [-34.45, -71.10],
  VII:  [-35.65, -71.55],
  XVI:  [-36.60, -71.95],
  VIII: [-37.45, -72.35],
  IX:   [-38.60, -72.20],
  XIV:  [-39.95, -72.65],
  X:    [-41.90, -72.90],
  XI:   [-46.40, -72.60],
  XII:  [-52.30, -71.30],
}

// divIcon sin tamaño: el span interior se centra sobre el ancla vía transform.
// pointer-events none para que hover/click pasen limpios al polígono de abajo.
function regionLabelIcon(nombre: string) {
  return L.divIcon({
    className: 'region-map-label',
    iconSize: [0, 0],
    html: `<span style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;pointer-events:none;font-size:10px;font-weight:600;letter-spacing:.02em;color:#334155;text-shadow:0 1px 2px rgba(255,255,255,.95),0 -1px 2px rgba(255,255,255,.95),1px 0 2px rgba(255,255,255,.95),-1px 0 2px rgba(255,255,255,.95)">${nombre}</span>`,
  })
}

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

export default function ChileMap({ geoData, selectedCod, projectCounts, onSelect, lockedRegions = [] }: Props) {
  const geoJsonRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  // Re-style all layers (y refrescar el conteo del tooltip) cuando cambia la
  // selección, los bloqueos o los conteos. Antes esto se hacía remontando toda
  // la capa GeoJSON vía `key={selectedCod}` (destruía y reconstruía los 16
  // polígonos + handlers en cada click → flash visible). Ahora se re-estila
  // in-place; la capa se monta una sola vez.
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
      ;(layer as { setTooltipContent?: (c: string) => void }).setTooltipContent?.(
        tooltipHtml(name, projectCounts[name] ?? 0)
      )
    })
  }, [selectedCod, lockedRegions, projectCounts])

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
    >
      <MapController />
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
      />
      <GeoJSON
        data={geoData}
        onEachFeature={onEachFeature}
        ref={geoJsonRef as never}
      />
      {/* Solo nombres de regiones — sin países, capitales ni ciudades.
          (Antes había una TileLayer light_only_labels de CARTO que pintaba
          todo eso; se reemplazó por estas 16 etiquetas propias.) */}
      {REGIONS.map(r => {
        const anchor = LABEL_ANCHORS[r.cod]
        if (!anchor) return null
        return (
          <Marker
            key={r.cod}
            position={anchor}
            icon={regionLabelIcon(r.nombre)}
            interactive={false}
            keyboard={false}
          />
        )
      })}
    </MapContainer>
  )
}
