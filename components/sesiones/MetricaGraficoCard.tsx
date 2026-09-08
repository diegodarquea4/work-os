'use client'

import { useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import type { ComiteMetrica, SesionComiteValor } from '@/lib/types'
import {
  type PuntoGraficoComite, serieGraficoComite, alinearConTimeline, valorDesglosePara,
} from '@/lib/sesiones/helpers'
import { useSerieDesgloseComite } from '@/lib/hooks/useComiteMetricas'

const TOTAL = '__total__'

type Props = {
  metrica: ComiteMetrica
  datos: PuntoGraficoComite[]      // serie del TOTAL (valor principal), ya armada por el padre
  regionCod: string
  ejeId: number
  fechas: string[]                 // timeline completo de sesión cerrada — huecos honestos
  fechaSesion: string
  valorActual: SesionComiteValor   // fila de esta sesión (o el default vacío) — punto "en curso" del ítem elegido
}

function fechaCorta(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })
}

/** Violeta y más grande para el valor en curso (sesión sin cerrar); gris para
 *  el histórico ya sellado — la distinción que pidió Diego. Recharts no llama
 *  a `dot` para puntos `valor: null` (huecos), así que no hace falta filtrar
 *  eso acá. */
function PuntoDot({ cx, cy, payload }: { cx?: number; cy?: number; payload?: PuntoGraficoComite }) {
  if (cx == null || cy == null) return null
  return payload?.enCurso
    ? <circle cx={cx} cy={cy} r={4.5} fill="#7c3aed" stroke="#fff" strokeWidth={1.5} />
    : <circle cx={cx} cy={cy} r={2.5} fill="#94a3b8" />
}

/**
 * Un gráfico de línea por métrica numérica del comité — evolución de sesiones
 * cerradas más, si ya se digitó, el valor de la sesión en curso (punto
 * violeta). Si la métrica tiene plantilla de desglose (mig 094 — comuna,
 * provincia o campo libre), un selector arriba cambia el MISMO gráfico entre
 * el valor principal ("Total") y la evolución de un ítem puntual — con huecos
 * reales las semanas sin dato para ese ítem, no una línea que conecta como si
 * nada faltara.
 */
export default function MetricaGraficoCard({ metrica, datos, regionCod, ejeId, fechas, fechaSesion, valorActual }: Props) {
  const [seleccion, setSeleccion] = useState<string>(TOTAL)
  const tieneDesglose = metrica.desglose_plantilla.length > 0
  const claveElegida = seleccion !== TOTAL ? seleccion : ''

  const serieDesglose = useSerieDesgloseComite(regionCod, ejeId, metrica.id, claveElegida, claveElegida !== '')

  const datosMostrados = claveElegida === ''
    ? datos
    : serieGraficoComite(
        alinearConTimeline(serieDesglose, fechas),
        fechaSesion,
        valorDesglosePara(valorActual.desglose, claveElegida),
      )

  const etiquetaElegida = metrica.desglose_plantilla.find(p => p.clave === claveElegida)?.etiqueta

  if (datosMostrados.length === 0) {
    return (
      <div className="px-3 py-4 bg-gray-50 rounded-lg text-center">
        <p className="text-sm font-medium text-gray-800">{metrica.nombre}</p>
        <p className="text-xs text-gray-400 mt-1">Sin datos reportados todavía.</p>
      </div>
    )
  }

  return (
    <div className="px-3 py-3 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <p className="text-sm font-medium text-gray-800">
          {metrica.nombre}
          {metrica.unidad && <span className="text-xs text-gray-400 font-normal"> · {metrica.unidad}</span>}
        </p>
        {tieneDesglose && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            Ver:
            <select
              value={seleccion}
              onChange={e => setSeleccion(e.target.value)}
              className="border border-slate-200 rounded-md text-xs text-slate-700 py-1 pl-1.5 pr-6 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              <option value={TOTAL}>Total (valor principal)</option>
              {metrica.desglose_plantilla.map(p => (
                <option key={p.clave} value={p.clave}>{p.etiqueta}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div style={{ width: '100%', height: 160 }}>
        <ResponsiveContainer>
          <LineChart data={datosMostrados} margin={{ top: 6, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="2 4" vertical={false} stroke="#e8ecf0" />
            <XAxis
              dataKey="fecha" tickFormatter={fechaCorta} tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false} tickLine={false} padding={{ left: 20, right: 20 }}
            />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={44} allowDecimals={false} />
            <Tooltip
              labelFormatter={v => fechaCorta(v as string)}
              formatter={(valor, _nombre, item) => {
                const payload = item?.payload as PuntoGraficoComite | undefined
                if (payload?.valor == null) return ['Sin dato esta semana', etiquetaElegida ?? metrica.nombre]
                const n = Number(valor)
                const texto = metrica.unidad && claveElegida === '' ? `${n.toLocaleString('es-CL')} ${metrica.unidad}` : n.toLocaleString('es-CL')
                return [texto, payload.enCurso ? 'Esta semana (sin cerrar)' : 'Reportado']
              }}
            />
            <Line type="monotone" dataKey="valor" stroke="#94a3b8" strokeWidth={2} dot={<PuntoDot />} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
