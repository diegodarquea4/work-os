'use client'

import { useEffect, useRef, useState } from 'react'
import { marcasDelEje, diasEntreFechas, type Punto } from '@/lib/seguimientoPolicial'

/**
 * Gráfico de líneas sobre fechas reales (SVG, sin librería): una línea por
 * serie, un punto por reporte. Se dibuja al ancho de su contenedor.
 *
 *   valores  escribe el valor sobre cada punto (para UNA serie). Con muchos
 *            reportes no caben todos arriba: el que choca con el anterior va
 *            bajo el punto, y si tampoco cabe se omite (queda en el tooltip)
 *   fin      rotula cada línea con su nombre al final (para varias)
 *   mini     versión chica, para una grilla de gráficos
 *
 * El eje Y usa marcas redondas (`marcasDelEje`) y parte de 0, o del mínimo si
 * hay negativos. El eje X marca cada reporte cuando es una sola serie corta, y
 * cada mes cuando hay varias.
 */

export type SerieLinea = { clave: string; nombre: string; color: string; pts: Punto[] }

const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
export const num = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 })
const corta = (f: string) => `${f.slice(8)}-${f.slice(5, 7)}`
const larga = (f: string) => `${f.slice(8)}-${f.slice(5, 7)}-${f.slice(0, 4)}`
const primeroDelMes = (f: string) => f.slice(0, 8) + '01'
const mesSiguiente = (f: string) => new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7), 1, 12)).toISOString().slice(0, 10)

/** El ancho en píxeles de un contenedor, al día si cambia de tamaño. */
function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [ancho, setAncho] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setAncho(Math.floor(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, ancho] as const
}

type Props = {
  series: SerieLinea[]
  titulo: string
  unidad?: string | null
  valores?: boolean
  fin?: boolean
  mini?: boolean
  alto?: number
  /** Serie destacada (las demás se atenúan). */
  foco?: string | null
  onFoco?: (clave: string | null) => void
}

export default function GraficoLineas({ series: todas, titulo, unidad, valores, fin, mini, alto, foco, onFoco }: Props) {
  const [ref, ancho] = useAncho<HTMLDivElement>()
  const series = todas.filter(s => s.pts.length)
  const H = alto ?? (mini ? 170 : 300)

  if (!series.length) return <div ref={ref} className="text-sm text-gray-400 py-6 text-center">Sin reportes.</div>

  const W = Math.max(260, ancho)
  const puntos = series.flatMap(s => s.pts)
  const vs = puntos.map(p => p[1])
  // Un conteo (todos enteros) no lleva marcas con decimales: «0,2 casos» no existe.
  const marcas = marcasDelEje(Math.min(0, ...vs), Math.max(...vs), mini ? 3 : 5)
  const ys = vs.every(Number.isInteger) && marcas.filter(Number.isInteger).length > 1 ? marcas.filter(Number.isInteger) : marcas
  const yMin = ys[0], yMax = ys[ys.length - 1]
  const mI = Math.max(mini ? 30 : 40, Math.max(...ys.map(v => num(v).length)) * 6.6 + 14)
  const mD = fin ? 118 : 18
  const mT = (valores ? 26 : 14) + (unidad && !mini ? 16 : 0)
  const mB = mini ? 22 : 34
  const fechas = puntos.map(p => p[0]).sort()
  const f0 = fechas[0], f1 = fechas[fechas.length - 1]
  const dias = Math.max(1, diasEntreFechas(f0, f1))
  const x = (f: string) => f0 === f1 ? mI + (W - mI - mD) / 2 : mI + (diasEntreFechas(f0, f) * (W - mI - mD)) / dias
  const y = (v: number) => H - mB - ((v - yMin) * (H - mB - mT)) / (yMax - yMin)

  const unaCorta = series.length === 1 && series[0].pts.length <= 14 && !mini
  const meses: string[] = []
  if (!unaCorta) {
    for (let m = primeroDelMes(f0); m <= f1; m = mesSiguiente(m)) if (m >= f0) meses.push(m)
    if (!meses.length) meses.push(f0)
  }

  // Fechas del eje cuando va una por reporte: la que pisaría a la anterior no se escribe.
  let finFecha = -Infinity
  const fechasEscritas = new Set(unaCorta ? series[0].pts.map(p => p[0]).filter(f => { if (x(f) - 17 < finFecha) return false; finFecha = x(f) + 17; return true }) : [])

  // Valores escritos junto a cada punto: arriba, y si ahí pisa a otro, abajo.
  // El que no cabe en ninguno de los dos lados se omite (queda en el tooltip).
  const rotulosDeValor = (pts: Punto[]) => {
    const puestos: { x0: number; x1: number; cy: number }[] = []
    return pts.flatMap(([f, v]) => {
      const texto = num(v), medio = (texto.length * 6.8 + 6) / 2
      const cx = Math.min(Math.max(x(f), mI + medio), W - 2 - medio)
      for (const cy of [y(v) - 10, y(v) + 19]) {
        if (cy > H - mB - 2 || puestos.some(o => cx - medio < o.x1 && cx + medio > o.x0 && Math.abs(cy - o.cy) < 13)) continue
        puestos.push({ x0: cx - medio, x1: cx + medio, cy })
        return [{ f, texto, cx, cy }]
      }
      return []
    })
  }

  // Rótulos de fin de línea, separados para que no se pisen.
  const fines = fin ? series.map(s => ({ clave: s.clave, yy: y(s.pts[s.pts.length - 1][1]) })).sort((a, b) => a.yy - b.yy) : []
  for (let i = 1; i < fines.length; i++) if (fines[i].yy - fines[i - 1].yy < 14) fines[i].yy = fines[i - 1].yy + 14

  return (
    <div ref={ref} style={{ minHeight: H }}>
      {ancho > 0 && (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={titulo} className="block">
          {ys.map(v => (
            <g key={v}>
              <line x1={mI} x2={W - mD} y1={y(v)} y2={y(v)} className={v === 0 ? 'stroke-gray-300' : 'stroke-gray-100'} />
              <text x={mI - 7} y={y(v) + 3.5} textAnchor="end" className="fill-gray-400 text-[11px] tabular-nums">{num(v)}</text>
            </g>
          ))}
          {unidad && !mini && <text x={2} y={11} className="fill-gray-400 text-[11px]">{unidad}</text>}

          {unaCorta
            ? <>
                {series[0].pts.map(([f]) => (
                  <g key={f}>
                    <line x1={x(f)} x2={x(f)} y1={H - mB} y2={H - mB + 4} className="stroke-gray-300" />
                    {fechasEscritas.has(f) && <text x={x(f)} y={H - mB + 17} textAnchor="middle" className="fill-gray-400 text-[11px] tabular-nums">{corta(f)}</text>}
                  </g>
                ))}
                <text x={W - mD} y={H - 3} textAnchor="end" className="fill-gray-400 text-[11px]">{f0.slice(0, 4) === f1.slice(0, 4) ? f1.slice(0, 4) : `${f0.slice(0, 4)}–${f1.slice(0, 4)}`}</text>
              </>
            : meses.map(m => (
                <g key={m}>
                  <line x1={x(m)} x2={x(m)} y1={H - mB} y2={H - mB + 4} className="stroke-gray-300" />
                  <text x={x(m)} y={H - mB + 16} textAnchor="middle" className="fill-gray-400 text-[11px]">
                    {m === f0 && +m.slice(8) !== 1 ? corta(m) : MES3[+m.slice(5, 7) - 1]}
                  </text>
                </g>
              ))}

          {series.map(s => {
            const ultimo = s.pts[s.pts.length - 1]
            const rotulo = fines.find(z => z.clave === s.clave)
            return (
              <g key={s.clave} opacity={foco && foco !== s.clave ? 0.15 : 1}
                onMouseEnter={onFoco ? () => onFoco(s.clave) : undefined} onMouseLeave={onFoco ? () => onFoco(null) : undefined}>
                {s.pts.length > 1 && (
                  <polyline points={s.pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')}
                    fill="none" stroke={s.color} strokeWidth={mini ? 1.75 : 2} strokeLinejoin="round" strokeLinecap="round" />
                )}
                {s.pts.map(([f, v]) => (
                  <circle key={f} cx={x(f)} cy={y(v)} r={mini ? 2.5 : 4} fill={s.color} stroke="#fff" strokeWidth={mini ? 1.5 : 2}>
                    <title>{`${s.nombre} · ${larga(f)}: ${num(v)}${unidad ? ' ' + unidad : ''}`}</title>
                  </circle>
                ))}
                {valores && rotulosDeValor(s.pts).map(r => (
                  <text key={r.f} x={r.cx} y={r.cy} textAnchor="middle" stroke="#fff" strokeWidth={3} style={{ paintOrder: 'stroke' }}
                    className="fill-slate-900 text-[11.5px] font-semibold tabular-nums">{r.texto}</text>
                ))}
                {rotulo && <text x={x(ultimo[0]) + 9} y={rotulo.yy + 4} className="fill-slate-600 text-[11.5px] font-semibold">{s.nombre}</text>}
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}

/** La leyenda de colores. Pasar el mouse destaca esa serie en los gráficos que compartan `foco`. */
export function LeyendaSeries({ series, foco, onFoco }: { series: Pick<SerieLinea, 'clave' | 'nombre' | 'color'>[]; foco?: string | null; onFoco?: (clave: string | null) => void }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-600">
      {series.map(s => (
        <span key={s.clave} className={`inline-flex items-center gap-1.5 cursor-default ${foco && foco !== s.clave ? 'opacity-40' : ''} ${foco === s.clave ? 'text-slate-900' : ''}`}
          onMouseEnter={onFoco ? () => onFoco(s.clave) : undefined} onMouseLeave={onFoco ? () => onFoco(null) : undefined}>
          <i className="inline-block w-4 h-[3px] rounded-sm" style={{ background: s.color }} />{s.nombre}
        </span>
      ))}
    </div>
  )
}
