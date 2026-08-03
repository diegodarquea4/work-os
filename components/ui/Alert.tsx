import type { ReactNode } from 'react'

type Variant = 'error' | 'warning' | 'success' | 'info'

const STYLE: Record<Variant, { box: string; icon: string; glyph: string }> = {
  error:   { box: 'bg-red-50 border-red-200 text-red-800',        icon: 'bg-red-600',    glyph: '!' },
  warning: { box: 'bg-amber-50 border-amber-200 text-amber-900',  icon: 'bg-amber-500',  glyph: '!' },
  success: { box: 'bg-green-50 border-green-200 text-green-800',   icon: 'bg-green-600',  glyph: '✓' },
  info:    { box: 'bg-violet-50 border-violet-200 text-violet-900', icon: 'bg-violet-600', glyph: 'i' },
}

type Props = {
  variant?: Variant
  title?: ReactNode
  children?: ReactNode
  onClose?: () => void
  className?: string
}

/**
 * Alerta / banner del sistema. Reemplaza el string `text-red-600 bg-red-50
 * border` (y variantes ámbar) repetido en 8+ archivos.
 */
export function Alert({ variant = 'error', title, children, onClose, className = '' }: Props) {
  const s = STYLE[variant]
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex gap-2.5 px-3.5 py-2.5 rounded-lg border text-sm ${s.box} ${className}`}>
      <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full text-white text-[11px] font-bold flex items-center justify-center ${s.icon}`} aria-hidden="true">
        {s.glyph}
      </span>
      <div className="flex-1 min-w-0 leading-snug">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
      {onClose && (
        <button type="button" onClick={onClose} className="flex-shrink-0 opacity-60 hover:opacity-100 font-bold leading-none" aria-label="Cerrar aviso">×</button>
      )}
    </div>
  )
}
