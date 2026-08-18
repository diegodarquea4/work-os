'use client'

/**
 * Conmutador entre los dos modos del Mapa: «PSG» (iniciativas / semáforos, el modo
 * histórico) y «Autoridades» (bloque político de la autoridad electa). Flota arriba
 * a la izquierda de la columna del mapa, en la misma columna que el breadcrumb.
 */

import { Tabs } from '@/components/ui/Tabs'

export type MapaCapa = 'psg' | 'autoridades'

const ITEMS = [
  { key: 'psg', label: 'PSG' },
  { key: 'autoridades', label: 'Autoridades' },
]

export default function MapaModoToggle({ value, onChange }: { value: MapaCapa; onChange: (v: MapaCapa) => void }) {
  return (
    <div className="pointer-events-auto bg-white/95 backdrop-blur rounded-lg shadow-sm border border-slate-200 p-0.5">
      <Tabs
        variant="segmented"
        ariaLabel="Modo del mapa"
        value={value}
        onChange={(k) => onChange(k as MapaCapa)}
        items={ITEMS}
        className="border-0 bg-transparent"
      />
    </div>
  )
}
