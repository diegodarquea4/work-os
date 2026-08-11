import type { Capa } from '@/lib/projects'

type Props = {
  value: Capa
  size?: 'sm' | 'md'
  /** Si true y value === 'lll', no renderiza nada. Útil en cards chicas para
   *  no competir visualmente con el flag `⚑` de En foco. */
  hideDefault?: boolean
  className?: string
}

// Colorimetría sobria "neutro con acento" (Diego, 2026-08-11): las Capas son un
// ranking de un solo eje, así que se leen como una escala neutra —no tres colores
// sueltos—. Slate en todo; el vino (marca, `--color-wine`) aparece SOLO en Capa I
// como acento (contorno + texto), fiel a la sobriedad del resto del panel.
const STYLES: Record<Capa, { label: string; classes: string }> = {
  l: {
    label: 'Capa I',
    classes: 'bg-white text-wine ring-1 ring-wine/55',
  },
  ll: {
    label: 'Capa II',
    classes: 'bg-slate-100 text-slate-700 ring-1 ring-slate-300',
  },
  lll: {
    label: 'Capa III',
    classes: 'bg-slate-50 text-slate-400 ring-1 ring-slate-200',
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
