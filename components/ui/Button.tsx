import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-violet-700 text-white border-transparent hover:bg-violet-800',
  secondary: 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50',
  ghost:     'bg-transparent text-violet-700 border-transparent hover:bg-violet-50',
  danger:    'bg-red-600 text-white border-transparent hover:bg-red-700',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

/**
 * Botón único del sistema. Reemplaza los 6+ colores de "primario" sueltos:
 * el primario es SIEMPRE el violeta de acento. `loading` muestra el spinner
 * embebido y deshabilita. El foco de teclado es visible (ring violeta).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className = '', children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && <Spinner size="xs" className="-ml-0.5 text-current" />}
      {children}
    </button>
  )
})
