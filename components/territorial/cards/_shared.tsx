'use client'

/**
 * Primitivos compartidos por las fichas del modo «Autoridades». Portan el CONTENIDO
 * del PTS (badges de bloque, cajas de reelección, filas meta, contrincantes) con el
 * look & feel de work-os. Nota de diseño: el PTS usaba `border-left` de color como
 * acento; acá se reemplaza por borde completo + punto de estado (los side-stripes
 * están vetados en el sistema de work-os).
 */

import type { ReactNode } from 'react'
import { COLOR_HEX, LADO_LABEL, titleCase } from '@/lib/territorial/politica'
import type { Lado, Contrincante } from '@/lib/territorial/types'

/** Colores de estado de reelección (idénticos al PTS). */
export const REELECCION = {
  siPuede: '#1B6B8A',
  noPuede: '#CC0000',
  verificado: '#1B6B8A',
  estimado: '#E06C00',
  otro: '#999999',
} as const

export function confColor(estado: string | null | undefined): string {
  if (estado === 'verificado') return REELECCION.verificado
  if (estado === 'estimado') return REELECCION.estimado
  return REELECCION.otro
}

export function confLabel(estado: string | null | undefined): string {
  if (estado === 'verificado') return 'Verificado con fuente'
  if (estado === 'estimado') return 'Estimado, no verificado'
  return 'Sin información suficiente'
}

/** Blanco o tinta oscura según la luminancia del fondo (para badges legibles). */
function textOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1e293b' : '#ffffff'
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">{children}</div>
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{children}</div>
}

export function PersonName({ children }: { children: ReactNode }) {
  return <p className="text-base font-semibold leading-tight text-slate-800">{children}</p>
}

export function Party({ children }: { children: ReactNode }) {
  return <div className="mt-0.5 text-[13px] text-slate-500">{children}</div>
}

export function LadoBadge({ lado }: { lado: Lado | null }) {
  const color = lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
  const label = lado ? LADO_LABEL[lado] : 'Sin clasificar'
  return (
    <span
      className="mt-1.5 mr-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ background: color, color: textOn(color) }}
    >
      {label}
    </span>
  )
}

export function PctTag({ pct, votos }: { pct: number | null; votos?: number | null }) {
  if (pct == null) return null
  return (
    <span className="mt-1.5 ml-0.5 inline-block rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 tabular-nums">
      {pct.toFixed(2)}%{votos != null ? ` · ${votos.toLocaleString('es-CL')} votos` : ''}
    </span>
  )
}

export function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[12.5px]">
      <span className="text-slate-500">{label}</span>
      <b className="font-semibold text-slate-700 tabular-nums">{value}</b>
    </div>
  )
}

/**
 * Caja de estado (reelección / resultado). `dot` = color del punto de estado (antes
 * era el border-left); `valueColor` = color del valor. Borde completo, sin stripe.
 */
export function StatusBox({
  label, value, valueColor, note, dot,
}: { label: string; value: ReactNode; valueColor: string; note?: ReactNode; dot: string }) {
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold" style={{ color: valueColor }}>{value}</div>
      {note != null && <div className="mt-0.5 text-[11.5px]" style={{ color: dot }}>{note}</div>}
    </div>
  )
}

export function ContrincantesBox({ contrincantes }: { contrincantes: Contrincante[] | null }) {
  if (!contrincantes || !contrincantes.length) return null
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Resultó electo/a frente a:</div>
      <div className="flex flex-col gap-1">
        {contrincantes.map((c, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2 text-[12px]">
            <span className="font-medium text-slate-700">{titleCase(c.nombre)}</span>
            <span className="shrink-0 text-slate-400">{c.partido || c.pacto || 'Sin dato'}</span>
            <span className="shrink-0 text-slate-500 tabular-nums">
              {c.votos ? `${c.votos.toLocaleString('es-CL')} ` : ''}({c.pct != null ? c.pct.toFixed(1) : 'N/D'}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Separador «▲ comparar con 2021 ▼» entre las tarjetas de 2024 y 2021. */
export function CompareArrow({ children }: { children: ReactNode }) {
  return <div className="my-2 text-center text-[11px] font-medium text-slate-400">{children}</div>
}
