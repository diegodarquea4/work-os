'use client'

import DesalojoBadge from './DesalojoBadge'

/**
 * Chips compactos para renderizar el campo `tags` multi-valor de una iniciativa.
 *
 * Reglas:
 *   - tags vacío y sin desalojo → no renderiza nada (devuelve null para no
 *     ocupar layout).
 *   - hasta `max` chips visibles; el resto colapsa a un chip "+N".
 *   - lookup case-sensitive: "Costa" ≠ "costa".
 *   - estilo neutro gris para todos — sin colores semánticos por ahora.
 *   - `esDesalojo`: agrega el badge de desalojo COMO PARTE de esta fila de
 *     chips (antes vivía suelto pegado al nombre, en otra parte de la card/
 *     fila — visualmente no leía como una etiqueta más de la iniciativa).
 */
type Props = {
  tags:       string[] | null | undefined
  max?:       number
  className?: string
  esDesalojo?: boolean
}

export default function TagChips({ tags, max = 2, className = '', esDesalojo = false }: Props) {
  if ((!tags || tags.length === 0) && !esDesalojo) return null

  const visible  = tags?.slice(0, max) ?? []
  const overflow = (tags?.length ?? 0) - visible.length

  const chip =
    'inline-flex items-center text-[10px] leading-none px-1.5 py-0.5 rounded ' +
    'bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap'

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {esDesalojo && <DesalojoBadge size="sm" />}
      {visible.map(t => (
        <span key={t} className={chip} title={t}>{t}</span>
      ))}
      {overflow > 0 && (
        <span
          className={chip}
          title={tags!.slice(max).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
