'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import type { DesalojoCapa, DesalojoPoligono } from '@/lib/types'
import { parseWktPolygon, toWktPolygon } from '@/lib/wkt'

/**
 * Panel lateral derecho con vista satelital del terreno del caso y
 * herramientas para dibujar/importar polígonos. Modos:
 *
 *   - Compact: sibling del contenido principal, 440px de ancho. Cuando el
 *     drawer de Hitos está abierto, Mapa aparece justo abajo (mismo aside
 *     con flex-col en DesalojoCaseView).
 *   - Expanded ("Ampliar"): overlay fullscreen con mapa grande a la
 *     izquierda y sidebar de detalle a la derecha (nombre editable,
 *     descripción, vértices, "Centrar en mapa", recolor, borrar).
 *
 * Buscador: input Nominatim (OpenStreetMap), biased a Chile (countrycodes=cl),
 * debounced 500ms, dropdown de hasta 5 resultados. Al elegir, mapa hace
 * flyTo con zoom 17.
 *
 * Coord convention:
 *   - BD y `DesalojoPoligono.coords`: [[lng, lat], ...] (GeoJSON canónico).
 *   - Leaflet: [lat, lng]. Convertimos solo en el borde de dibujo/render.
 */

type Props = {
  open:           boolean
  onClose:        () => void
  prioridadId:    number
  capas:          DesalojoCapa[]
  selectedCapaId: number | null
  poligonos:      DesalojoPoligono[]
  onCreated:      (p: DesalojoPoligono) => void
  onUpdated:      (p: DesalojoPoligono) => void
  onDeleted:      (id: number) => void
}

const PALETTE = [
  '#e53935', '#f57c00', '#fbc02d', '#43a047',
  '#00acc1', '#3949ab', '#8e24aa', '#616161',
] as const

const FALLBACK_CENTER: [number, number] = [-33.4, -70.6]
const FALLBACK_ZOOM = 5

function computeCenter(capas: DesalojoCapa[], selectedCapaId: number | null): {
  center: [number, number]
  zoom: number
} {
  const preferred = capas.find(c => c.id === selectedCapaId)
    ?? capas.find(c => c.lat != null && c.lng != null)
  if (preferred?.lat != null && preferred?.lng != null) {
    return { center: [Number(preferred.lat), Number(preferred.lng)], zoom: 17 }
  }
  return { center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM }
}

// ── Sub-componentes internos al MapContainer (usan useMap) ─────────────────

/** Guarda la instancia de mapa en un ref para uso externo (flyTo, etc). */
function MapInstanceCapture({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap()
  useEffect(() => {
    mapRef.current = map
    return () => { mapRef.current = null }
  }, [map, mapRef])
  return null
}

type DrawerBridgeRef = { startDrawing: () => void }

function DrawControl({
  bridgeRef,
  onCreatedRaw,
}: {
  bridgeRef: React.MutableRefObject<DrawerBridgeRef | null>
  onCreatedRaw: (coords: [number, number][]) => void
}) {
  const map = useMap()
  const drawerRef = useRef<L.Draw.Polygon | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Draw = (L as any).Draw
    const drawer: L.Draw.Polygon = new Draw.Polygon(map, {
      allowIntersection: false,
      showArea: false,
      shapeOptions: { color: '#e53935', weight: 2 },
    })
    drawerRef.current = drawer

    function handleCreated(e: L.LeafletEvent) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layer = (e as any).layer as L.Polygon
      const latlngs = layer.getLatLngs() as L.LatLng[] | L.LatLng[][]
      const flat = Array.isArray(latlngs[0]) ? (latlngs[0] as L.LatLng[]) : (latlngs as L.LatLng[])
      const coords: [number, number][] = flat.map(ll => [ll.lng, ll.lat])
      onCreatedRaw(coords)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.on((L as any).Draw.Event.CREATED, handleCreated)

    bridgeRef.current = {
      startDrawing: () => { drawerRef.current?.enable() },
    }

    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.off((L as any).Draw.Event.CREATED, handleCreated)
      drawerRef.current?.disable()
      drawerRef.current = null
      bridgeRef.current = null
    }
  }, [map, bridgeRef, onCreatedRaw])

  return null
}

// ── Buscador Nominatim ─────────────────────────────────────────────────────

type NominatimResult = { display_name: string; lat: string; lon: string; place_id: number }

function useNominatimSearch(query: string) {
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 3) {
      setResults([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cl&addressdetails=0&q=${encodeURIComponent(trimmed)}`
        const res = await fetch(url, {
          signal:  controller.signal,
          headers: { 'Accept-Language': 'es-CL' },
        })
        if (res.ok) {
          const json = (await res.json()) as NominatimResult[]
          setResults(json)
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.warn('[mapa/search] Nominatim fetch failed', err)
        }
      } finally {
        setLoading(false)
      }
    }, 500)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  return { results, loading }
}

function SearchBox({
  compact,
  onSelect,
}: {
  compact?: boolean
  onSelect: (lat: number, lng: number) => void
}) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const { results, loading } = useNominatimSearch(q)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleSelect(r: NominatimResult) {
    onSelect(Number(r.lat), Number(r.lon))
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <svg
          width="14" height="14" viewBox="0 0 14 14"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        >
          <circle cx="6" cy="6" r="4"/>
          <path d="M9.5 9.5L12 12"/>
        </svg>
        <input
          type="text"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar dirección o lugar…"
          className={`w-full pl-8 pr-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white ${
            compact ? 'py-1 text-xs' : 'py-1.5 text-sm'
          }`}
        />
      </div>
      {open && (loading || results.length > 0) && (
        <div className="absolute left-0 right-0 top-full mt-1 z-[6500] bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-500">Buscando…</div>
          )}
          {!loading && results.map(r => (
            <button
              key={r.place_id}
              type="button"
              onClick={() => handleSelect(r)}
              className="block w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-100"
              title={r.display_name}
            >
              <span className="line-clamp-2">{r.display_name}</span>
            </button>
          ))}
          {!loading && results.length === 0 && q.trim().length >= 3 && (
            <div className="px-3 py-2 text-xs text-gray-500">Sin resultados.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Modal para nombre + color ──────────────────────────────────────────────

type PendingPoligono = {
  coords: [number, number][]
  nombre: string
  color:  string
}

function NameColorModal({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingPoligono
  onCancel: () => void
  onConfirm: (nombre: string, color: string) => void
}) {
  const [nombre, setNombre] = useState(pending.nombre)
  const [color,  setColor]  = useState(pending.color)
  const canSave = nombre.trim().length > 0

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">Nombre y color del polígono</h3>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Nombre</label>
          <input
            type="text"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="Ej: Recuperado 2025-Q4"
            autoFocus
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-700">Color</label>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-lg border-2 transition-transform ${color === c ? 'border-slate-900 scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
          <button
            type="button"
            onClick={() => canSave && onConfirm(nombre.trim(), color)}
            disabled={!canSave}
            className="px-4 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal para pegar WKT ───────────────────────────────────────────────────

function WktModal({
  onCancel,
  onParsed,
}: {
  onCancel: () => void
  onParsed: (coords: [number, number][]) => void
}) {
  const [wkt, setWkt]     = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleParse() {
    const r = parseWktPolygon(wkt)
    if (!r.ok) { setError(r.error); return }
    onParsed(r.value)
  }

  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-lg bg-white rounded-xl shadow-xl p-5 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-900">Pegar coordenadas WKT</h3>
        <p className="text-xs text-gray-500">
          Formato: <code className="text-[11px] bg-gray-100 px-1 rounded">POLYGON((lng lat, lng lat, ...))</code>
        </p>
        <textarea
          value={wkt}
          onChange={e => { setWkt(e.target.value); setError(null) }}
          rows={6}
          placeholder="POLYGON((-73.05 -36.83, -73.04 -36.83, -73.04 -36.82, -73.05 -36.82))"
          className="w-full px-3 py-2 text-xs font-mono border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          autoFocus
        />
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
          <button
            type="button"
            onClick={handleParse}
            disabled={!wkt.trim()}
            className="px-4 py-1.5 text-sm font-medium bg-slate-900 text-white rounded-lg hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Continuar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Color swatch picker inline (para la lista) ─────────────────────────────

function ColorSwatchPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        title="Cambiar color"
        className="w-4 h-4 rounded ring-1 ring-gray-300"
        style={{ backgroundColor: color }}
        aria-label="Cambiar color"
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-[7500] flex gap-1 bg-white border border-gray-200 rounded-md shadow p-1.5">
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false) }}
              className={`w-5 h-5 rounded ${c === color ? 'ring-2 ring-slate-900' : 'ring-1 ring-gray-200'}`}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Cálculo de centroid aproximado (promedio de vértices) ──────────────────

function centroid(coords: [number, number][]): [number, number] {
  const n = coords.length
  const [sx, sy] = coords.reduce<[number, number]>(
    (acc, [x, y]) => [acc[0] + x, acc[1] + y],
    [0, 0],
  )
  return [sx / n, sy / n]
}

// ── Componente principal ───────────────────────────────────────────────────

export default function DesalojoMapaDrawer(props: Props) {
  const {
    open, onClose,
    prioridadId, capas, selectedCapaId,
    poligonos,
    onCreated, onUpdated, onDeleted,
  } = props

  const { center, zoom } = useMemo(() => computeCenter(capas, selectedCapaId), [capas, selectedCapaId])

  const [expanded, setExpanded]           = useState(false)
  const bridgeRef                         = useRef<DrawerBridgeRef | null>(null)
  const mapRef                            = useRef<L.Map | null>(null)
  const [pendingCoords, setPendingCoords] = useState<[number, number][] | null>(null)
  const [wktModalOpen, setWktModalOpen]   = useState(false)
  const [visibility, setVisibility]       = useState<Record<number, boolean>>({})
  const [editingId, setEditingId]         = useState<number | null>(null)
  const [editingName, setEditingName]     = useState('')
  const [saving, setSaving]               = useState(false)

  const visible = useCallback((id: number) => visibility[id] !== false, [visibility])
  const toggleVisible = useCallback((id: number) => {
    setVisibility(v => ({ ...v, [id]: v[id] === false ? true : false }))
  }, [])

  const handleStartDrawing  = useCallback(() => bridgeRef.current?.startDrawing(), [])
  const handleDrawCreated   = useCallback((coords: [number, number][]) => setPendingCoords(coords), [])
  const handleWktParsed     = useCallback((coords: [number, number][]) => { setWktModalOpen(false); setPendingCoords(coords) }, [])
  const handleCancelPending = useCallback(() => setPendingCoords(null), [])
  const handleSearchSelect  = useCallback((lat: number, lng: number) => {
    mapRef.current?.flyTo([lat, lng], 17)
  }, [])

  const handleConfirmPending = useCallback(async (nombre: string, color: string) => {
    if (!pendingCoords) return
    setSaving(true)
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nombre, color, coords: pendingCoords }),
      })
      const json = await res.json()
      if (!res.ok || !json.poligono) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      onCreated(json.poligono as DesalojoPoligono)
      setPendingCoords(null)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }, [pendingCoords, prioridadId, onCreated])

  async function handleRename(p: DesalojoPoligono, nuevoNombre: string) {
    const trimmed = nuevoNombre.trim()
    if (!trimmed || trimmed === p.nombre) { setEditingId(null); return }
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nombre: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json.poligono) { window.alert(json?.error ?? `Error HTTP ${res.status}`); return }
      onUpdated(json.poligono as DesalojoPoligono)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    } finally {
      setEditingId(null)
    }
  }

  async function handleRecolor(p: DesalojoPoligono, color: string) {
    if (color === p.color) return
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ color }),
      })
      const json = await res.json()
      if (!res.ok || !json.poligono) { window.alert(json?.error ?? `Error HTTP ${res.status}`); return }
      onUpdated(json.poligono as DesalojoPoligono)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleUpdateDescripcion(p: DesalojoPoligono, descripcion: string) {
    const nueva = descripcion.trim()
    if ((nueva || null) === p.descripcion) return
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ descripcion: nueva || null }),
      })
      const json = await res.json()
      if (!res.ok || !json.poligono) { window.alert(json?.error ?? `Error HTTP ${res.status}`); return }
      onUpdated(json.poligono as DesalojoPoligono)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  async function handleDelete(p: DesalojoPoligono) {
    if (!window.confirm(`¿Borrar el polígono "${p.nombre}"?`)) return
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos/${p.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) { window.alert(json?.error ?? `Error HTTP ${res.status}`); return }
      onDeleted(p.id)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  function handleCenterOn(p: DesalojoPoligono) {
    if (p.coords.length === 0) return
    const [cx, cy] = centroid(p.coords)
    mapRef.current?.flyTo([cy, cx], 18)
  }

  if (!open) return null

  // ── Contenido del mapa reutilizado por ambos modos ────────────────────────
  const mapContent = (
    <>
      <TileLayer
        attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
      />
      <MapInstanceCapture mapRef={mapRef} />
      <DrawControl bridgeRef={bridgeRef} onCreatedRaw={handleDrawCreated} />
      {poligonos.filter(p => visible(p.id)).map(p => {
        const latlngs: [number, number][] = p.coords.map(([lng, lat]) => [lat, lng])
        return (
          <Polygon
            key={p.id}
            positions={latlngs}
            pathOptions={{ color: p.color, fillOpacity: 0.35, weight: 2 }}
          >
            <Popup>
              <div className="text-xs">
                <p className="font-semibold text-gray-900">{p.nombre}</p>
                {p.descripcion && <p className="text-gray-600 mt-1">{p.descripcion}</p>}
              </div>
            </Popup>
          </Polygon>
        )
      })}
      {pendingCoords && (
        <Polygon
          positions={pendingCoords.map(([lng, lat]) => [lat, lng] as [number, number])}
          pathOptions={{ color: '#e53935', fillOpacity: 0.15, weight: 2, dashArray: '4 4' }}
        />
      )}
    </>
  )

  // ── Modales compartidos ───────────────────────────────────────────────────
  const modals = (
    <>
      {pendingCoords && (
        <NameColorModal
          pending={{ coords: pendingCoords, nombre: '', color: PALETTE[0] }}
          onCancel={handleCancelPending}
          onConfirm={handleConfirmPending}
        />
      )}
      {wktModalOpen && !pendingCoords && (
        <WktModal
          onCancel={() => setWktModalOpen(false)}
          onParsed={handleWktParsed}
        />
      )}
    </>
  )

  // ── Botones de toolbar reutilizados ───────────────────────────────────────
  function ToolbarActions({ inline = false }: { inline?: boolean }) {
    return (
      <>
        <button
          type="button"
          onClick={handleStartDrawing}
          disabled={!!pendingCoords || saving}
          className={`inline-flex items-center gap-1.5 px-3 ${inline ? 'py-1.5' : 'py-1.5'} text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10L10 2M2 10l3-1M2 10l1-3"/>
          </svg>
          Dibujar
        </button>
        <button
          type="button"
          onClick={() => setWktModalOpen(true)}
          disabled={!!pendingCoords || saving}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-40"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 3h8M2 6h8M2 9h8"/>
          </svg>
          Pegar WKT
        </button>
      </>
    )
  }

  // ── Modo Expanded (fullscreen overlay) ────────────────────────────────────
  if (expanded) {
    return (
      <>
        <div className="fixed inset-0 z-[7000] bg-white flex flex-col">
          {/* Top bar */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 bg-white">
            <div>
              <h2 className="text-base font-bold text-gray-900">Mapa del caso</h2>
              <p className="text-[11px] text-gray-500 leading-tight">
                {poligonos.length} polígono{poligonos.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex-1 max-w-md">
              <SearchBox onSelect={handleSearchSelect} />
            </div>
            <div className="flex items-center gap-2">
              <ToolbarActions />
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-100"
              title="Reducir mapa"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H8V1M1 8h3v3M8 1l3 3M4 11L1 8"/>
              </svg>
              Reducir
            </button>
          </header>

          {/* Body */}
          <div className="flex-1 flex overflow-hidden">
            {/* Mapa */}
            <div className="flex-1 relative bg-gray-100">
              <MapContainer
                key="map-expanded"
                center={center}
                zoom={zoom}
                scrollWheelZoom
                className="h-full w-full"
              >
                {mapContent}
              </MapContainer>
            </div>
            {/* Sidebar de detalle */}
            <aside className="w-[400px] border-l border-gray-200 bg-white overflow-y-auto">
              {poligonos.length === 0 ? (
                <p className="text-xs text-gray-500 px-4 py-6 text-center">
                  Sin polígonos todavía. Dibujá el primero con la herramienta o pegá coordenadas WKT.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {poligonos.map(p => (
                    <li key={p.id} className="p-4 space-y-2.5">
                      <div className="flex items-start gap-2">
                        <ColorSwatchPicker color={p.color} onChange={c => handleRecolor(p, c)} />
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            defaultValue={p.nombre}
                            onBlur={e => handleRename(p, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            className="w-full text-sm font-semibold text-gray-900 border-b border-transparent hover:border-gray-200 focus:border-slate-900 focus:outline-none pb-0.5"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleVisible(p.id)}
                            title={visible(p.id) ? 'Ocultar' : 'Mostrar'}
                            className="text-gray-400 hover:text-gray-700 p-0.5"
                          >
                            {visible(p.id) ? (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/>
                              </svg>
                            ) : (
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M1 8s2.5-5 7-5c1.5 0 2.8.5 3.9 1.2M15 8s-2.5 5-7 5c-1.5 0-2.8-.5-3.9-1.2"/><path d="M2 14L14 2"/>
                              </svg>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p)}
                            className="text-gray-400 hover:text-rose-600 p-0.5"
                            title="Borrar polígono"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                              <path d="M2 3.5h10M5.5 3v-1a1 1 0 011-1h1a1 1 0 011 1v1M3.5 3.5v9a1 1 0 001 1h5a1 1 0 001-1v-9"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <textarea
                        defaultValue={p.descripcion ?? ''}
                        onBlur={e => handleUpdateDescripcion(p, e.target.value)}
                        placeholder="Sin descripción…"
                        rows={2}
                        className="w-full text-xs text-gray-700 border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900 resize-none"
                      />
                      <div className="flex items-center justify-between text-[11px] text-gray-500">
                        <span>{p.coords.length} vértices</span>
                        <button
                          type="button"
                          onClick={() => handleCenterOn(p)}
                          className="text-slate-700 hover:text-slate-900 font-medium"
                        >
                          Centrar en mapa
                        </button>
                      </div>
                      <details className="text-[10px] text-gray-500">
                        <summary className="cursor-pointer hover:text-gray-700">WKT</summary>
                        <pre className="mt-1 p-2 bg-gray-50 rounded font-mono text-[10px] leading-tight break-all whitespace-pre-wrap">
                          {toWktPolygon(p.coords)}
                        </pre>
                      </details>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </div>
        {modals}
      </>
    )
  }

  // ── Modo Compact (drawer 440px) ───────────────────────────────────────────
  return (
    <>
      <aside
        className="w-[440px] flex-shrink-0 flex flex-col bg-white border border-gray-200 rounded-xl overflow-hidden"
        aria-label="Mapa del caso"
      >
        {/* Header */}
        <header className="flex items-start gap-3 px-4 py-3 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Mapa del caso</h2>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">
              {poligonos.length} polígono{poligonos.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-gray-400 hover:text-gray-700 p-1"
            aria-label="Ampliar mapa"
            title="Ampliar mapa"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2H2v4M14 6V2h-4M2 10v4h4M10 14h4v-4"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 -mr-1"
            aria-label="Cerrar mapa"
            title="Cerrar mapa"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </header>

        {/* Buscador */}
        <div className="px-4 pt-3">
          <SearchBox compact onSelect={handleSearchSelect} />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200">
          <ToolbarActions />
        </div>

        {/* Mapa */}
        <div className="relative" style={{ height: '320px' }}>
          <MapContainer
            key="map-compact"
            center={center}
            zoom={zoom}
            scrollWheelZoom
            className="h-full w-full"
          >
            {mapContent}
          </MapContainer>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto px-2 py-2 max-h-[220px]">
          {poligonos.length === 0 ? (
            <p className="text-xs text-gray-500 px-2 py-4 text-center">
              Sin polígonos todavía. Dibujá el primero con la herramienta o pegá coordenadas WKT.
            </p>
          ) : (
            <ul className="space-y-1">
              {poligonos.map(p => (
                <li key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50">
                  <button
                    type="button"
                    onClick={() => toggleVisible(p.id)}
                    title={visible(p.id) ? 'Ocultar' : 'Mostrar'}
                    className="text-gray-400 hover:text-gray-700"
                    aria-label={visible(p.id) ? 'Ocultar polígono' : 'Mostrar polígono'}
                  >
                    {visible(p.id) ? (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
                        <circle cx="8" cy="8" r="2"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 8s2.5-5 7-5c1.5 0 2.8.5 3.9 1.2M15 8s-2.5 5-7 5c-1.5 0-2.8-.5-3.9-1.2"/>
                        <path d="M2 14L14 2"/>
                      </svg>
                    )}
                  </button>
                  <ColorSwatchPicker color={p.color} onChange={c => handleRecolor(p, c)} />
                  {editingId === p.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onBlur={() => handleRename(p, editingName)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')   { e.currentTarget.blur() }
                        if (e.key === 'Escape')  { setEditingId(null) }
                      }}
                      autoFocus
                      className="flex-1 min-w-0 px-2 py-0.5 text-xs border border-gray-300 rounded"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditingId(p.id); setEditingName(p.nombre) }}
                      className="flex-1 min-w-0 text-left text-xs text-gray-900 hover:text-slate-700 truncate"
                    >
                      {p.nombre}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCenterOn(p)}
                    className="text-gray-400 hover:text-slate-900"
                    title="Centrar en mapa"
                    aria-label="Centrar en mapa"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="7" cy="7" r="4"/>
                      <circle cx="7" cy="7" r="1" fill="currentColor"/>
                      <path d="M7 1v2M7 11v2M1 7h2M11 7h2"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(p)}
                    className="text-gray-400 hover:text-rose-600"
                    title="Borrar polígono"
                    aria-label="Borrar polígono"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M2 3.5h10M5.5 3v-1a1 1 0 011-1h1a1 1 0 011 1v1M3.5 3.5v9a1 1 0 001 1h5a1 1 0 001-1v-9"/>
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {modals}
    </>
  )
}
