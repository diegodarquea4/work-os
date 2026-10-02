'use client'

/**
 * Agenda de un comité (mig 123): el selector «Nueva sesión» y el modal
 * «Calendario». Los cinco comités los montan igual: el padre guarda cuál está
 * abierto y recibe por `onAbrir` el id de la sesión que su modal de sesión
 * tiene que abrir (como `borradorId`).
 *
 * Toda sesión nace acá: o se abre una programada, o se agenda en el momento
 * (hoy = extraordinaria, fecha pasada = registrada después).
 */

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui'
import { useAgendaComite } from '@/lib/hooks/useAgendaComite'
import type { SesionesFiltro } from '@/lib/hooks/useSesionesEje'
import { diaChile } from '@/lib/fechaChile'
import {
  estadoAgenda, fechaCorta, fechaLarga, fechasRecurrentes, sumarDias, diaSemana, describirFrecuencia, MESES, medirCalendario,
  FERIADOS, MAX_ABIERTAS, ETIQUETA_ESTADO, type SesionAgenda, type Frecuencia,
} from '@/lib/sesiones/calendario'
import { MarcaSesion, LeyendaSesiones } from './MarcaSesion'

export type VistaAgenda = 'nueva' | 'calendario' | null

type Props = {
  vista: VistaAgenda
  onVista: (v: VistaAgenda) => void
  regionCod: string
  filtro: SesionesFiltro
  nombreComite: string
  email: string | null
  /** Abre la sesión en el modal del comité. */
  onAbrir: (sesionId: number) => void
}

export default function AgendaSesiones({ vista, onVista, regionCod, filtro, nombreComite, email, onAbrir }: Props) {
  const agenda = useAgendaComite(regionCod, filtro, email, vista !== null)
  const hoy = diaChile()
  const [trabajando, setTrabajando] = useState(false)

  async function correr<T>(fn: () => Promise<T>): Promise<T | undefined> {
    setTrabajando(true)
    try { return await fn() }
    catch (e) { window.alert((e as Error).message) }
    finally { setTrabajando(false) }
  }
  const abrirYSalir = async (fn: () => Promise<number>) => {
    const id = await correr(fn)
    if (id != null) { onVista(null); onAbrir(id) }
  }

  return (
    <>
      <Modal open={vista === 'nueva'} onClose={() => onVista(null)} size="md" title={`Nueva sesión · ${nombreComite}`}>
        <NuevaSesion
          sesiones={agenda.sesiones} cargando={agenda.cargando} hoy={hoy} trabajando={trabajando}
          onReanudar={id => { onVista(null); onAbrir(id) }}
          onAbrirProgramada={id => abrirYSalir(() => agenda.abrir(id))}
          onFueraDeCalendario={(f, l) => abrirYSalir(() => agenda.abrirFueraDeCalendario(f, l))}
          onCalendario={() => onVista('calendario')}
        />
      </Modal>
      <Modal open={vista === 'calendario'} onClose={() => onVista(null)} size="xl" title={`Calendario · ${nombreComite}`}>
        <Calendario
          sesiones={agenda.sesiones} cargando={agenda.cargando} hoy={hoy} trabajando={trabajando}
          onAgendar={(fs, l) => correr(async () => { await agenda.agendar(fs, l); return true })}
          onAbrir={id => abrirYSalir(() => agenda.abrir(id))}
          onReanudar={id => { onVista(null); onAbrir(id) }}
          onMover={(s, f, m) => correr(() => agenda.mover(s, f, m))}
          onAnular={(s, m) => correr(() => agenda.anular(s, m))}
        />
      </Modal>
    </>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────

const btn = 'px-2.5 py-1 text-xs font-semibold rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
const btnSec = `${btn} border-gray-300 text-gray-700 hover:border-gray-500 bg-white`
const btnPri = `${btn} border-gray-900 bg-gray-900 text-white hover:bg-gray-700`
const input = 'border border-gray-300 rounded-md px-2 py-1 text-xs bg-white min-w-0'
const titulo = 'text-[10px] font-bold uppercase tracking-wider text-gray-500'

function Dia({ fecha }: { fecha: string }) {
  return (
    <div className="w-11 shrink-0 text-center border border-gray-200 rounded-md py-0.5 leading-tight bg-gray-50">
      <div className="text-[9px] uppercase text-gray-500">{fechaCorta(fecha).split(' ')[0]}</div>
      <div className="text-base font-bold text-gray-900">{+fecha.slice(8)}</div>
      <div className="text-[9px] uppercase text-gray-500">{fechaCorta(fecha).split('-')[1]}</div>
    </div>
  )
}

function Estado({ s, hoy }: { s: SesionAgenda; hoy: string }) {
  const e = estadoAgenda(s, hoy)
  return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-700"><MarcaSesion estado={e} />{ETIQUETA_ESTADO[e]}</span>
}

const TIPO: Record<string, string> = { extraordinaria: 'Extraordinaria', registrada: 'Registrada después' }

// ── Nueva sesión ────────────────────────────────────────────────────────────

function NuevaSesion({ sesiones, cargando, hoy, trabajando, onReanudar, onAbrirProgramada, onFueraDeCalendario, onCalendario }: {
  sesiones: SesionAgenda[]; cargando: boolean; hoy: string; trabajando: boolean
  onReanudar: (id: number) => void
  onAbrirProgramada: (id: number) => void
  onFueraDeCalendario: (fecha: string, lugar: string) => void
  onCalendario: () => void
}) {
  const abiertas = sesiones.filter(s => s.estado === 'borrador')
  const programadas = sesiones.filter(s => s.estado === 'programada' && s.fecha >= hoy)
  const lleno = abiertas.length >= MAX_ABIERTAS
  const ultimoLugar = [...sesiones].reverse().find(s => s.lugar)?.lugar ?? ''
  const [lugarHoy, setLugarHoy] = useState(ultimoLugar)
  const [fechaPasada, setFechaPasada] = useState('')
  const [lugarPasada, setLugarPasada] = useState('')

  if (cargando && !sesiones.length) return <p className="text-sm text-gray-500">Cargando…</p>

  const fila = 'flex items-center gap-3 py-2 border-t border-gray-100 first:border-t-0'
  return (
    <div className="space-y-4">
      {abiertas.length > 0 && (
        <section>
          <p className={titulo}>Abiertas</p>
          {abiertas.map(s => (
            <div key={s.id} className={fila}>
              <Dia fecha={s.fecha} />
              <div className="flex-1 min-w-0">
                <Estado s={s} hoy={hoy} />
                <p className="text-xs text-gray-600 truncate">{s.lugar ?? 'Sin lugar'}</p>
              </div>
              <button className={btnPri} onClick={() => onReanudar(s.id)}>Reanudar</button>
            </div>
          ))}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <p className={titulo}>Programadas</p>
          <button className="text-xs font-semibold text-gray-600 hover:text-gray-900 hover:underline" onClick={onCalendario}>Calendario</button>
        </div>
        {programadas.slice(0, 3).map((s, i) => (
          <div key={s.id} className={fila}>
            <Dia fecha={s.fecha} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">
                {fechaLarga(s.fecha)}
                {i === 0 && <span className="ml-2 text-[10px] font-semibold border border-gray-400 rounded px-1 py-px text-gray-600">Próxima</span>}
              </p>
              <p className="text-xs text-gray-600 truncate">{s.lugar ?? 'Sin lugar'}</p>
            </div>
            <button className={i === 0 ? btnPri : btnSec} disabled={lleno || trabajando} onClick={() => onAbrirProgramada(s.id)}>Abrir</button>
          </div>
        ))}
        {!programadas.length && <p className="text-xs text-gray-500 py-2">Sin sesiones programadas.</p>}
      </section>

      <section>
        <p className={titulo}>Sin agendar</p>
        <div className={fila}>
          <Dia fecha={hoy} />
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Extraordinaria, hoy</span>
            <input className={`${input} flex-1`} placeholder="Lugar" value={lugarHoy} onChange={e => setLugarHoy(e.target.value)} />
          </div>
          <button className={btnSec} disabled={lleno || trabajando} onClick={() => onFueraDeCalendario(hoy, lugarHoy)}>Abrir</button>
        </div>
        <div className={fila}>
          <div className="w-11 shrink-0" />
          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Ya realizada</span>
            <input type="date" className={input} max={sumarDias(hoy, -1)} value={fechaPasada} onChange={e => setFechaPasada(e.target.value)} aria-label="Fecha en que se realizó" />
            <input className={`${input} flex-1`} placeholder="Lugar" value={lugarPasada} onChange={e => setLugarPasada(e.target.value)} />
          </div>
          <button className={btnSec} disabled={lleno || trabajando || !fechaPasada || fechaPasada >= hoy} onClick={() => onFueraDeCalendario(fechaPasada, lugarPasada)}>Registrar</button>
        </div>
      </section>

      {lleno && <p className="text-xs font-semibold text-gray-700">Hay {MAX_ABIERTAS} sesiones abiertas: cierra una para abrir otra.</p>}
    </div>
  )
}

// ── Calendario ──────────────────────────────────────────────────────────────

const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

function Calendario({ sesiones, cargando, hoy, trabajando, onAgendar, onAbrir, onReanudar, onMover, onAnular }: {
  sesiones: SesionAgenda[]; cargando: boolean; hoy: string; trabajando: boolean
  onAgendar: (fechas: string[], lugar: string) => Promise<boolean | undefined>
  onAbrir: (id: number) => void
  onReanudar: (id: number) => void
  onMover: (s: SesionAgenda, fecha: string, motivo: string) => Promise<unknown>
  onAnular: (s: SesionAgenda, motivo: string) => Promise<unknown>
}) {
  const visibles = sesiones.filter(s => s.estado !== 'anulada')
  const m = medirCalendario(sesiones, hoy)
  const [mes, setMes] = useState(hoy.slice(0, 8) + '01')
  // null = cerrado; '' = abierto sin fecha; 'YYYY-MM-DD' = abierto desde un día.
  const [agendando, setAgendando] = useState<string | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)

  let inicio = mes
  while (diaSemana(inicio) !== 1) inicio = sumarDias(inicio, -1)
  const dias = Array.from({ length: 42 }, (_, i) => sumarDias(inicio, i))
  const porDia = new Map<string, SesionAgenda[]>()
  for (const s of visibles) porDia.set(s.fecha, [...(porDia.get(s.fecha) ?? []), s])
  const mover = (n: number) => { const d = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7) - 1 + n, 1, 12)); setMes(d.toISOString().slice(0, 10)) }
  const sesion = visibles.find(s => s.id === elegida) ?? null
  const nombreMes = MESES[+mes.slice(5, 7) - 1]

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-2">
        <button className="px-2 py-0.5 rounded hover:bg-gray-100 text-gray-600" onClick={() => mover(-1)} aria-label="Mes anterior">‹</button>
        <span className="text-sm font-bold text-gray-900 w-36 text-center">{nombreMes[0].toUpperCase() + nombreMes.slice(1)} {mes.slice(0, 4)}</span>
        <button className="px-2 py-0.5 rounded hover:bg-gray-100 text-gray-600" onClick={() => mover(1)} aria-label="Mes siguiente">›</button>
        {m.cumplimiento != null && (
          <span className="text-xs text-gray-600 ml-2">Cumplimiento <b className="text-gray-900">{Math.round(m.cumplimiento * 100)}%</b> · {m.realizadasATiempo} de {m.programadasVencidas}</span>
        )}
        <LeyendaSesiones className="ml-auto hidden sm:flex" />
        <button className={`${btnPri} ml-2`} onClick={() => setAgendando('')}>+ Agendar</button>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-7 min-w-[560px] border border-gray-200 rounded-lg overflow-hidden bg-gray-200 gap-px">
          {DOW.map(d => <div key={d} className="bg-gray-50 text-[10px] font-bold uppercase text-gray-500 text-center py-1">{d}</div>)}
          {dias.map(f => {
            const delMes = f.slice(0, 7) === mes.slice(0, 7)
            const lista = porDia.get(f) ?? []
            const libre = f >= hoy && !lista.length
            return (
              <div key={f}
                onClick={libre ? () => setAgendando(f) : undefined}
                className={`min-h-[68px] p-1 flex flex-col gap-0.5 ${delMes ? 'bg-white' : 'bg-gray-50'} ${libre ? 'cursor-pointer hover:bg-gray-50' : ''}`}>
                <div className="flex items-start justify-between gap-1">
                  <span className={`text-[11px] font-semibold ${f === hoy ? 'bg-gray-900 text-white rounded-full px-1.5' : delMes ? 'text-gray-800' : 'text-gray-400'}`}>{+f.slice(8)}</span>
                  {FERIADOS[f] && <span className="text-[9px] leading-tight text-gray-500 text-right">{FERIADOS[f]}</span>}
                </div>
                {lista.map(s => {
                  const e = estadoAgenda(s, hoy)
                  return (
                    <button key={s.id} onClick={ev => { ev.stopPropagation(); setElegida(s.id) }}
                      className={`flex items-center gap-1 text-[11px] text-gray-800 rounded px-1 py-0.5 text-left hover:bg-gray-100 ${elegida === s.id ? 'bg-gray-100 ring-1 ring-gray-400' : ''}`}>
                      <MarcaSesion estado={e} size={11} /><span className="truncate">{ETIQUETA_ESTADO[e]}</span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      {cargando && !sesiones.length && <p className="text-sm text-gray-500 py-2">Cargando…</p>}

      {sesion && (
        <div className="mt-3 border border-gray-200 rounded-lg px-3">
          <Renglon key={sesion.id} s={sesion} hoy={hoy} trabajando={trabajando} onAbrir={onAbrir} onReanudar={onReanudar} onMover={onMover} onAnular={onAnular} />
        </div>
      )}

      {agendando !== null && (
        <div className="absolute right-0 top-9 z-10 w-[340px] max-w-full bg-white border border-gray-200 rounded-lg shadow-xl p-3">
          <Agendar key={agendando} sesiones={visibles} hoy={hoy} trabajando={trabajando} fechaInicial={agendando}
            onAgendar={onAgendar} onListo={() => setAgendando(null)} />
        </div>
      )}
    </div>
  )
}

function Renglon({ s, hoy, trabajando, onAbrir, onReanudar, onMover, onAnular }: {
  s: SesionAgenda; hoy: string; trabajando: boolean
  onAbrir: (id: number) => void
  onReanudar: (id: number) => void
  onMover: (s: SesionAgenda, fecha: string, motivo: string) => Promise<unknown>
  onAnular: (s: SesionAgenda, motivo: string) => Promise<unknown>
}) {
  const e = estadoAgenda(s, hoy)
  const [editando, setEditando] = useState<'mover' | 'anular' | null>(null)
  const [fecha, setFecha] = useState(s.fecha)
  const [motivo, setMotivo] = useState('')
  const [descargando, setDescargando] = useState(false)

  async function acta() {
    setDescargando(true)
    try {
      const res = await fetch(`/api/sesiones/${s.id}/acta`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.url) window.open(body.url, '_blank', 'noopener,noreferrer')
      else window.alert(body.error ?? 'No se pudo obtener el acta')
    } finally { setDescargando(false) }
  }

  return (
    <div className="py-2 border-t border-gray-100">
      <div className="flex items-start gap-3">
        <Dia fecha={s.fecha} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Estado s={s} hoy={hoy} />
            {s.agenda && TIPO[s.agenda] && <span className="text-[10px] text-gray-500 border border-gray-200 rounded px-1">{TIPO[s.agenda]}</span>}
          </div>
          <p className="text-xs text-gray-600 truncate">{s.lugar ?? 'Sin lugar'}</p>
          {s.fecha_original && s.fecha_original !== s.fecha && (
            <p className="text-[11px] text-gray-500">Movida desde el {fechaCorta(s.fecha_original)}{s.motivo_cambio ? ` · ${s.motivo_cambio}` : ''}</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {e === 'programada' && <>
            <button className={btnSec} disabled={trabajando} onClick={() => onAbrir(s.id)}>Abrir</button>
            <button className={btnSec} onClick={() => setEditando(editando === 'mover' ? null : 'mover')}>Mover</button>
            <button className={btnSec} onClick={() => setEditando(editando === 'anular' ? null : 'anular')}>Anular</button>
          </>}
          {e === 'noRealizada' && <button className={btnSec} onClick={() => setEditando(editando === 'mover' ? null : 'mover')}>Mover</button>}
          {e === 'abierta' && <button className={btnPri} onClick={() => onReanudar(s.id)}>Reanudar</button>}
          {e === 'realizada' && s.acta_path && <button className={btnSec} disabled={descargando} onClick={acta}>Acta</button>}
        </div>
      </div>
      {editando && (
        <form
          className="mt-2 ml-14 flex flex-wrap items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-2"
          onSubmit={async ev => {
            ev.preventDefault()
            if (!motivo.trim()) return
            if (editando === 'mover') await onMover(s, fecha, motivo)
            else await onAnular(s, motivo)
            setEditando(null); setMotivo('')
          }}
        >
          {editando === 'mover' && <input type="date" className={input} min={hoy} value={fecha} onChange={ev => setFecha(ev.target.value)} required aria-label="Nueva fecha" />}
          <input className={`${input} flex-1`} placeholder="Motivo" value={motivo} onChange={ev => setMotivo(ev.target.value)} required autoFocus />
          <button type="submit" className={btnPri} disabled={trabajando || !motivo.trim() || (editando === 'mover' && (!fecha || fecha < hoy))}>{editando === 'mover' ? 'Mover' : 'Anular'}</button>
          <button type="button" className={btnSec} onClick={() => setEditando(null)}>Cancelar</button>
        </form>
      )}
    </div>
  )
}

function Agendar({ sesiones, hoy, trabajando, fechaInicial, onAgendar, onListo }: {
  sesiones: SesionAgenda[]; hoy: string; trabajando: boolean; fechaInicial: string
  onAgendar: (fechas: string[], lugar: string) => Promise<boolean | undefined>
  onListo: () => void
}) {
  const ultimoLugar = [...sesiones].reverse().find(s => s.lugar)?.lugar ?? ''
  const [fecha, setFecha] = useState(fechaInicial)
  const [lugar, setLugar] = useState(ultimoLugar)
  const [recurrente, setRecurrente] = useState(false)
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('mensual')
  const [hasta, setHasta] = useState('')
  // Fechas de la serie que el usuario sacó o volvió a marcar a mano.
  const [quitar, setQuitar] = useState<Set<string>>(new Set())
  const [poner, setPoner] = useState<Set<string>>(new Set())

  const ocupadas = useMemo(() => new Set(sesiones.map(s => s.fecha)), [sesiones])
  const serie = useMemo(() => {
    if (!fecha || fecha < hoy) return []
    if (!recurrente) return [fecha]
    return fechasRecurrentes(fecha, hasta || sumarDias(fecha, 180), frecuencia)
  }, [fecha, hasta, frecuencia, recurrente, hoy])
  const vale = (f: string) => poner.has(f) || (!quitar.has(f) && !FERIADOS[f] && !ocupadas.has(f))
  const elegidas = recurrente ? serie.filter(vale) : serie

  const limpiarMarcas = () => { setQuitar(new Set()); setPoner(new Set()) }
  const alternar = (f: string) => {
    const q = new Set(quitar), p = new Set(poner)
    if (vale(f)) { q.add(f); p.delete(f) } else { p.add(f); q.delete(f) }
    setQuitar(q); setPoner(p)
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    if (!elegidas.length) return
    if (await onAgendar(elegidas, lugar)) onListo()
  }

  const campo = 'grid gap-1 text-[11px] font-semibold text-gray-600'
  return (
    <form onSubmit={enviar} className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-gray-900">Agendar</p>
        <button type="button" onClick={onListo} className="text-gray-400 hover:text-gray-700 text-lg leading-none" aria-label="Cerrar">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className={campo}>Fecha
          <input type="date" className={input} min={hoy} value={fecha} required onChange={e => { setFecha(e.target.value); limpiarMarcas() }} />
        </label>
        <label className={campo}>Lugar
          <input className={input} value={lugar} onChange={e => setLugar(e.target.value)} />
        </label>
      </div>
      <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-700">
        <input type="checkbox" checked={recurrente} onChange={e => { setRecurrente(e.target.checked); limpiarMarcas() }} className="accent-gray-900" />
        Recurrente
      </label>
      {recurrente && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className={campo}>Frecuencia
              <select className={input} value={frecuencia} onChange={e => { setFrecuencia(e.target.value as Frecuencia); limpiarMarcas() }}>
                <option value="semanal">Cada semana</option>
                <option value="quincenal">Cada 2 semanas</option>
                <option value="mensual">Cada mes</option>
              </select>
            </label>
            <label className={campo}>Hasta
              <input type="date" className={input} min={fecha || hoy} value={hasta} onChange={e => { setHasta(e.target.value); limpiarMarcas() }} />
            </label>
          </div>
          {fecha && (
            <div>
              <p className="text-[11px] text-gray-600 mb-1.5">{describirFrecuencia(fecha, frecuencia)}{hasta ? '' : ', por 6 meses'}</p>
              <div className="flex flex-wrap gap-1.5">
                {serie.map(f => {
                  const motivo = FERIADOS[f] ?? (ocupadas.has(f) ? 'Ya hay sesión' : null)
                  return (
                    <button key={f} type="button" onClick={() => alternar(f)} aria-pressed={vale(f)}
                      className={`text-left text-[11px] leading-tight border rounded px-1.5 py-0.5 ${vale(f) ? 'border-gray-400 bg-white text-gray-900' : 'border-dashed border-gray-300 text-gray-400 line-through'}`}>
                      {fechaCorta(f)}{motivo && <span className="block text-[9px] no-underline">{motivo}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
      <div className="flex justify-end">
        <button type="submit" className={btnPri} disabled={trabajando || !elegidas.length}>
          {elegidas.length > 1 ? `Agendar ${elegidas.length}` : 'Agendar'}
        </button>
      </div>
    </form>
  )
}

