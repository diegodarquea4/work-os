'use client'

/**
 * Tablero «Seguimiento» del Comité Policial: lo que cada región reporta por
 * institución en sus sesiones, sesión a sesión. Misma estructura que el
 * Seguimiento SEIA del Comité Económico. Lógica pura en
 * `lib/seguimientoPolicial.ts`; datos y permisos en `useSeguimientoPolicial`.
 *
 * Cinco pestañas: Nacional (región × indicador), Regional (la evolución de mis
 * métricas), Comparativa regional (un gráfico por indicador), Comité policial
 * (región contra región) y Calendario.
 */

import { useMemo, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { getRegionColor } from '@/lib/regionColors'
import { diaChile } from '@/lib/fechaChile'
import { useSeguimientoPolicial, type DatosPolicial } from '@/lib/hooks/useSeguimientoPolicial'
import {
  INSTITUCIONES, DIAS_SIN_SESIONAR, nombreInstitucion, nombreCorto, ultimoPunto, diferencia, resumirRegion,
  type MetricaEstandar, type Punto,
} from '@/lib/seguimientoPolicial'
import GraficoLineas, { LeyendaSeries, num, type SerieLinea } from './GraficoLineas'
import FiltroRegiones from './FiltroRegiones'
import CalendarioComites from './CalendarioComites'

export type PestanaPolicial = 'nacional' | 'regional' | 'comparativa' | 'comite' | 'calendario'

const NOMBRE_REGION = Object.fromEntries(REGIONS.map(r => [r.cod, r.nombre]))
const COLOR_REGION = Object.fromEntries(REGIONS.map(r => [r.cod, getRegionColor(r.nombre)]))
const VIOLETA = '#6D28D9'
const fmtF = (f: string | null) => f ? `${f.slice(8)}-${f.slice(5, 7)}-${f.slice(0, 4)}` : '—'
const conSigno = (n: number) => (n > 0 ? '+' : '') + num(n)
const flecha = (d: { abs: number } | null) => !d || d.abs === 0 ? '' : d.abs > 0 ? '▲' : '▼'
const ordenInst = (a: string) => { const i = INSTITUCIONES.indexOf(a); return i < 0 ? 99 : i }

const serieDe = (d: DatosPolicial, region: string, id: number): Punto[] => d.serie[region]?.[id] ?? []
/** Las regiones dadas que reportan un indicador, como líneas del color de cada región. */
const lineasDe = (d: DatosPolicial, e: MetricaEstandar, regiones: string[]): SerieLinea[] =>
  regiones.map(c => ({ clave: c, nombre: NOMBRE_REGION[c] ?? c, color: COLOR_REGION[c], pts: serieDe(d, c, e.id) })).filter(s => s.pts.length)

export default function SeguimientoPolicial({ pestanaInicial = 'nacional', regionInicial }: {
  /** Desde el comité de una región se abre en «Regional», en esa región. */
  pestanaInicial?: PestanaPolicial
  regionInicial?: string
} = {}) {
  const { datos, error, cargando, permitidas } = useSeguimientoPolicial()
  const [elegida, setPestana] = useState<PestanaPolicial>(pestanaInicial)
  const hoy = diaChile()
  // «Nacional» cruza regiones: solo para quien opera el comité en dos o más.
  // Con una sola no hay panorama que mirar y se parte por «Regional».
  const veNacional = permitidas.length >= 2
  const pestana = elegida === 'nacional' && !veNacional ? 'regional' : elegida

  if (!permitidas.length) return <div className="p-8 text-center text-sm text-gray-500">No operas el Comité Policial en ninguna región.</div>
  if (error) return <div className="p-8 text-center text-sm text-red-700">No se pudieron cargar los datos: {error}</div>
  if (cargando || !datos) return <div className="p-10 text-center text-sm text-gray-400">Cargando las métricas del comité…</div>

  const ultimoReporte = datos.sesiones.map(s => s.fecha).sort().pop() ?? null

  return (
    <div className="p-5 max-w-[1400px] mx-auto">
      <header className="flex items-start gap-4 flex-wrap">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-violet-700">Comité Policial</p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-0.5">Seguimiento de las métricas policiales</h2>
        </div>
        <div className="ml-auto text-right text-[11.5px] text-gray-400 pt-1">
          Último reporte<b className="block text-sm font-bold text-slate-900 tabular-nums">{fmtF(ultimoReporte)}</b>
        </div>
      </header>

      <nav className="mt-5 inline-flex gap-0.5 p-[3px] rounded-[11px] bg-stone-100 max-w-full overflow-x-auto">
        {([['nacional', 'Nacional'], ['regional', 'Regional'], ['comparativa', 'Comparativa regional'], ['comite', 'Comité policial'], ['calendario', 'Calendario']] as const).filter(([k]) => k !== 'nacional' || veNacional).map(([k, t]) => (
          <button key={k} onClick={() => setPestana(k)}
            className={`px-3.5 py-1.5 text-[13px] font-semibold rounded-lg whitespace-nowrap ${pestana === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t}
          </button>
        ))}
      </nav>

      {pestana === 'nacional'    && <VistaNacional datos={datos} regiones={permitidas} hoy={hoy} />}
      {pestana === 'regional'    && <VistaRegional datos={datos} regiones={permitidas} hoy={hoy} regionInicial={regionInicial} />}
      {pestana === 'comparativa' && <VistaComparativa datos={datos} regiones={permitidas} />}
      {pestana === 'comite'      && <VistaComite datos={datos} regiones={permitidas} hoy={hoy} />}
      {pestana === 'calendario'  && <CalendarioComites instancia="eje" />}

      {pestana !== 'calendario' && (
        <footer className="mt-7 pt-3 border-t border-gray-200 text-[11.5px] text-gray-400">
          <p>Cada valor es el que la región reportó en una sesión cerrada del comité.</p>
        </footer>
      )}
    </div>
  )
}

// ══ Piezas ══════════════════════════════════════════════════════════════════

function Segmentos<T extends string>({ opciones, valor, onCambio }: { opciones: [T, string][]; valor: T; onCambio: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap rounded-[9px] border border-gray-300 bg-white overflow-hidden">
      {opciones.map(([k, t], i) => (
        <button key={k} onClick={() => onCambio(k)} aria-pressed={valor === k}
          className={`px-3 py-1.5 text-[13px] font-semibold ${i ? 'border-l border-gray-300' : ''} ${valor === k ? 'bg-violet-50 text-violet-700' : 'text-slate-500 hover:text-slate-800'}`}>
          {t}
        </button>
      ))}
    </div>
  )
}

function Tile({ valor, texto, nota }: { valor: string; texto: string; nota?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <b className="block text-[28px] font-bold leading-none tracking-tight tabular-nums">{valor}</b>
      <span className="block text-[12.5px] text-slate-600 mt-1.5">{texto}</span>
      {nota && <small className="block text-[11px] text-gray-400 mt-0.5">{nota}</small>}
    </div>
  )
}

/** La forma de la serie en chico: sin ejes, el último punto marcado. */
function Chispa({ pts }: { pts: Punto[] }) {
  if (!pts.length) return <span />
  const vs = pts.map(p => p[1]), mn = Math.min(...vs), mx = Math.max(...vs)
  const x = (i: number) => pts.length === 1 ? 126 : 6 + (i * 120) / (pts.length - 1)
  const y = (v: number) => mx === mn ? 14 : 23 - ((v - mn) * 18) / (mx - mn)
  return (
    <svg viewBox="0 0 132 28" className="w-[132px] h-7 hidden md:block" aria-hidden="true">
      {pts.length > 1 && <polyline points={pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} fill="none" stroke={VIOLETA} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1][1])} r="3.5" fill={VIOLETA} stroke="#fff" strokeWidth="2" />
    </svg>
  )
}

/** Una métrica: nombre · forma · último valor · variación · reportes. Clic abre su gráfico. */
function FilaSerie({ nombre, sub, pts, unidad, abierta, onClick }: {
  nombre: string; sub?: string; pts: Punto[]; unidad: string | null; abierta: boolean; onClick: () => void
}) {
  const u = ultimoPunto(pts), d = diferencia(pts)
  if (!u) {
    return (
      <div className="border-t border-gray-200 px-3.5 py-2 flex items-center gap-3.5 text-[13px] text-gray-400">
        <span className="flex-1 min-w-0">{nombre}</span><span>sin reporte</span>
      </div>
    )
  }
  return (
    <div className="border-t border-gray-200">
      <button onClick={onClick} aria-expanded={abierta}
        className={`w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_132px_7.5rem_4.5rem_4.5rem] gap-3.5 items-center text-left px-3.5 py-2 ${abierta ? 'bg-violet-50' : 'hover:bg-stone-50'}`}>
        <span className="text-[13px] font-semibold text-slate-900 min-w-0 break-words">
          {nombre}{sub && <small className="block font-normal text-[11.5px] text-gray-400">{sub}</small>}
        </span>
        <Chispa pts={pts} />
        <span className="text-right text-[15px] font-bold tabular-nums whitespace-nowrap">{num(u[1])}<small className="text-[11px] font-normal text-gray-400 ml-1">{unidad}</small></span>
        <span className="hidden md:block text-right text-xs text-slate-600 tabular-nums whitespace-nowrap">{d ? `${flecha(d)} ${conSigno(d.abs)}` : ''}</span>
        <span className="hidden md:block text-right text-xs text-gray-400 whitespace-nowrap">{pts.length} {pts.length === 1 ? 'reporte' : 'reportes'}</span>
      </button>
      {abierta && (
        <div className="px-3.5 pt-2.5 pb-3.5">
          <GraficoLineas series={[{ clave: 'una', nombre, color: VIOLETA, pts }]} titulo={nombre} unidad={unidad} valores />
        </div>
      )}
    </div>
  )
}

// ══ Nacional ════════════════════════════════════════════════════════════════

function VistaNacional({ datos, regiones, hoy }: { datos: DatosPolicial; regiones: string[]; hoy: string }) {
  const metsDe = (i: string) => datos.estandar.filter(e => e.institucion === i).sort((a, b) => a.orden - b.orden)
  const instituciones = INSTITUCIONES.filter(i => metsDe(i).length)
  const [inst, setInst] = useState(instituciones[0] ?? 'carabineros')
  const [modo, setModo] = useState<'ultimo' | 'var'>('ultimo')
  const [sel, setSel] = useState<Set<string>>(() => new Set(regiones))
  // Abre con un indicador elegido, para que el gráfico esté a la vista.
  const [region, setRegion] = useState<string | null>(null)
  const [metrica, setMetrica] = useState<number | null>(() => metsDe(instituciones[0] ?? 'carabineros')[0]?.id ?? null)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [foco, setFoco] = useState<string | null>(null)

  const mets = metsDe(inst)
  const filas = regiones.filter(c => sel.has(c))
  const reportan = filas.filter(c => mets.some(e => serieDe(datos, c, e.id).length))
  const conDato = mets.filter(e => filas.some(c => serieDe(datos, c, e.id).length)).length
  const maximo = new Map(mets.map(e => [e.id, Math.max(0, ...filas.map(c => Math.abs(ultimoPunto(serieDe(datos, c, e.id))?.[1] ?? 0)))]))
  const elegir = (r: string | null, m: number | null) => {
    if (region === r && metrica === m) { setRegion(null); setMetrica(null) } else { setRegion(r); setMetrica(m) }
    setAbierta(null)
  }
  const e = metrica != null ? mets.find(x => x.id === metrica) ?? null : null
  const lineas = e && !region ? lineasDe(datos, e, filas) : []

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2.5 mt-[18px]">
        <Segmentos opciones={instituciones.map(i => [i, nombreInstitucion(i)] as [string, string])} valor={inst} onCambio={i => { setInst(i); setMetrica(null); setAbierta(null) }} />
        <Segmentos opciones={[['ultimo', 'Último reporte'], ['var', 'Variación']]} valor={modo} onCambio={setModo} />
        {regiones.length > 1 && <FiltroRegiones seleccion={sel} onCambio={setSel} opciones={regiones} />}
      </div>

      <div className="flex flex-wrap items-end gap-4 mt-[18px] mb-3">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <b className="text-[30px] font-bold tracking-tight leading-none tabular-nums">{reportan.length}</b>
          <span className="text-[15px] font-semibold text-slate-600">{reportan.length === 1 ? 'región reporta' : 'regiones reportan'} a {nombreInstitucion(inst)}</span>
        </div>
        <div className="ml-auto bg-white border border-gray-200 rounded-xl py-2 pr-2 pl-3.5 flex items-center gap-2">
          <h3 className="text-xs font-bold text-slate-600 leading-tight max-w-[9.5rem]">Métricas estándar de {nombreInstitucion(inst)}</h3>
          <div className="bg-stone-50 rounded-[9px] px-3.5 py-1.5 text-right"><b className="block text-[21px] font-bold leading-tight tabular-nums">{mets.length}</b><span className="text-[11px] text-gray-400">en el catálogo</span></div>
          <div className="bg-stone-50 rounded-[9px] px-3.5 py-1.5 text-right"><b className="block text-[21px] font-bold leading-tight tabular-nums">{conDato}</b><span className="text-[11px] text-gray-400">con reporte</span></div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-white border-b border-gray-200" />
              {mets.map(m => (
                <th key={m.id} className={`border-b border-gray-200 align-bottom ${metrica === m.id ? 'bg-violet-50' : ''}`}>
                  <button onClick={() => elegir(null, m.id)} title={m.nombre}
                    className={`w-full min-w-[70px] px-1.5 py-2 text-[11px] font-semibold leading-tight hover:text-violet-700 ${metrica === m.id ? 'text-violet-700' : 'text-slate-500'}`}>
                    {nombreCorto(m.nombre)}<small className="block font-normal text-[10px] text-gray-400">{m.unidad}</small>
                  </button>
                </th>
              ))}
              <th className="border-b border-l border-gray-200 px-2.5 py-2 text-[11px] font-semibold text-slate-500 align-bottom whitespace-nowrap">Último comité</th>
              <th className="border-b border-gray-200 px-2.5 py-2 text-[11px] font-semibold text-slate-500 align-bottom">Sesiones</th>
            </tr>
          </thead>
          <tbody>
            {filas.map(c => {
              const res = resumirRegion(c, datos.sesiones, datos, hoy)
              const selFila = region === c
              return (
                <tr key={c} className={selFila ? 'bg-violet-50' : ''}>
                  <th className={`sticky left-0 z-[1] text-left border-r border-gray-200 ${selFila ? 'bg-violet-50' : 'bg-white'}`}>
                    <button onClick={() => elegir(c, null)}
                      className={`h-[30px] px-3 text-xs whitespace-nowrap hover:text-violet-700 font-medium ${selFila ? 'text-violet-700' : res.sesiones ? 'text-slate-800' : 'text-gray-400 italic'}`}>
                      {NOMBRE_REGION[c]}
                    </button>
                  </th>
                  {mets.map(m => {
                    const pts = serieDe(datos, c, m.id), u = ultimoPunto(pts)
                    const fondo = metrica === m.id && !selFila ? 'bg-violet-50' : ''
                    if (!u) return <td key={m.id} className={`text-center text-gray-300 ${fondo}`}>–</td>
                    const d = diferencia(pts)
                    const texto = modo === 'ultimo' ? num(u[1]) : d ? `${flecha(d)} ${d.pct != null ? conSigno(Math.round(d.pct * 10) / 10) + '%' : conSigno(d.abs)}` : '·'
                    const mx = maximo.get(m.id) ?? 0
                    const fuerza = modo === 'ultimo' && mx ? 0.06 + (0.26 * Math.abs(u[1])) / mx : 0
                    return (
                      <td key={m.id} className={`p-0.5 ${fondo}`}>
                        <button onClick={() => elegir(c, m.id)} title={`${NOMBRE_REGION[c]} · ${m.nombre} · ${fmtF(u[0])}`}
                          style={fuerza ? { background: `rgba(109, 40, 217, ${fuerza.toFixed(3)})` } : undefined}
                          className={`block w-full h-[26px] rounded-[5px] text-xs font-semibold tabular-nums whitespace-nowrap px-1.5 ${region === c && metrica === m.id ? 'outline outline-2 -outline-offset-2 outline-violet-700' : ''}`}>
                          {texto}
                        </button>
                      </td>
                    )
                  })}
                  <td className={`border-l border-gray-200 px-2.5 text-center text-[11.5px] tabular-nums whitespace-nowrap ${res.dias != null && res.dias > DIAS_SIN_SESIONAR ? 'text-red-700 font-semibold' : 'text-slate-600'}`}>{res.ultimoComite ? fmtF(res.ultimoComite) : '–'}</td>
                  <td className="px-2.5 text-center text-[11.5px] text-slate-600 tabular-nums">{res.sesiones || '–'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-[22px]">
        {!region && !e
          ? <div className="mt-3 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">Elige un indicador, una región o un dato.</div>
          : (
            <>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h3 className="text-base font-bold tracking-tight">
                  {region && e ? `${e.nombre} · ${NOMBRE_REGION[region]}` : e ? `${e.nombre} · todas las regiones` : `${NOMBRE_REGION[region!]} · ${nombreInstitucion(inst)}`}
                </h3>
                <button onClick={() => { setRegion(null); setMetrica(null) }} className="ml-auto text-[12.5px] font-semibold text-violet-700">Quitar selección</button>
              </div>
              {region && e && (
                // Un dato: la evolución de ese indicador en esa región.
                <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3.5">
                  <GraficoLineas series={[{ clave: region, nombre: NOMBRE_REGION[region], color: COLOR_REGION[region], pts: serieDe(datos, region, e.id) }]} titulo={e.nombre} unidad={e.unidad} valores />
                </div>
              )}
              {!region && e && (
                // Un indicador: todas las regiones que lo reportan, una línea por región.
                <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3.5">
                  <GraficoLineas series={lineas} titulo={e.nombre} unidad={e.unidad} fin foco={foco} onFoco={setFoco} />
                  <div className="mt-3"><LeyendaSeries series={lineas} foco={foco} onFoco={setFoco} /></div>
                </div>
              )}
              {region && !e && (
                <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden [&>div:first-child]:border-t-0">
                  {mets.map(m => <FilaSerie key={m.id} nombre={m.nombre} pts={serieDe(datos, region, m.id)} unidad={m.unidad} abierta={abierta === m.id} onClick={() => setAbierta(abierta === m.id ? null : m.id)} />)}
                </div>
              )}
            </>
          )}
      </div>
    </section>
  )
}

// ══ Regional ════════════════════════════════════════════════════════════════

function VistaRegional({ datos, regiones, hoy, regionInicial }: { datos: DatosPolicial; regiones: string[]; hoy: string; regionInicial?: string }) {
  const conSesiones = (c: string) => datos.sesiones.some(s => s.region_cod === c)
  const [region, setRegion] = useState(() => regionInicial && regiones.includes(regionInicial) ? regionInicial : regiones.find(conSesiones) ?? regiones[0])
  const primera = (c: string) => {
    const e = [...datos.estandar].sort((a, b) => ordenInst(a.institucion) - ordenInst(b.institucion) || a.orden - b.orden).find(x => serieDe(datos, c, x.id).length)
    return e ? `e${e.id}` : datos.propias[c]?.[0]?.clave ?? null
  }
  // Abre con la primera métrica desplegada: el gráfico es lo que se viene a ver.
  const [abierta, setAbierta] = useState<string | null>(() => primera(region))
  const res = resumirRegion(region, datos.sesiones, datos, hoy)
  const propias = datos.propias[region] ?? []
  const alternar = (k: string) => setAbierta(a => a === k ? null : k)

  return (
    <section>
      <div className="mt-[18px]">
        <select value={region} onChange={ev => { setRegion(ev.target.value); setAbierta(primera(ev.target.value)) }} aria-label="Región"
          className="text-[13px] text-slate-800 bg-white border border-gray-300 rounded-[9px] px-2.5 py-1.5 max-w-full">
          {regiones.map(c => <option key={c} value={c}>{NOMBRE_REGION[c]}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-4">
        <Tile valor={String(res.sesiones)} texto="Sesiones realizadas" />
        <Tile valor={fmtF(res.ultimoComite)} texto="Último comité" nota={res.dias == null ? undefined : res.dias === 1 ? 'hace 1 día' : `hace ${res.dias} días`} />
        <Tile valor={String(res.estandar + res.propias)} texto="Métricas con reporte" nota={`${res.estandar} estándar · ${res.propias} propias`} />
      </div>

      {!res.sesiones
        ? <div className="mt-3.5 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">La región todavía no cierra una sesión del comité.</div>
        : (
          <div className="mt-3.5 bg-white border border-gray-200 rounded-xl overflow-hidden">
            {INSTITUCIONES.map(i => {
              const mets = datos.estandar.filter(e => e.institucion === i).sort((a, b) => a.orden - b.orden)
              if (!mets.some(e => serieDe(datos, region, e.id).length)) return null
              return (
                <div key={i} className="border-t border-gray-200 first:border-t-0">
                  <h3 className="px-3.5 pt-2.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">{nombreInstitucion(i)}</h3>
                  {mets.map(e => <FilaSerie key={e.id} nombre={e.nombre} pts={serieDe(datos, region, e.id)} unidad={e.unidad} abierta={abierta === `e${e.id}`} onClick={() => alternar(`e${e.id}`)} />)}
                </div>
              )
            })}
            {propias.length > 0 && (
              <div className="border-t border-gray-200 first:border-t-0">
                <h3 className="px-3.5 pt-2.5 pb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Propias de la región</h3>
                {propias.map(p => <FilaSerie key={p.clave} nombre={p.nombre} sub={nombreInstitucion(p.institucion)} pts={p.pts} unidad={p.unidad} abierta={abierta === p.clave} onClick={() => alternar(p.clave)} />)}
              </div>
            )}
          </div>
        )}
    </section>
  )
}

// ══ Comparativa regional: un gráfico por indicador ══════════════════════════

function VistaComparativa({ datos, regiones }: { datos: DatosPolicial; regiones: string[] }) {
  const [sel, setSel] = useState<Set<string>>(() => new Set(regiones))
  const [inst, setInst] = useState('*')
  const [indicador, setIndicador] = useState<number | null>(null)
  const [foco, setFoco] = useState<string | null>(null)

  const filas = regiones.filter(c => sel.has(c))
  const deInst = useMemo(
    () => datos.estandar.filter(e => inst === '*' || e.institucion === inst).sort((a, b) => ordenInst(a.institucion) - ordenInst(b.institucion) || a.orden - b.orden),
    [datos.estandar, inst],
  )
  const elegido = indicador != null && deInst.some(e => e.id === indicador) ? indicador : null
  const mostrar = deInst.filter(e => elegido == null || e.id === elegido).map(e => ({ e, lineas: lineasDe(datos, e, filas) })).filter(x => x.lineas.length)
  const enUso = new Set(mostrar.flatMap(x => x.lineas.map(l => l.clave)))
  const instituciones = INSTITUCIONES.filter(i => datos.estandar.some(e => e.institucion === i))

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2.5 mt-[18px]">
        {regiones.length > 1 && <FiltroRegiones seleccion={sel} onCambio={setSel} opciones={regiones} />}
        <Segmentos opciones={[['*', 'Todas'], ...instituciones.map(i => [i, nombreInstitucion(i)] as [string, string])]} valor={inst} onCambio={setInst} />
        <select value={elegido ?? ''} onChange={ev => setIndicador(ev.target.value ? +ev.target.value : null)} aria-label="Indicador"
          className="text-[13px] text-slate-800 bg-white border border-gray-300 rounded-[9px] px-2.5 py-1.5 max-w-full">
          <option value="">Todos los indicadores</option>
          {deInst.map(e => <option key={e.id} value={e.id}>{inst === '*' ? `${nombreInstitucion(e.institucion)} · ` : ''}{nombreCorto(e.nombre)}</option>)}
        </select>
      </div>
      <div className="mt-3">
        <LeyendaSeries series={filas.filter(c => enUso.has(c)).map(c => ({ clave: c, nombre: NOMBRE_REGION[c], color: COLOR_REGION[c] }))} foco={foco} onFoco={setFoco} />
      </div>

      {!mostrar.length && <div className="mt-3 p-5 text-center text-[13px] text-gray-400 border border-dashed border-gray-300 rounded-xl">Ninguna de las regiones elegidas reporta estos indicadores.</div>}

      {elegido != null && mostrar[0] && (
        <>
          <div className="flex items-baseline gap-2.5 flex-wrap mt-3.5">
            <h3 className="text-base font-bold tracking-tight">{mostrar[0].e.nombre}</h3>
            <span className="text-[12.5px] text-gray-400">{nombreInstitucion(mostrar[0].e.institucion)}</span>
          </div>
          <div className="mt-3 bg-white border border-gray-200 rounded-xl p-3.5">
            <GraficoLineas series={mostrar[0].lineas} titulo={mostrar[0].e.nombre} unidad={mostrar[0].e.unidad} alto={340} fin foco={foco} onFoco={setFoco} />
          </div>
        </>
      )}

      {elegido == null && mostrar.length > 0 && (
        <div className="grid gap-3 mt-3 grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))]">
          {mostrar.map(({ e, lineas }) => (
            <div key={e.id} className="bg-white border border-gray-200 rounded-xl px-3.5 pt-2.5 pb-2 min-w-0">
              <button onClick={() => setIndicador(e.id)} title="Ver solo este indicador" className="block w-full text-left pb-1.5 group">
                <b className="block text-[13px] font-bold text-slate-900 group-hover:text-violet-700">{nombreCorto(e.nombre)}</b>
                <small className="block text-[11px] text-gray-400">{nombreInstitucion(e.institucion)}{e.unidad ? ` · ${e.unidad}` : ''}</small>
              </button>
              <GraficoLineas series={lineas} titulo={e.nombre} unidad={e.unidad} mini foco={foco} onFoco={setFoco} />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ══ Comité policial: región contra región ═══════════════════════════════════

type ColComite = 'region' | 'sesiones' | 'ultimoComite' | 'dias' | 'estandar' | 'propias'

function VistaComite({ datos, regiones, hoy }: { datos: DatosPolicial; regiones: string[]; hoy: string }) {
  const [orden, setOrden] = useState<{ k: ColComite; dir: 1 | -1 }>({ k: 'sesiones', dir: -1 })
  const filas = regiones.map(c => resumirRegion(c, datos.sesiones, datos, hoy))
  const activas = filas.filter(f => f.sesiones)
  const promedio = activas.length ? activas.reduce((s, f) => s + f.sesiones, 0) / activas.length : 0
  const sinSesionar = filas.filter(f => f.dias == null || f.dias > DIAS_SIN_SESIONAR).length
  const valor = (f: typeof filas[number], k: ColComite): string | number =>
    k === 'region' ? NOMBRE_REGION[f.region] : k === 'ultimoComite' ? f.ultimoComite ?? '' : f[k] ?? -1
  const ordenadas = [...filas].sort((a, b) => {
    const x = valor(a, orden.k), y = valor(b, orden.k)
    return (typeof x === 'string' ? x.localeCompare(y as string) : x - (y as number)) * orden.dir
  })
  const maximo = (k: 'sesiones' | 'propias') => Math.max(1, ...filas.map(f => f[k]))
  const chip = (v: number, k: 'sesiones' | 'propias') => v
    ? <span className="inline-block min-w-[46px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums" style={{ background: `rgba(109, 40, 217, ${(0.06 + (0.24 * v) / maximo(k)).toFixed(3)})` }}>{num(v)}</span>
    : <span className="text-gray-300">–</span>
  const resumen = (txt: string, pie: string, rojo = false) => (
    <th className="px-1.5 pt-2.5 pb-1 text-right">
      <div className="w-full min-w-[92px] text-right rounded-[10px] border border-gray-200 bg-stone-50 px-2.5 py-2">
        <b className={`block text-[19px] font-bold leading-tight tabular-nums ${rojo ? 'text-red-700' : 'text-slate-900'}`}>{txt}</b>
        <small className="block text-[10.5px] font-normal text-gray-400 mt-0.5 whitespace-nowrap">{pie}</small>
      </div>
    </th>
  )
  const col = (k: ColComite, t: string) => (
    <th className={`px-2.5 pb-2 pt-1.5 align-bottom ${k === 'region' ? 'text-left sticky left-0 bg-white' : 'text-right'}`}>
      <button onClick={() => setOrden(o => o.k === k ? { k, dir: (o.dir * -1) as 1 | -1 } : { k, dir: k === 'region' ? 1 : -1 })}
        className={`text-[11px] uppercase tracking-wide font-semibold leading-tight ${orden.k === k ? 'text-slate-800' : 'text-gray-400 hover:text-slate-800'}`}>
        {t}{orden.k === k ? (orden.dir < 0 ? ' ↓' : ' ↑') : ''}
      </button>
    </th>
  )
  const celda = 'border-t border-gray-200 px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap'

  return (
    <section>
      <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              <th />
              {resumen(num(Math.round(promedio * 10) / 10), 'sesiones por comité')}
              {resumen(String(activas.length), 'regiones sesionan')}
              {resumen(String(sinSesionar), `sin sesionar en ${DIAS_SIN_SESIONAR} días`, sinSesionar > 0)}
              {resumen(String(datos.estandar.length), 'métricas estándar')}
              {resumen(String(filas.reduce((s, f) => s + f.propias, 0)), 'métricas propias')}
            </tr>
            <tr>
              {col('region', 'Región')}{col('sesiones', 'Sesiones')}{col('ultimoComite', 'Último comité')}{col('dias', 'Días sin sesionar')}{col('estandar', 'Estándar reportadas')}{col('propias', 'Propias')}
            </tr>
          </thead>
          <tbody>
            {ordenadas.map(f => (
              <tr key={f.region} className="hover:bg-stone-50">
                <td className="sticky left-0 bg-white border-t border-gray-200 px-3 py-1.5 font-semibold whitespace-nowrap">{NOMBRE_REGION[f.region]}</td>
                <td className={celda}>{chip(f.sesiones, 'sesiones')}</td>
                <td className={`${celda} ${f.ultimoComite ? '' : 'text-gray-300'}`}>{f.ultimoComite ? fmtF(f.ultimoComite) : '–'}</td>
                <td className={`${celda} ${f.dias == null ? 'text-gray-300' : f.dias > DIAS_SIN_SESIONAR ? 'text-red-700 font-bold' : ''}`}>{f.dias ?? '–'}</td>
                <td className={celda}>{f.estandar ? <>{f.estandar} <span className="text-gray-300">de {datos.estandar.length}</span></> : <span className="text-gray-300">–</span>}</td>
                <td className={celda}>{chip(f.propias, 'propias')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
