'use client'

/**
 * Calendario regional — concentra en una sola vista todo lo que tiene fecha
 * en la región: reuniones e hitos (seguimientos de las iniciativas) y
 * sesiones de comités/gabinete (eje_sesiones). Deliberadamente NO incluye
 * avances (no son "eventos" con fecha propia, son cambios de estado).
 *
 * Vista mensual pero de 6 semanas fijas (como Google Calendar): la primera
 * semana es siempre la que contiene el día 1 del mes mostrado, aunque
 * empiece en el mes anterior; de ahí se despliegan las siguientes 5 semanas.
 * Paginado por mes (no por bloques de 42 días sueltos). Cada categoría se
 * puede prender/apagar.
 */

import { useEffect, useMemo, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type { Seguimiento, EjeSesion } from '@/lib/types'
import type { Region } from '@/lib/regions'
import { getSupabase } from '@/lib/supabase'
import { useRegionConfig } from '@/lib/hooks/useRegionConfig'
import { Modal } from '@/components/ui'

type Props = {
  open: boolean
  onClose: () => void
  region: Region
  iniciativas: Iniciativa[]
  onSelectIniciativa?: (p: Iniciativa) => void
  // Click en un item de Comités y Gabinetes — el padre decide qué modal de
  // historial abrir según `sesion.instancia` (cada instancia tiene el suyo).
  onSelectSesion?: (sesion: EjeSesion) => void
}

type ItemTipo = 'reunion' | 'hito' | 'comite'

type CalItem = {
  tipo: ItemTipo
  fecha: string
  titulo: string
  subtitulo: string | null
  hora: string | null
  lugar: string | null
  iniciativa?: Iniciativa
  sesion?: EjeSesion
}

const TIPO_CONFIG: Record<ItemTipo, { label: string; dot: string; badge: string }> = {
  reunion: { label: 'Reuniones',           dot: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  hito:    { label: 'Hitos',               dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700'  },
  comite:  { label: 'Comités y Gabinetes', dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700'  },
}

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

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

function instanciaLabel(s: EjeSesion, gabineteNombre?: string, infraestructuraNombre?: string): string {
  switch (s.instancia) {
    case 'gabinete':       return gabineteNombre || 'Gabinete Regional'
    case 'infraestructura': return infraestructuraNombre || 'Comité de Infraestructura'
    case 'inversion':      return 'Comité Económico'
    case 'politico':       return 'Comité Político'
    case 'eje':            return 'Comité'
  }
}

export default function RegionCalendarioModal({ open, onClose, region, iniciativas, onSelectIniciativa, onSelectSesion }: Props) {
  // Ancla = día 1 del mes mostrado. La semana visible arranca en el lunes de
  // la semana que contiene ese día 1 (puede caer en el mes anterior).
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(new Date()))
  const [show, setShow]             = useState<Record<ItemTipo, boolean>>({ reunion: true, hito: true, comite: true })
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([])
  const [sesiones, setSesiones]     = useState<EjeSesion[]>([])
  const [loading, setLoading]       = useState(false)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const { config: regionConfig } = useRegionConfig(region.cod)

  // Reset al abrir — que cada apertura arranque en el mes actual, no donde
  // se quedó la vez anterior (podría confundir "hoy" con "donde navegué antes").
  useEffect(() => {
    if (open) { setMonthAnchor(startOfMonth(new Date())); setSelectedDay(null) }
  }, [open])

  const weekStart = useMemo(() => mondayOf(monthAnchor), [monthAnchor])
  const desde = useMemo(() => toISO(weekStart), [weekStart])
  const hasta = useMemo(() => toISO(addDays(weekStart, 41)), [weekStart])

  useEffect(() => {
    if (!open) return
    const ns = iniciativas.map(p => p.n)
    if (ns.length === 0) { setSeguimientos([]); setSesiones([]); return }
    let cancelled = false
    setLoading(true)
    Promise.all([
      getSupabase().from('seguimientos').select('*')
        .in('prioridad_id', ns).in('tipo', ['reunion', 'hito'])
        .gte('fecha', desde).lte('fecha', hasta),
      getSupabase().from('eje_sesiones').select('*')
        .eq('region_cod', region.cod).gte('fecha', desde).lte('fecha', hasta),
    ]).then(([segRes, sesRes]) => {
      if (cancelled) return
      setSeguimientos((segRes.data ?? []) as Seguimiento[])
      setSesiones((sesRes.data ?? []) as EjeSesion[])
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, desde, hasta, region.cod])

  const items = useMemo(() => {
    const list: CalItem[] = []
    for (const s of seguimientos) {
      const tipo = s.tipo as ItemTipo
      if ((tipo !== 'reunion' && tipo !== 'hito') || !show[tipo] || !s.fecha) continue
      const ini = iniciativas.find(p => p.n === s.prioridad_id)
      list.push({
        tipo,
        fecha: s.fecha,
        titulo: (tipo === 'hito' ? s.nombre : s.nombre) || (tipo === 'hito' ? 'Hito' : 'Reunión'),
        subtitulo: ini?.nombre ?? null,
        hora: s.hora ? s.hora.slice(0, 5) : null,
        lugar: s.lugar,
        iniciativa: ini,
      })
    }
    if (show.comite) {
      for (const s of sesiones) {
        list.push({
          tipo: 'comite',
          fecha: s.fecha,
          titulo: instanciaLabel(s, regionConfig?.gabinete_nombre, regionConfig?.infraestructura_nombre),
          subtitulo: s.estado === 'borrador' ? 'Borrador' : null,
          hora: null,
          lugar: s.lugar,
          sesion: s,
        })
      }
    }
    return list
  }, [seguimientos, sesiones, show, iniciativas, regionConfig])

  const byDate = useMemo(() => {
    const m: Record<string, CalItem[]> = {}
    for (const it of items) (m[it.fecha] ??= []).push(it)
    return m
  }, [items])

  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const today = toISO(new Date())

  const monthLabel = (() => {
    const s = monthAnchor.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  function toggle(tipo: ItemTipo) {
    setShow(prev => ({ ...prev, [tipo]: !prev[tipo] }))
  }

  const selectedItems = selectedDay ? (byDate[selectedDay] ?? []) : []

  return (
    <Modal open={open} onClose={onClose} title={`Calendario — ${region.nombre}`} size="xl">
      <div className="space-y-3">
        {/* Navegación mensual — 6 semanas fijas arrancando en el lunes de la
            semana del día 1 del mes mostrado. */}
        <div className="flex items-center justify-between">
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

        {/* Filtros — seleccionar/deseleccionar cada categoría */}
        <div className="flex items-center gap-2 flex-wrap">
          {(Object.keys(TIPO_CONFIG) as ItemTipo[]).map(tipo => {
            const cfg = TIPO_CONFIG[tipo]
            const active = show[tipo]
            return (
              <button
                key={tipo}
                onClick={() => toggle(tipo)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                  active ? cfg.badge : 'bg-white text-gray-400 border border-gray-200'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${active ? cfg.dot : 'bg-gray-300'}`} />
                {cfg.label}
              </button>
            )
          })}
          {loading && <span className="text-xs text-gray-400">Cargando…</span>}
        </div>

        {/* Grilla 6 semanas × 7 días */}
        <div className="grid grid-cols-7 mb-0.5">
          {DOW.map((d, i) => (
            <div key={i} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-xl overflow-hidden border border-gray-100">
          {days.map((d, i) => {
            const dateStr = toISO(d)
            const dayItems = byDate[dateStr] ?? []
            const isToday = dateStr === today
            const isSelected = dateStr === selectedDay
            const isFirstOfMonth = d.getDate() === 1
            // Días de relleno del mes anterior/siguiente — mismo criterio que
            // cualquier vista mensual: se muestran para completar la semana
            // pero atenuados, así se distingue "el mes que estás mirando".
            const isOtherMonth = d.getMonth() !== monthAnchor.getMonth()
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(isSelected ? null : dateStr)}
                className={`bg-white h-16 p-1.5 flex flex-col items-start transition-colors hover:bg-slate-50 relative ${
                  isSelected ? 'bg-slate-50 ring-2 ring-inset ring-slate-900' : ''
                } ${isOtherMonth ? 'opacity-40' : ''}`}
              >
                <span className="flex items-center gap-1">
                  <span className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full ${
                    isToday ? 'bg-slate-900 text-white' : 'text-gray-600'
                  }`}>{d.getDate()}</span>
                  {isFirstOfMonth && (
                    <span className="text-[9px] text-gray-400 capitalize">{d.toLocaleDateString('es-CL', { month: 'short' })}</span>
                  )}
                </span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {dayItems.slice(0, 4).map((it, j) => (
                    <span
                      key={j}
                      title={`${TIPO_CONFIG[it.tipo].label.replace(/s$/, '')}: ${it.titulo}`}
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${TIPO_CONFIG[it.tipo].dot}`}
                    />
                  ))}
                  {dayItems.length > 4 && (
                    <span className="text-[10px] text-gray-400 leading-none">+{dayItems.length - 4}</span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Detalle del día seleccionado */}
        {selectedDay && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-medium text-gray-500 mb-2">
              {new Date(selectedDay + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
              {selectedItems.length === 0 && ' — Sin actividad'}
            </p>
            {selectedItems.length > 0 && (
              <div className="space-y-1.5">
                {selectedItems.map((it, i) => {
                  const cfg = TIPO_CONFIG[it.tipo]
                  const onClick =
                    it.tipo !== 'comite' && it.iniciativa && onSelectIniciativa
                      ? () => { onSelectIniciativa!(it.iniciativa!); onClose() }
                      : it.tipo === 'comite' && it.sesion && onSelectSesion
                        ? () => { onSelectSesion!(it.sesion!); onClose() }
                        : undefined
                  const Wrapper = onClick ? 'button' : 'div'
                  return (
                    <Wrapper
                      key={i}
                      {...(onClick ? { onClick } : {})}
                      className={`w-full flex gap-3 items-start p-2.5 rounded-lg bg-gray-50 text-left ${onClick ? 'hover:bg-gray-100 transition-colors cursor-pointer' : ''}`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                            {cfg.label.replace(/s$/, '')}
                          </span>
                          {it.hora && <span className="text-xs text-gray-400">🕐 {it.hora}</span>}
                          {it.lugar && <span className="text-xs text-gray-400">📍 {it.lugar}</span>}
                        </div>
                        <p className="text-sm text-gray-700 leading-snug">{it.titulo}</p>
                        {it.subtitulo && <p className="text-xs text-gray-500 mt-0.5">{it.subtitulo}</p>}
                      </div>
                    </Wrapper>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
