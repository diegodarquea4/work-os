import { HomeIcon } from './icons/HomeIcon'

/**
 * Badge "DESALOJO" para diferenciar iniciativas marcadas como caso de la
 * Mesa Interministerial. Compact, va en esquina de cards o inline en filas.
 *
 * Decisión visual (con Diego): badge slate, NO ring. El ring amber está
 * reservado a `en_foco`. Una iniciativa puede ser foco + desalojo: ambos
 * marcadores coexisten sin pisarse.
 *
 * Variantes:
 *   - size 'sm' (default): chip mini para listados densos (filas Bandeja).
 *   - size 'md': badge esquinero para cards (Kanban).
 *   - size 'inline': inline con texto, mismo color, sin fondo (para títulos
 *     de ficha o secciones).
 */

type Props = {
  size?:      'sm' | 'md' | 'inline'
  className?: string
  /** Si true, el badge va con label visible. Si false, solo ícono. Default true. */
  showLabel?: boolean
}

export default function DesalojoBadge({ size = 'md', showLabel = true, className = '' }: Props) {
  if (size === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold text-slate-700 ${className}`}>
        <HomeIcon filled className="w-3 h-3" />
        {showLabel && <span>Desalojo</span>}
      </span>
    )
  }
  const padding = size === 'sm' ? 'px-1.5 py-0.5' : 'px-2 py-0.5'
  const text    = size === 'sm' ? 'text-[10px]'  : 'text-xs'
  const iconCls = size === 'sm' ? 'w-2.5 h-2.5'  : 'w-3 h-3'
  return (
    <span
      title="Caso de la Mesa Interministerial de Desalojos"
      className={`inline-flex items-center gap-1 ${padding} ${text} font-semibold rounded-full bg-slate-700 text-white whitespace-nowrap ${className}`}
    >
      <HomeIcon filled className={iconCls} />
      {showLabel && <span>DESALOJO</span>}
    </span>
  )
}
