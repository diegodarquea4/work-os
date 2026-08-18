'use client'

/**
 * Estado + datos del modo «Autoridades» del Mapa. Un hook (`useTerritorialMode`)
 * que WorkOSApp llama para poder pasar el `overlay` a ChileMap, y un contexto
 * (`TerritorialProvider` / `useTerritorialCtx`) para que la barra, leyenda, stat
 * bar, sidebar, fichas y modales lo consuman sin prop-drilling.
 *
 * `TerrState` (controles: nivel, año, criterio, etc.) vive acá — local a la vista
 * Mapa. `selectedRegion` / `mapDrill` siguen en WorkOSApp (compartidos con PSG).
 */

import { createContext, useContext, useCallback, useMemo, useState } from 'react'
import { useTerritorial } from '@/lib/hooks/useTerritorial'
import {
  fillForRegion, fillForComuna, fillForTerritorioCongreso, esNivelCongreso,
} from '@/lib/territorial/derive'
import type { TerritorialData, TerrState } from '@/lib/territorial/types'
import type { CarritoItem } from '@/lib/territorial/carrito'

/** Diccionarios de coloreo que consume ChileMap/ComunasLayer/TerritoriosLayer. */
export interface MapaAutoridadesOverlay {
  /** INE (numérico) → color de la región. */
  regionFill: Record<number, string>
  /** CUT (numérico) → color de la comuna. */
  comunaFill: Record<number, string>
  /** Solo en congreso + coloreo por distrito: capa de territorios. null si no aplica. */
  territorios: {
    tipo: 'distrito' | 'circunscripcion'
    fill: Record<string, string>
  } | null
}

/** Cuál de los paneles flotantes está abierto (mutuamente excluyentes). */
export type PanelAbierto = 'controles' | 'simbologia' | null

export interface TerritorialContextValue {
  active: boolean
  data: TerritorialData | null
  loading: boolean
  error: string | null
  state: TerrState
  setState: (patch: Partial<TerrState>) => void
  overlay: MapaAutoridadesOverlay | null
  /** Panel flotante abierto; abrir uno colapsa el otro. */
  panelAbierto: PanelAbierto
  setPanelAbierto: (p: PanelAbierto) => void
  /** Territorio de congreso seleccionado (vista por distrito → ficha de electos). */
  selectedTerritorio: string | null
  setSelectedTerritorio: (t: string | null) => void
  carrito: CarritoItem[]
  addCarrito: (items: CarritoItem[]) => number
  clearCarrito: () => void
}

const DEFAULT_STATE: TerrState = {
  year: '2024',
  lado: 'lado_abierto',
  nivel: 'alcalde',
  congresoAnio: '2025',
  coloreoCongreso: 'comuna',
  periodoDelegado: 'Gabriel Boric Font',
}

const STATE_KEY = 'workos:autoridadesState'
const CARRITO_KEY = 'workos:autoridadesCarrito'

function readStoredState(): TerrState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = window.localStorage.getItem(STATE_KEY)
    if (raw) return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch { /* noop */ }
  return DEFAULT_STATE
}

function readStoredCarrito(): CarritoItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(CARRITO_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* noop */ }
  return []
}

/** Hook maestro: carga datos (cuando `active`), estado de controles y overlay. */
export function useTerritorialMode(active: boolean): TerritorialContextValue {
  const { data, loading, error } = useTerritorial(active)
  const [state, setStateRaw] = useState<TerrState>(readStoredState)
  const [carrito, setCarrito] = useState<CarritoItem[]>(readStoredCarrito)
  const [selectedTerritorio, setSelectedTerritorio] = useState<string | null>(null)
  const [panelAbierto, setPanelAbierto] = useState<PanelAbierto>(null)

  const setState = useCallback((patch: Partial<TerrState>) => {
    setStateRaw((prev) => {
      const next = { ...prev, ...patch }
      try { window.localStorage.setItem(STATE_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
  }, [])

  const addCarrito = useCallback((items: CarritoItem[]) => {
    let agregados = 0
    setCarrito((prev) => {
      const ids = new Set(prev.map((c) => c.id))
      const nuevos = items.filter((it) => !ids.has(it.id))
      agregados = nuevos.length
      if (!nuevos.length) return prev
      const next = [...prev, ...nuevos]
      try { window.sessionStorage.setItem(CARRITO_KEY, JSON.stringify(next)) } catch { /* noop */ }
      return next
    })
    return agregados
  }, [])

  const clearCarrito = useCallback(() => {
    setCarrito([])
    try { window.sessionStorage.removeItem(CARRITO_KEY) } catch { /* noop */ }
  }, [])

  const overlay = useMemo<MapaAutoridadesOverlay | null>(() => {
    if (!active || !data) return null
    const regionFill: Record<number, string> = {}
    data.regionOrder.forEach((rk) => { regionFill[parseInt(rk, 10)] = fillForRegion(data, state, rk) })
    const comunaFill: Record<number, string> = {}
    Object.values(data.comunaPropsByCut).forEach((p) => {
      comunaFill[parseInt(p.codigo_comuna, 10)] = fillForComuna(data, state, p)
    })
    let territorios: MapaAutoridadesOverlay['territorios'] = null
    if (esNivelCongreso(state.nivel) && state.coloreoCongreso === 'distrito') {
      const tipo = state.nivel === 'diputado' ? 'distrito' : 'circunscripcion'
      const idx = state.nivel === 'diputado' ? data.DIPUTADOS : data.SENADORES
      const fill: Record<string, string> = {}
      Object.keys(idx.porTerritorioAnio).forEach((terr) => { fill[terr] = fillForTerritorioCongreso(data, state, terr) })
      territorios = { tipo, fill }
    }
    return { regionFill, comunaFill, territorios }
  }, [active, data, state])

  return { active, data, loading, error, state, setState, overlay, panelAbierto, setPanelAbierto, selectedTerritorio, setSelectedTerritorio, carrito, addCarrito, clearCarrito }
}

const TerritorialContext = createContext<TerritorialContextValue | null>(null)

export function TerritorialProvider({ value, children }: { value: TerritorialContextValue; children: React.ReactNode }) {
  return <TerritorialContext.Provider value={value}>{children}</TerritorialContext.Provider>
}

export function useTerritorialCtx(): TerritorialContextValue {
  const ctx = useContext(TerritorialContext)
  if (!ctx) throw new Error('useTerritorialCtx debe usarse dentro de <TerritorialProvider>')
  return ctx
}
