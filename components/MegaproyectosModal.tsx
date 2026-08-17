'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { EmptyState } from '@/components/ui'
import { useDialogA11y } from '@/lib/hooks/useDialogA11y'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'

/**
 * Curaduría de "Megaproyectos" del Comité de Infraestructura (mig 061) —
 * un SUB-CONJUNTO de los tags de la cartera de la región, no todos. Elegir
 * acá qué tags cuentan como megaproyecto es lo único que hace este modal;
 * agrupar "Iniciativas contempladas" por esos tags lo hace
 * ComiteInfraestructuraTab con el resultado guardado.
 *
 * Candidatos: todos los tags en uso en la cartera de la región (no solo los
 * de las iniciativas con el tag del comité — un tag puede nacer como
 * megaproyecto antes de que se etiquete la primera iniciativa del comité con
 * él). `region_config` ya tiene fila para las 16 regiones (mig 060) — es
 * siempre UPDATE, nunca INSERT.
 */

type Props = {
  region: Region
  iniciativas: Iniciativa[]
  megaproyectosActuales: string[]
  onClose: () => void
  onSaved: () => void
}

export default function MegaproyectosModal({ region, iniciativas, megaproyectosActuales, onClose, onSaved }: Props) {
  const tagsDisponibles = useMemo(() => {
    const vistos = new Set<string>()
    for (const p of iniciativas) {
      for (const t of p.tags ?? []) vistos.add(t)
    }
    return Array.from(vistos).sort((a, b) => a.localeCompare(b, 'es'))
  }, [iniciativas])

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set(megaproyectosActuales))
  const [saving, setSaving] = useState(false)

  // A11y del diálogo (Fase 4a): foco inicial al primer botón, restauración al
  // cerrar y focus-trap por Tab; el Escape se maneja aparte (abajo) para poder
  // ignorarlo cuando el foco está en un campo.
  const { panelRef, onKeyDown } = useDialogA11y<HTMLDivElement>()

  // Enter/leave (Fase 4b, mismo patrón que ProjectTrackerModal): al montar el
  // backdrop hace fade y el panel entra con opacity+scale; al cerrar se reproduce
  // la salida (~150ms) antes de desmontar. reduced-motion la colapsa a instantáneo.
  const [entered, setEntered] = useState(false)
  const closingRef = useRef(false)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  function requestClose() {
    if (closingRef.current) return
    closingRef.current = true
    setEntered(false)
    window.setTimeout(onClose, 150)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      const t = e.target as HTMLElement
      const enCampo = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
      if (!enCampo) { e.preventDefault(); requestClose() }
      return
    }
    onKeyDown(e) // focus-trap por Tab
  }

  function toggle(tag: string) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  async function handleGuardar() {
    setSaving(true)
    try {
      await safeWrite(
        getSupabase().from('region_config')
          .update({ infraestructura_megaproyectos: Array.from(seleccionados) })
          .eq('region_cod', region.cod),
        `region_config megaproyectos ${region.cod}`,
      )
      onSaved()
      requestClose()
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={requestClose}>
      <div className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-150 ${entered ? 'opacity-100' : 'opacity-0'}`} />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Megaproyectos · ${region.nombre}`}
        onKeyDown={handleKeyDown}
        className={`relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${entered ? 'opacity-100 scale-100' : 'opacity-0 scale-[0.98]'}`}
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Megaproyectos</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {region.nombre} · marca qué etiquetas agrupan &quot;Iniciativas contempladas&quot; como megaproyecto
            </p>
          </div>
          <button onClick={requestClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tagsDisponibles.length === 0 ? (
            <EmptyState
              title="Sin etiquetas en la cartera"
              description="Etiqueta alguna iniciativa desde su ficha y sus etiquetas van a aparecer acá para marcarlas como megaproyecto."
            />
          ) : (
            <div className="space-y-1">
              {tagsDisponibles.map(tag => {
                const activo = seleccionados.has(tag)
                return (
                  <label
                    key={tag}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      activo ? 'bg-violet-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={activo}
                      onChange={() => toggle(tag)}
                      className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                    />
                    <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{tag}</span>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">{seleccionados.size} seleccionada{seleccionados.size === 1 ? '' : 's'}</p>
          <div className="flex gap-2">
            <button onClick={requestClose} disabled={saving} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={handleGuardar}
              disabled={saving}
              className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
