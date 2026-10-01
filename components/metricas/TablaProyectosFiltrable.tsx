'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  VACIAS, filtrarFilas, opcionesDeColumna, ordenarFilas, normalizarFiltro,
  type ColumnaFiltrable, type Filtro, type Filtros, type Orden,
} from '@/lib/filtroColumnas'

/**
 * Tabla de proyectos con filtro por columna «modo Excel»: cada encabezado
 * abre un menú para ordenar y filtrar esa columna (texto: marcar valores con
 * buscador; monto y fecha: desde / hasta). La lógica es pura y vive en
 * lib/filtroColumnas.ts.
 */

export type FilaProyecto = {
  id: string
  region: string
  nombre: string
  url: string | null
  titular: string | null
  tipo: string | null
  comuna: string | null
  via: string | null
  /** MMUSD, del SEIA. */
  inversion: number | null
  /** Para lo cargado a mano en la cartera: el monto en su propia moneda («25 MM$»). */
  inversionTexto: string | null
  ingreso: string | null
}

type Columna = ColumnaFiltrable<FilaProyecto> & { titulo: string; derecha?: boolean; ancho?: string }

const fmtN = (n: number) => Math.round(n).toLocaleString('es-CL')
const fmtF = (s: string | null) => s ? `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '—'

export default function TablaProyectosFiltrable({ filas, conRegion, nombreRegion, vacio }: {
  filas: FilaProyecto[]
  conRegion: boolean
  nombreRegion: (cod: string) => string
  vacio: string
}) {
  const columnas = useMemo<Columna[]>(() => [
    { clave: 'nombre', titulo: 'Nombre', tipo: 'lista', valores: f => [f.nombre] },
    ...(conRegion ? [{ clave: 'region', titulo: 'Región', tipo: 'lista' as const, valores: (f: FilaProyecto) => [nombreRegion(f.region)] }] : []),
    { clave: 'titular', titulo: 'Titular', tipo: 'lista', valores: f => [f.titular] },
    { clave: 'tipo', titulo: 'Tipo', tipo: 'lista', valores: f => [f.tipo] },
    // Una comuna del SEIA puede ser varias («Osorno, San Pablo»): se filtra por cada una.
    { clave: 'comuna', titulo: 'Comuna', tipo: 'lista', valores: f => (f.comuna ?? '').split(',') },
    { clave: 'via', titulo: 'Vía', tipo: 'lista', valores: f => [f.via] },
    { clave: 'inversion', titulo: 'Inversión (MMUSD)', tipo: 'numero', valor: f => f.inversion != null ? f.inversion / 1e6 : null, derecha: true },
    { clave: 'ingreso', titulo: 'Ingreso', tipo: 'fecha', valor: f => f.ingreso, derecha: true },
  ], [conRegion, nombreRegion])

  const [filtros, setFiltros] = useState<Filtros>({})
  const [orden, setOrden] = useState<Orden>({ clave: 'inversion', dir: -1 })
  const [todas, setTodas] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  const filtradas = useMemo(() => filtrarFilas(filas, columnas, filtros), [filas, columnas, filtros])
  const ordenadas = useMemo(
    () => ordenarFilas(filtradas, columnas.find(c => c.clave === orden?.clave), orden?.dir ?? 1),
    [filtradas, columnas, orden],
  )
  const LIMITE = 25
  const visibles = todas ? ordenadas : ordenadas.slice(0, LIMITE)
  const hayFiltros = Object.values(filtros).some(Boolean)

  if (filas.length === 0) {
    return <div className="mt-2.5 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">{vacio}</div>
  }

  const th = 'px-2.5 py-2 text-[11px] uppercase tracking-wide font-semibold whitespace-nowrap'
  const td = 'border-t border-gray-200 px-2.5 py-2 whitespace-nowrap'

  return (
    <>
      {hayFiltros && (
        <div className="mt-2 flex items-center gap-3 text-[12.5px] text-slate-600">
          <span className="tabular-nums">{filtradas.length} de {filas.length}</span>
          <button onClick={() => setFiltros({})} className="font-semibold text-violet-700 hover:underline">Quitar filtros</button>
        </div>
      )}
      <div className="mt-2.5 bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full min-w-[920px] text-[12.5px] text-left">
          <thead>
            <tr>
              {columnas.map(c => (
                <th key={c.clave} className={`${th} ${c.derecha ? 'text-right' : ''}`}>
                  <EncabezadoFiltrable
                    col={c} filas={filas} columnas={columnas} filtros={filtros} orden={orden}
                    abierta={abierta === c.clave} onAbrir={a => setAbierta(a ? c.clave : null)}
                    onFiltro={f => setFiltros(prev => ({ ...prev, [c.clave]: f }))}
                    onOrden={dir => setOrden({ clave: c.clave, dir })}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.map(p => (
              <tr key={p.id} className="hover:bg-stone-50">
                <td className={`${td} font-semibold max-w-[300px] truncate`} title={p.nombre}>
                  {p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="hover:text-violet-700 hover:underline">{p.nombre}</a> : p.nombre}
                </td>
                {conRegion && <td className={td}>{nombreRegion(p.region)}</td>}
                <td className={`${td} max-w-[190px] truncate text-slate-600`} title={p.titular ?? undefined}>{p.titular ?? '—'}</td>
                <td className={`${td} max-w-[190px] truncate text-slate-600`} title={p.tipo ?? undefined}>{p.tipo ?? '—'}</td>
                <td className={`${td} max-w-[160px] truncate text-slate-600`} title={p.comuna ?? undefined}>{p.comuna ?? '—'}</td>
                <td className={td}>{p.via ?? '—'}</td>
                <td className={`${td} text-right tabular-nums`}>
                  {p.inversion != null ? fmtN(p.inversion / 1e6)
                    : p.inversionTexto ? <span className="text-gray-400" title="Monto cargado a mano en la cartera, en su propia moneda">{p.inversionTexto}</span>
                    : '—'}
                </td>
                <td className={`${td} text-right tabular-nums`}>{fmtF(p.ingreso)}</td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={columnas.length} className="px-2.5 py-6 text-center text-gray-400">Ningún proyecto calza con los filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {!todas && ordenadas.length > LIMITE && (
        <button onClick={() => setTodas(true)} className="mt-2 text-[12.5px] font-semibold text-violet-700 hover:underline">
          Ver {ordenadas.length - LIMITE} proyecto{ordenadas.length - LIMITE === 1 ? '' : 's'} más
        </button>
      )}
    </>
  )
}

// ── Encabezado con su menú ───────────────────────────────────────────────────

function EncabezadoFiltrable({ col, filas, columnas, filtros, orden, abierta, onAbrir, onFiltro, onOrden }: {
  col: Columna
  filas: FilaProyecto[]
  columnas: Columna[]
  filtros: Filtros
  orden: Orden
  abierta: boolean
  onAbrir: (a: boolean) => void
  onFiltro: (f: Filtro | undefined) => void
  onOrden: (dir: 1 | -1) => void
}) {
  const boton = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const activo = !!filtros[col.clave]
  const ordenada = orden?.clave === col.clave

  // El menú va con position: fixed: la tabla tiene su propio scroll
  // horizontal y un absoluto quedaría recortado por él.
  useLayoutEffect(() => {
    if (!abierta || !boton.current) return
    const r = boton.current.getBoundingClientRect()
    const ancho = 264
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)) })
  }, [abierta])

  useEffect(() => {
    if (!abierta) return
    const fuera = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !boton.current?.contains(e.target as Node)) onAbrir(false)
    }
    const cerrar = () => onAbrir(false)
    // El scroll de la propia lista de opciones no cuenta; el de la página sí (el menú es fixed y quedaría flotando).
    const alScroll = (e: Event) => { if (!menu.current?.contains(e.target as Node)) onAbrir(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onAbrir(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    window.addEventListener('resize', cerrar)
    window.addEventListener('scroll', alScroll, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
      window.removeEventListener('resize', cerrar)
      window.removeEventListener('scroll', alScroll, true)
    }
  }, [abierta, onAbrir])

  const etiquetasOrden: [string, string] = col.tipo === 'lista' ? ['A → Z', 'Z → A'] : col.tipo === 'numero' ? ['Menor a mayor', 'Mayor a menor'] : ['Más antiguo primero', 'Más reciente primero']

  return (
    <>
      <button ref={boton} onClick={() => onAbrir(!abierta)} aria-expanded={abierta}
        className={`inline-flex items-center gap-1 uppercase tracking-wide ${activo || ordenada ? 'text-violet-700' : 'text-gray-400 hover:text-slate-800'}`}>
        {col.titulo}
        {ordenada && <span aria-hidden="true">{orden!.dir < 0 ? '↓' : '↑'}</span>}
        <svg width="11" height="11" viewBox="0 0 12 12" fill={activo ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
          <path d="M1.5 2h9L7 6.2V10L5 9V6.2z" />
        </svg>
      </button>
      {abierta && pos && (
        <div ref={menu} style={{ top: pos.top, left: pos.left }}
          className="fixed z-50 w-[264px] bg-white border border-gray-300 rounded-xl shadow-xl p-2 text-left normal-case tracking-normal font-normal text-[13px] text-slate-800">
          <div className="flex flex-col pb-1.5 mb-1.5 border-b border-gray-100">
            {([1, -1] as const).map((dir, i) => (
              <button key={dir} onClick={() => { onOrden(dir); onAbrir(false) }}
                className={`text-left px-2 py-1 rounded-md hover:bg-gray-50 ${ordenada && orden!.dir === dir ? 'font-semibold text-violet-700' : ''}`}>
                Ordenar {etiquetasOrden[i]}
              </button>
            ))}
          </div>
          {col.tipo === 'lista'
            ? <MenuLista col={col} filas={filtrarFilas(filas, columnas, filtros, col.clave)} filtro={filtros[col.clave]} onFiltro={onFiltro} />
            : <MenuRango tipo={col.tipo} filtro={filtros[col.clave]} onFiltro={onFiltro} />}
        </div>
      )}
    </>
  )
}

function MenuLista({ col, filas, filtro, onFiltro }: {
  col: Extract<Columna, { tipo: 'lista' }>
  filas: FilaProyecto[]
  filtro: Filtro | undefined
  onFiltro: (f: Filtro | undefined) => void
}) {
  const [busqueda, setBusqueda] = useState('')
  const opciones = useMemo(() => opcionesDeColumna(filas, col), [filas, col])
  const todos = opciones.map(o => o.valor)
  const marcados = filtro?.tipo === 'lista' ? filtro.incluidos : new Set(todos)
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const visibles = busqueda ? opciones.filter(o => norm(o.valor).includes(norm(busqueda))) : opciones
  const todosVisiblesMarcados = visibles.every(o => marcados.has(o.valor))

  const aplicar = (s: Set<string>) => onFiltro(normalizarFiltro({ tipo: 'lista', incluidos: s }, todos))
  const alternar = (v: string) => {
    const s = new Set(marcados)
    if (s.has(v)) s.delete(v); else s.add(v)
    aplicar(s)
  }
  // «Seleccionar todo» actúa sobre lo que se ve: buscar «Puerto» y marcarlo
  // todo deja solo esas, como en Excel.
  const alternarVisibles = () => {
    if (busqueda) {
      aplicar(todosVisiblesMarcados ? new Set([...marcados].filter(v => !visibles.some(o => o.valor === v))) : new Set(visibles.map(o => o.valor)))
    } else {
      aplicar(todosVisiblesMarcados ? new Set() : new Set(todos))
    }
  }

  return (
    <>
      <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar…" autoFocus
        className="w-full px-2 py-1 border border-gray-300 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-violet-400" />
      <div className="mt-1.5 max-h-60 overflow-y-auto">
        <label className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-gray-50 font-semibold border-b border-gray-100">
          <input type="checkbox" className="accent-violet-700" checked={visibles.length > 0 && todosVisiblesMarcados} onChange={alternarVisibles} />
          {busqueda ? 'Seleccionar los encontrados' : 'Seleccionar todo'}
        </label>
        {visibles.map(o => (
          <label key={o.valor} className="flex items-center gap-2 px-2 py-1 rounded-md cursor-pointer hover:bg-gray-50">
            <input type="checkbox" className="accent-violet-700 flex-shrink-0" checked={marcados.has(o.valor)} onChange={() => alternar(o.valor)} />
            <span className={`flex-1 min-w-0 truncate ${o.valor === VACIAS ? 'text-gray-400 italic' : ''}`} title={o.valor}>{o.valor}</span>
            <span className="text-[11px] text-gray-400 tabular-nums">{o.n}</span>
          </label>
        ))}
        {visibles.length === 0 && <p className="px-2 py-2 text-gray-400">Sin coincidencias.</p>}
      </div>
      {filtro && (
        <button onClick={() => onFiltro(undefined)} className="mt-1.5 w-full text-left px-2 py-1 rounded-md text-violet-700 font-semibold hover:bg-violet-50">
          Quitar filtro de esta columna
        </button>
      )}
    </>
  )
}

function MenuRango({ tipo, filtro, onFiltro }: { tipo: 'numero' | 'fecha'; filtro: Filtro | undefined; onFiltro: (f: Filtro | undefined) => void }) {
  const actual = filtro?.tipo === 'rango' ? filtro : { tipo: 'rango' as const, desde: null, hasta: null }
  const cambiar = (k: 'desde' | 'hasta', v: string) =>
    onFiltro(normalizarFiltro({ ...actual, [k]: v === '' ? null : v }, []))
  const input = 'w-full px-2 py-1 border border-gray-300 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-violet-400'
  return (
    <div className="space-y-1.5 px-1">
      {(['desde', 'hasta'] as const).map(k => (
        <label key={k} className="flex items-center gap-2">
          <span className="w-12 text-slate-500 capitalize">{k}</span>
          <input type={tipo === 'numero' ? 'number' : 'date'} value={actual[k] ?? ''} onChange={e => cambiar(k, e.target.value)}
            placeholder={tipo === 'numero' ? 'MMUSD' : undefined} className={input} />
        </label>
      ))}
      {filtro && (
        <button onClick={() => onFiltro(undefined)} className="w-full text-left px-1 py-1 text-violet-700 font-semibold hover:underline">
          Quitar filtro de esta columna
        </button>
      )}
    </div>
  )
}
