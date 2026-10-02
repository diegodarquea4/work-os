import type { EstadoAgenda } from '@/lib/sesiones/calendario'
import { ETIQUETA_ESTADO } from '@/lib/sesiones/calendario'

/**
 * El estado de una sesión por el LLENADO del círculo, sin colores (Manuel,
 * 2026-10-01): vacío = programada, medio = abierta, lleno = realizada,
 * tachado = no realizada. Toma el color del texto que lo rodea.
 */
export function MarcaSesion({ estado, size = 12, className = '' }: { estado: EstadoAgenda; size?: number; className?: string }) {
  const r = 5.25
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" className={`shrink-0 ${className}`} aria-label={ETIQUETA_ESTADO[estado]} role="img">
      {estado === 'abierta' && <path d={`M7 ${7 - r} A${r} ${r} 0 0 0 7 ${7 + r} Z`} fill="currentColor" />}
      <circle cx="7" cy="7" r={r} fill={estado === 'realizada' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" />
      {estado === 'noRealizada' && <path d="M3.2 10.8 10.8 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  )
}

const LEYENDA: EstadoAgenda[] = ['programada', 'abierta', 'realizada', 'noRealizada']

export function LeyendaSesiones({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600 ${className}`}>
      {LEYENDA.map(e => (
        <span key={e} className="inline-flex items-center gap-1"><MarcaSesion estado={e} size={11} />{ETIQUETA_ESTADO[e]}</span>
      ))}
    </div>
  )
}
