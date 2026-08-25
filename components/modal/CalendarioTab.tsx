'use client'

import { useMemo, useState } from 'react'
import type { Seguimiento, Tarea, EjeSesion } from '@/lib/types'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'Avanzando',  color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

const TAREA_ESTADO_CONFIG = {
  no_iniciada: { label: 'No iniciada', color: 'bg-gray-100 text-gray-600'   },
  en_proceso:  { label: 'En proceso',  color: 'bg-blue-100 text-blue-700'   },
  bloqueada:   { label: 'Bloqueada',   color: 'bg-red-100 text-red-700'     },
  completada:  { label: 'Completada',  color: 'bg-green-100 text-green-700' },
} as const

// Las tareas se distinguen de los seguimientos con un dot índigo propio —
// no comparten paleta con TIPO_CONFIG para que se puedan diferenciar de un
// vistazo en el mismo día. Comités/Gabinete usa ámbar, mismo criterio que el
// calendario regional (RegionCalendarioModal) — misma categoría, mismo color.
const TAREA_DOT = 'bg-indigo-500'
const COMITE_DOT = 'bg-amber-500'
const COMITE_BADGE = 'bg-amber-100 text-amber-700'

type ComiteItem = { sesion: EjeSesion; titulo: string }

type Props = {
  seguimientos: Seguimiento[]
  // Tareas de la iniciativa — se ubican en el calendario por fecha_termino.
  tareas?: Tarea[]
  usuarios?: { email: string; name: string }[]
  // Próximo hito declarado en la ficha de la iniciativa abierta. Si la fecha
  // cae en el mes mostrado, se marca con un anillo distintivo en el día —
  // visualmente separado de los dots de seguimientos para distinguir "esto
  // es lo que se prometió" de "esto es lo que pasó".
  fechaProximoHito?: string | null
  proximoHitoTexto?: string | null
  // Sesiones de Gabinete/Infraestructura donde esta iniciativa estuvo en la
  // agenda — click abre el historial de esa sesión (mismo mecanismo que el
  // calendario regional).
  comites?: ComiteItem[]
  onSelectSesion?: (s: EjeSesion) => void
}

function mondayOf(d: Date): Date {
  const x = new Date(d)
  const dow = (x.getDay() + 6) % 7 // 0 = lunes
  x.setDate(x.getDate() - dow)
  x.setHours(0, 0, 0, 0)
  return x
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
// Fecha local YYYY-MM-DD — evita el corrimiento de toISOString() en UTC.
function toISO(d: Date): string {
  return d.toLocaleDateString('en-CA')
}

export default function CalendarioTab({
  seguimientos, tareas = [], usuarios = [], fechaProximoHito, proximoHitoTexto,
  comites = [], onSelectSesion,
}: Props) {
  // Mismo formato que el calendario regional: 6 semanas fijas, la primera es
  // la que contiene el día 1 del mes mostrado, navegación por mes.
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [calDay, setCalDay] = useState<string | null>(null)

  const weekStart = useMemo(() => mondayOf(monthAnchor), [monthAnchor])
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const today = toISO(new Date())

  const byDate: Record<string, Seguimiento[]> = {}
  for (const s of seguimientos) {
    const d = s.fecha ? s.fecha.split('T')[0] : s.created_at.split('T')[0]
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  }

  const tareasByDate: Record<string, Tarea[]> = {}
  for (const t of tareas) {
    if (!t.fecha_termino) continue
    const d = t.fecha_termino.split('T')[0]
    if (!tareasByDate[d]) tareasByDate[d] = []
    tareasByDate[d].push(t)
  }

  const comitesByDate: Record<string, ComiteItem[]> = {}
  for (const c of comites) {
    const d = c.sesion.fecha
    if (!comitesByDate[d]) comitesByDate[d] = []
    comitesByDate[d].push(c)
  }

  function responsableLabel(email: string | null) {
    if (!email) return null
    return usuarios.find(u => u.email === email)?.name ?? email
  }

  const monthLabel = (() => {
    const s = monthAnchor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const selectedEntries = calDay ? (byDate[calDay] ?? []) : []
  const selectedTareas  = calDay ? (tareasByDate[calDay] ?? []) : []
  const selectedComites = calDay ? (comitesByDate[calDay] ?? []) : []

  // Normaliza fecha_proximo_hito a YYYY-MM-DD para matchear contra dateStr
  // de las celdas. Soporta tanto el formato puro ISO como timestamp con hora
  // por si la BD trae la fecha completa.
  const hitoDate = fechaProximoHito ? fechaProximoHito.split('T')[0] : null
  const hitoTooltip = proximoHitoTexto ? `Próximo hito: ${proximoHitoTexto}` : 'Próximo hito comprometido'

  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          title="Mes anterior"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 2L4 7l5 5"/>
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{monthLabel}</span>
          {toISO(monthAnchor) !== toISO(startOfMonth(new Date())) && (
            <button
              onClick={() => setMonthAnchor(startOfMonth(new Date()))}
              className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
            >
              Hoy
            </button>
          )}
        </div>
        <button
          onClick={() => setMonthAnchor(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
          title="Mes siguiente"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 2l5 5-5 5"/>
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
        {days.map((d, i) => {
          const dateStr      = toISO(d)
          const entries      = byDate[dateStr] ?? []
          const dayTareas    = tareasByDate[dateStr] ?? []
          const dayComites   = comitesByDate[dateStr] ?? []
          const isToday      = dateStr === today
          const isSelected   = dateStr === calDay
          const isHito       = dateStr === hitoDate
          const isOtherMonth = d.getMonth() !== monthAnchor.getMonth()
          const total        = entries.length + dayTareas.length + dayComites.length
          return (
            <button
              key={i}
              onClick={() => setCalDay(isSelected ? null : dateStr)}
              title={isHito ? hitoTooltip : undefined}
              className={`bg-white h-16 p-1.5 flex flex-col items-start transition-colors hover:bg-slate-50 relative ${
                isSelected ? 'bg-slate-50 ring-2 ring-inset ring-slate-900' : ''
              } ${isOtherMonth ? 'opacity-40' : ''}`}
            >
              {/* Ring del próximo hito: anillo distintivo (no dot lleno) para
                  separar "fecha comprometida" de "evento ocurrido". Usa el
                  número del día como ancla — el ring va alrededor del número. */}
              <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                isHito && !isToday ? 'ring-2 ring-amber-500 text-amber-700 font-semibold' :
                isToday ? 'bg-slate-900 text-white' :
                'text-gray-600'
              }`}>{d.getDate()}</span>
              <div className="flex flex-wrap gap-0.5 mt-0.5">
                {entries.slice(0, 4).map((s, j) => (
                  <span
                    key={`s${j}`}
                    title={`${TIPO_CONFIG[s.tipo]?.label}: ${s.descripcion}`}
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_CONFIG[s.tipo]?.dot ?? 'bg-gray-300'}`}
                  />
                ))}
                {dayTareas.slice(0, Math.max(0, 4 - entries.length)).map((t, j) => (
                  <span
                    key={`t${j}`}
                    title={`Tarea: ${t.nombre}`}
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${TAREA_DOT}`}
                  />
                ))}
                {dayComites.slice(0, Math.max(0, 4 - entries.length - dayTareas.length)).map((c, j) => (
                  <span
                    key={`c${j}`}
                    title={`${c.titulo}: tratada acá`}
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${COMITE_DOT}`}
                  />
                ))}
                {total > 4 && (
                  <span className="text-xs text-gray-400 leading-none">+{total - 4}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {(Object.entries(TIPO_CONFIG) as [keyof typeof TIPO_CONFIG, typeof TIPO_CONFIG[keyof typeof TIPO_CONFIG]][]).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
            <span className="text-xs text-gray-500">{cfg.label}</span>
          </div>
        ))}
        {tareas.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${TAREA_DOT}`} />
            <span className="text-xs text-gray-500">Tarea (término)</span>
          </div>
        )}
        {comites.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${COMITE_DOT}`} />
            <span className="text-xs text-gray-500">Tratada en comité/gabinete</span>
          </div>
        )}
        {hitoDate && (
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-500" />
            <span className="text-xs text-gray-500">Próximo hito</span>
          </div>
        )}
      </div>

      {calDay && (
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-500 mb-3">
            {new Date(calDay + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
            {selectedEntries.length === 0 && selectedTareas.length === 0 && selectedComites.length === 0 && calDay !== hitoDate && ' — Sin actividad'}
          </p>
          {calDay === hitoDate && (
            <div className="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2">
              <span className="w-2.5 h-2.5 rounded-full ring-2 ring-amber-500 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-amber-800">Próximo hito comprometido</p>
                {proximoHitoTexto && <p className="text-sm text-amber-900 leading-snug mt-0.5">{proximoHitoTexto}</p>}
              </div>
            </div>
          )}
          {selectedComites.length > 0 && (
            <div className="space-y-2 mb-2">
              {selectedComites.map((c, i) => {
                const clickable = !!onSelectSesion
                const Wrapper = clickable ? 'button' : 'div'
                return (
                  <Wrapper
                    key={i}
                    {...(clickable ? { onClick: () => onSelectSesion!(c.sesion) } : {})}
                    className={`w-full flex gap-3 items-start p-2.5 rounded-lg bg-gray-50 text-left ${clickable ? 'hover:bg-gray-100 transition-colors cursor-pointer' : ''}`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${COMITE_DOT}`} />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${COMITE_BADGE}`}>Comité/Gabinete</span>
                      <p className="text-sm text-gray-700 leading-snug mt-0.5">{c.titulo}</p>
                      {c.sesion.lugar && <p className="text-xs text-gray-500 mt-0.5">📍 {c.sesion.lugar}</p>}
                    </div>
                  </Wrapper>
                )
              })}
            </div>
          )}
          {selectedEntries.length > 0 && (
            <div className="space-y-2">
              {selectedEntries.map(s => {
                const cfg = TIPO_CONFIG[s.tipo] ?? TIPO_CONFIG.avance
                const est = s.estado ? ESTADO_CONFIG[s.estado as keyof typeof ESTADO_CONFIG] : null
                return (
                  <div key={s.id} className="flex gap-3 items-start p-2.5 rounded-lg bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                        {est && <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{s.descripcion}</p>
                      {s.autor && <p className="text-xs text-gray-500 mt-0.5">{s.autor}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {selectedTareas.length > 0 && (
            <div className={`space-y-2 ${selectedEntries.length > 0 ? 'mt-2' : ''}`}>
              {selectedTareas.map(t => {
                const est = TAREA_ESTADO_CONFIG[t.estado] ?? TAREA_ESTADO_CONFIG.no_iniciada
                return (
                  <div key={t.id} className="flex gap-3 items-start p-2.5 rounded-lg bg-gray-50">
                    <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${TAREA_DOT}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Tarea</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>
                      </div>
                      <p className="text-sm text-gray-700 leading-snug">{t.nombre}</p>
                      {responsableLabel(t.responsable) && <p className="text-xs text-gray-500 mt-0.5">{responsableLabel(t.responsable)}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
