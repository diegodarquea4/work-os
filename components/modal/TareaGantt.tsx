'use client'

import { useMemo, useState } from 'react'
import type { Tarea } from '@/lib/types'
import { horizonteTarea, HORIZONTE_LABEL } from '@/lib/tareas'

/**
 * Carta Gantt consolidada de las tareas de Planificación de una iniciativa.
 * Solo grafica tareas con fecha_inicio Y fecha_termino (sin rango no hay
 * barra que dibujar); el resto se cuenta en un aviso arriba del chart.
 *
 * Eje temporal ajustable (semana/mes/trimestre/año, ver `Granularidad`) y
 * descarga a PDF horizontal con esa misma granularidad (/api/tarea-gantt-pdf).
 *
 * Implementación SVG manual (sin librería externa), suficiente para el
 * volumen esperado (tareas por iniciativa, no por caso completo de desalojo).
 */

export type Granularidad = 'semana' | 'mes' | 'trimestre' | 'anio'

export const GRANULARIDAD_LABEL: Record<Granularidad, string> = {
  semana: 'Semanal',
  mes: 'Mensual',
  trimestre: 'Trimestral',
  anio: 'Anual',
}

const ESTADO_FILL: Record<Tarea['estado'], string> = {
  no_iniciada: '#cbd5e1', // slate-300
  en_proceso:  '#3b82f6', // blue-500
  bloqueada:   '#ef4444', // red-500
  completada:  '#22c55e', // green-500
}
const ESTADO_LABEL: Record<Tarea['estado'], string> = {
  no_iniciada: 'No iniciada',
  en_proceso:  'En proceso',
  bloqueada:   'Bloqueada',
  completada:  'Completada',
}

const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function parseDateISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}
function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}
function startOfWeekMonday(d: Date): Date {
  const r = new Date(d)
  const dow = (r.getDay() + 6) % 7
  r.setDate(r.getDate() - dow)
  return r
}

type Props = { tareas: Tarea[]; nombreIniciativa: string }

export default function TareaGantt({ tareas, nombreIniciativa }: Props) {
  const [granularidad, setGranularidad] = useState<Granularidad>('mes')
  const [descargando, setDescargando] = useState(false)

  const rows = useMemo(
    () => tareas.filter(t => !!t.fecha_inicio && !!t.fecha_termino),
    [tareas],
  )
  const sinFecha = tareas.length - rows.length

  const { minDate, maxDate, daysTotal } = useMemo(() => {
    if (rows.length === 0) {
      const hoy = new Date()
      const min = addDays(hoy, -15)
      const max = addDays(hoy, 15)
      return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
    }
    let min = parseDateISO(rows[0].fecha_inicio!)
    let max = parseDateISO(rows[0].fecha_termino!)
    for (const t of rows) {
      const ini = parseDateISO(t.fecha_inicio!)
      const fin = parseDateISO(t.fecha_termino!)
      if (ini < min) min = ini
      if (fin > max) max = fin
    }
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    if (hoy < min) min = hoy
    if (hoy > max) max = hoy
    min = addDays(min, -3)
    max = addDays(max, 3)
    return { minDate: min, maxDate: max, daysTotal: daysBetween(min, max) }
  }, [rows])

  const ROW_H       = 30
  const HEADER_H    = 40
  const LABEL_W     = 220
  const CHART_W_MIN = 520
  const PADDING_R   = 16
  // Compresión de px/día según granularidad: mientras más ancho el período
  // (trimestre > mes > semana), menos px hace falta por día para que el
  // rango completo se lea de un vistazo.
  const MIN_DAY_PX: Record<Granularidad, number> = {
    semana: 10, mes: 3.2, trimestre: 1.3, anio: 0.45,
  }

  const dayPx = Math.max(MIN_DAY_PX[granularidad], CHART_W_MIN / Math.max(daysTotal, 1))
  const chartW = Math.max(CHART_W_MIN, daysTotal * dayPx)
  const totalW = LABEL_W + chartW + PADDING_R
  const totalH = HEADER_H + Math.max(ROW_H, rows.length * ROW_H) + 12

  // Marcadores del eje temporal — su unidad cambia según granularidad, pero
  // las barras siguen posicionándose con precisión de día (dayPx) debajo.
  const axisMarkers = useMemo(() => {
    const out: { x: number; label: string; strong?: boolean }[] = []
    if (granularidad === 'semana') {
      const cur = startOfWeekMonday(minDate)
      while (cur <= maxDate) {
        if (cur >= minDate) {
          out.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${cur.getDate()} ${MESES_CORTO[cur.getMonth()]}`, strong: cur.getDate() <= 7 })
        }
        cur.setDate(cur.getDate() + 7)
      }
    } else if (granularidad === 'mes') {
      const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
      while (cur <= maxDate) {
        if (cur >= minDate) {
          out.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${MESES_CORTO[cur.getMonth()]} ${cur.getFullYear()}`, strong: cur.getMonth() === 0 })
        }
        cur.setMonth(cur.getMonth() + 1)
      }
    } else if (granularidad === 'trimestre') {
      const startQ = Math.floor(minDate.getMonth() / 3) * 3
      const cur = new Date(minDate.getFullYear(), startQ, 1)
      while (cur <= maxDate) {
        if (cur >= minDate) {
          const q = Math.floor(cur.getMonth() / 3) + 1
          out.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `T${q} ${cur.getFullYear()}`, strong: q === 1 })
        }
        cur.setMonth(cur.getMonth() + 3)
      }
    } else {
      const cur = new Date(minDate.getFullYear(), 0, 1)
      while (cur <= maxDate) {
        if (cur >= minDate) {
          out.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${cur.getFullYear()}`, strong: true })
        }
        cur.setFullYear(cur.getFullYear() + 1)
      }
    }
    return out
  }, [minDate, maxDate, dayPx, granularidad, LABEL_W])

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const todayX = LABEL_W + daysBetween(minDate, hoy) * dayPx
  const todayVisible = hoy >= minDate && hoy <= maxDate

  async function descargarPdf() {
    if (descargando || rows.length === 0) return
    setDescargando(true)
    try {
      const res = await fetch('/api/tarea-gantt-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombreIniciativa,
          granularidad,
          tareas: rows.map(t => ({
            id: t.id,
            nombre: t.nombre,
            tarea: t.tarea,
            estado: t.estado,
            fecha_inicio: t.fecha_inicio,
            fecha_termino: t.fecha_termino,
          })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `carta-gantt-${nombreIniciativa.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white mt-5">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-100 flex-wrap">
        <h4 className="text-sm font-semibold text-gray-900">Carta Gantt — Planificación</h4>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-[11px]">
            {(Object.keys(GRANULARIDAD_LABEL) as Granularidad[]).map(g => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularidad(g)}
                className={`px-2 py-1 transition-colors ${granularidad === g ? 'bg-slate-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {GRANULARIDAD_LABEL[g]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-600 flex-wrap">
            {(Object.keys(ESTADO_FILL) as Tarea['estado'][]).map(k => (
              <span key={k} className="hidden lg:flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: ESTADO_FILL[k] }} />
                {ESTADO_LABEL[k]}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={descargarPdf}
            disabled={descargando || rows.length === 0}
            aria-label="Descargar PDF"
            title="Descargar PDF"
            className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-violet-700 text-white hover:bg-violet-800 disabled:opacity-40 disabled:hover:bg-violet-700 transition-colors"
          >
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10"/>
            </svg>
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="p-6 text-center">
          <p className="text-sm text-gray-500 mb-1">Sin tareas para graficar</p>
          <p className="text-xs text-gray-500">Agrega fecha de inicio y término a las tareas para verlas acá.</p>
        </div>
      ) : (
        <>
          {sinFecha > 0 && (
            <p className="text-xs text-gray-400 px-3 pt-2">
              {sinFecha} tarea{sinFecha === 1 ? '' : 's'} sin fecha de inicio/término no se {sinFecha === 1 ? 'muestra' : 'muestran'} acá.
            </p>
          )}
          <div className="overflow-auto">
            <div className="relative flex" style={{ width: totalW, minWidth: totalW }}>
              {/* Columna de etiquetas — fija al scrollear horizontal */}
              <div className="sticky left-0 z-10 shrink-0 bg-white" style={{ width: LABEL_W, height: totalH }}>
                {rows.map((t, i) => {
                  const hz = horizonteTarea(t.fecha_inicio, t.fecha_termino)
                  return (
                    <div
                      key={t.id}
                      title={t.nombre || t.tarea}
                      className="absolute left-0 flex items-center gap-1.5 px-3 overflow-hidden"
                      style={{ top: HEADER_H + i * ROW_H, height: ROW_H, width: LABEL_W, background: i % 2 === 0 ? '#fafafa' : '#ffffff' }}
                    >
                      <span className="truncate text-[12px] text-slate-700">{t.nombre || t.tarea}</span>
                      {hz && <span className="shrink-0 text-[10px] text-gray-400">{HORIZONTE_LABEL[hz]}</span>}
                    </div>
                  )
                })}
                <div className="absolute top-0 right-0 h-full w-px bg-gray-200" />
              </div>

              <svg width={chartW + PADDING_R} height={totalH} viewBox={`${LABEL_W} 0 ${chartW + PADDING_R} ${totalH}`} className="block shrink-0">
                {rows.map((_, i) => (
                  <rect key={`bg-${i}`} x={0} y={HEADER_H + i * ROW_H} width={totalW} height={ROW_H} fill={i % 2 === 0 ? '#fafafa' : '#ffffff'} />
                ))}

                {axisMarkers.map((m, i) => (
                  <g key={`ax-${i}`}>
                    <line x1={m.x} x2={m.x} y1={HEADER_H - 4} y2={totalH - 6} stroke={m.strong ? '#94a3b8' : '#e5e7eb'} strokeWidth={1} />
                    <text x={m.x + 4} y={HEADER_H - 12} fontSize={11} fill={m.strong ? '#334155' : '#64748b'} fontWeight={m.strong ? 700 : 600}>{m.label}</text>
                  </g>
                ))}

                {todayVisible && (
                  <>
                    <line x1={todayX} x2={todayX} y1={HEADER_H - 4} y2={totalH - 6} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="3 3" />
                    <text x={todayX + 4} y={HEADER_H - 26} fontSize={10} fill="#dc2626" fontWeight={700}>hoy</text>
                  </>
                )}

                {rows.map((t, i) => {
                  const y = HEADER_H + i * ROW_H
                  const ini = parseDateISO(t.fecha_inicio!)
                  const fin = parseDateISO(t.fecha_termino!)
                  const x1 = LABEL_W + daysBetween(minDate, ini) * dayPx
                  const x2 = LABEL_W + daysBetween(minDate, fin) * dayPx + dayPx
                  const w = Math.max(dayPx, x2 - x1)
                  return (
                    <rect key={t.id} x={x1} y={y + 5} width={w} height={ROW_H - 10} rx={3} fill={ESTADO_FILL[t.estado]}>
                      <title>{`${t.nombre || t.tarea}\n${t.fecha_inicio} → ${t.fecha_termino}`}</title>
                    </rect>
                  )
                })}
              </svg>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
