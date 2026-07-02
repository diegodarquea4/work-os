'use client'

import { useEffect, useMemo, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
} from '@/lib/types'
import {
  FASE_CFG,
  TIPOLOGIA_CFG,
  checklistItems,
  getCapaColor,
  type CapaColor,
} from '@/lib/desalojos'

/**
 * Panel lateral derecho (NO overlay) con calendario mensual que agrega los
 * HITOS de todas las capas activas del caso. Cada capa pinta sus hitos con
 * su color propio (paleta cíclica blue/emerald/rose/amber/teal/fuchsia).
 *
 * Layout: el panel es un sibling del contenido principal en un flex
 * horizontal — al abrir, la ficha del caso se reduce de ancho en lugar de
 * cubrirse. Mismo patrón que la barra de métricas por eje en Mi Región.
 *
 * Fuentes de hitos:
 *   - capa.fecha_instrumento           → "Resolución / sentencia"
 *   - capa.fecha_tentativa_operativo   → "Operativo tentativo"
 *   - Cualquier item del checklist por fase con `fecha` set → "{checklist}.{fase}"
 */

type Props = {
  open:        boolean
  onClose:     () => void
  capas:       DesalojoCapa[]
  fasesEstado: DesalojoFaseEstado[]
}

type Hito = {
  fecha:    Date           // local 00:00
  iso:      string         // YYYY-MM-DD
  capaId:   number
  capaName: string
  color:    CapaColor
  tipo:     string         // texto corto
  detalle:  string         // descripción larga
}

const MES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]
const DOW_LABEL = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function parseISODate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  // Aceptar ISO completo o YYYY-MM-DD plain. Anclar a 00:00 local para evitar
  // que zonas horarias muevan el día.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3])
  const dt = new Date(y, mo, d)
  if (isNaN(dt.getTime())) return null
  return dt
}

function fmtISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function buildHitos(capas: DesalojoCapa[], fasesEstado: DesalojoFaseEstado[]): Hito[] {
  const out: Hito[] = []
  for (const capa of capas) {
    if (!capa.activa) continue
    const color = getCapaColor(capa.orden)

    // 1) Resolución / sentencia.
    const fInstr = parseISODate(capa.fecha_instrumento)
    if (fInstr) {
      out.push({
        fecha: fInstr,
        iso:   fmtISO(fInstr),
        capaId: capa.id,
        capaName: capa.nombre,
        color,
        tipo:    capa.tipologia === 'C' ? 'Sentencia firme' : 'Resolución / instrumento',
        detalle: capa.instrumento ?? '—',
      })
    }
    // 2) Operativo tentativo.
    const fOp = parseISODate(capa.fecha_tentativa_operativo)
    if (fOp) {
      out.push({
        fecha: fOp,
        iso:   fmtISO(fOp),
        capaId: capa.id,
        capaName: capa.nombre,
        color,
        tipo:    'Operativo tentativo',
        detalle: capa.contingente ? `Contingente: ${capa.contingente}` : 'Plan operativo',
      })
    }
    // 3) Checklist items con fecha — sólo fases que aplican a la tipología.
    for (const e of fasesEstado) {
      if (e.capa_id !== capa.id) continue
      const items = checklistItems(capa.tipologia, e.fase as DesalojoFaseConSemaforo)
      for (const it of items) {
        const st = e.checklist_estado?.[it.key]
        const f  = parseISODate(st?.fecha)
        if (!f) continue
        out.push({
          fecha: f,
          iso:   fmtISO(f),
          capaId: capa.id,
          capaName: capa.nombre,
          color,
          tipo:    `${FASE_CFG[e.fase].short} · ${st?.done ? 'Cumplido' : 'Pendiente'}`,
          detalle: it.label,
        })
      }
    }
  }
  // Orden por fecha ascendente.
  out.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
  return out
}

export default function DesalojoCalendarioDrawer({
  open, onClose, capas, fasesEstado,
}: Props) {
  // "Hoy" capturado en el mount (estable, evita impuros en render).
  const [todayMs] = useState(() => Date.now())

  // Cursor de mes visible. Inicializado al mes del mount.
  const [cursor, setCursor] = useState<{ y: number; m: number }>(() => {
    const now = new Date(todayMs)
    return { y: now.getFullYear(), m: now.getMonth() }
  })

  const hitos = useMemo(() => buildHitos(capas, fasesEstado), [capas, fasesEstado])

  // Index: ISO → Hito[]
  const hitosByDia = useMemo(() => {
    const m = new Map<string, Hito[]>()
    for (const h of hitos) {
      const arr = m.get(h.iso) ?? []
      arr.push(h)
      m.set(h.iso, arr)
    }
    return m
  }, [hitos])

  // Día seleccionado para el panel inferior. Lo limpiamos directamente al
  // cambiar de mes vía los handlers de navegación (evita efecto con setState).
  const [diaSel, setDiaSel] = useState<string | null>(null)
  function gotoMonth(next: { y: number; m: number }) {
    setCursor(next)
    setDiaSel(null)
  }

  // Cierre con Escape.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const activas = capas.filter(c => c.activa)

  if (!open) return null

  return (
    <aside
      className="w-[440px] flex-shrink-0"
      aria-label="Calendario de hitos"
    >
      <div className="space-y-4">
        {/* Header — mismo lenguaje que la ficha del caso */}
        <header className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Calendario de hitos</h2>
            <p className="text-xs text-gray-500 leading-tight mt-0.5">
              {hitos.length} hito{hitos.length === 1 ? '' : 's'} · {activas.length} capa{activas.length === 1 ? '' : 's'} activa{activas.length === 1 ? '' : 's'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 -mr-1"
            aria-label="Cerrar calendario"
            title="Cerrar calendario"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14"/>
            </svg>
          </button>
        </header>

        {/* Leyenda de capas */}
        {activas.length > 0 && (
          <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-2">Capas</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {activas.map(c => {
                const color = getCapaColor(c.orden)
                return (
                  <span
                    key={c.id}
                    className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${color.bg} ${color.text} ring-1 ${color.ring} rounded-full px-2 py-0.5`}
                    title={c.tipologia ? TIPOLOGIA_CFG[c.tipologia].label : 'Sin tipología'}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${color.dotBg}`} />
                    {c.nombre}
                  </span>
                )
              })}
            </div>
          </section>
        )}

        {/* Mes (nav + grilla) */}
        <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
          <div className="flex items-center gap-2 mb-3">
            <button
              type="button"
              onClick={() => gotoMonth(cursor.m === 0 ? { y: cursor.y - 1, m: 11 } : { y: cursor.y, m: cursor.m - 1 })}
              className="text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 text-base leading-none"
              aria-label="Mes anterior"
            >
              ‹
            </button>
            <p className="flex-1 text-center text-sm font-bold text-gray-900 tabular-nums capitalize">
              {MES_LABEL[cursor.m]} {cursor.y}
            </p>
            <button
              type="button"
              onClick={() => gotoMonth(cursor.m === 11 ? { y: cursor.y + 1, m: 0 } : { y: cursor.y, m: cursor.m + 1 })}
              className="text-gray-500 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 text-base leading-none"
              aria-label="Mes siguiente"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date(todayMs)
                gotoMonth({ y: now.getFullYear(), m: now.getMonth() })
              }}
              className="text-[11px] text-slate-600 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-gray-100"
            >
              Hoy
            </button>
          </div>
          <MonthGrid
            year={cursor.y}
            month={cursor.m}
            hitosByDia={hitosByDia}
            diaSel={diaSel}
            onSelectDia={setDiaSel}
            todayMs={todayMs}
          />
        </section>

        {/* Detalle del día seleccionado / próximos hitos */}
        <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
          {diaSel ? (
            <DiaDetalle iso={diaSel} hitos={hitosByDia.get(diaSel) ?? []} />
          ) : (
            <ProximosHitos hitos={hitos} cursor={cursor} todayMs={todayMs} />
          )}
        </section>
      </div>
    </aside>
  )
}

// ────────────────────────────────────────────────────────────────────────

function MonthGrid({
  year, month, hitosByDia, diaSel, onSelectDia, todayMs,
}: {
  year:       number
  month:      number
  hitosByDia: Map<string, Hito[]>
  diaSel:     string | null
  onSelectDia:(iso: string | null) => void
  todayMs:    number
}) {
  // Primer día del mes y total de días.
  const firstDay = new Date(year, month, 1)
  const lastDay  = new Date(year, month + 1, 0)
  // L=0 ... D=6 (formato europeo). JS getDay() devuelve D=0...S=6.
  const startDow = (firstDay.getDay() + 6) % 7
  const totalDays = lastDay.getDate()
  const totalCells = Math.ceil((startDow + totalDays) / 7) * 7

  const todayISO = fmtISO(new Date(todayMs))

  const cells: Array<{ iso: string | null; day: number | null }> = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startDow + 1
    if (dayNum < 1 || dayNum > totalDays) {
      cells.push({ iso: null, day: null })
    } else {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
      cells.push({ iso, day: dayNum })
    }
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 mb-1.5">
        {DOW_LABEL.map((d, i) => (
          <span key={i} className="text-[10px] font-semibold text-gray-400 text-center uppercase tracking-wide">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.iso) {
            return <div key={i} className="aspect-square" />
          }
          const dayHitos = hitosByDia.get(cell.iso) ?? []
          const isToday  = cell.iso === todayISO
          const isSel    = cell.iso === diaSel

          // Colores únicos de las capas que tienen hitos ese día.
          const coloresUnicos = Array.from(
            new Map(dayHitos.map(h => [h.capaId, h.color])).values(),
          ).slice(0, 3)

          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelectDia(isSel ? null : cell.iso)}
              className={`aspect-square rounded-lg text-xs tabular-nums flex flex-col items-center justify-between py-1.5 px-0.5 transition-colors ${
                isSel    ? 'bg-slate-900 text-white' :
                isToday  ? 'bg-slate-100 text-slate-900 font-bold ring-1 ring-slate-300' :
                dayHitos.length > 0 ? 'bg-gray-50 text-gray-800 hover:bg-gray-100' :
                                      'text-gray-500 hover:bg-gray-50'
              }`}
              title={dayHitos.length > 0 ? `${dayHitos.length} hito${dayHitos.length === 1 ? '' : 's'}` : ''}
              aria-pressed={isSel}
            >
              <span className="leading-none">{cell.day}</span>
              {dayHitos.length > 0 ? (
                <span className="flex items-center gap-0.5">
                  {coloresUnicos.map((color, idx) => (
                    <span key={idx} className={`w-1.5 h-1.5 rounded-full ${color.dotBg}`} />
                  ))}
                  {dayHitos.length > coloresUnicos.length && (
                    <span className={`text-[9px] leading-none ml-0.5 ${isSel ? 'text-white' : 'text-gray-500'}`}>
                      +{dayHitos.length - coloresUnicos.length}
                    </span>
                  )}
                </span>
              ) : (
                <span className="h-1.5" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────

function DiaDetalle({ iso, hitos }: { iso: string; hitos: Hito[] }) {
  const fecha = parseISODate(iso)
  const label = fecha
    ? fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : iso
  if (hitos.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-xs font-bold text-gray-700 capitalize">{label}</p>
        <p className="text-xs text-gray-400 mt-1">Sin hitos.</p>
      </div>
    )
  }
  return (
    <div>
      <p className="text-xs font-bold text-gray-700 capitalize mb-2">{label}</p>
      <ul className="space-y-2">
        {hitos.map((h, i) => (
          <HitoItem key={i} h={h} />
        ))}
      </ul>
    </div>
  )
}

function ProximosHitos({ hitos, cursor, todayMs }: { hitos: Hito[]; cursor: { y: number; m: number }; todayMs: number }) {
  // Mostrar los hitos del mes visible, hasta 8. Si no hay, los próximos 5 después de hoy.
  const inicioMes = new Date(cursor.y, cursor.m, 1).getTime()
  const finMes    = new Date(cursor.y, cursor.m + 1, 0, 23, 59, 59).getTime()
  const delMes    = hitos.filter(h => {
    const t = h.fecha.getTime()
    return t >= inicioMes && t <= finMes
  })

  if (delMes.length > 0) {
    return (
      <div>
        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Hitos del mes</p>
        <ul className="space-y-2">
          {delMes.slice(0, 8).map((h, i) => <HitoItem key={i} h={h} showDate />)}
        </ul>
        {delMes.length > 8 && (
          <p className="text-[11px] text-gray-400 mt-2">+ {delMes.length - 8} más en el mes.</p>
        )}
      </div>
    )
  }

  const proximos = hitos.filter(h => h.fecha.getTime() >= todayMs).slice(0, 5)
  if (proximos.length === 0) {
    return (
      <p className="text-xs text-gray-400 text-center py-4">
        Sin hitos por venir. Carga fechas en los checklists o en los campos del polígono.
      </p>
    )
  }
  return (
    <div>
      <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-2">Próximos hitos</p>
      <ul className="space-y-2">
        {proximos.map((h, i) => <HitoItem key={i} h={h} showDate />)}
      </ul>
    </div>
  )
}

function HitoItem({ h, showDate = false }: { h: Hito; showDate?: boolean }) {
  return (
    <li className={`px-2.5 py-2 rounded ${h.color.bg} ring-1 ${h.color.ring} flex items-start gap-2`}>
      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${h.color.dotBg}`} />
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold ${h.color.text} truncate`}>{h.capaName}</p>
        <p className="text-[11px] text-gray-700 leading-snug">
          {h.tipo}
          {h.detalle !== '—' && <span className="text-gray-500"> · {h.detalle}</span>}
        </p>
        {showDate && (
          <p className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
            {h.fecha.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
          </p>
        )}
      </div>
    </li>
  )
}
