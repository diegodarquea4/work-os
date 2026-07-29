'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvent } from 'react-leaflet'
import L from 'leaflet'
import type { GeoJsonObject, Feature, FeatureCollection, Position } from 'geojson'
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

// Encuadre de una región para el focus de cámara: excluye del cálculo los
// territorios lejanos que arruinan el flyToBounds — Rapa Nui / Juan Fernández /
// Desventuradas (lon < -76) y la Antártica (lat < -57). Mismo criterio que
// boundsSinTerritoriosLejanos de ComunasLayer, pero a nivel de coordenadas
// porque cada región es un solo (Multi)Polygon.
function regionFocusBounds(feature: Feature): L.LatLngBounds | null {
  let bounds: L.LatLngBounds | null = null
  const extend = (pos: Position) => {
    const [lng, lat] = pos
    if (lng < -76 || lat < -57) return
    if (bounds) bounds.extend([lat, lng])
    else bounds = L.latLngBounds([lat, lng], [lat, lng])
  }
  const g = feature.geometry
  if (g.type === 'Polygon') g.coordinates.forEach(ring => ring.forEach(extend))
  else if (g.type === 'MultiPolygon') g.coordinates.forEach(poly => poly.forEach(ring => ring.forEach(extend)))
  return bounds
}

function MapController({ drillActive, focusBounds }: { drillActive: boolean; focusBounds: L.LatLngBounds | null }) {
  const map = useMap()
  const initialized = useRef(false)
  const drillRef = useRef(drillActive)
  const focusRef = useRef(focusBounds)
  // true mientras hay un vuelo agendado — el handler de resize no debe pisar
  // el invalidateSize+fly del timeout (invalidateSize dispara 'resize').
  const flyPendingRef = useRef(false)
  useEffect(() => {
    drillRef.current = drillActive
    focusRef.current = focusBounds
  })

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
    // Espera a que el ajuste termine y congela ese zoom como mínimo
    map.once('moveend', () => { map.setMinZoom(map.getZoom()) })
  }, [map])

  // Re-encuadra el nivel vigente cuando cambia el tamaño — salvo durante el
  // drill comunal (pisaría el encuadre de ComunasLayer) o con un vuelo agendado.
  useMapEvent('resize', () => {
    if (drillRef.current || flyPendingRef.current) return
    if (focusRef.current) map.fitBounds(focusRef.current, { padding: [30, 30] })
    else map.fitBounds(CHILE_BOUNDS, { padding: [20, 20] })
  })

  // Cámara del nivel país/región. El drill tiene cámara propia (ComunasLayer
  // vuela al encuadre comunal cuando llega su geojson); acá van las
  // transiciones hacia una región enfocada y las vueltas a la visual de todo
  // Chile — incluida la salida del drill, que antes vivía en un cleanup de
  // desmontaje de ComunasLayer y competía con el reacomodo del layout.
  const intentRef = useRef<'init' | 'chile' | 'region' | 'drill'>('init')
  useEffect(() => {
    const prev = intentRef.current
    const next = drillActive ? 'drill' : focusBounds ? 'region' : 'chile'
    intentRef.current = next
    if (next === 'drill') return
    if (prev === 'init') return // el primer encuadre lo hace el fit inicial
    if (next === 'chile' && prev === 'chile') return
    const target = next === 'region' ? focusBounds : null
    // El panel lateral abre/cierra con transition de 300ms — esperar el tamaño
    // final del contenedor antes de volar, o el encuadre queda corrido.
    flyPendingRef.current = true
    const t = setTimeout(() => {
      map.invalidateSize()
      flyPendingRef.current = false
      if (target) map.flyToBounds(target, { padding: [30, 30], duration: 0.8 })
      else map.flyToBounds(CHILE_BOUNDS, { padding: [20, 20], duration: 0.8 })
    }, 320)
    return () => {
      clearTimeout(t)
      flyPendingRef.current = false
    }
  }, [drillActive, focusBounds, map])

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
  // Región que la cámara debe enfocar (click desde el lateral). null = visual
  // de todo Chile. Ignorado mientras el drill está activo.
  focusCod?: string | null
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

export default function ChileMap({ geoData, selectedCod, projectCounts, onSelect, onRegionDoubleClick, drill = null, focusCod = null, lockedRegions = [] }: Props) {
  const geoJsonRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  // Bounds de la región enfocada — identidad estable (geoData no cambia) para
  // que el effect de cámara de MapController solo corra en transiciones reales.
  const focusBounds = useMemo(() => {
    if (!focusCod) return null
    const features = (geoData as FeatureCollection).features ?? []
    const feature = features.find(f => getCod(f) === focusCod)
    return feature ? regionFocusBounds(feature) : null
  }, [geoData, focusCod])

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
      <MapController drillActive={!!drill} focusBounds={focusBounds} />
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
