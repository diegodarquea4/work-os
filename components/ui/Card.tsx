import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  /** Header opcional. */
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  padded?: boolean
  className?: string
}

/**
 * Card contenedora del sistema: bg-white + border slate + rounded-xl + shadow-sm.
 * Convención única de superficie (hoy las cards mezclan rounded-lg/xl y bordes).
 */
export function Card({ children, title, subtitle, actions, padded = true, className = '' }: Props) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-slate-900 truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </div>
  )
}
