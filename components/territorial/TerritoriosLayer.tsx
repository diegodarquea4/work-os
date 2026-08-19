'use client'

/**
 * Capa de territorios de congreso (distritos / circunscripciones) del modo
 * «Autoridades», cuando el nivel es diputado/senador y el coloreo es «por distrito».
 * Cubre todo el país por encima de la capa regional, coloreada por el bloque
 * mayoritario de electos del territorio. Click → ficha de electos en el lateral.
 *
 * Calco de ComunasLayer: fetch on-demand del geojson estático (public/) con caché
 * de módulo, re-estilo in-place vía ref, encuadre al montar.
 */

import { useEffect, useRef, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'

const geoCache = new Map<string, FeatureCollection>()

function archivoDe(tipo: 'distrito' | 'circunscripcion'): string {
  return tipo === 'distrito' ? '/api/territorial/distritos' : '/api/territorial/circunscripciones'
}

function getTerritorio(f: Feature): string {
  return (f.properties as { territorio?: string })?.territorio ?? ''
}

function buildStyle(color: string): PathOptions {
  return { fillColor: color, fillOpacity: 0.55, color: '#fff', weight: 0.8 }
}

function tooltipHtml(nombre: string): string {
  return `<div style="font-size:12px;font-weight:600;line-height:1.4">${nombre}<br>
       <span style="color:#6b7280;font-weight:400">Clic: ver electos</span></div>`
}

type Props = {
  tipo: 'distrito' | 'circunscripcion'
  fill: Record<string, string>
  onSelectTerritorio: (territorio: string) => void
}

export default function TerritoriosLayer({ tipo, fill, onSelectTerritorio }: Props) {
  const map = useMap()
  const archivo = archivoDe(tipo)
  const [fc, setFc] = useState<FeatureCollection | null>(geoCache.get(archivo) ?? null)
  const geoRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  const fillRef = useRef(fill)
  const onSelectRef = useRef(onSelectTerritorio)
  useEffect(() => { fillRef.current = fill; onSelectRef.current = onSelectTerritorio })

  useEffect(() => {
    if (geoCache.has(archivo)) return
    let cancelled = false
    fetch(archivo)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() as Promise<FeatureCollection> })
      .then((json) => { geoCache.set(archivo, json); if (!cancelled) setFc(json) })
      .catch((err) => { console.error(`[TerritoriosLayer] no se pudo cargar ${archivo}:`, err); if (!cancelled) setFc(null) })
    return () => { cancelled = true }
  }, [archivo])

  // Encuadre nacional al montar la capa (resetea la cámara si venía de un drill).
  useEffect(() => {
    if (!fc) return
    const bounds = L.geoJSON(fc).getBounds()
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [20, 20], duration: 0.6 })
  }, [fc, map])

  // Re-estilo in-place al cambiar los colores (cambia el año de congreso, etc.).
  useEffect(() => {
    if (!geoRef.current) return
    geoRef.current.eachLayer((layer) => {
      const f = (layer as { feature?: Feature }).feature
      if (!f) return
      const terr = getTerritorio(f)
      ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(buildStyle(fill[terr] ?? '#E7E4DC'))
    })
  }, [fill])

  if (!fc) return null

  function onEachFeature(feature: Feature, layer: Layer) {
    const terr = getTerritorio(feature)
    ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(buildStyle(fillRef.current[terr] ?? '#E7E4DC'))
    layer.on({
      mouseover(e: LeafletMouseEvent) { e.target.setStyle({ fillOpacity: 0.75, weight: 1.5 }) },
      mouseout(e: LeafletMouseEvent) { e.target.setStyle(buildStyle(fillRef.current[terr] ?? '#E7E4DC')) },
      click(e: LeafletMouseEvent) { L.DomEvent.stopPropagation(e); onSelectRef.current(terr) },
    })
    layer.bindTooltip(tooltipHtml(terr), { sticky: true, opacity: 0.95 })
  }

  return <GeoJSON key={tipo} data={fc} onEachFeature={onEachFeature} ref={geoRef as never} />
}
