import type { Capa } from '@/lib/projects'

type Props = {
  value: Capa
  size?: 'sm' | 'md'
  /** Si true y value === 'lll', no renderiza nada. Útil en cards chicas para
   *  no competir visualmente con el flag `⚑` de En foco. */
  hideDefault?: boolean
  className?: string
}

const STYLES: Record<Capa, { label: string; classes: string }> = {
  l: {
    label: 'Capa I',
    classes: 'bg-[#6b1d2c] text-white ring-1 ring-[#6b1d2c]/30',
  },
  ll: {
    label: 'Capa II',
    classes: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
  },
  lll: {
    label: 'Capa III',
    classes: 'bg-gray-100 text-gray-500 ring-1 ring-gray-300',
  },
}

const SIZE: Record<NonNullable<Props['size']>, string> = {
  sm: 'text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide',
  md: 'text-xs px-2 py-0.5 rounded font-semibold tracking-wide',
}

export function CapaBadge({ value, size = 'sm', hideDefault = false, className = '' }: Props) {
  if (hideDefault && value === 'lll') return null
  const s = STYLES[value]
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap ${s.classes} ${SIZE[size]} ${className}`}
      title={`Importancia: ${s.label}`}
    >
      {s.label}
    </span>
  )
}
