'use client'

import { useMemo, useState } from 'react'
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
  title?:          string                 // titulo del card (default: "Carta Gantt")
  subtitle?:       string                 // p.ej. "Caso completo" o nombre de capa
  /** Modo foco: render del padre + sus hitos como filas separadas. */
  focusedParent?:  DesalojoPlanificacion | null
  focusedHitos?:   DesalojoPlanificacion[]
  onExitFocus?:    () => void
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

export default function DesalojoGantt({
  eventos, onSelectEvento, title, subtitle, focusedParent, focusedHitos, onExitFocus,
}: Props) {
  const [expanded, setExpanded] = useState(false)

  // En modo foco, las filas son [parent, ...hitos]. El parent va primero con
  // estilo distinto (background bar que abarca todo su rango); los hitos
  // van debajo. Ignoramos `eventos` prop entonces.
  const focusMode = focusedParent != null
  const rows: DesalojoPlanificacion[] = focusMode
    ? [focusedParent, ...(focusedHitos ?? [])]
    : eventos

  const { minDate, maxDate, daysTotal } = useMemo(() => {
    // Modo foco: zoom apretado al rango del padre con padding chico
    // (2-3 días) para que el detalle de los hitos se lea cómodo.
    if (focusMode && focusedParent) {
      const ini = parseDateISO(focusedParent.fecha_inicio)
      const fin = parseDateISO(focusedParent.fecha_fin ?? focusedParent.fecha_inicio)
      const min = addDays(ini, -2)
      const max = addDays(fin, 2)
      return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
    }
    if (rows.length === 0) {
      const hoy = new Date()
      const min = addDays(hoy, -30)
      const max = addDays(hoy, 30)
      return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
    }
    let min = parseDateISO(rows[0].fecha_inicio)
    let max = parseDateISO(rows[0].fecha_fin ?? rows[0].fecha_inicio)
    for (const e of rows) {
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
  }, [rows, focusMode, focusedParent])

  // Layout dims — al ampliar, filas más altas, más ancho mínimo por día y
  // labels más largos para aprovechar el fullscreen.
  const ROW_H        = expanded ? 36 : 28
  const HEADER_H     = 70
  const LABEL_W      = expanded ? 280 : 200
  const CHART_W_MIN  = expanded ? 1100 : 600
  const MIN_DAY_PX   = expanded ? 34 : 22
  const LABEL_MAX    = expanded ? 46 : 26
  const PADDING_R    = 16

  // Posiciones Y dentro del header (de arriba abajo: mes, hoy, ticks, día).
  const MONTH_LABEL_Y = 14
  const TODAY_LABEL_Y = 30
  const DAY_TICK_TOP  = 44
  const DAY_TICK_BOT  = 50
  const DAY_LABEL_Y   = 62

  // Cada día = 1 unidad. Floor de 22px por día para que el número DD quepa
  // sin colisión (showall: no skipeamos ningún día). Si el rango es muy chico,
  // expandimos dayPx para que el chart llene al menos CHART_W_MIN; si es muy
  // grande, dejamos que crezca y el contenedor hace scroll horizontal.
  const dayPx = Math.max(MIN_DAY_PX, CHART_W_MIN / daysTotal)
  const chartW = Math.max(CHART_W_MIN, daysTotal * dayPx)
  const totalW = LABEL_W + chartW + PADDING_R
  const totalH = HEADER_H + Math.max(ROW_H, rows.length * ROW_H) + 16

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

  // Marcadores de día — TODOS los días del rango, sin step. El día 1 de mes
  // va con tipografía reforzada para marcar el límite del mes.
  const dayMarkers = useMemo(() => {
    const out: { x: number; day: number; isMonthStart: boolean }[] = []
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
    while (cur <= maxDate) {
      const day = cur.getDate()
      const x = LABEL_W + daysBetween(minDate, cur) * dayPx + dayPx / 2
      out.push({ x, day, isMonthStart: day === 1 })
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [minDate, maxDate, dayPx])

  // Línea de hoy
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const todayX = LABEL_W + daysBetween(minDate, hoy) * dayPx
  const todayVisible = hoy >= minDate && hoy <= maxDate

  if (rows.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg bg-white p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">Sin eventos para graficar</p>
        <p className="text-xs text-gray-400">Cuando agregues eventos en el timeline, aparecerán acá como barras o círculos sobre el eje temporal.</p>
      </div>
    )
  }

  return (
    <div className={expanded
      ? 'fixed inset-0 z-[7000] bg-white flex flex-col overflow-hidden'
      : 'border border-gray-200 rounded-lg bg-white overflow-auto'}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 sticky top-0 bg-white z-10 shrink-0">
        <div className="flex items-baseline gap-2 min-w-0">
          {focusMode && onExitFocus && (
            <button
              type="button"
              onClick={onExitFocus}
              className="text-xs text-slate-700 hover:text-slate-900 font-medium flex items-center gap-1 mr-2 shrink-0"
              title="Volver a todos los eventos"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="10,4 6,8 10,12" />
              </svg>
              Volver
            </button>
          )}
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {focusMode ? 'Foco: ' : ''}{title ?? 'Carta Gantt'}
          </h3>
          {subtitle && <span className="text-xs text-gray-500 truncate">{subtitle}</span>}
          {!focusMode && (
            <span className="text-xs text-gray-400 shrink-0">· {rows.length} evento{rows.length === 1 ? '' : 's'}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-gray-600 shrink-0 ml-3">
          <span className="hidden sm:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-900" />Hecho</span>
          <span className="hidden sm:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />En curso</span>
          <span className="hidden sm:flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" />Planificado</span>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-gray-500 hover:text-slate-900 hover:bg-gray-100"
            title={expanded ? 'Reducir' : 'Ampliar carta Gantt'}
            aria-label={expanded ? 'Reducir' : 'Ampliar'}
          >
            {expanded ? (
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H8V1M1 8h3v3M8 1l3 3M4 11L1 8"/>
              </svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2H2v4M14 6V2h-4M2 10v4h4M10 14h4v-4"/>
              </svg>
            )}
            <span className="hidden sm:inline">{expanded ? 'Reducir' : 'Ampliar'}</span>
          </button>
        </div>
      </div>
      <div className={expanded ? 'flex-1 overflow-auto' : ''}>
      <svg width={totalW} height={totalH} className="block">
        {/* Fondo de filas alternadas. En modo foco, la primera fila (parent)
            tiene un fondo amber muy tenue para distinguir el "container" de
            los hitos hijos. */}
        {rows.map((_, i) => (
          <rect
            key={`bg-${i}`}
            x={0}
            y={HEADER_H + i * ROW_H}
            width={totalW}
            height={ROW_H}
            fill={focusMode && i === 0 ? '#fef3c7' : i % 2 === 0 ? '#fafafa' : '#ffffff'}
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
              y={MONTH_LABEL_Y}
              fontSize={11}
              fill="#475569"
              fontWeight={600}
            >
              {m.label} {m.year}
            </text>
          </g>
        ))}

        {/* Línea vertical de hoy — se dibuja antes de los day markers
            para que los números del día queden por encima y legibles. */}
        {todayVisible && (
          <line
            x1={todayX} x2={todayX}
            y1={TODAY_LABEL_Y + 4} y2={totalH - 8}
            stroke="#dc2626"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}

        {/* Marcadores de día — tick + número en el borde inferior del header */}
        {dayMarkers.map((d, i) => (
          <g key={`d-${i}`}>
            <line
              x1={d.x} x2={d.x}
              y1={DAY_TICK_TOP} y2={DAY_TICK_BOT}
              stroke={d.isMonthStart ? '#94a3b8' : '#cbd5e1'}
              strokeWidth={1}
            />
            <text
              x={d.x}
              y={DAY_LABEL_Y}
              fontSize={9.5}
              fill={d.isMonthStart ? '#334155' : '#64748b'}
              fontWeight={d.isMonthStart ? 600 : 400}
              textAnchor="middle"
            >
              {d.day}
            </text>
          </g>
        ))}

        {/* Label "hoy" — al final del header, encima de cualquier número */}
        {todayVisible && (
          <text
            x={todayX + 4}
            y={TODAY_LABEL_Y}
            fontSize={10}
            fill="#dc2626"
            fontWeight={700}
          >
            hoy
          </text>
        )}

        {/* Eventos (en modo foco, la primera fila es el parent: misma fill
            que la barra pero con stroke más marcado para señalar el container). */}
        {rows.map((ev, i) => {
          const isParentRow = focusMode && i === 0
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
              {/* Label izquierda — en modo foco, el parent va en bold + prefijo */}
              <text
                x={12}
                y={y + ROW_H / 2 + 4}
                fontSize={12}
                fill={isParentRow ? '#0f172a' : '#1e293b'}
                fontWeight={isParentRow ? 700 : 400}
                className="select-none"
              >
                {(isParentRow ? '◆ ' : '') + (ev.titulo.length > LABEL_MAX ? ev.titulo.slice(0, LABEL_MAX - 1) + '…' : ev.titulo)}
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
    </div>
  )
}
