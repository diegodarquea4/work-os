'use client'

import { useMemo } from 'react'
import type { DesalojoPlanificacion, DesalojoPlanificacionEstado } from '@/lib/types'
import { estadoEventoPlanificacion } from '@/lib/desalojos'

/**
 * Carta Gantt para el timeline de Planificación.
 *
 * - Eje X: días, con marcas mayores en cambios de mes.
 * - Auto-fit del rango: desde 1 semana antes del evento más temprano hasta
 *   1 semana después del más tardío (o "hoy", lo que sea más adelante).
 * - Barras horizontales para eventos con rango; círculos para puntuales.
 * - Línea vertical roja en "hoy".
 * - Click en barra/círculo → `onSelectEvento(id)`. El padre decide si scrollea
 *   la card del timeline y la flashea.
 *
 * Implementación SVG manual (sin librería) — para el volumen esperado del
 * módulo (<50 eventos por caso) no se justifica peso adicional de bundle.
 */

type Props = {
  eventos:         DesalojoPlanificacion[]
  onSelectEvento?: (id: number) => void
}

const MESES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                     'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const ESTADO_FILL: Record<DesalojoPlanificacionEstado, string> = {
  hecho:       '#0f172a',  // slate-900
  en_curso:    '#f59e0b',  // amber-500
  planificado: '#cbd5e1',  // slate-300
}
const ESTADO_FILL_HOVER: Record<DesalojoPlanificacionEstado, string> = {
  hecho:       '#1e293b',
  en_curso:    '#d97706',
  planificado: '#94a3b8',
}

function parseDateISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function toISO(d: Date): string {
  return d.toLocaleDateString('sv-SE')
}

function formatFecha(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  return `${d} ${MESES_CORTO[m - 1]} ${y}`
}

export default function DesalojoGantt({ eventos, onSelectEvento }: Props) {
  const { minDate, maxDate, daysTotal } = useMemo(() => {
    if (eventos.length === 0) {
      const hoy = new Date()
      const min = addDays(hoy, -30)
      const max = addDays(hoy, 30)
      return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
    }
    let min = parseDateISO(eventos[0].fecha_inicio)
    let max = parseDateISO(eventos[0].fecha_fin ?? eventos[0].fecha_inicio)
    for (const e of eventos) {
      const ini = parseDateISO(e.fecha_inicio)
      const fin = parseDateISO(e.fecha_fin ?? e.fecha_inicio)
      if (ini < min) min = ini
      if (fin > max) max = fin
    }
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    if (hoy < min) min = hoy
    if (hoy > max) max = hoy
    min = addDays(min, -7)
    max = addDays(max, 7)
    return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
  }, [eventos])

  // Layout dims
  const ROW_H        = 28
  const HEADER_H     = 48
  const LABEL_W      = 200
  const CHART_W_MIN  = 600
  const PADDING_R    = 16

  // Cada día = 1 unidad. Cálculo dinámico: si el rango es muy chico, expandir
  // a min 600px de área de chart; si es muy grande, dejarlo crecer (scroll).
  const dayPx = Math.max(2, Math.min(20, CHART_W_MIN / daysTotal))
  const chartW = Math.max(CHART_W_MIN, daysTotal * dayPx)
  const totalW = LABEL_W + chartW + PADDING_R
  const totalH = HEADER_H + Math.max(ROW_H, eventos.length * ROW_H) + 16

  // Marcadores de mes
  const monthMarkers = useMemo(() => {
    const out: { x: number; label: string; year: number }[] = []
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (cur <= maxDate) {
      const x = LABEL_W + daysBetween(minDate, cur) * dayPx
      if (cur >= minDate) {
        out.push({
          x,
          label: MESES_LARGO[cur.getMonth()],
          year:  cur.getFullYear(),
        })
      }
      cur.setMonth(cur.getMonth() + 1)
    }
    return out
  }, [minDate, maxDate, dayPx])

  // Línea de hoy
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const todayX = LABEL_W + daysBetween(minDate, hoy) * dayPx
  const todayVisible = hoy >= minDate && hoy <= maxDate

  if (eventos.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Sin eventos para graficar</p>
        <p className="text-xs text-gray-400">Cuando agregues eventos en el timeline, aparecerán acá como barras o círculos sobre el eje temporal.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white overflow-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 sticky top-0 bg-white z-10">
        <h3 className="text-sm font-semibold text-gray-900">Carta Gantt — {eventos.length} evento{eventos.length === 1 ? '' : 's'}</h3>
        <div className="flex items-center gap-3 text-[11px] text-gray-600">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-900" />Hecho</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />En curso</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" />Planificado</span>
        </div>
      </div>
      <svg width={totalW} height={totalH} className="block">
        {/* Fondo de filas alternadas */}
        {eventos.map((_, i) => (
          <rect
            key={`bg-${i}`}
            x={0}
            y={HEADER_H + i * ROW_H}
            width={totalW}
            height={ROW_H}
            fill={i % 2 === 0 ? '#fafafa' : '#ffffff'}
          />
        ))}

        {/* Marcadores verticales de mes */}
        {monthMarkers.map((m, i) => (
          <g key={`m-${i}`}>
            <line
              x1={m.x} x2={m.x}
              y1={HEADER_H - 4} y2={totalH - 8}
              stroke="#e5e7eb"
              strokeWidth={1}
            />
            <text
              x={m.x + 4}
              y={HEADER_H - 8}
              fontSize={11}
              fill="#475569"
              fontWeight={500}
            >
              {m.label}{i === 0 || monthMarkers[i - 1]?.year !== m.year ? ` ${m.year}` : ''}
            </text>
          </g>
        ))}

        {/* Línea de hoy */}
        {todayVisible && (
          <g>
            <line
              x1={todayX} x2={todayX}
              y1={HEADER_H - 12} y2={totalH - 8}
              stroke="#dc2626"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text
              x={todayX + 4}
              y={HEADER_H - 16}
              fontSize={10}
              fill="#dc2626"
              fontWeight={600}
            >
              hoy
            </text>
          </g>
        )}

        {/* Eventos */}
        {eventos.map((ev, i) => {
          const y = HEADER_H + i * ROW_H
          const iniDate = parseDateISO(ev.fecha_inicio)
          const finDate = parseDateISO(ev.fecha_fin ?? ev.fecha_inicio)
          const x1 = LABEL_W + daysBetween(minDate, iniDate) * dayPx
          const x2 = LABEL_W + daysBetween(minDate, finDate) * dayPx + dayPx  // incluir día completo
          const w  = Math.max(dayPx, x2 - x1)
          const estado = estadoEventoPlanificacion(ev)
          const fill   = ESTADO_FILL[estado]
          const esRango = ev.fecha_fin !== null && ev.fecha_fin !== ev.fecha_inicio
          const fechaLabel = esRango
            ? `${formatFecha(ev.fecha_inicio)} → ${formatFecha(ev.fecha_fin!)}`
            : formatFecha(ev.fecha_inicio)

          return (
            <g
              key={ev.id}
              onClick={() => onSelectEvento?.(ev.id)}
              style={{ cursor: onSelectEvento ? 'pointer' : 'default' }}
              className="hover:[&>rect]:fill-current"
            >
              {/* Label izquierda */}
              <text
                x={12}
                y={y + ROW_H / 2 + 4}
                fontSize={12}
                fill="#1e293b"
                className="select-none"
              >
                {ev.titulo.length > 28 ? ev.titulo.slice(0, 27) + '…' : ev.titulo}
              </text>

              {/* Barra o círculo */}
              {esRango ? (
                <rect
                  x={x1}
                  y={y + 6}
                  width={w}
                  height={ROW_H - 12}
                  rx={3}
                  fill={fill}
                  onMouseEnter={e => { (e.target as SVGRectElement).setAttribute('fill', ESTADO_FILL_HOVER[estado]) }}
                  onMouseLeave={e => { (e.target as SVGRectElement).setAttribute('fill', fill) }}
                >
                  <title>{`${ev.titulo}\n${fechaLabel}${ev.descripcion ? '\n\n' + ev.descripcion : ''}`}</title>
                </rect>
              ) : (
                <circle
                  cx={x1 + dayPx / 2}
                  cy={y + ROW_H / 2}
                  r={6}
                  fill={fill}
                  onMouseEnter={e => { (e.target as SVGCircleElement).setAttribute('fill', ESTADO_FILL_HOVER[estado]) }}
                  onMouseLeave={e => { (e.target as SVGCircleElement).setAttribute('fill', fill) }}
                >
                  <title>{`${ev.titulo}\n${fechaLabel}${ev.descripcion ? '\n\n' + ev.descripcion : ''}`}</title>
                </circle>
              )}
            </g>
          )
        })}

        {/* Separador label/chart */}
        <line
          x1={LABEL_W} x2={LABEL_W}
          y1={0} y2={totalH}
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
