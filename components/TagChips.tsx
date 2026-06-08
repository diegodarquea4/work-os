'use client'

/**
 * Chips compactos para renderizar el campo `tags` multi-valor de una iniciativa.
 *
 * Reglas:
 *   - tags vacío → no renderiza nada (devuelve null para no ocupar layout).
 *   - hasta `max` chips visibles; el resto colapsa a un chip "+N".
 *   - lookup case-sensitive: "Costa" ≠ "costa".
 *   - estilo neutro gris para todos — sin colores semánticos por ahora.
 */
type Props = {
  tags:       string[] | null | undefined
  max?:       number
  className?: string
}

export default function TagChips({ tags, max = 2, className = '' }: Props) {
  if (!tags || tags.length === 0) return null

  const visible  = tags.slice(0, max)
  const overflow = tags.length - visible.length

  const chip =
    'inline-flex items-center text-[10px] leading-none px-1.5 py-0.5 rounded ' +
    'bg-gray-100 text-gray-600 border border-gray-200 whitespace-nowrap'

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {visible.map(t => (
        <span key={t} className={chip} title={t}>{t}</span>
      ))}
      {overflow > 0 && (
        <span
          className={chip}
          title={tags.slice(max).join(', ')}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
