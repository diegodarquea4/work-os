'use client'

import { useMemo, useState } from 'react'
import { summarizeImportErrors, type ClassifiedError } from '@/lib/importErrors'

type Variant = 'compact' | 'full'

type Props = {
  errors:  string[]
  /** Variante visual. `compact` (modal de propuesta — fondo claro, espacio limitado)
   *  o `full` (modal de import directo — mas espacio para banner). Default `full`. */
  variant?: Variant
  /** Cantidad de errores mostrados por default antes de "Ver mas" (default 8). */
  initialShown?: number
}

export default function ImportErrorReport({ errors, variant = 'full', initialShown = 8 }: Props) {
  const summary = useMemo(() => summarizeImportErrors(errors), [errors])
  const [showAll, setShowAll] = useState(false)

  if (summary.total === 0) return null

  const itemsToShow = showAll ? summary.items : summary.items.slice(0, initialShown)
  const oculta = summary.items.length - itemsToShow.length

  return (
    <div className="space-y-3">
      {summary.banner && (
        <div
          className={
            variant === 'compact'
              ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900'
              : 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
          }
        >
          <p className="font-semibold mb-1 leading-snug">{summary.banner.title}</p>
          <p className="leading-relaxed">{summary.banner.body}</p>
          <p className="mt-2 leading-relaxed">
            <span className="font-semibold">Que hacer: </span>
            {summary.banner.action}
          </p>
        </div>
      )}

      <details open={!summary.banner} className="group">
        <summary
          className={
            variant === 'compact'
              ? 'cursor-pointer text-xs font-medium text-gray-700 hover:text-gray-900 select-none'
              : 'cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900 select-none'
          }
        >
          {summary.banner
            ? `Ver detalle de los ${summary.total} errores`
            : `${summary.total} error${summary.total === 1 ? '' : 'es'}`}
          <span className="ml-1 text-gray-400 group-open:hidden">▸</span>
          <span className="ml-1 text-gray-400 hidden group-open:inline">▾</span>
        </summary>
        <ul
          className={
            variant === 'compact'
              ? 'mt-2 max-h-48 overflow-auto text-xs text-gray-700 space-y-0.5 pr-1'
              : 'mt-2 max-h-64 overflow-auto text-xs text-gray-700 space-y-0.5 pr-1 bg-gray-50 rounded-lg px-3 py-2 border border-gray-200'
          }
        >
          {itemsToShow.map((it, i) => (
            <li key={i} className="flex gap-2">
              <FamilyBadge family={it.family} />
              <span className="flex-1 leading-snug break-words">{it.raw}</span>
            </li>
          ))}
        </ul>
        {oculta > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-1.5 text-xs text-slate-600 hover:text-slate-900 underline"
          >
            Mostrar {oculta} mas
          </button>
        )}
      </details>
    </div>
  )
}

function FamilyBadge({ family }: { family: ClassifiedError['family'] }) {
  const map: Record<ClassifiedError['family'], { label: string; cls: string }> = {
    'dato-requerido':    { label: 'falta dato',  cls: 'bg-orange-100 text-orange-700' },
    'header-faltante':   { label: 'header',      cls: 'bg-orange-100 text-orange-700' },
    'region-invalida':   { label: 'región',      cls: 'bg-rose-100   text-rose-700'   },
    'eje-invalido':      { label: 'eje',         cls: 'bg-rose-100   text-rose-700'   },
    'region-mismatch':   { label: 'región/#',    cls: 'bg-rose-100   text-rose-700'   },
    'valor-invalido':    { label: 'valor',       cls: 'bg-amber-100  text-amber-700'  },
    'permiso-denegado':  { label: 'permisos',    cls: 'bg-purple-100 text-purple-700' },
    'duplicado':         { label: 'duplicado',   cls: 'bg-yellow-100 text-yellow-700' },
    'fk-faltante':       { label: 'catálogo',    cls: 'bg-yellow-100 text-yellow-700' },
    'formato':           { label: 'formato',     cls: 'bg-amber-100  text-amber-700'  },
    'otro':              { label: 'error',       cls: 'bg-gray-100   text-gray-700'   },
  }
  const { label, cls } = map[family]
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0 rounded ${cls} flex-shrink-0 self-start mt-0.5`}>
      {label}
    </span>
  )
}
