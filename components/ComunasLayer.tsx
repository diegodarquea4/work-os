'use client'

import { useEffect, useRef, useState } from 'react'
import { GeoJSON, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Feature, FeatureCollection } from 'geojson'
import type { Layer, LeafletMouseEvent, PathOptions } from 'leaflet'
import { fmtMM } from '@/lib/comunaStats'

/**
 * Capa comunal del drill-down del Mapa. Dueña del fetch on-demand del geojson
 * (public/comunas/{codINE}.geojson) con caché en memoria a nivel de módulo —
 * el bundle y la carga inicial del panel no cambian; la primera bajada de una
 * región cuesta 3-51 KB y las siguientes son gratis.
 *
 * Estilos calcados de la maqueta (docs/drilldown-comunal): relleno = color de
 * la región, fillOpacity .28 reposo / .5 hover / .75 seleccionada / .18 resto
 * cuando hay selección; stroke blanco .5 (hover .8), seleccionada #1e293b w1.
 *
 * Mismo patrón anti-flash de ChileMap: la capa GeoJSON se monta UNA vez por
 * región (el padre la remonta con key=regionIne) y los cambios de selección /
 * stats se aplican re-estilando in-place vía ref. Los handlers leen refs para
 * no quedar con closures stale.
 */

const comunaGeoCache = new Map<number, FeatureCollection>()

// Encuadre del drill: excluye del cálculo los territorios lejanos que
// arruinan el flyToBounds — Rapa Nui/Juan Fernández en Valparaíso (lon < -75)
// y la Antártica (cut 12202). Esas comunas IGUAL se listan en el lateral
// (nota al pie) — solo quedan fuera del encuadre del mapa.
function boundsSinTerritoriosLejanos(fc: FeatureCollection, regionIne: number): L.LatLngBounds | null {
  let bounds: L.LatLngBounds | null = null
  for (const f of fc.features) {
    const cut = (f.properties as { cod_comuna?: number })?.cod_comuna
    if (cut === 12202) continue
    const fb = L.geoJSON(f).getBounds()
    if (regionIne === 5 && fb.getWest() < -75) continue
    bounds = bounds ? bounds.extend(fb) : L.latLngBounds(fb.getSouthWest(), fb.getNorthEast())
  }
  return bounds
}

function getCut(f: Feature): number {
  return (f.properties as { cod_comuna?: number })?.cod_comuna ?? 0
}

function getNombre(f: Feature): string {
  return (f.properties as { comuna?: string })?.comuna ?? ''
}

function buildComunaStyle(color: string, isSelected: boolean, anySelected: boolean): PathOptions {
  if (isSelected) return { fillColor: color, fillOpacity: 0.75, color: '#1e293b', weight: 1 }
  return {
    fillColor: color,
    fillOpacity: anySelected ? 0.18 : 0.28,
    color: '#fff',
    weight: 0.5,
  }
}

function tooltipHtml(nombre: string, n: number, mm: number, nameOnly = false): string {
  if (nameOnly) return `<div style="font-size:12px;font-weight:600;line-height:1.4">${nombre}</div>`
  return `<div style="font-size:12px;font-weight:600;line-height:1.4">${nombre}<br>
       <span style="color:#6b7280;font-weight:400">${n} iniciativa${n === 1 ? '' : 's'} · ${fmtMM(mm)}</span></div>`
}

type Props = {
  regionIne: number
  regionColor: string
  selectedCut: number | null
  statsByCut: ReadonlyMap<number, { n: number; mm: number }>
  onSelectComuna: (cut: number, nombre: string) => void
  /** Modo Autoridades: color de relleno por CUT (bloque político) y tooltip solo nombre. */
  comunaFill?: Record<number, string>
  autoridades?: boolean
}

export default function ComunasLayer({ regionIne, regionColor, selectedCut, statsByCut, onSelectComuna, comunaFill, autoridades = false }: Props) {
  const map = useMap()
  const [fc, setFc] = useState<FeatureCollection | null>(comunaGeoCache.get(regionIne) ?? null)
  const geoRef = useRef<ReturnType<typeof import('leaflet')['geoJSON']> | null>(null)

  // Los handlers de onEachFeature se registran una vez — leen refs, no props.
  // Refresco post-render (react-hooks/refs prohíbe asignar en el render).
  const selectedRef = useRef(selectedCut)
  const statsRef = useRef(statsByCut)
  const onSelectRef = useRef(onSelectComuna)
  const fillRef = useRef(comunaFill)
  useEffect(() => {
    selectedRef.current = selectedCut
    statsRef.current = statsByCut
    onSelectRef.current = onSelectComuna
    fillRef.current = comunaFill
  })

  // Color de una comuna: político por CUT (modo Autoridades) o el color de la región.
  const colorForCut = (cut: number, fill = fillRef.current): string => fill?.[cut] ?? regionColor

  // Fetch on-demand + caché. Si falla, el drill sigue vivo con la lista
  // lateral (la capa simplemente no se dibuja). El caso cacheado ya viene
  // resuelto por el initializer del useState (el padre remonta esta capa
  // con key=regionIne, así que regionIne nunca cambia en un mount vivo).
  useEffect(() => {
    if (comunaGeoCache.has(regionIne)) return
    let cancelled = false
    fetch(`/comunas/${regionIne}.geojson`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<FeatureCollection>
      })
      .then(json => {
        comunaGeoCache.set(regionIne, json)
        if (!cancelled) setFc(json)
      })
      .catch(err => {
        console.error(`[ComunasLayer] no se pudo cargar /comunas/${regionIne}.geojson:`, err)
        if (!cancelled) setFc(null)
      })
    return () => { cancelled = true }
  }, [regionIne])

  // Encuadre al entrar (datos listos). La vuelta a Chile al salir del drill
  // la maneja MapController (ChileMap) — cámara centralizada por intención.
  useEffect(() => {
    if (!fc) return
    const bounds = boundsSinTerritoriosLejanos(fc, regionIne)
    if (bounds) map.flyToBounds(bounds, { padding: [30, 30], duration: 0.8 })
  }, [fc, regionIne, map])

  // Re-estilo in-place al cambiar selección o conteos.
  useEffect(() => {
    if (!geoRef.current) return
    const anySelected = selectedCut != null
    geoRef.current.eachLayer(layer => {
      const f = (layer as { feature?: Feature }).feature
      if (!f) return
      const cut = getCut(f)
      ;(layer as { setStyle?: (s: PathOptions) => void }).setStyle?.(
        buildComunaStyle(colorForCut(cut, comunaFill), cut === selectedCut, anySelected)
      )
      const s = statsByCut.get(cut) ?? { n: 0, mm: 0 }
      ;(layer as { setTooltipContent?: (c: string) => void }).setTooltipContent?.(
        tooltipHtml(getNombre(f), s.n, s.mm, autoridades)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCut, statsByCut, regionColor, comunaFill, autoridades])

  if (!fc) return null

  function onEachFeature(feature: Feature, layer: Layer) {
    const cut = getCut(feature)
    const nombre = getNombre(feature)
    const s = statsRef.current.get(cut) ?? { n: 0, mm: 0 }

    ;(layer as { setStyle?: (st: PathOptions) => void }).setStyle?.(
      buildComunaStyle(colorForCut(cut), cut === selectedRef.current, selectedRef.current != null)
    )

    layer.on({
      mouseover(e: LeafletMouseEvent) {
        if (cut === selectedRef.current) return
        e.target.setStyle({ fillOpacity: 0.5, weight: 0.8 })
      },
      mouseout(e: LeafletMouseEvent) {
        if (cut === selectedRef.current) return
        e.target.setStyle(buildComunaStyle(colorForCut(cut), false, selectedRef.current != null))
      },
      click(e: LeafletMouseEvent) {
        L.DomEvent.stopPropagation(e)
        onSelectRef.current(cut, nombre)
      },
    })

    layer.bindTooltip(tooltipHtml(nombre, s.n, s.mm, autoridades), { sticky: true, opacity: 0.95 })
  }

  return (
    <GeoJSON
      data={fc}
      onEachFeature={onEachFeature}
      ref={geoRef as never}
    />
  )
}
