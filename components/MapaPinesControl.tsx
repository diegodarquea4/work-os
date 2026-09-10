'use client'

import type { Capa } from '@/lib/projects'

/**
 * Control flotante de los pines del drill comunal (mig 104). Va debajo del
 * breadcrumb, mismo chrome. Tres cosas, nada más:
 *   · chips I · II · III para filtrar los pines por capa (multi, todas on);
 *   · el contador de avance de la georreferenciación de la región — solo
 *     cuentan las que tienen ubicación exacta cargada (sin aproximación por
 *     centroide, Diego 2026-09-11: prefiere el drill vacío a un pin que no
 *     representa una ubicación real);
 *   · el chip "+N de alcance regional" (esas no tienen pin) → abre la lista
 *     en el lateral.
 */

const CAPAS: { key: Capa; label: string; title: string }[] = [
  { key: 'l',   label: 'I',   title: 'Capa I — las prioridades' },
  { key: 'll',  label: 'II',  title: 'Capa II' },
  { key: 'lll', label: 'III', title: 'Capa III — cartera regular' },
]

type Props = {
  capas: ReadonlySet<Capa>
  onToggleCapa: (capa: Capa) => void
  conUbicacion: number
  sinUbicacion: number
  regionales: number
  onVerRegionales?: () => void
}

export default function MapaPinesControl({ capas, onToggleCapa, conUbicacion, sinUbicacion, regionales, onVerRegionales }: Props) {
  const total = conUbicacion + sinUbicacion
  return (
    <div className="pointer-events-auto flex items-center gap-2 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg shadow-sm px-2.5 py-1.5 max-w-full flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pines</span>
      <div className="flex rounded-md border border-gray-200 overflow-hidden">
        {CAPAS.map((c, i) => {
          const on = capas.has(c.key)
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => onToggleCapa(c.key)}
              title={c.title}
              aria-pressed={on}
              className={`px-2 py-0.5 text-[11px] font-semibold transition-colors ${i > 0 ? 'border-l border-gray-200' : ''} ${
                on ? 'bg-slate-800 text-white' : 'bg-white text-gray-400 hover:text-gray-700'
              }`}
            >
              {c.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-gray-500 tabular-nums" title="Iniciativas con ubicación exacta cargada. Las que no tienen ubicación aún no aparecen como pin — se fija desde la ficha o subiendo Latitud/Longitud por Excel.">
        <span className="font-semibold text-slate-700">{conUbicacion}</span> de {total} georreferenciadas
        {sinUbicacion > 0 && <span className="text-gray-400"> · {sinUbicacion} sin ubicación</span>}
      </p>
      {regionales > 0 && (
        <button
          type="button"
          onClick={onVerRegionales}
          className="text-[11px] text-violet-700 hover:text-violet-900 font-medium hover:underline"
          title="Iniciativas de alcance regional: no tienen comuna, no van como pin"
        >
          +{regionales} de alcance regional
        </button>
      )}
    </div>
  )
}
