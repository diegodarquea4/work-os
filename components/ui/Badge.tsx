import type { ReactNode } from 'react'

type Tone = 'neutral' | 'accent' | 'wine' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  accent:  'bg-violet-50 text-violet-700 ring-violet-200',
  wine:    'bg-wine text-white ring-wine/30',
  success: 'bg-green-50 text-green-700 ring-green-200',
  warning: 'bg-amber-50 text-amber-700 ring-amber-200',
  danger:  'bg-red-50 text-red-700 ring-red-200',
}

type Props = {
  children: ReactNode
  tone?: Tone
  size?: 'sm' | 'md'
  /** Si se pasa, muestra una "×" para quitar (chip removible). */
  onRemove?: () => void
  className?: string
  title?: string
}

/**
 * Badge / chip / tag del sistema. Formaliza el patrón ya sano (CapaBadge,
 * TagChips, DesalojoTipologiaChip) como variantes de un mismo primitivo.
 */
export function Badge({ children, tone = 'neutral', size = 'sm', onRemove, className = '', title }: Props) {
  const sz = size === 'sm' ? 'text-[11px] px-2 py-0.5 gap-1' : 'text-xs px-2.5 py-1 gap-1.5'
  return (
    <span
      className={`inline-flex items-center font-semibold whitespace-nowrap rounded-full ring-1 ${TONE[tone]} ${sz} ${className}`}
      title={title}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 font-bold leading-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current rounded"
          aria-label="Quitar"
        >
          ×
        </button>
      )}
    </span>
  )
}
