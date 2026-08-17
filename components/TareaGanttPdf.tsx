import { Document, Page, Text, View, StyleSheet, Svg, Rect, Line } from '@react-pdf/renderer'

/**
 * PDF horizontal (landscape) de la carta Gantt de tareas de una iniciativa.
 * Reconstruye la misma geometría que components/modal/TareaGantt.tsx (SVG
 * manual) con los primitivos propios de @react-pdf/renderer (Svg/Rect/Line/
 * Text) — no es el <svg> del DOM, así que se recalcula acá en vez de
 * reusarse tal cual. La granularidad del eje (semana/mes/trimestre/año) es
 * la que el usuario tenía seleccionada al pedir la descarga.
 */

export type GanttPdfGranularidad = 'semana' | 'mes' | 'trimestre' | 'anio'

export type GanttPdfTarea = {
  id: number
  nombre: string
  tarea: string
  estado: 'completada' | 'en_proceso' | 'bloqueada' | 'no_iniciada'
  fecha_inicio: string | null
  fecha_termino: string | null
}

export type TareaGanttPdfData = {
  nombreIniciativa: string
  granularidad: GanttPdfGranularidad
  generadoEn: string   // display, ya formateado
  tareas: GanttPdfTarea[]
}

const GRANULARIDAD_LABEL: Record<GanttPdfGranularidad, string> = {
  semana: 'Semanal', mes: 'Mensual', trimestre: 'Trimestral', anio: 'Anual',
}

const ESTADO_FILL: Record<GanttPdfTarea['estado'], string> = {
  no_iniciada: '#cbd5e1',
  en_proceso:  '#3b82f6',
  bloqueada:   '#ef4444',
  completada:  '#22c55e',
}
const ESTADO_LABEL: Record<GanttPdfTarea['estado'], string> = {
  no_iniciada: 'No iniciada', en_proceso: 'En proceso', bloqueada: 'Bloqueada', completada: 'Completada',
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

// Página A4 landscape ≈ 841.89 x 595.28 pt.
const PAGE_W = 841.89
const MARGIN = 28
const LABEL_W = 170
const HEADER_H = 26
const CONTENT_W = PAGE_W - MARGIN * 2
const CHART_W = CONTENT_W - LABEL_W

const s = StyleSheet.create({
  page: { padding: MARGIN, fontFamily: 'Carlito', fontSize: 9, color: '#1e293b' },
  title: { fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  subtitle: { fontSize: 9, color: '#64748b', marginBottom: 10 },
  legendRow: { flexDirection: 'row', gap: 14, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 7, height: 7, borderRadius: 3.5 },
  legendText: { fontSize: 8, color: '#475569' },
  empty: { fontSize: 10, color: '#64748b', marginTop: 20, textAlign: 'center' },
})

export default function TareaGanttPdf({ data }: { data: TareaGanttPdfData }) {
  const rows = data.tareas.filter(t => !!t.fecha_inicio && !!t.fecha_termino)

  let minDate: Date, maxDate: Date
  if (rows.length === 0) {
    const hoy = new Date()
    minDate = addDays(hoy, -15)
    maxDate = addDays(hoy, 15)
  } else {
    minDate = parseDateISO(rows[0].fecha_inicio!)
    maxDate = parseDateISO(rows[0].fecha_termino!)
    for (const t of rows) {
      const ini = parseDateISO(t.fecha_inicio!)
      const fin = parseDateISO(t.fecha_termino!)
      if (ini < minDate) minDate = ini
      if (fin > maxDate) maxDate = fin
    }
    const hoy = new Date()
    hoy.setHours(0, 0, 0, 0)
    if (hoy < minDate) minDate = hoy
    if (hoy > maxDate) maxDate = hoy
    minDate = addDays(minDate, -3)
    maxDate = addDays(maxDate, 3)
  }
  const daysTotal = Math.max(daysBetween(minDate, maxDate), 1)
  const dayPx = CHART_W / daysTotal

  // Alto de fila: se ajusta al espacio disponible en una sola página — filas
  // más chicas si hay muchas tareas, con un piso legible.
  const availableH = 595.28 - MARGIN * 2 - 90 - HEADER_H
  const ROW_H = Math.max(9, Math.min(20, availableH / Math.max(rows.length, 1)))
  const totalH = HEADER_H + Math.max(ROW_H, rows.length * ROW_H) + 6

  const axisMarkers: { x: number; label: string; strong?: boolean }[] = []
  const g = data.granularidad
  if (g === 'semana') {
    const cur = startOfWeekMonday(minDate)
    while (cur <= maxDate) {
      if (cur >= minDate) axisMarkers.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${cur.getDate()} ${MESES_CORTO[cur.getMonth()]}`, strong: cur.getDate() <= 7 })
      cur.setDate(cur.getDate() + 7)
    }
  } else if (g === 'mes') {
    const cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1)
    while (cur <= maxDate) {
      if (cur >= minDate) axisMarkers.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${MESES_CORTO[cur.getMonth()]} ${cur.getFullYear()}`, strong: cur.getMonth() === 0 })
      cur.setMonth(cur.getMonth() + 1)
    }
  } else if (g === 'trimestre') {
    const startQ = Math.floor(minDate.getMonth() / 3) * 3
    const cur = new Date(minDate.getFullYear(), startQ, 1)
    while (cur <= maxDate) {
      if (cur >= minDate) {
        const q = Math.floor(cur.getMonth() / 3) + 1
        axisMarkers.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `T${q} ${cur.getFullYear()}`, strong: q === 1 })
      }
      cur.setMonth(cur.getMonth() + 3)
    }
  } else {
    const cur = new Date(minDate.getFullYear(), 0, 1)
    while (cur <= maxDate) {
      if (cur >= minDate) axisMarkers.push({ x: LABEL_W + daysBetween(minDate, cur) * dayPx, label: `${cur.getFullYear()}`, strong: true })
      cur.setFullYear(cur.getFullYear() + 1)
    }
  }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const todayX = LABEL_W + daysBetween(minDate, hoy) * dayPx
  const todayVisible = hoy >= minDate && hoy <= maxDate

  return (
    <Document title={`Carta Gantt — ${data.nombreIniciativa}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Carta Gantt — Planificación</Text>
        <Text style={s.subtitle}>
          {data.nombreIniciativa} · Vista {GRANULARIDAD_LABEL[g]} · Generado el {data.generadoEn}
        </Text>

        <View style={s.legendRow}>
          {(Object.keys(ESTADO_FILL) as GanttPdfTarea['estado'][]).map(k => (
            <View key={k} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: ESTADO_FILL[k] }]} />
              <Text style={s.legendText}>{ESTADO_LABEL[k]}</Text>
            </View>
          ))}
        </View>

        {rows.length === 0 ? (
          <Text style={s.empty}>Sin tareas con fecha de inicio y término para graficar.</Text>
        ) : (
          <Svg width={CONTENT_W} height={totalH}>
            {rows.map((_, i) => (
              <Rect key={`bg-${i}`} x={0} y={HEADER_H + i * ROW_H} width={CONTENT_W} height={ROW_H} fill={i % 2 === 0 ? '#fafafa' : '#ffffff'} />
            ))}

            {axisMarkers.map((m, i) => (
              <Line key={`ax-l-${i}`} x1={m.x} x2={m.x} y1={HEADER_H - 4} y2={totalH - 4} stroke={m.strong ? '#94a3b8' : '#e5e7eb'} strokeWidth={0.75} />
            ))}
            {axisMarkers.map((m, i) => (
              <Text key={`ax-t-${i}`} x={m.x + 3} y={HEADER_H - 12} style={{ fontSize: 7.5, fontFamily: 'Carlito', fontWeight: m.strong ? 'bold' : 'normal', fill: m.strong ? '#334155' : '#64748b' }}>
                {m.label}
              </Text>
            ))}

            {todayVisible && (
              <Line x1={todayX} x2={todayX} y1={HEADER_H - 4} y2={totalH - 4} stroke="#dc2626" strokeWidth={1} />
            )}

            {rows.map((t, i) => {
              const y = HEADER_H + i * ROW_H
              return (
                <Text key={`lbl-${i}`} x={2} y={y + ROW_H / 2 + 3} style={{ fontSize: Math.min(8, ROW_H - 3), fontFamily: 'Carlito', fill: '#334155' }}>
                  {(t.nombre || t.tarea).slice(0, 46)}
                </Text>
              )
            })}

            {rows.map((t, i) => {
              const y = HEADER_H + i * ROW_H
              const ini = parseDateISO(t.fecha_inicio!)
              const fin = parseDateISO(t.fecha_termino!)
              const x1 = LABEL_W + daysBetween(minDate, ini) * dayPx
              const x2 = LABEL_W + daysBetween(minDate, fin) * dayPx + dayPx
              const w = Math.max(dayPx, x2 - x1)
              return (
                <Rect key={`bar-${i}`} x={x1} y={y + 2} width={w} height={Math.max(4, ROW_H - 4)} rx={1.5} fill={ESTADO_FILL[t.estado]} />
              )
            })}

            <Line x1={LABEL_W} x2={LABEL_W} y1={0} y2={totalH - 4} stroke="#e2e8f0" strokeWidth={1} />
          </Svg>
        )}
      </Page>
    </Document>
  )
}
