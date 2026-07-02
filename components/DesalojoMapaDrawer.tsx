'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, Polygon, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-draw/dist/leaflet.draw.css'
import 'leaflet-draw'
import type { DesalojoCapa, DesalojoPoligono } from '@/lib/types'
import { parseWktPolygon } from '@/lib/wkt'

/**
 * Panel lateral derecho con la vista satelital del terreno del caso y
 * herramientas para dibujar o importar polígonos. Sibling del contenido
 * principal en un flex; NO overlay. Cuando el drawer de Hitos está abierto,
 * los dos comparten la columna derecha apilados verticalmente (Hitos arriba,
 * Mapa abajo — layout compuesto en DesalojoCaseView).
 *
 * Storage:
 *   - GET   /api/desalojos/[n]/poligonos            — carga inicial via aggregate GET del caso.
 *   - POST  /api/desalojos/[n]/poligonos            — crear (dibujando o WKT).
 *   - PATCH /api/desalojos/[n]/poligonos/[id]       — actualizar (rename, recolor).
 *   - DELETE /api/desalojos/[n]/poligonos/[id]      — borrar.
 *
 * Coord convention:
 *   - En la BD y en `DesalojoPoligono.coords`: [[lng, lat], ...] (GeoJSON canónico).
 *   - En Leaflet: [lat, lng]. Convertimos SOLO en el borde de dibujo/render.
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

// Paleta institucional para polígonos.
const PALETTE = [
  '#e53935', '#f57c00', '#fbc02d', '#43a047',
  '#00acc1', '#3949ab', '#8e24aa', '#616161',
] as const

// Fallback si no hay lat/lng en las capas del caso: centro geográfico de Chile.
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

// ── Toolbar: puente entre botones React y L.Draw ───────────────────────────

type DrawerBridgeRef = {
  startDrawing: () => void
}

/**
 * Componente hijo que vive dentro de `<MapContainer>` para tener acceso a
 * `useMap()`. Expone `startDrawing()` al padre via ref, y escucha
 * `draw:created` para llamar `onCreatedRaw` con los vértices en `[lng, lat]`.
 */
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
      startDrawing: () => {
        drawerRef.current?.enable()
      },
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
    if (!r.ok) {
      setError(r.error)
      return
    }
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

// ── Componente principal ───────────────────────────────────────────────────

export default function DesalojoMapaDrawer({
  open, onClose,
  prioridadId, capas, selectedCapaId,
  poligonos,
  onCreated, onUpdated, onDeleted,
}: Props) {
  const { center, zoom } = useMemo(() => computeCenter(capas, selectedCapaId), [capas, selectedCapaId])

  const bridgeRef = useRef<DrawerBridgeRef | null>(null)
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

  const handleStartDrawing = useCallback(() => {
    bridgeRef.current?.startDrawing()
  }, [])

  const handleDrawCreated = useCallback((coords: [number, number][]) => {
    setPendingCoords(coords)
  }, [])

  const handleWktParsed = useCallback((coords: [number, number][]) => {
    setWktModalOpen(false)
    setPendingCoords(coords)
  }, [])

  const handleCancelPending = useCallback(() => {
    setPendingCoords(null)
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
    if (!trimmed || trimmed === p.nombre) {
      setEditingId(null)
      return
    }
    try {
      const res = await fetch(`/api/desalojos/${prioridadId}/poligonos/${p.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nombre: trimmed }),
      })
      const json = await res.json()
      if (!res.ok || !json.poligono) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
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
      if (!res.ok || !json.poligono) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
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
      if (!res.ok) {
        window.alert(json?.error ?? `Error HTTP ${res.status}`)
        return
      }
      onDeleted(p.id)
    } catch (err) {
      window.alert(`Error de red: ${String(err)}`)
    }
  }

  if (!open) return null

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

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-gray-50">
          <button
            type="button"
            onClick={handleStartDrawing}
            disabled={!!pendingCoords || saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-900 text-white rounded-md hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
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
        </div>

        {/* Mapa */}
        <div className="relative" style={{ height: '360px' }}>
          <MapContainer
            center={center}
            zoom={zoom}
            scrollWheelZoom
            className="h-full w-full"
          >
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />
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
                  <ColorSwatchPicker
                    color={p.color}
                    onChange={c => handleRecolor(p, c)}
                  />
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

      {/* Modales */}
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
}

// ── Color swatch picker (pequeño dropdown en la lista) ─────────────────────

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
        <div className="absolute left-0 top-full mt-1 z-[6000] flex gap-1 bg-white border border-gray-200 rounded-md shadow p-1.5">
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
