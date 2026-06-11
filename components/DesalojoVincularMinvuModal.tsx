'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CatastroEntry } from '@/lib/types'

/**
 * Modal para buscar una entrada del catastro MINVU CNC 2026 y vincularla a
 * una capa. Al confirmar, devuelve { folio_minvu, lat, lng } al padre que
 * hace el PATCH.
 *
 * UX:
 *   - Search input con debounce 250ms.
 *   - Filtro region preset (la región del caso) — el usuario lo puede limpiar.
 *   - Lista de resultados: folio · nombre · comuna · hogares.
 *   - Tab Enter sobre un resultado lo confirma.
 *
 * Si la capa ya tiene folio vinculado, lo pasa como `currentFolio` para
 * destacarlo en la lista (con un "✓ Actual").
 */

type Props = {
  open:          boolean
  onClose:       () => void
  onConfirm:     (entry: CatastroEntry) => Promise<void> | void
  regionPreset?: string   // Nombre de la región del caso (filtro inicial).
  currentFolio?: string | null
}

export default function DesalojoVincularMinvuModal({
  open, onClose, onConfirm, regionPreset, currentFolio,
}: Props) {
  const [query,   setQuery]   = useState('')
  const [region,  setRegion]  = useState<string | null>(regionPreset ?? null)
  const [results, setResults] = useState<CatastroEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [pick,    setPick]    = useState<CatastroEntry | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  // Resetear cuando se abre.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setPick(null)
    setError(null)
    setRegion(regionPreset ?? null)
    // Foco en el input.
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [open, regionPreset])

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, saving])

  // Fetch debounced.
  useEffect(() => {
    if (!open) return
    if (!query.trim() && !region) { setResults([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (query.trim()) params.set('q', query.trim())
        if (region)       params.set('region', region)
        params.set('limit', '50')
        const res = await fetch(`/api/catastro-minvu?${params}`, { signal: ctrl.signal })
        const json = await res.json()
        if (!res.ok) {
          setError(json?.error ?? `Error HTTP ${res.status}`)
          setResults([])
        } else {
          setResults(json.results ?? [])
        }
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return
        setError(`Error de red: ${String(err)}`)
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, region, open])

  async function confirmar(entry: CatastroEntry) {
    setSaving(true)
    try {
      await onConfirm(entry)
      onClose()
    } catch (err) {
      setError(`Error al vincular: ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  const placeholder = useMemo(() => {
    if (region) return `Buscar en ${region}…`
    return 'Buscar por nombre, comuna o folio…'
  }, [region])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start justify-center px-4 py-12"
      onClick={() => { if (!saving) onClose() }}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Vincular folio MINVU"
      >
        {/* Header */}
        <header className="px-5 py-4 border-b border-gray-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Vincular al catastro MINVU</h2>
            <p className="text-xs text-gray-500 mt-0.5 leading-snug">
              CNC 2026 — Catastro Nacional de Campamentos. Vincular hereda coords, propietario y hogares oficiales.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-gray-400 hover:text-gray-700 p-1 -mr-1 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </header>

        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400 focus:border-transparent"
          />
          {regionPreset && (
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-gray-500">Filtro región:</span>
              <button
                type="button"
                onClick={() => setRegion(region ? null : regionPreset)}
                className={`px-2 py-0.5 rounded-full font-medium ring-1 transition-colors ${
                  region
                    ? 'bg-slate-900 text-white ring-slate-900'
                    : 'bg-white text-gray-500 ring-gray-300 hover:ring-gray-400'
                }`}
              >
                {region ?? `+ ${regionPreset}`}
              </button>
              {region && (
                <span className="text-gray-400">Click para limpiar y buscar en todo el país</span>
              )}
            </div>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}
          {loading && (
            <p className="px-5 py-6 text-center text-sm text-gray-400">Buscando…</p>
          )}
          {!loading && !error && results.length === 0 && (query.trim() || region) && (
            <p className="px-5 py-6 text-center text-sm text-gray-400">
              Sin resultados. Probá con otra búsqueda{region && ' o quita el filtro región'}.
            </p>
          )}
          {!loading && !query.trim() && !region && (
            <p className="px-5 py-6 text-center text-sm text-gray-400">
              Escribe nombre, comuna o folio para empezar.
            </p>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {results.map(entry => {
                const isCurrent  = entry.folio === currentFolio
                const isSelected = pick?.folio === entry.folio
                return (
                  <li key={entry.folio}>
                    <button
                      type="button"
                      onClick={() => setPick(entry)}
                      onDoubleClick={() => confirmar(entry)}
                      className={`w-full text-left px-5 py-2.5 hover:bg-gray-50 transition-colors ${
                        isSelected ? 'bg-slate-50 ring-1 ring-inset ring-slate-300' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {entry.nombre}
                            {isCurrent && (
                              <span className="ml-2 text-[10px] uppercase tracking-wide font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                Actual
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-tight">
                            {entry.comuna} · {entry.region} ·{' '}
                            <span className="text-gray-700">Folio {entry.folio}</span>
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-gray-500 leading-tight whitespace-nowrap shrink-0">
                          {entry.hogares_catastro !== null && (
                            <p><span className="font-semibold text-gray-900">{entry.hogares_catastro}</span> hog.</p>
                          )}
                          {entry.tipo_propiedad && (
                            <p>{entry.tipo_propiedad}</p>
                          )}
                          <p className="text-gray-400">{entry.catastro_ingreso.replace(/^CATASTRO[ _]/, '')}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="px-5 py-3 border-t border-gray-200 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-500 leading-tight">
            {pick
              ? <>Seleccionado: <span className="font-semibold text-gray-900">{pick.nombre}</span> (folio {pick.folio})</>
              : 'Selecciona una entrada y confirma.'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => pick && confirmar(pick)}
              disabled={!pick || saving}
              className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold"
            >
              {saving ? 'Vinculando…' : 'Vincular'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
