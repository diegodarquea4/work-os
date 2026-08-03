type Props = {
  size?: 'xs' | 'sm' | 'md'
  className?: string
  /** Texto para lectores de pantalla (default "Cargando"). */
  label?: string
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  xs: 'w-3.5 h-3.5 border-[2px]',
  sm: 'w-5 h-5 border-2',
  md: 'w-7 h-7 border-[2.5px]',
}

/**
 * Spinner único del sistema. Reemplaza los ≥3 spinners sueltos (svg animate-spin,
 * div border-ring, etc.). Respeta prefers-reduced-motion (gira más lento).
 */
export function Spinner({ size = 'sm', className = '', label = 'Cargando' }: Props) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-block rounded-full border-current border-t-transparent animate-spin motion-reduce:[animation-duration:1.5s] ${SIZE[size]} ${className}`}
    />
  )
}
