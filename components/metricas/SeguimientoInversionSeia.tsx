'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { useSeguimientoSeia, expedienteDeCartera, type DatosSeguimientoSeia } from '@/lib/hooks/useSeguimientoSeia'
import TablaProyectosFiltrable, { type FilaProyecto } from './TablaProyectosFiltrable'
import {
  COD_REGIONES, FILAS_MATRIZ, MINISTERIOS, ATRASO_MAXIMO_DIAS, DIAS_PENDIENTE,
  nombreFila, ministerioCorto, ministerioLargo, prepararOficios, pasaModo, armarMatriz, claveCelda,
  agruparPorProyecto, medirRegion, regionesSinSesionar, fechasDeCorte, evaluacionDelCorte,
  selloDeActualizacion, sumarDias,
  type Oficio, type ModoTablero, type Cuenta, type MedicionRegion, type GrupoProyecto,
} from '@/lib/seguimientoSeia'
import { diaChile } from '@/lib/fechaChile'

/**
 * «Seguimiento de la inversión en el SEIA» — el módulo «Comité Económico
 * Regional» de Métricas. Mira de arriba lo que la sesión del comité mira
 * proyecto por proyecto: quién debe pronunciarse, sobre qué, y cuánto lleva
 * atrasado. La lógica vive pura en lib/seguimientoSeia.ts.
 *
 * Cuatro pestañas: Nacional (matriz región × ministerio), Regional (por
 * ministerio u organismo), Comparativa (región contra región, con evolutivo)
 * y Cartera (lo de la cartera del comité y, abajo, el resto de lo que está en
 * calificación).
 *
 * El color es SOLO para el atraso: rojo = vencido. Un pendiente no tiene nada
 * de malo y va en gris.
 */

export type Pestana = 'nacional' | 'regional' | 'comparativa' | 'cartera'

const NOMBRE_REGION = Object.fromEntries(REGIONS.map(r => [r.cod, r.nombre]))
const fmtN = (n: number) => Math.round(n).toLocaleString('es-CL')
const fmt1 = (n: number) => n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtF = (s: string | null) => s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '—'
const pl = (n: number, uno: string, varios = uno + 's') => n === 1 ? uno : varios
const mmusd = (v: number) => v / 1e6

/** Fondo de una celda: una sola rampa por trabajo. Rojo = vencidos; gris = pendientes. */
function calor(valor: number, max: number, tono: 'rojo' | 'gris'): React.CSSProperties | undefined {
  if (!valor || !max) return undefined
  const pct = Math.round(14 + 66 * Math.sqrt(valor / max))
  const base = tono === 'gris' ? '#94a3b8' : '#b91c1c'
  return {
    background: `color-mix(in oklab, ${base} ${pct}%, white)`,
    color: tono === 'rojo' && pct > 46 ? 'white' : undefined,
  }
}

export default function SeguimientoInversionSeia({ pestanaInicial = 'nacional', regionInicial }: {
  /** Desde el Comité Económico de una región se abre en «Regional», en esa región. */
  pestanaInicial?: Pestana
  regionInicial?: string
} = {}) {
  const { datos, error, cargando, recargar } = useSeguimientoSeia()
  const [pestana, setPestana] = useState<Pestana>(pestanaInicial)
  // Lo que se está mostrando, para el sello: cada pestaña lo informa.
  const [enPantalla, setEnPantalla] = useState<string[]>(COD_REGIONES)

  const oficios = useMemo(
    () => datos ? prepararOficios(datos.oficios, datos.hoy, iso => diaChile(new Date(iso))) : [],
    [datos],
  )

  if (error) {
    return <div className="p-8 text-center text-sm text-red-700">No se pudieron cargar los datos: {error}</div>
  }
  if (cargando || !datos) {
    return <div className="p-10 text-center text-sm text-gray-400">Cargando oficios del SEIA…</div>
  }

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <header className="flex items-start gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-violet-700">Comité Económico Regional</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Seguimiento de la inversión en el SEIA</h2>
        </div>
        <Sello datos={datos} regiones={enPantalla} onActualizado={recargar} />
      </header>

      <nav className="mt-5 inline-flex gap-0.5 p-[3px] rounded-[11px] bg-stone-100 max-w-full overflow-x-auto">
        {([['nacional', 'Nacional'], ['regional', 'Regional'], ['comparativa', 'Comparativa regional'], ['cartera', 'Cartera de proyectos']] as const).map(([k, t]) => (
          <button key={k} onClick={() => setPestana(k)}
            className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-lg whitespace-nowrap ${pestana === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t}
          </button>
        ))}
      </nav>

      {pestana === 'nacional'    && <VistaNacional datos={datos} oficios={oficios} onRegiones={setEnPantalla} />}
      {pestana === 'regional'    && <VistaRegional datos={datos} oficios={oficios} onRegiones={setEnPantalla} regionInicial={regionInicial} />}
      {pestana === 'comparativa' && <VistaComparativa datos={datos} oficios={oficios} onRegiones={setEnPantalla} />}
      {pestana === 'cartera'     && <VistaCartera datos={datos} onRegiones={setEnPantalla} />}

      <footer className="mt-7 pt-3 border-t border-gray-200 text-[11.5px] text-gray-400 space-y-0.5">
        <p>Las fechas pueden tener un margen de error de un día.</p>
        <p>Se consideran pendientes los oficios a los que les faltan {DIAS_PENDIENTE} días o menos para el vencimiento de su pronunciamiento.</p>
        <p>Se excluyen del análisis los oficios con más de un año ({ATRASO_MAXIMO_DIAS} días) de atraso.</p>
      </footer>
    </div>
  )
}

// ══ Sello: última actualización + botón ═════════════════════════════════════

/**
 * La fecha es la del oficio menos al día entre las regiones que se muestran.
 * El cron nacional (lunes, miércoles y viernes) recorre todo lo que está en calificación;
 * el botón hace lo mismo con las regiones mostradas que no están al día, de a
 * una, y se apaga cuando ya están todas (la ruta tiene candado diario).
 */
function Sello({ datos, regiones, onActualizado }: { datos: DatosSeguimientoSeia; regiones: string[]; onActualizado: () => void }) {
  const s = selloDeActualizacion(regiones, datos.actualizado, datos.hoy, datos.medibles, r => datos.refrescables.has(r))
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  async function actualizar() {
    const cola = s.atrasadas
    setAviso(null)
    setProgreso({ hechas: 0, total: cola.length })
    const sinPermiso: string[] = [], fallaron: string[] = []
    for (let i = 0; i < cola.length; i++) {
      const r = cola[i]
      try {
        // Una región grande (Atacama) corta a medias: `partial`, y la ruta
        // guarda dónde quedó para seguir en el reintento.
        for (let intento = 0; intento < 6; intento++) {
          const res = await fetch(`/api/oficios-seia/scrape?region=${encodeURIComponent(r)}`, { method: 'POST' })
          if (res.status === 403) { sinPermiso.push(r); break }
          const json = await res.json().catch(() => null) as { partial?: boolean; error?: string } | null
          if (!res.ok || !json) { fallaron.push(r); break }
          if (!json.partial) break
        }
      } catch {
        fallaron.push(r)
      }
      setProgreso({ hechas: i + 1, total: cola.length })
    }
    setProgreso(null)
    const partes: string[] = []
    if (sinPermiso.length) partes.push(`sin permiso en ${sinPermiso.map(c => NOMBRE_REGION[c]).join(', ')}`)
    if (fallaron.length) partes.push(`no respondió el SEIA en ${fallaron.map(c => NOMBRE_REGION[c]).join(', ')}`)
    setAviso(partes.length ? partes.join(' · ') : null)
    onActualizado()
  }

  const alDia = s.atrasadas.length === 0
  const titulo = progreso ? `Actualizando ${progreso.hechas} de ${progreso.total}…`
    : alDia ? 'Ya se actualizó hoy. Se puede volver a actualizar mañana.'
    : s.atrasadas.length === 1 ? `Actualizar ${NOMBRE_REGION[s.atrasadas[0]]} desde el SEIA (entre medio minuto y dos)`
    : `Actualizar desde el SEIA las ${s.atrasadas.length} regiones que no están al día (de a una; unos minutos)`

  return (
    <div className="ml-auto flex items-center gap-2.5 text-right">
      <button type="button" onClick={actualizar} disabled={alDia || !!progreso} title={titulo} aria-label={titulo}
        className="w-9 h-9 rounded-full border border-gray-300 bg-white text-violet-700 grid place-items-center hover:border-violet-500 hover:bg-violet-50 disabled:text-gray-300 disabled:hover:bg-white disabled:hover:border-gray-300 disabled:cursor-not-allowed">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          className={progreso ? 'animate-spin' : ''} aria-hidden="true">
          <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" />
        </svg>
      </button>
      <div className="leading-tight">
        <p className="text-[11.5px] text-gray-400">{progreso ? `Actualizando ${progreso.hechas} de ${progreso.total}…` : 'Última actualización'}</p>
        <p className="text-sm font-bold text-slate-900 tabular-nums">{fmtF(s.fecha)}</p>
        {(aviso || s.sinProyectos.length > 0) && (
          <p className="text-[11px] text-gray-400 max-w-[260px]" title="Regiones sin proyectos de la cartera vinculados a un expediente del SEIA: no hay oficios que traer.">
            {aviso ?? `${s.sinProyectos.length <= 2 ? s.sinProyectos.map(c => NOMBRE_REGION[c]).join(' y ') : `${s.sinProyectos.length} regiones`} sin proyectos en el SEIA`}
          </p>
        )}
      </div>
    </div>
  )
}

// ══ Piezas compartidas ══════════════════════════════════════════════════════

function Segmentos<T extends string>({ opciones, valor, onCambio }: { opciones: [T, string][]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-[9px] border border-gray-300 bg-white overflow-hidden">
      {opciones.map(([k, t], i) => (
        <button key={k} onClick={() => onCambio(k)} aria-pressed={valor === k}
          className={`px-3 py-1.5 text-[13px] font-semibold ${i ? 'border-l border-gray-300' : ''} ${valor === k ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:text-slate-800'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

/** Multiselección de regiones. Nunca queda vacía: sin región no habría nada que mostrar. */
function FiltroRegiones({ seleccion, onCambio, compacto = false }: { seleccion: Set<string>; onCambio: (s: Set<string>) => void; compacto?: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const todas = seleccion.size === COD_REGIONES.length
  const resumen = todas ? 'Todas las regiones' : seleccion.size === 1 ? NOMBRE_REGION[[...seleccion][0]] : `${seleccion.size} regiones`
  const alternar = (c: string) => {
    const s = new Set(seleccion)
    if (s.has(c)) { if (s.size > 1) s.delete(c) } else s.add(c)
    onCambio(s)
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setAbierto(a => !a)}
        className={compacto
          ? `text-[11px] uppercase tracking-wide font-semibold ${todas ? 'text-gray-400' : 'text-violet-700'} hover:text-slate-800`
          : `text-[13px] font-semibold text-slate-800 bg-white border rounded-[9px] px-3 py-1.5 ${abierto ? 'border-violet-500' : 'border-gray-300'}`}>
        {compacto ? `Región${todas ? '' : ` (${seleccion.size})`}` : resumen} <span className="text-gray-400">▾</span>
      </button>
      {abierto && (
        <div className="absolute z-30 left-0 top-[calc(100%+6px)] w-60 max-h-80 overflow-y-auto bg-white border border-gray-300 rounded-xl shadow-xl p-1.5 text-left normal-case tracking-normal">
          <label className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-semibold text-slate-800 border-b border-gray-100 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" className="accent-violet-700" checked={todas}
              onChange={e => onCambio(e.target.checked ? new Set(COD_REGIONES) : new Set([COD_REGIONES[0]]))} />
            Todas
          </label>
          {REGIONS.map(r => (
            <label key={r.cod} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] font-normal text-slate-800 cursor-pointer hover:bg-gray-50">
              <input type="checkbox" className="accent-violet-700" checked={seleccion.has(r.cod)} onChange={() => alternar(r.cod)} />
              {r.nombre}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

/** Los oficios por proyecto → organismo → oficio, igual que en la sesión del comité. */
function TarjetasProyectos({ oficios, datos, mostrarRegion = false }: { oficios: Oficio[]; datos: DatosSeguimientoSeia; mostrarRegion?: boolean }) {
  const [todos, setTodos] = useState(false)
  const grupos = useMemo(() => agruparPorProyecto(oficios), [oficios])
  const LIMITE = 12
  const visibles = todos ? grupos : grupos.slice(0, LIMITE)
  return (
    <div className="mt-3 space-y-2">
      {visibles.map(g => <TarjetaProyecto key={g.expediente} g={g} datos={datos} mostrarRegion={mostrarRegion} />)}
      {grupos.length > visibles.length && (
        <button onClick={() => setTodos(true)} className="text-[12.5px] font-semibold text-violet-700 hover:underline pt-1">
          Ver {grupos.length - visibles.length} {pl(grupos.length - visibles.length, 'proyecto')} más
        </button>
      )}
    </div>
  )
}

function TarjetaProyecto({ g, datos, mostrarRegion }: { g: GrupoProyecto; datos: DatosSeguimientoSeia; mostrarRegion: boolean }) {
  const tipos = [...new Set(g.organismos.flatMap(o => o.oficios.map(x => x.tipo)).filter(Boolean))] as string[]
  const inversion = datos.inversionPorExpediente.get(g.expediente)
  return (
    <div className={`rounded-[11px] border overflow-hidden ${g.vencidos ? 'border-red-200 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
      <div className="px-3.5 py-2.5 flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          {g.urlProyecto
            ? <a href={g.urlProyecto} target="_blank" rel="noreferrer" className="text-[13.5px] font-semibold text-slate-900 leading-snug hover:text-violet-700 hover:underline">{g.proyecto}</a>
            : <span className="text-[13.5px] font-semibold text-slate-900 leading-snug">{g.proyecto}</span>}
          {g.enCartera && <span className="ml-1.5 align-[1px] text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-violet-300 bg-violet-50 text-violet-700">Cartera</span>}
          {tipos.length === 1 && <p className="text-xs text-slate-600 mt-0.5">{tipos[0]}</p>}
          <p className="text-[11.5px] text-gray-400 mt-0.5">
            {[
              g.vencidos ? <span key="v" className="text-red-700 font-bold">{g.vencidos} {pl(g.vencidos, 'vencido')}</span> : null,
              g.pendientes ? <span key="p" className="text-slate-600 font-bold">{g.pendientes} {pl(g.pendientes, 'pendiente')}</span> : null,
              <span key="o">{g.organismos.length} {pl(g.organismos.length, 'organismo')}</span>,
              mostrarRegion ? <span key="r">{NOMBRE_REGION[g.region] ?? g.region}</span> : null,
            ].filter(Boolean).flatMap((x, i) => i ? [<span key={`s${i}`}> · </span>, x] : [x])}
          </p>
        </div>
        {inversion != null && (
          <div className="text-right text-[11.5px] text-gray-400 whitespace-nowrap tabular-nums">
            <b className="block text-[13.5px] text-slate-900">{fmtN(mmusd(inversion))}</b>MMUSD
          </div>
        )}
      </div>
      <div className="border-t border-gray-200/70 divide-y divide-gray-200/70">
        {g.organismos.map(org => (
          <div key={org.nombre} className="px-3.5 py-2">
            <p className="text-[12.5px] text-slate-800">{org.nombre} <span className="text-[11.5px] text-gray-400">· {ministerioCorto(org.ministerio)}</span></p>
            {org.oficios.map(o => (
              <div key={o.id} className="flex flex-wrap items-baseline gap-2 text-[11.5px] mt-0.5 tabular-nums">
                <span className="text-slate-600">{fmtF(o.fechaLimite)}</span>
                {o.estado === 'v'
                  ? <span className="font-bold text-red-700">{o.dias} {pl(o.dias, 'día')} de atraso</span>
                  : <span className="font-bold text-slate-600">{o.dias === 0 ? 'vence hoy' : `vence en ${-o.dias} ${pl(-o.dias, 'día')}`}</span>}
                {tipos.length > 1 && o.tipo && <span className="text-gray-400">· {o.tipo}</span>}
                {o.urlOficio && <a href={o.urlOficio} target="_blank" rel="noreferrer" className="font-semibold text-violet-700 hover:underline">Ver oficio →</a>}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ══ Nacional ════════════════════════════════════════════════════════════════

const colorDeCuenta = (c: Cuenta | undefined, tono: 'rojo' | 'gris') => tono === 'gris' ? (c?.p ?? 0) : (c?.v ?? 0)

/** Una celda de la matriz: el total del cruce, coloreado por lo que manda el modo. */
function Celda({ c, mx, tono, cruce = false, onElegir, extra = '' }: {
  c?: Cuenta; mx: number; tono: 'rojo' | 'gris'; cruce?: boolean; onElegir: () => void; extra?: string
}) {
  const n = c ? c.v + c.p : 0
  if (!c || !n) return <td className={`text-center text-gray-300 ${extra}`}>-</td>
  const soloPend = tono === 'rojo' && !c.v
  return (
    <td className={`p-0.5 ${extra}`}>
      <button onClick={onElegir} title={`${c.v} ${pl(c.v, 'vencido')} · ${c.p} ${pl(c.p, 'pendiente')}`}
        style={calor(colorDeCuenta(c, tono), mx, tono)}
        className={`block w-full h-[26px] rounded-[5px] text-xs font-semibold tabular-nums ${soloPend ? 'bg-stone-100' : ''} ${cruce ? 'outline outline-2 -outline-offset-2 outline-violet-700' : ''}`}>
        {n}
      </button>
    </td>
  )
}


function VistaNacional({ datos, oficios, onRegiones }: { datos: DatosSeguimientoSeia; oficios: Oficio[]; onRegiones: (r: string[]) => void }) {
  const [modo, setModo] = useState<ModoTablero>('ambos')
  const [regs, setRegs] = useState<Set<string>>(new Set(COD_REGIONES))
  const [fila, setFila] = useState<string | null>(null)
  const [min, setMin] = useState<string | null>(null)
  const detalleRef = useRef<HTMLDivElement>(null)

  useEffect(() => { onRegiones([...regs]) }, [regs, onRegiones])

  const base = useMemo(() => oficios.filter(o => regs.has(o.region) && pasaModo(o, modo)), [oficios, regs, modo])
  const m = useMemo(() => armarMatriz(base), [base])
  const filas = FILAS_MATRIZ.filter(f => !COD_REGIONES.includes(f) || regs.has(f))
  const tono: 'rojo' | 'gris' = modo === 'p' ? 'gris' : 'rojo'
  const colorDe = (c?: Cuenta) => colorDeCuenta(c, tono)
  const max = (vals: Iterable<Cuenta>) => Math.max(1, ...[...vals].map(colorDe))
  const maxC = max(m.celdas.values()), maxF = max(m.porFila.values()), maxM = max(m.porMinisterio.values())
  const proyectos = new Set(base.map(o => o.expediente))
  const inversion = [...proyectos].reduce((s, e) => s + (datos.inversionPorExpediente.get(e) ?? 0), 0)

  function elegir(f: string | null, k: string | null) {
    if (f && k) {
      if (fila === f && min === k) { setFila(null); setMin(null) } else { setFila(f); setMin(k) }
    } else if (f) setFila(fila === f ? null : f)
    else if (k) setMin(min === k ? null : k)
    requestAnimationFrame(() => detalleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const lista = fila || min ? base.filter(o => (!fila || o.fila === fila) && (!min || o.ministerio === min)) : []

  return (
    <section>
      <div className="mt-4 flex items-center gap-2.5 flex-wrap">
        <Segmentos<ModoTablero> valor={modo} onCambio={setModo}
          opciones={[['ambos', 'Vencidos y pendientes'], ['v', 'Solo vencidos'], ['p', 'Solo pendientes']]} />
        <FiltroRegiones seleccion={regs} onCambio={s => { setRegs(s); if (fila && COD_REGIONES.includes(fila) && !s.has(fila)) setFila(null) }} />
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>Color = {modo === 'p' ? 'pendientes' : 'vencidos'}</span>
          <span className="inline-flex gap-0.5">{[1, 4, 9].map(v => <i key={v} className="w-[11px] h-[11px] rounded-[3px] inline-block" style={calor(v, 9, tono)} />)}</span>
          {modo === 'ambos' && <span className="inline-flex items-center gap-1.5"><i className="w-[11px] h-[11px] rounded-[3px] inline-block bg-stone-100" />Solo pendientes</span>}
        </div>
      </div>

      <div className="mt-4 mb-3 flex items-end gap-4 flex-wrap">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          {modo === 'ambos' && <>
            <b className="text-3xl font-bold tracking-tight tabular-nums">{fmtN(m.total.v + m.total.p)}</b>
            <span className="text-[15px] font-semibold text-slate-600">pronunciamientos pendientes</span>
            <span className="text-slate-400">·</span>
            <span className="text-[15px] font-semibold text-red-700 tabular-nums">{fmtN(m.total.v)} vencidos</span>
          </>}
          {modo === 'v' && <><b className="text-3xl font-bold tracking-tight tabular-nums text-red-700">{fmtN(m.total.v)}</b><span className="text-[15px] font-semibold text-slate-600">pronunciamientos vencidos</span></>}
          {modo === 'p' && <><b className="text-3xl font-bold tracking-tight tabular-nums">{fmtN(m.total.p)}</b><span className="text-[15px] font-semibold text-slate-600">pronunciamientos pendientes, sin vencer</span></>}
        </div>
        <div className="ml-auto flex items-center gap-2 bg-white border border-gray-200 rounded-xl py-2 pl-3.5 pr-2">
          <span className="text-xs font-bold text-slate-600 leading-tight max-w-[9.5rem]">Proyectos con oficios {modo === 'v' ? 'vencidos' : 'pendientes'}</span>
          <span className="bg-stone-50 rounded-lg px-3.5 py-1.5 text-right"><b className="block text-xl font-bold tabular-nums leading-tight">{fmtN(proyectos.size)}</b><span className="text-[11px] text-gray-400">proyectos</span></span>
          <span className="bg-stone-50 rounded-lg px-3.5 py-1.5 text-right"><b className="block text-xl font-bold tabular-nums leading-tight">{fmtN(mmusd(inversion))}</b><span className="text-[11px] text-gray-400">MMUSD</span></span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white border-b border-gray-200" />
              {MINISTERIOS.map(mi => (
                <th key={mi.clave} className={`border-b border-gray-200 align-bottom ${min === mi.clave ? 'bg-violet-50' : ''}`}>
                  <button onClick={() => elegir(null, mi.clave)} title={mi.largo}
                    className={`w-full min-w-[58px] px-1 py-2 text-[11px] font-semibold leading-tight hover:text-violet-700 ${min === mi.clave ? 'text-violet-700' : 'text-slate-500'}`}>
                    {mi.corto}
                  </button>
                </th>
              ))}
              <th className="border-b border-l border-gray-200 px-2 py-2 text-[11px] font-semibold text-slate-800 align-bottom">Total</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => {
              const especial = f === 'NAC' || f === 'INTER'
              const sinDatos = !especial && !datos.medibles.has(f)
              const sel = fila === f
              const borde = f === 'INTER' || i === 1 ? 'border-t border-gray-200' : ''
              return (
                <tr key={f} className={sel ? 'bg-violet-50' : ''}>
                  <th className={`sticky left-0 z-[1] text-left border-r border-gray-200 ${sel ? 'bg-violet-50' : 'bg-white'} ${borde}`}>
                    <button onClick={() => elegir(f, null)} title={sinDatos ? 'Sin proyectos de la cartera vinculados al SEIA' : undefined}
                      className={`h-[30px] px-3 text-xs whitespace-nowrap hover:text-violet-700 ${sel ? 'text-violet-700' : sinDatos ? 'text-gray-400 italic' : 'text-slate-800'} ${especial ? 'font-bold' : 'font-medium'}`}>
                      {nombreFila(f)}
                    </button>
                  </th>
                  {MINISTERIOS.map(mi => (
                    <Celda key={mi.clave} c={m.celdas.get(claveCelda(f, mi.clave))} mx={maxC} tono={tono}
                      cruce={fila === f && min === mi.clave} onElegir={() => elegir(f, mi.clave)}
                      extra={`${borde} ${min === mi.clave && !sel ? 'bg-violet-50' : ''}`} />
                  ))}
                  <Celda c={m.porFila.get(f)} mx={maxF} tono={tono} onElegir={() => elegir(f, null)} extra={`border-l border-gray-200 ${borde}`} />
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th className="sticky left-0 bg-white text-left px-3 h-8 text-xs font-bold border-t border-r border-gray-300">Total</th>
              {MINISTERIOS.map(mi => (
                <Celda key={mi.clave} c={m.porMinisterio.get(mi.clave)} mx={maxM} tono={tono} onElegir={() => elegir(null, mi.clave)}
                  extra={`border-t border-gray-300 ${min === mi.clave ? 'bg-violet-50' : ''}`} />
              ))}
              <td className="border-t border-l border-gray-300 text-center font-bold tabular-nums">{fmtN(m.total.v + m.total.p)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div ref={detalleRef} className="mt-5 scroll-mt-4">
        {!fila && !min ? (
          <div className="p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">
            Aprieta una región, un ministerio o un número de la tabla para ver sus oficios por proyecto.
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <h3 className="text-base font-bold tracking-tight">{[fila && nombreFila(fila), min && ministerioLargo(min)].filter(Boolean).join(' · ')}</h3>
              <span className="text-[12.5px] text-gray-400 tabular-nums">
                {lista.length} {pl(lista.length, 'oficio')} · {new Set(lista.map(o => o.expediente)).size} {pl(new Set(lista.map(o => o.expediente)).size, 'proyecto')}
              </span>
              <button onClick={() => { setFila(null); setMin(null) }} className="ml-auto text-[12.5px] font-semibold text-violet-700 hover:underline">Quitar selección</button>
            </div>
            {lista.length
              ? <TarjetasProyectos key={`${fila}|${min}|${modo}`} oficios={lista} datos={datos} mostrarRegion />
              : <div className="mt-3 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">Sin oficios en este cruce.</div>}
          </>
        )}
      </div>
    </section>
  )
}

// ══ Regional ════════════════════════════════════════════════════════════════

function Kpi({ activo, onClick, valor, texto, rojo = false }: { activo: boolean; onClick: () => void; valor: string; texto: string; rojo?: boolean }) {
  return (
    <button onClick={onClick} aria-pressed={activo}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${activo ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
      <b className={`block text-[28px] font-bold leading-none tracking-tight tabular-nums ${rojo ? 'text-red-700' : 'text-slate-900'}`}>{valor}</b>
      <span className="block text-xs text-slate-600 mt-1.5 leading-snug">{texto}</span>
    </button>
  )
}


function VistaRegional({ datos, oficios, onRegiones, regionInicial }: { datos: DatosSeguimientoSeia; oficios: Oficio[]; onRegiones: (r: string[]) => void; regionInicial?: string }) {
  const conDatos = COD_REGIONES.filter(c => datos.medibles.has(c))
  // Arranca en la región pedida o, si no, en la con más vencidos: es la que
  // hay que mirar primero.
  const [region, setRegion] = useState(() => {
    if (regionInicial && COD_REGIONES.includes(regionInicial)) return regionInicial
    const venc = (c: string) => oficios.filter(o => o.region === c && o.estado === 'v').length
    return [...conDatos].sort((a, b) => venc(b) - venc(a))[0] ?? COD_REGIONES[0]
  })
  const [vista, setVista] = useState<'min' | 'org'>('min')
  const [filtro, setFiltro] = useState<ModoTablero>('ambos')
  const [orden, setOrden] = useState<'v' | 'atraso'>('v')
  const [abierto, setAbierto] = useState<string | null>(null)

  useEffect(() => { onRegiones([region]) }, [region, onRegiones])

  const todos = oficios.filter(o => o.region === region && o.estado)
  const venc = todos.filter(o => o.estado === 'v')
  const pend = todos.filter(o => o.estado === 'p')
  const atrasoProm = venc.length ? venc.reduce((s, o) => s + o.dias, 0) / venc.length : 0
  const organismos = new Set(todos.map(o => o.organismo)).size

  type Grupo = { k: string; ofs: Oficio[]; v: number; p: number; suma: number; orgs: Set<string>; min: string; fila: string }
  const grupos = new Map<string, Grupo>()
  for (const o of todos.filter(x => pasaModo(x, filtro))) {
    const k = vista === 'min' ? o.ministerio : o.organismo
    const g = grupos.get(k) ?? { k, ofs: [], v: 0, p: 0, suma: 0, orgs: new Set<string>(), min: o.ministerio, fila: o.fila }
    g.ofs.push(o); if (o.estado === 'v') { g.v++; g.suma += o.dias } else g.p++
    g.orgs.add(o.organismo)
    grupos.set(k, g)
  }
  const prom = (g: Grupo) => g.v ? g.suma / g.v : 0
  const ordenados = [...grupos.values()].sort(orden === 'atraso'
    ? (a, b) => prom(b) - prom(a) || b.v - a.v
    : (a, b) => b.v - a.v || (b.v + b.p) - (a.v + a.p))
  const max = Math.max(1, ...ordenados.map(g => g.v + g.p))

  return (
    <section>
      <div className="mt-4 flex items-center gap-2.5 flex-wrap">
        <select value={region} onChange={e => { setRegion(e.target.value); setAbierto(null) }}
          className="text-[13px] bg-white border border-gray-300 rounded-[9px] px-2.5 py-1.5">
          {REGIONS.map(r => <option key={r.cod} value={r.cod} disabled={!datos.medibles.has(r.cod)}>{r.nombre}{datos.medibles.has(r.cod) ? '' : ' (sin proyectos en el SEIA)'}</option>)}
        </select>
        <Segmentos<'min' | 'org'> valor={vista} onCambio={v => { setVista(v); setAbierto(null) }} opciones={[['min', 'Por ministerio'], ['org', 'Por organismo']]} />
        <div className="ml-auto flex items-center gap-3.5 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5"><i className="w-[11px] h-[11px] rounded-[3px] bg-red-700 inline-block" />Vencidos</span>
          <span className="inline-flex items-center gap-1.5"><i className="w-[11px] h-[11px] rounded-[3px] bg-slate-400 inline-block" />Pendientes</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Kpi activo={filtro === 'v'} onClick={() => { setFiltro(f => f === 'v' ? 'ambos' : 'v'); setAbierto(null) }} valor={fmtN(venc.length)} texto="Oficios vencidos" rojo />
        <Kpi activo={filtro === 'p'} onClick={() => { setFiltro(f => f === 'p' ? 'ambos' : 'p'); setAbierto(null) }} valor={fmtN(pend.length)} texto="Oficios pendientes" />
        <Kpi activo={orden === 'atraso'} onClick={() => setOrden(o => o === 'atraso' ? 'v' : 'atraso')} valor={venc.length ? fmt1(atrasoProm) : '0'} texto="Días de atraso promedio" rojo={venc.length > 0} />
        <Kpi activo={vista === 'org'} onClick={() => { setVista(v => v === 'org' ? 'min' : 'org'); setAbierto(null) }} valor={fmtN(organismos)} texto="OAECAs con pronunciamientos pendientes" />
      </div>

      {ordenados.length === 0 ? (
        <div className="mt-3.5 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">Sin oficios en esta selección.</div>
      ) : (
        <div className="mt-3.5 bg-white border border-gray-200 rounded-xl divide-y divide-gray-200">
          {ordenados.map(g => {
            const ab = abierto === g.k
            const nombre = vista === 'min' ? ministerioLargo(g.k) : g.k
            const sub = vista === 'min'
              ? `${g.orgs.size} ${pl(g.orgs.size, 'organismo')}`
              : `${ministerioCorto(g.min)}${g.fila === 'NAC' ? ' · nivel central' : g.fila === 'INTER' ? ' · zonal' : ''}`
            return (
              <div key={g.k}>
                <button onClick={() => setAbierto(ab ? null : g.k)} aria-expanded={ab}
                  className={`w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_8.5rem_6.5rem_1rem] gap-3.5 items-center px-3.5 py-2.5 ${ab ? 'bg-violet-50' : 'hover:bg-stone-50'}`}>
                  <div className="min-w-0"><b className="block text-[13px] font-semibold break-words">{nombre}</b><span className="block text-[11.5px] text-gray-400">{sub}</span></div>
                  <div className="hidden md:flex gap-0.5 h-4">
                    {g.v > 0 && <i className="block rounded bg-red-700 min-w-[3px]" style={{ width: `${(g.v / max) * 100}%` }} />}
                    {g.p > 0 && <i className="block rounded bg-slate-400 min-w-[3px]" style={{ width: `${(g.p / max) * 100}%` }} />}
                  </div>
                  <div className="text-xs text-slate-600 whitespace-nowrap tabular-nums">
                    {g.v > 0 && <span className="text-red-700 font-bold">{g.v} {pl(g.v, 'vencido')}</span>}
                    {g.v > 0 && g.p > 0 && ' · '}
                    {g.p > 0 && `${g.p} ${pl(g.p, 'pendiente')}`}
                  </div>
                  <div className={`hidden md:block text-xs text-right whitespace-nowrap tabular-nums ${g.v ? 'text-red-700 font-bold' : 'text-gray-400'}`}>
                    {g.v ? `${fmt1(prom(g))} días prom.` : 'sin atraso'}
                  </div>
                  <span className={`hidden md:block text-gray-400 transition-transform ${ab ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
                </button>
                {ab && <div className="px-3.5 pb-3.5"><TarjetasProyectos oficios={g.ofs} datos={datos} /></div>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ══ Comparativa ═════════════════════════════════════════════════════════════

type Item = { k: keyof MedicionRegion; t: string; tono: 'rojo' | 'gris'; fmt: (v: number) => string; evolutivo?: boolean }
const ITEMS: Item[] = [
  { k: 'sesiones',       t: 'Sesiones del comité',        tono: 'gris', fmt: fmtN },
  { k: 'ultimoComite',   t: 'Último comité',              tono: 'gris', fmt: fmtN, evolutivo: false },
  { k: 'cartera',        t: 'Proyectos en cartera',       tono: 'gris', fmt: fmtN },
  { k: 'gestionados',    t: 'Oficios gestionados',        tono: 'gris', fmt: fmtN },
  { k: 'vencidos',       t: 'Oficios vencidos',           tono: 'rojo', fmt: fmtN },
  { k: 'pendientes',     t: 'Oficios pendientes',         tono: 'gris', fmt: fmtN },
  { k: 'pctVencidos',    t: '% de gestionados vencidos',  tono: 'rojo', fmt: v => `${fmt1(v * 100)}%` },
  { k: 'atrasoPromedio', t: 'Atraso promedio (días)',     tono: 'rojo', fmt: fmt1 },
]

/** El total de una columna. Sesiones y Último comité no se suman: ver `textoResumen`. */
function agregado(k: keyof MedicionRegion, ms: MedicionRegion[]): number | null {
  const con = ms.filter(m => m[k] != null)
  if (!con.length) return null
  const suma = (kk: keyof MedicionRegion) => con.reduce((s, m) => s + (m[kk] as number), 0)
  if (k === 'pctVencidos') { const g = suma('gestionados'); return g ? suma('vencidos') / g : 0 }
  if (k === 'atrasoPromedio') {
    const v = suma('vencidos')
    return v ? con.reduce((s, m) => s + (m.atrasoPromedio ?? 0) * (m.vencidos ?? 0), 0) / v : 0
  }
  return suma(k)
}

/** Un botón de resumen arriba de cada columna; en el evolutivo, el selector del ítem. */
function Resumen({ txt, pie, rojo, evolutivo, elegible, pulsado, onClick }: {
  txt: string; pie: string; rojo: boolean; evolutivo: boolean; elegible: boolean; pulsado: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick} disabled={evolutivo && !elegible} aria-pressed={pulsado}
      className={`w-full min-w-[92px] text-right rounded-[10px] border px-2.5 py-2
        ${pulsado ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600'
          : evolutivo && elegible ? 'border-dashed border-violet-500 bg-stone-50 hover:bg-violet-50 cursor-pointer'
          : 'border-gray-200 bg-stone-50 cursor-default'}
        ${evolutivo && !elegible ? 'opacity-40' : ''}`}>
      <b className={`block text-[19px] font-bold leading-tight tabular-nums ${rojo ? 'text-red-700' : 'text-slate-900'}`}>{txt}</b>
      <small className="block text-[10.5px] text-gray-400 mt-0.5 whitespace-nowrap">{pie}</small>
    </button>
  )
}

function VistaComparativa({ datos, oficios, onRegiones }: { datos: DatosSeguimientoSeia; oficios: Oficio[]; onRegiones: (r: string[]) => void }) {
  const [regs, setRegs] = useState<Set<string>>(new Set(COD_REGIONES))
  const [orden, setOrden] = useState<{ k: keyof MedicionRegion; dir: 1 | -1 }>({ k: 'vencidos', dir: -1 })
  const [evolutivo, setEvolutivo] = useState(false)
  const [item, setItem] = useState<keyof MedicionRegion | null>(null)
  const [hasta, setHasta] = useState(datos.hoy)
  const [desde, setDesde] = useState(sumarDias(datos.hoy, -100))
  const [nFechas, setNFechas] = useState(6)

  const cods = COD_REGIONES.filter(c => regs.has(c))
  useEffect(() => { onRegiones(cods) }, [regs]) // eslint-disable-line react-hooks/exhaustive-deps

  const base = useMemo(() => ({ oficios, sesiones: datos.sesiones, cartera: datos.carteraAltas, conDatos: datos.medibles }), [oficios, datos])
  const ahora = useMemo(() => Object.fromEntries(COD_REGIONES.map(r => [r, medirRegion(r, datos.hoy, base)])), [base, datos.hoy])
  const filas = cods.map(c => ahora[c])

  function textoResumen(k: keyof MedicionRegion): string {
    if (k === 'sesiones') return filas.length ? fmt1(filas.reduce((s, f) => s + f.sesiones, 0) / filas.length) : '—'
    if (k === 'ultimoComite') return fmtN(regionesSinSesionar(filas, datos.hoy))
    const v = agregado(k, filas)
    return v == null ? '—' : ITEMS.find(i => i.k === k)!.fmt(v)
  }
  const PIE: Partial<Record<keyof MedicionRegion, string>> = {
    sesiones: 'sesiones prom. por comité', ultimoComite: 'sin sesionar en 15 días', cartera: 'proyectos',
    gestionados: 'oficios', vencidos: 'vencidos', pendientes: 'pendientes', pctVencidos: 'del total', atrasoPromedio: 'días prom.',
  }

  const resumen = (it: Item) => {
    const txt = textoResumen(it.k)
    const elegible = it.evolutivo !== false
    return (
      <Resumen txt={txt} pie={PIE[it.k] ?? ''} rojo={it.tono === 'rojo' || (it.k === 'ultimoComite' && txt !== '0')}
        evolutivo={evolutivo} elegible={elegible} pulsado={evolutivo && item === it.k}
        onClick={() => { if (evolutivo && elegible) setItem(item === it.k ? null : it.k) }} />
    )
  }

  const encabezadoRegion = <FiltroRegiones seleccion={regs} onCambio={setRegs} compacto />

  return (
    <section>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={() => { setEvolutivo(e => !e); setItem(null) }} aria-pressed={evolutivo}
          className={`text-[13px] font-semibold rounded-[9px] px-3.5 py-1.5 border ${evolutivo ? 'bg-violet-700 border-violet-700 text-white' : 'bg-white border-gray-300 text-slate-800 hover:border-gray-400'}`}>
          Evolutivo
        </button>
        {evolutivo && !item && <span className="text-[13px] font-semibold text-violet-700">Elige qué ítem revisar</span>}
        {evolutivo && item && (
          <div className="flex items-center gap-2 flex-wrap text-[13px] text-slate-600">
            <label className="flex items-center gap-1.5">Desde
              <input type="date" value={desde} max={hasta} onChange={e => e.target.value && setDesde(e.target.value)}
                className="bg-white border border-gray-300 rounded-[9px] px-2 py-1 text-[13px]" /></label>
            <label className="flex items-center gap-1.5">Hasta
              <input type="date" value={hasta} min={desde} max={datos.hoy} onChange={e => e.target.value && setHasta(e.target.value)}
                className="bg-white border border-gray-300 rounded-[9px] px-2 py-1 text-[13px]" /></label>
            <label className="flex items-center gap-1.5">Fechas
              <select value={nFechas} onChange={e => setNFechas(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded-[9px] px-2 py-1 text-[13px]">
                {Array.from({ length: 11 }, (_, i) => i + 2).map(n => <option key={n} value={n}>{n}</option>)}
              </select></label>
          </div>
        )}
      </div>

      {!evolutivo ? (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-[5] bg-white" />
                {ITEMS.map(it => <th key={it.k} className="px-1 pt-2.5 pb-1">{resumen(it)}</th>)}
              </tr>
              <tr>
                <th className="sticky left-0 z-[5] bg-white text-left px-3 pb-2 pt-1.5 align-bottom">{encabezadoRegion}</th>
                {ITEMS.map(it => (
                  <th key={it.k} className="px-2.5 pb-2 pt-1.5 text-right align-bottom">
                    <button onClick={() => setOrden(o => o.k === it.k ? { k: it.k, dir: (o.dir * -1) as 1 | -1 } : { k: it.k, dir: -1 })}
                      className={`text-[11px] uppercase tracking-wide font-semibold leading-tight text-right ${orden.k === it.k ? 'text-slate-800' : 'text-gray-400 hover:text-slate-800'}`}>
                      {it.t}{orden.k === it.k ? (orden.dir < 0 ? ' ↓' : ' ↑') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...cods].sort((a, b) => {
                const x = ahora[a][orden.k], y = ahora[b][orden.k]
                if (x == null && y == null) return COD_REGIONES.indexOf(a) - COD_REGIONES.indexOf(b)
                if (x == null) return 1
                if (y == null) return -1
                return (x < y ? -1 : x > y ? 1 : 0) * orden.dir || COD_REGIONES.indexOf(a) - COD_REGIONES.indexOf(b)
              }).map(c => {
                const f = ahora[c]
                return (
                  <tr key={c} className="hover:bg-stone-50">
                    <td className="sticky left-0 bg-white border-t border-gray-200 px-3 py-1.5 font-semibold whitespace-nowrap"
                      title={datos.actualizado[c] ? `Actualizado ${fmtF(datos.actualizado[c])}` : datos.medibles.has(c) ? 'Sin oficios pendientes registrados' : 'Sin proyectos de la cartera vinculados al SEIA'}>
                      {NOMBRE_REGION[c]}
                    </td>
                    {ITEMS.map(it => {
                      const v = f[it.k]
                      const cls = 'border-t border-gray-200 px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap'
                      if (v == null) return <td key={it.k} className={`${cls} text-gray-300`}>—</td>
                      if (it.k === 'ultimoComite') return <td key={it.k} className={cls}>{fmtF(v as string)}</td>
                      if (it.tono === 'rojo') {
                        const mx = Math.max(0, ...filas.map(x => (x[it.k] as number | null) ?? 0))
                        return <td key={it.k} className={cls}><span className="inline-block min-w-[46px] px-1.5 py-0.5 rounded-md font-semibold" style={calor(v as number, mx, 'rojo')}>{it.fmt(v as number)}</span></td>
                      }
                      return <td key={it.k} className={cls}>{it.fmt(v as number)}</td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="mt-3 flex gap-2.5 flex-wrap">
            {ITEMS.map(it => (
              <div key={it.k} className="flex-[1_1_120px] max-w-[170px]">
                {resumen(it)}
                <p className="text-[11px] text-gray-400 mt-1 leading-tight">{it.t}</p>
              </div>
            ))}
          </div>
          {item && <Evolucion item={ITEMS.find(i => i.k === item)!} cods={cods} base={base} datos={datos}
            cortes={fechasDeCorte(desde, hasta, nFechas)} encabezadoRegion={encabezadoRegion} />}
        </>
      )}
    </section>
  )
}

function Evolucion({ item, cods, base, datos, cortes, encabezadoRegion }: {
  item: Item; cods: string[]; datos: DatosSeguimientoSeia; cortes: string[]; encabezadoRegion: React.ReactNode
  base: Parameters<typeof medirRegion>[2]
}) {
  const celdas = useMemo(() => cods.map(r => {
    const ses = datos.sesiones.filter(s => s.region === r)
    return cortes.map((_, i) => {
      const e = evaluacionDelCorte(ses, cortes, i)
      return { ...e, m: medirRegion(r, e.en, base) }
    })
  }), [cods, cortes, datos.sesiones, base])
  const max = Math.max(0, ...celdas.flat().map(c => (c.m[item.k] as number | null) ?? 0))
  const totales = cortes.map((_, i) => agregado(item.k, celdas.map(f => f[i].m)))

  return (
    <>
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-[5] bg-white text-left px-3 py-2 align-bottom">{encabezadoRegion}</th>
              {cortes.map(c => (
                <th key={c} className="px-2.5 py-2 text-right align-bottom text-[11px] uppercase tracking-wide font-semibold text-gray-400 whitespace-nowrap">
                  Hasta el<small className="block text-[10.5px] normal-case tracking-normal font-normal">{fmtF(c)}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cods.map((r, ri) => (
              <tr key={r} className="hover:bg-stone-50">
                <td className="sticky left-0 bg-white border-t border-gray-200 px-3 py-1.5 font-semibold whitespace-nowrap">{NOMBRE_REGION[r]}</td>
                {celdas[ri].map(c => {
                  const v = c.m[item.k] as number | null
                  const cls = 'border-t border-gray-200 px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap'
                  if (v == null) return <td key={c.en + ri} className={`${cls} text-gray-300`}>—</td>
                  return (
                    <td key={c.en + ri} className={cls} title={c.esSesion ? `Sesión del ${fmtF(c.en)}` : `Corte al ${fmtF(c.en)}`}>
                      {c.esSesion && <span className="inline-block w-1.5 h-1.5 rounded-full bg-violet-700 mr-1.5 align-[2px]" />}
                      <span className="inline-block min-w-[46px] px-1.5 py-0.5 rounded-md font-semibold" style={calor(v, max, item.tono)}>{item.fmt(v)}</span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky left-0 bg-white border-t border-gray-300 px-3 py-1.5 font-bold">Total</td>
              {totales.map((v, i) => <td key={i} className="border-t border-gray-300 px-2.5 py-1.5 text-right font-bold tabular-nums">{v == null ? '—' : item.k === 'sesiones' ? fmtN(v) : item.fmt(v)}</td>)}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-2.5 flex justify-end gap-4 text-xs text-slate-500 flex-wrap">
        <span className="inline-flex items-center gap-1.5"><i className="w-1.5 h-1.5 rounded-full bg-violet-700 inline-block" />Sesión del comité</span>
        <span>Sin marca: la fecha de corte</span>
      </div>
      <p className="mt-2 text-[11.5px] text-gray-400 italic">
        Los cortes pasados se reconstruyen con las fechas de cada oficio. Un oficio que se respondió antes de que el panel empezara a seguir su
        proyecto no aparece, así que los primeros cortes pueden quedar cortos.
      </p>
    </>
  )
}

// ══ Cartera ═════════════════════════════════════════════════════════════════

function Tile({ valor, unidad, texto, nota }: { valor: string; unidad?: string; texto: string; nota: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <b className="block text-[28px] font-bold leading-none tracking-tight tabular-nums">{valor}{unidad && <span className="text-[15px] text-gray-400 font-semibold"> {unidad}</span>}</b>
      <span className="block text-[12.5px] text-slate-600 mt-1.5">{texto}</span>
      <small className="block text-[11px] text-gray-400 mt-0.5">{nota}</small>
    </div>
  )
}

/** Nombre para la columna Región: los interregionales del SEIA no son de ninguna. */
const nombreRegionCartera = (c: string) => c === 'INTER' ? 'Interregional' : NOMBRE_REGION[c] ?? c

/**
 * Mi cartera y, abajo, lo demás que está en calificación — con las MISMAS
 * columnas, para poder leer una tabla contra la otra. Lo de la cartera
 * vinculado al SEIA toma de ahí titular, tipo, comuna, vía, inversión e
 * ingreso; lo cargado a mano (65 de 276 hoy) no los tiene y muestra su monto
 * en su propia moneda, sin convertir.
 */
function VistaCartera({ datos, onRegiones }: { datos: DatosSeguimientoSeia; onRegiones: (r: string[]) => void }) {
  const [sel, setSel] = useState<string>('*')
  const cods = sel === '*' ? [...COD_REGIONES, 'INTER'] : [sel]
  useEffect(() => { onRegiones(sel === '*' ? COD_REGIONES : [sel]) }, [sel, onRegiones])

  const calif = datos.enCalificacion.filter(p => cods.includes(p.region))
  const inversion = calif.reduce((s, p) => s + (p.inversion ?? 0), 0)
  const mia = datos.cartera.filter(p => cods.includes(p.region_cod))
  const manoObra = mia.reduce((s, p) => s + Number(p.mano_obra_directa ?? 0) + Number(p.mano_obra_indirecta ?? 0), 0)

  const filasMia: FilaProyecto[] = mia.map(p => {
    const exp = expedienteDeCartera(p)
    const f = exp ? datos.catalogo.get(exp) : undefined
    return {
      id: `c${p.id}`, region: p.region_cod, nombre: p.nombre, url: f?.url ?? null,
      titular: f?.titular ?? null, tipo: f?.tipo ?? null, comuna: f?.comuna ?? null, via: f?.via ?? null,
      inversion: f?.inversion ?? null,
      inversionTexto: !f && p.inversion_monto != null ? `${p.inversion_monto.toLocaleString('es-CL')}${p.inversion_moneda ? ` ${p.inversion_moneda}` : ''}` : null,
      ingreso: f?.ingreso ?? null,
    }
  })
  // «Los otros»: lo que está en calificación y no está en la cartera.
  const enCartera = new Set(datos.cartera.map(expedienteDeCartera).filter((e): e is string => e != null))
  const filasOtros: FilaProyecto[] = calif
    .filter(p => !enCartera.has(p.id.replace(/^seia_/, '')))
    .map(p => ({ ...p, inversionTexto: null }))

  const varias = cods.length > 1

  return (
    <section>
      <div className="mt-4">
        <select value={sel} onChange={e => setSel(e.target.value)}
          className="text-[13px] bg-white border border-gray-300 rounded-[9px] px-2.5 py-1.5">
          <option value="*">Todas las regiones</option>
          {REGIONS.map(r => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
        </select>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2.5">
        <Tile valor={fmtN(calif.length)} texto="Proyectos en calificación" nota="SEIA" />
        <Tile valor={fmtN(mmusd(inversion))} unidad="MMUSD" texto="Inversión acumulada" nota="Proyectos en calificación · SEIA" />
        <Tile valor={fmtN(manoObra)} texto="Mano de obra (directa + indirecta)" nota="Cartera del comité · el SEIA no la desglosa" />
      </div>

      <h3 className="mt-6 text-[15px] font-bold flex items-baseline gap-2">
        Mi cartera <span className="text-[13px] text-gray-400 font-semibold tabular-nums">{filasMia.length}</span>
      </h3>
      <TablaProyectosFiltrable key={`mia-${sel}`} filas={filasMia} conRegion={varias} nombreRegion={nombreRegionCartera}
        vacio="Sin proyectos en la cartera." />

      <h3 className="mt-6 text-[15px] font-bold flex items-baseline gap-2 flex-wrap">
        Otros proyectos en calificación <span className="text-[13px] text-gray-400 font-semibold tabular-nums">{filasOtros.length}</span>
        <small className="text-xs text-gray-400 font-normal">SEIA · no están en la cartera</small>
      </h3>
      <TablaProyectosFiltrable key={`otros-${sel}`} filas={filasOtros} conRegion={varias} nombreRegion={nombreRegionCartera}
        vacio="No hay otros proyectos en calificación." />
    </section>
  )
}
