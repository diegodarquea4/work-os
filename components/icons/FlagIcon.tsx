type Props = {
  filled?: boolean
  className?: string
}

export function FlagIcon({ filled = false, className = 'w-4 h-4' }: Props) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 14V2.5h8.5L9.75 6l2.25 3.5H3.5" strokeLinecap="round" />
    </svg>
  )
}
