/**
 * Ícono casa simple para marcar iniciativas de la Mesa de Desalojos.
 * Misma interfaz que FlagIcon: prop `filled` controla relleno sólido.
 * Usa `currentColor` para heredar del padre.
 */
type Props = {
  filled?:   boolean
  className?: string
}

export function HomeIcon({ filled = false, className = 'w-4 h-4' }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
      className={className}
    >
      <path d="M2 7.5L8 2.5L14 7.5V13.5C14 13.7761 13.7761 14 13.5 14H10V10H6V14H2.5C2.22386 14 2 13.7761 2 13.5V7.5Z" />
    </svg>
  )
}
