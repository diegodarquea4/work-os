'use client'

import type { IndicadorContext } from '@/lib/hooks/useV2Dashboard'

const CALIDAD_ICON: Record<string, { icon: string; title: string; color: string }> = {
  verificado:  { icon: '●', title: 'Dato verificado',  color: '#22c55e' },
  preliminar:  { icon: '◐', title: 'Dato preliminar',  color: '#f59e0b' },
  calculado:   { icon: '◇', title: 'Dato calculado',   color: '#3b82f6' },
  manual:      { icon: '○', title: 'Carga manual',     color: '#9ca3af' },
}

function fmtValor(valor: number | null, unidad: string): string {
  if (valor === null) return '—'
  if (unidad === '%' || unidad === '% ') return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`
  if (unidad.includes('miles')) return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })} mil`
  if (unidad.includes('MM CLP') || unidad.includes('MM$') || unidad.includes('MM ')) return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })} MM$`
  if (unidad.includes('índice')) return valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  if (unidad.includes('/100k') || unidad.includes('tasa')) return valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  if (['personas', 'hogares', 'viviendas', 'unidades'].includes(unidad)) {
    return valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })
  }
  if (unidad === 'km²') return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 0 })} km²`
  if (unidad === 'hab/km²') return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })} hab/km²`
  if (unidad === 'años') return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })} años`
  if (unidad.includes('camas')) return valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  if (unidad.includes('kg/')) return `${valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })} kg/hab`
  return valor.toLocaleString('es-CL', { maximumFractionDigits: 1 })
}

function fmtPeriodo(periodo: string | null): string {
  if (!periodo) return ''
  const d = new Date(periodo + 'T12:00:00')
  return new Intl.DateTimeFormat('es-CL', { month: 'short', year: 'numeric' }).format(d)
}

type Props = {
  ctx: IndicadorContext
  accentColor?: string
  sparkline?: React.ReactNode
  compact?: boolean
}

export default function KpiCardV2({ ctx, accentColor, sparkline, compact }: Props) {
  const calidad = CALIDAD_ICON[ctx.calidad] ?? CALIDAD_ICON.verificado
  const borderColor = ctx.valor === null ? '#d1d5db' : (accentColor ?? '#3b82f6')
  const deltaColor = ctx.deltaGood === true ? '#16a34a' : ctx.deltaGood === false ? '#dc2626' : '#64748b'

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border border-gray-100 text-center relative group ${compact ? 'p-3' : 'p-4'}`}
      style={{ borderBottomWidth: 3, borderBottomColor: borderColor }}
    >
      {/* Quality + stale indicator */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <span title={calidad.title} style={{ color: calidad.color }} className="text-[8px] leading-none">
          {calidad.icon}
        </span>
        {ctx.stale && (
          <span title={`Dato obsoleto (${ctx.edadDias} días)`} className="text-[8px] text-red-400">⏳</span>
        )}
      </div>

      {/* Label */}
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-700 mb-1.5 leading-none pr-6">
        {ctx.nombre}
      </p>

      {/* Value */}
      {ctx.valor !== null ? (
        <p className="text-2xl font-bold text-gray-900 leading-none">
          {fmtValor(ctx.valor, ctx.unidad)}
        </p>
      ) : (
        <p className="text-sm text-gray-500 leading-none mt-2">Sin dato</p>
      )}

      {/* Period + source — darker for readability */}
      {ctx.periodo && (
        <p className="text-[10px] text-gray-600 mt-1.5 leading-snug">
          {fmtPeriodo(ctx.periodo)}{ctx.fuente ? ` · ${ctx.fuente}` : ''}
        </p>
      )}
      {ctx.valor === null && ctx.fuente && (
        <p className="text-[10px] text-gray-600 mt-1 leading-snug">
          Fuente esperada: {ctx.fuente}
        </p>
      )}

      {/* National + delta — on one line, clearly separated */}
      {ctx.nacional !== null && (
        <p className="text-[11px] mt-2 leading-snug text-gray-700">
          Nac: {fmtValor(ctx.nacional, ctx.unidad)}
          {ctx.delta && (
            <span className="font-semibold ml-1.5" style={{ color: deltaColor }}>
              ({ctx.delta})
            </span>
          )}
        </p>
      )}

      {/* Ranking — separate line, visible */}
      {ctx.ranking && (
        <p className="text-[10px] font-semibold text-gray-600 mt-0.5">
          {ctx.ranking}
        </p>
      )}

      {sparkline && <div className="mt-2">{sparkline}</div>}

      {/* Hover tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-10 pointer-events-none">
        <div className="bg-gray-900 text-white text-[10px] rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
          <p className="font-semibold">{ctx.nombre}</p>
          {ctx.fuente && <p className="text-gray-300 mt-0.5">Fuente: {ctx.fuente}</p>}
          {ctx.periodo && <p className="text-gray-300">Periodo: {fmtPeriodo(ctx.periodo)}</p>}
          <p className="text-gray-300">Calidad: {calidad.title}</p>
          {ctx.edadDias !== null && <p className="text-gray-300">Antigüedad: {ctx.edadDias} días</p>}
        </div>
      </div>
    </div>
  )
}
