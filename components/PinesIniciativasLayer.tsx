'use client'

import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import type { PinIniciativa } from '@/lib/pinesIniciativas'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { getRegionColor } from '@/lib/regionColors'

/**
 * Pines de iniciativas del drill comunal (mig 104). Recibe la lista YA
 * calculada por `construirPines` (lib/pinesIniciativas.ts) — acá solo se
 * dibuja. SOLO llegan iniciativas con `ubicacion_lat/lng` cargada (Diego,
 * 2026-09-11: descartó el centroide de comuna como aproximación — prefiere
 * el drill vacío antes que un pin que no representa una ubicación real).
 *
 * REESCRITO 2026-09-10 (feedback de Diego, primera pasada con datos reales):
 * la v1 dibujaba círculos en un `L.Canvas` compartido. Un `L.Canvas` cubre
 * TODO el pane con un único <canvas> que por defecto tiene
 * `pointer-events: auto` en su rectángulo entero (a diferencia de los path
 * SVG, que Leaflet pone en `none` y solo activa por shape via la clase
 * `leaflet-interactive`) — así que ese canvas interceptaba clicks/hover en
 * CUALQUIER punto del drill, no solo sobre un pin: el click sobre una comuna
 * quedaba atrapado antes de llegar al polígono, y como el canvas nunca se
 * sacaba del mapa al desmontar (solo se vaciaba el layerGroup, no
 * `map.removeLayer(renderer)`), el cursor podía quedar pegado en "manito" y
 * bloqueando clicks incluso después de salir del drill. Ahora son
 * `L.Marker` de verdad: cada pin es su propio nodo pequeño
 * (`leaflet-marker-icon`, `pointer-events: none` salvo sobre el ícono), así
 * que el resto del mapa queda libre, y al desmontar cada Marker se limpia
 * solo — sin nada persistente en el mapa.
 *
 * Estilo pin tipo Google Maps (gota), color = el de SU región (no el semáforo
 * — pedido explícito de Diego: "un color genérico como el de la región", no
 * puntos multicolor). El semáforo se preserva como texto en el tooltip para no
 * perder la señal, junto al nombre de la región: desde el 2026-09-14 la capa
 * siempre puede traer varias a la vez (el drill comunal muestra también las
 * vecinas, para poder desplazarse sin salir a la vista país).
 *
 * Los clicks NO deben llegar al polígono de la comuna ni al mapa (que
 * cerraría el detalle), y el dblclick NO debe disparar el drill regional.
 */

type Props = {
  pines: PinIniciativa[]
  onSelect: (id: number) => void
}

// Chico a propósito (Diego, 2026-09-10: la v1 a 22×30 se veía "muy grande"
// sobre el drill comunal) — el viewBox del path se mantiene, solo se achica
// el tamaño renderizado.
const PIN_W = 14
const PIN_H = 19
const ANCHOR: L.PointExpression = [PIN_W / 2, PIN_H]

// Gota de mapa clásica con un punto blanco al centro. Trazo siempre sólido.
function pinSvg(color: string): string {
  return `<svg width="${PIN_W}" height="${PIN_H}" viewBox="0 0 22 30" xmlns="http://www.w3.org/2000/svg" style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
    <path d="M11 0C4.9 0 0 4.9 0 11c0 8.25 11 19 11 19s11-10.75 11-19C22 4.9 17.1 0 11 0z"
          fill="${color}" stroke="#fff" stroke-width="1.4"/>
    <circle cx="11" cy="11" r="4" fill="#fff"/>
  </svg>`
}

function buildIcon(color: string): L.DivIcon {
  return L.divIcon({
    html: pinSvg(color),
    className: 'workos-pin-iniciativa',
    iconSize: [PIN_W, PIN_H],
    iconAnchor: ANCHOR,
  })
}

// El `.leaflet-tooltip` de Leaflet trae `white-space: nowrap` por defecto
// (para que tooltips cortos no se estiren) — sin resetearlo acá, un nombre
// largo no envuelve: el tooltip entero se ensancha y se sale del mapa. Se
// resetea en el div de contenido, no en el className del tooltip (evita
// tocar CSS global).
function tooltipHtml(pin: PinIniciativa): string {
  const nombre = pin.nombre.replace(/</g, '&lt;')
  const sem = SEMAFORO_CONFIG[pin.semaforo]?.label ?? SEMAFORO_CONFIG.gris.label
  // La región SIEMPRE: hasta dentro de un drill la capa trae las vecinas.
  const pie = `${pin.region.replace(/</g, '&lt;')} · ${sem}`
  return `<div style="font-size:12px;font-weight:600;line-height:1.4;white-space:normal;width:220px">${nombre}
    <br><span style="color:#6b7280;font-weight:400">${pie}</span></div>`
}

export default function PinesIniciativasLayer({ pines, onSelect }: Props) {
  const map = useMap()
  const onSelectRef = useRef(onSelect)
  useEffect(() => { onSelectRef.current = onSelect })

  useEffect(() => {
    const grupo = L.layerGroup().addTo(map)
    const tooltip = L.tooltip({ sticky: true, opacity: 0.95, direction: 'top', offset: [0, -PIN_H] })

    // Un ícono por COLOR, no por pin: la capa siempre puede traer varias
    // regiones, y construir un divIcon por marker sería rehacer el mismo SVG
    // cientos de veces. El caché vive dentro del effect, que es exactamente lo
    // que viven los markers.
    const iconos = new Map<string, L.DivIcon>()
    const iconoDe = (pin: PinIniciativa): L.DivIcon => {
      const color = getRegionColor(pin.region)
      let icono = iconos.get(color)
      if (!icono) { icono = buildIcon(color); iconos.set(color, icono) }
      return icono
    }

    for (const pin of pines) {
      const marker = L.marker([pin.lat, pin.lng], { icon: iconoDe(pin), riseOnHover: true, keyboard: false })
      marker.on({
        mouseover(e: L.LeafletMouseEvent) {
          tooltip.setContent(tooltipHtml(pin)).setLatLng(e.latlng).addTo(map)
        },
        mousemove(e: L.LeafletMouseEvent) { tooltip.setLatLng(e.latlng) },
        mouseout() { map.removeLayer(tooltip) },
        click(e: L.LeafletMouseEvent) {
          L.DomEvent.stopPropagation(e)
          map.removeLayer(tooltip)
          onSelectRef.current(pin.id)
        },
        dblclick(e: L.LeafletMouseEvent) { L.DomEvent.stopPropagation(e) },
      })
      grupo.addLayer(marker)
    }

    return () => {
      map.removeLayer(tooltip)
      grupo.clearLayers()
      map.removeLayer(grupo)
    }
  }, [map, pines])

  return null
}
