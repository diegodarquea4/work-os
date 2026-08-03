import type { ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  /** Ícono opcional (SVG). Si no se pasa, se muestra uno genérico. */
  icon?: ReactNode
  /** Acción opcional (ej. un <Button>). */
  action?: ReactNode
  className?: string
}

/**
 * Estado vacío del sistema. Reemplaza los bloques `text-center py-10 border
 * border-dashed` copiados en varias vistas.
 */
export function EmptyState({ title, description, icon, action, className = '' }: Props) {
  return (
    <div className={`text-center px-6 py-10 bg-white border border-dashed border-slate-300 rounded-xl ${className}`}>
      <div className="w-10 h-10 mx-auto mb-3 rounded-xl bg-violet-50 border border-violet-100 text-violet-700 flex items-center justify-center">
        {icon ?? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" />
          </svg>
        )}
      </div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
