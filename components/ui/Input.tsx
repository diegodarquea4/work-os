import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from 'react'

const BASE =
  'w-full rounded-lg border bg-white text-sm text-slate-900 placeholder:text-slate-400 ' +
  'focus:outline-none focus:ring-2 disabled:opacity-60 disabled:bg-slate-50 transition-colors'
const OK = 'border-slate-300 focus:border-violet-500 focus:ring-violet-200'
const ERR = 'border-red-400 focus:border-red-500 focus:ring-red-200'

/** Wrapper con label + hint/error. Foco violeta único en todos los campos. */
export function Field({
  label, required, hint, error, htmlFor, children, className = '',
}: {
  label?: ReactNode; required?: boolean; hint?: ReactNode; error?: ReactNode
  htmlFor?: string; children: ReactNode; className?: string
}) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="block text-xs font-semibold text-slate-700 mb-1">
          {label}{required && <span className="text-red-500"> *</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="text-xs text-red-600 mt-1">{error}</p>
        : hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { error?: boolean }>(
  function Input({ error, className = '', ...rest }, ref) {
    return <input ref={ref} className={`${BASE} ${error ? ERR : OK} h-9 px-3 ${className}`} {...rest} />
  },
)

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { error?: boolean }>(
  function Textarea({ error, className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`${BASE} ${error ? ERR : OK} px-3 py-2 resize-y ${className}`} {...rest} />
  },
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { error?: boolean }>(
  function Select({ error, className = '', children, ...rest }, ref) {
    return <select ref={ref} className={`${BASE} ${error ? ERR : OK} h-9 px-3 pr-8 ${className}`} {...rest}>{children}</select>
  },
)
