'use client'

import type { DesalojoTipologia } from '@/lib/types'
import { TIPOLOGIA_CFG } from '@/lib/desalojos'

/**
 * Chip de tipología (A/B/C/D) o CTA "Asignar tipología" cuando es null.
 *
 * Paleta deliberadamente distinta del deck oficial (A=indigo, B=cyan,
 * C=violet, D=orange) — el deck usa A=azul, B=ocre, C=verde, D=rojo pero
 * verde/rojo chocan con los semáforos y amber está reservado a `en_foco`.
 *
 * Usado en: mini-tabla de capas (Contexto), selector de capa pills
 * (Seguimiento), tablero, lista lateral.
 */

type Size = 'xs' | 'sm' | 'md'

const SIZE_CLS: Record<Size, { px: string; py: string; text: string; ring: string }> = {
  xs: { px: 'px-1.5', py: 'py-0',    text: 'text-[10px]', ring: 'ring-1' },
  sm: { px: 'px-2',   py: 'py-0.5',  text: 'text-xs',     ring: 'ring-1' },
  md: { px: 'px-2.5', py: 'py-1',    text: 'text-xs',     ring: 'ring-1' },
}

type Props = {
  tipologia: DesalojoTipologia | null
  size?:     Size
  withLabel?: boolean   // si false, muestra solo la letra. default true.
  onClick?:  () => void  // si tipologia===null y onClick está, renderiza CTA.
}

export default function DesalojoTipologiaChip({
  tipologia,
  size = 'sm',
  withLabel = true,
  onClick,
}: Props) {
  const s = SIZE_CLS[size]

  if (tipologia === null) {
    if (onClick) {
      return (
        <button
          type="button"
          onClick={onClick}
          className={`${s.text} ${s.px} ${s.py} ${s.ring} rounded-full font-semibold bg-gray-50 text-gray-500 ring-gray-200 hover:bg-gray-100 hover:text-gray-700`}
        >
          + Asignar tipología
        </button>
      )
    }
    return (
      <span className={`${s.text} ${s.px} ${s.py} ${s.ring} rounded-full font-semibold bg-gray-50 text-gray-400 ring-gray-200`}>
        Sin tipología
      </span>
    )
  }

  const cfg = TIPOLOGIA_CFG[tipologia]
  const cls = `${s.text} ${s.px} ${s.py} ${s.ring} rounded-full font-semibold ${cfg.chip.bg} ${cfg.chip.text} ${cfg.chip.ring}`

  const Tag = onClick ? 'button' : 'span'

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={cfg.label}
      className={`${cls} inline-flex items-center gap-1 ${onClick ? 'hover:opacity-80' : ''}`}
    >
      <span className="font-bold">{cfg.short}</span>
      {withLabel && <span className="font-normal">{cfg.label}</span>}
    </Tag>
  )
}
