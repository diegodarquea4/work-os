'use client'

import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, useMap, useMapEvent } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { INE_CODE, REGIONS } from '@/lib/regions'
import { parseCoordenada, pareceInvertida, parseDecimal, formatoCoordenada, type Coordenada } from '@/lib/coordenadas'
import { cargarCentroidesRegion } from './ComunasLayer'

/**
 * Popover «Ubicación» de la ficha (mig 104). Dos formas de fijar el punto:
 * pegar "lat, lng" (o un link de Google Maps) o hacer clic en el mini mapa.
 * Guardar / Quitar / Cancelar — nada más. Importa Leaflet: el padre lo monta
 * con `dynamic(..., { ssr: false })`.
 *
 * El mapa abre centrado en el punto actual; si no hay, en el centroide de la
 * primera comuna de la iniciativa (baja el geojson si hace falta); si tampoco,
 * en la capital regional.
 */

type Props = {
  regionCod: string
  comunaCods: number[]
  valor: Coordenada | null
  saving: boolean
  onSave: (c: Coordenada) => void
  onClear: () => void
  onClose: () => void
}

function ClickHandler({ onPick }: { onPick: (c: Coordenada) => void }) {
  useMapEvent('click', e => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }))
  return null
}

// Re-encuadra cuando llega el centroide de la comuna (async) o cambia el punto.
function Recenter({ centro, zoom }: { centro: Coordenada; zoom: number }) {
  const map = useMap()
  useEffect(() => { map.setView([centro.lat, centro.lng], zoom) }, [map, centro.lat, centro.lng, zoom])
  return null
}

export default function UbicacionPopover({ regionCod, comunaCods, valor, saving, onSave, onClear, onClose }: Props) {
  const [draft, setDraft] = useState<Coordenada | null>(valor)
  const [texto, setTexto] = useState(valor ? formatoCoordenada(valor.lat, valor.lng) : '')
  const [error, setError] = useState<string | null>(null)
  const [centroComuna, setCentroComuna] = useState<Coordenada | null>(null)

  const region = REGIONS.find(r => r.cod === regionCod)
  const cutPrimera = comunaCods[0]

  useEffect(() => {
    if (cutPrimera == null) return
    let cancelled = false
    cargarCentroidesRegion(INE_CODE[regionCod]).then(c => {
      const p = c?.[cutPrimera]
      if (!cancelled && p) setCentroComuna({ lat: p[0], lng: p[1] })
    })
    return () => { cancelled = true }
  }, [regionCod, cutPrimera])

  // Centro/zoom del mini mapa: punto > comuna > capital regional.
  const { centro, zoom } = useMemo(() => {
    if (draft) return { centro: draft, zoom: 14 }
    if (centroComuna) return { centro: centroComuna, zoom: 11 }
    return { centro: { lat: region?.lat ?? -33.45, lng: region?.lng ?? -70.65 }, zoom: 8 }
  }, [draft, centroComuna, region])

  function aplicarTexto() {
    const c = parseCoordenada(texto)
    if (c) { setDraft(c); setError(null); return }
    // Diagnóstico útil: ¿son dos números pero invertidos?
    const partes = texto.split(/[,;\s]+/).filter(Boolean)
    const a = parseDecimal(partes[0] ?? ''), b = parseDecimal(partes[1] ?? '')
    if (partes.length === 2 && a != null && b != null && pareceInvertida(a, b)) {
      setError('Parece latitud y longitud al revés: en Chile la latitud va entre -17 y -56 (ej: -33.45, -70.66).')
    } else {
      setError('No se reconoce. Pega "latitud, longitud" (ej: -33.4489, -70.6693) o un enlace de Google Maps.')
    }
  }

  function elegir(c: Coordenada) {
    setDraft(c)
    setTexto(formatoCoordenada(c.lat, c.lng))
    setError(null)
  }

  return (
    <div className={`absolute z-10 top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5 space-y-2 ${saving ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex gap-1.5">
        <input
          type="text"
          autoFocus
          value={texto}
          onChange={e => { setTexto(e.target.value); setError(null) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); aplicarTexto() } }}
          placeholder="-33.4489, -70.6693 o enlace de Google Maps"
          className="flex-1 min-w-0 text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-700 placeholder-gray-400 outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-200"
        />
        <button
          type="button"
          onClick={aplicarTexto}
          className="text-xs px-2 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          Ubicar
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600 leading-snug">{error}</p>}

      <div className="h-44 rounded-md overflow-hidden border border-gray-200">
        <MapContainer
          center={[centro.lat, centro.lng]}
          zoom={zoom}
          zoomControl={false}
          attributionControl={false}
          className="h-full w-full"
        >
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
            maxNativeZoom={16}
          />
          <Recenter centro={centro} zoom={zoom} />
          <ClickHandler onPick={elegir} />
          {draft && (
            <CircleMarker
              center={[draft.lat, draft.lng]}
              radius={7}
              pathOptions={{ color: '#fff', weight: 2, fillColor: '#7c3aed', fillOpacity: 0.95 }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        Haz clic en el mapa para poner o mover el punto.
        {!draft && centroComuna && ' El mapa parte en la comuna de la iniciativa.'}
      </p>

      <div className="flex items-center gap-2 pt-0.5">
        {valor && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] text-gray-400 hover:text-red-600"
            title="Volver a dejar la iniciativa sin ubicación exacta"
          >
            Quitar
          </button>
        )}
        <div className="flex-1" />
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => draft && onSave(draft)}
          disabled={!draft || (valor != null && draft.lat === valor.lat && draft.lng === valor.lng)}
          className="text-xs bg-slate-900 text-white px-3 py-1 rounded-md hover:bg-slate-700 disabled:opacity-40"
        >
          Guardar
        </button>
      </div>
    </div>
  )
}
