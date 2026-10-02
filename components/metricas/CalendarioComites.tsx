'use client'

/**
 * Calendario de los comités en todas las regiones que el usuario ve (mig 123).
 * Vive en dos lugares:
 *   - Métricas → «Calendario de comités», con selector de comité.
 *   - Seguimiento SEIA → pestaña «Calendario», fijo en el Comité Económico
 *     (pensado para que el Ministerio de Economía siga a las 16 regiones).
 *
 * Quién ve qué (Manuel, 2026-10-01): cada uno, el calendario de los comités
 * que puede operar en sus regiones. Se lee con el cliente del navegador: la
 * RLS de eje_sesiones ya entrega eso (operadores + regionales en su región) y
 * acá se acota a los que el usuario opera. Un SEREMI de Economía con las 16
 * regiones ve el Económico de todas.
 */

import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useCapabilities } from '@/lib/context/UserContext'
import { can, operarCapForInstancia } from '@/lib/permissions'
import { REGIONS } from '@/lib/regions'
import { diaChile } from '@/lib/fechaChile'
import {
  COLUMNAS_AGENDA, estadoAgenda, medirCalendario, fechaCorta, fechaLarga, sumarDias, diasEntre, diaSemana, MESES, ETIQUETA_ESTADO,
  type SesionAgenda,
} from '@/lib/sesiones/calendario'
import { MarcaSesion, LeyendaSesiones } from '@/components/sesiones/MarcaSesion'
import FiltroRegiones from './FiltroRegiones'

const COMITES = [
  { instancia: 'inversion', nombre: 'Económico' },
  { instancia: 'eje', nombre: 'Policial' },
  { instancia: 'politico', nombre: 'Político' },
  { instancia: 'gabinete', nombre: 'Gabinete' },
  { instancia: 'infraestructura', nombre: 'Nudos Críticos' },
] as const

const PAGINA = 1000
const primeroDelMes = (s: string) => s.slice(0, 8) + '01'
const finDelMes = (s: string) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7), 0, 12)).toISOString().slice(0, 10)
const mesSiguiente = (s: string) => sumarDias(finDelMes(s), 1)
const nombreMes = (s: string) => { const m = MESES[+s.slice(5, 7) - 1]; return m[0].toUpperCase() + m.slice(1) }

type Detalle = { asistentes: number; compromisos: string[] }

/** ¿Opera este comité en alguna región? Para decidir si se ofrece el calendario. */
export function useVeCalendario(instancia: string): boolean {
  return can(useCapabilities(), operarCapForInstancia(instancia)!)
}

export default function CalendarioComites({ instancia: fija }: {
  /** Fija el comité y oculta el selector (Seguimiento SEIA → Económico). */
  instancia?: string
} = {}) {
  const hoy = diaChile()
  const caps = useCapabilities()

  const comites = COMITES.filter(c => can(caps, operarCapForInstancia(c.instancia)!))
  const [elegido, setElegido] = useState<string>(comites[0]?.instancia ?? 'inversion')
  const instancia = fija ?? elegido
  const cap = operarCapForInstancia(instancia)!
  const permitidas = useMemo(() => REGIONS.filter(r => can(caps, cap, r.cod)).map(r => r.cod), [caps, cap])

  // Período por defecto: dos meses atrás y dos adelante, por mes completo.
  const [desde, setDesde] = useState(() => primeroDelMes(sumarDias(primeroDelMes(hoy), -45)))
  const [hasta, setHasta] = useState(() => finDelMes(sumarDias(primeroDelMes(hoy), 75)))
  const [antesDelZoom, setAntesDelZoom] = useState<[string, string] | null>(null)
  const [seleccion, setSeleccion] = useState<Set<string> | null>(null)
  const regiones = seleccion ? permitidas.filter(c => seleccion.has(c)) : permitidas

  const [sesiones, setSesiones] = useState<SesionAgenda[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)
  const [detalle, setDetalle] = useState<Detalle | null>(null)

  const leerDesde = desde
  const leerHasta = hasta
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      const out: SesionAgenda[] = []
      for (let a = 0; ; a += PAGINA) {
        const { data, error } = await getSupabase().from('eje_sesiones').select(COLUMNAS_AGENDA)
          .gte('fecha', leerDesde).lte('fecha', leerHasta).neq('estado', 'anulada')
          .order('fecha').order('id').range(a, a + PAGINA - 1)
        if (error) { if (!cancelado) { setError(error.message); setCargando(false) } return }
        out.push(...((data ?? []) as SesionAgenda[]))
        if (!data || data.length < PAGINA) break
      }
      if (!cancelado) { setSesiones(out); setError(null); setCargando(false) }
    })()
    return () => { cancelado = true }
  }, [leerDesde, leerHasta])

  const delComite = useMemo(
    () => sesiones.filter(s => s.instancia === instancia && regiones.includes(s.region_cod)),
    [sesiones, instancia, regiones],
  )
  const enPeriodo = delComite.filter(s => s.fecha >= desde && s.fecha <= hasta)
  const m = medirCalendario(enPeriodo, hoy)
  const programados = enPeriodo.filter(s => s.agenda === 'ordinaria').length
  const porVenir = enPeriodo.filter(s => s.estado === 'programada' && s.fecha >= hoy).length
  const sinCerrar = enPeriodo.filter(s => s.estado === 'borrador' && s.fecha < hoy).length

  const span = Math.max(1, diasEntre(desde, hasta) + 1)
  const pos = (f: string) => `${(100 * (diasEntre(desde, f) + 0.5)) / span}%`
  const meses: string[] = []
  for (let mm = primeroDelMes(desde); mm <= hasta; mm = mesSiguiente(mm)) meses.push(mm)
  const unMes = meses.length === 1
  // Una línea por semana (cada lunes) detrás de los puntos; el mes se marca solo arriba.
  const lunes: string[] = []
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (diaSemana(f) === 1) lunes.push(f)
  const borde = (f: string) => `${(100 * diasEntre(desde, f)) / span}%`

  const sesion = elegida != null ? delComite.find(s => s.id === elegida) ?? null : null

  // Lo tratado de la elegida: asistencia y compromisos. RLS: lo mismo que la sesión.
  useEffect(() => {
    if (!sesion || sesion.estado === 'programada') return
    let cancelado = false
    const sb = getSupabase()
    Promise.all([
      sb.from('sesion_asistencia').select('id', { count: 'exact', head: true }).eq('sesion_id', sesion.id),
      sb.from('sesion_compromisos').select('descripcion').eq('sesion_origen_id', sesion.id).order('created_at'),
    ]).then(([a, c]) => {
      if (!cancelado) setDetalle({ asistentes: a.count ?? 0, compromisos: (c.data ?? []).map(x => (x as { descripcion: string }).descripcion) })
    })
    return () => { cancelado = true; setDetalle(null) }
  }, [sesion])

  async function verActa(id: number) {
    const res = await fetch(`/api/sesiones/${id}/acta`)
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.url) window.open(body.url, '_blank', 'noopener,noreferrer')
    else window.alert(body.error ?? 'No se pudo obtener el acta')
  }

  const zoom = (mm: string) => { setAntesDelZoom([desde, hasta]); setDesde(mm); setHasta(finDelMes(mm)) }
  const salirZoom = () => { if (antesDelZoom) { setDesde(antesDelZoom[0]); setHasta(antesDelZoom[1]); setAntesDelZoom(null) } }

  if (!permitidas.length) return <p className="p-6 text-sm text-gray-500">No operas este comité en ninguna región.</p>

  const tarjeta = (valor: string | number, texto: string, nota: string) => (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <b className="block text-[26px] font-bold leading-none tracking-tight tabular-nums text-slate-900">{valor}</b>
      <span className="block text-[12.5px] text-slate-600 mt-1.5">{texto}</span>
      <small className="block text-[11px] text-gray-400 mt-0.5">{nota}</small>
    </div>
  )
  const input = 'border border-gray-300 rounded-[9px] px-2.5 py-1.5 text-[13px] bg-white'

  return (
    <div className={fija ? 'mt-4 space-y-4' : 'p-4 md:p-6 max-w-[1240px] mx-auto space-y-4'}>
      <div className="flex flex-wrap items-center gap-2">
        {!fija && <h2 className="text-lg font-bold text-gray-900 mr-auto">Calendario de comités</h2>}
        {!fija && (
          <div className="inline-flex flex-wrap border border-gray-300 rounded-lg overflow-hidden">
            {comites.map(c => (
              <button key={c.instancia} onClick={() => { setElegido(c.instancia); setElegida(null) }}
                className={`px-3 py-1.5 text-xs font-semibold border-r last:border-r-0 border-gray-300 ${instancia === c.instancia ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                {c.nombre}
              </button>
            ))}
          </div>
        )}
        {permitidas.length > 1 && (
          <FiltroRegiones seleccion={new Set(regiones)} opciones={permitidas} onCambio={s => setSeleccion(s)} />
        )}
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">Desde
          <input type="date" className={input} value={desde} max={hasta} onChange={e => { if (e.target.value) { setDesde(e.target.value); setAntesDelZoom(null) } }} />
        </label>
        <label className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">Hasta
          <input type="date" className={input} value={hasta} min={desde} onChange={e => { if (e.target.value) { setHasta(e.target.value); setAntesDelZoom(null) } }} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {tarjeta(m.terminadas, 'Comités realizados', 'cerrados en el período')}
        {tarjeta(programados, 'Comités programados', porVenir ? `${porVenir} por venir` : 'agendados en el período')}
        {tarjeta(m.cumplimiento == null ? '—' : `${Math.round(m.cumplimiento * 100)}%`, '% de sesiones realizadas', m.cumplimiento == null ? '' : `${m.realizadasATiempo} de ${m.programadasVencidas} programadas a la fecha`)}
        {tarjeta(sinCerrar, 'Sin cerrar', 'abiertas con la fecha pasada')}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 min-h-[40px]">
            {antesDelZoom
              ? <><button className="text-xs font-semibold text-gray-600 hover:text-gray-900" onClick={salirZoom}>← Todo el período</button>
                  <span className="text-sm font-bold text-gray-900">{nombreMes(desde)} {desde.slice(0, 4)}</span></>
              : !unMes && <span className="text-xs text-gray-500">Clic en un mes para verlo en detalle</span>}
            <LeyendaSesiones className="ml-auto" />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[150px_minmax(0,1fr)_84px_92px] items-end text-[10px] font-bold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                <span className="px-3 py-1.5">Región</span>
                <div className="relative h-7">
                  {unMes
                    ? Array.from({ length: span }, (_, i) => sumarDias(desde, i)).map(f => (
                        <span key={f} className={`absolute top-2 -translate-x-1/2 text-[9px] font-semibold ${f === hoy ? 'text-gray-900' : 'text-gray-400'}`} style={{ left: pos(f) }}>{+f.slice(8)}</span>
                      ))
                    : meses.map(mm => {
                        const ini = mm < desde ? desde : mm
                        const fin = finDelMes(mm) > hasta ? hasta : finDelMes(mm)
                        return (
                          <button key={mm} onClick={() => zoom(mm)} className="absolute top-1 bottom-0 border-l border-gray-200 pl-1 text-left normal-case text-[11px] text-gray-600 hover:text-gray-900 hover:bg-gray-50 overflow-hidden whitespace-nowrap"
                            style={{ left: `${(100 * diasEntre(desde, ini)) / span}%`, width: `${(100 * (diasEntre(ini, fin) + 1)) / span}%` }}>
                            {nombreMes(mm)}
                          </button>
                        )
                      })}
                </div>
                <span className="px-2 py-1.5 text-right">Terminadas</span>
                <span className="px-3 py-1.5 text-right">Programadas</span>
              </div>
              {cargando && <p className="px-3 py-6 text-sm text-gray-500">Cargando…</p>}
              {error && <p className="px-3 py-6 text-sm text-red-700">{error}</p>}
              {!cargando && !error && REGIONS.filter(r => regiones.includes(r.cod)).map(r => {
                const suyas = enPeriodo.filter(s => s.region_cod === r.cod)
                const mr = medirCalendario(suyas, hoy)
                const prog = suyas.filter(s => s.agenda === 'ordinaria').length
                const vistas: Record<string, number> = {}
                return (
                  <div key={r.cod} className="grid grid-cols-[150px_minmax(0,1fr)_84px_92px] items-center border-b border-gray-50 last:border-b-0 hover:bg-gray-50/60">
                    <span className="px-3 py-1.5 text-xs text-gray-800 truncate">{r.nombre}</span>
                    <div className="relative h-7">
                      {lunes.map(f => <span key={f} className="absolute inset-y-0 border-l border-gray-200" style={{ left: borde(f) }} />)}
                      {hoy >= desde && hoy <= hasta && <span className="absolute inset-y-0 border-l-2 border-gray-900/70" style={{ left: pos(hoy) }} />}
                      {suyas.map(s => {
                        const n = vistas[s.fecha] = (vistas[s.fecha] ?? -1) + 1
                        const e = estadoAgenda(s, hoy)
                        return (
                          <button key={s.id} onClick={() => setElegida(s.id)} title={`${fechaCorta(s.fecha)} · ${ETIQUETA_ESTADO[e]}`}
                            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full text-gray-800 hover:bg-gray-200 ${elegida === s.id ? 'bg-gray-200 ring-1 ring-gray-500' : ''}`}
                            style={{ left: `calc(${pos(s.fecha)} + ${n * 8}px)` }}>
                            <MarcaSesion estado={e} size={12} />
                          </button>
                        )
                      })}
                    </div>
                    <span className={`px-2 text-right text-xs tabular-nums ${mr.terminadas ? 'font-semibold text-gray-900' : 'text-gray-300'}`}>{mr.terminadas}</span>
                    <span className={`px-3 text-right text-xs tabular-nums ${prog ? 'font-semibold text-gray-900' : 'text-gray-300'}`}>{prog}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <aside className="bg-white border border-gray-200 rounded-xl p-4 lg:sticky lg:top-4">
          {!sesion ? <p className="text-sm text-gray-500">Elige una sesión.</p> : (() => {
            const e = estadoAgenda(sesion, hoy)
            const region = REGIONS.find(r => r.cod === sesion.region_cod)
            return (
              <div className="space-y-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700"><MarcaSesion estado={e} />{ETIQUETA_ESTADO[e]}</span>
                <h3 className="text-sm font-bold text-gray-900">{COMITES.find(c => c.instancia === instancia)?.nombre} · {region?.nombre}</h3>
                <p className="text-xs text-gray-600">{fechaLarga(sesion.fecha)} · {sesion.lugar ?? 'sin lugar'}</p>
                {sesion.fecha_original && sesion.fecha_original !== sesion.fecha && (
                  <p className="text-[11px] text-gray-500">Movida desde el {fechaCorta(sesion.fecha_original)}{sesion.motivo_cambio ? ` · ${sesion.motivo_cambio}` : ''}</p>
                )}
                {detalle && (
                  <>
                    <div className="flex gap-5 pt-1">
                      <div><div className="text-lg font-bold text-gray-900">{detalle.asistentes}</div><div className="text-[11px] text-gray-600">asistentes</div></div>
                      <div><div className="text-lg font-bold text-gray-900">{detalle.compromisos.length}</div><div className="text-[11px] text-gray-600">compromisos</div></div>
                    </div>
                    {detalle.compromisos.length > 0 && (
                      <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700 max-h-64 overflow-y-auto">
                        {detalle.compromisos.map((c, i) => <li key={i} className="line-clamp-3">{c}</li>)}
                      </ul>
                    )}
                  </>
                )}
                {e === 'realizada' && sesion.acta_path && (
                  <button className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-300 hover:border-gray-500" onClick={() => verActa(sesion.id)}>Acta</button>
                )}
              </div>
            )
          })()}
        </aside>
      </div>
    </div>
  )
}
