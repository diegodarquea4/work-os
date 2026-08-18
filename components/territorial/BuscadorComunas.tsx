'use client'

/**
 * Buscador de comunas del modo «Autoridades». Sugiere hasta 12 comunas por
 * coincidencia de nombre («Comuna — Región») y al elegir navega a esa comuna
 * (entra al drill de su región y la selecciona). Espejo del buscador del PTS.
 */

import { useMemo, useRef, useState } from 'react'
import { INE_INVERSE } from '@/lib/regions'
import { useTerritorialCtx } from './TerritorialProvider'

type Props = {
  onNavigateComuna: (regionCod: string, cut: number, comuna: string) => void
}

export default function BuscadorComunas({ onNavigateComuna }: Props) {
  const { data } = useTerritorialCtx()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sugerencias = useMemo(() => {
    if (!data || q.trim().length < 2) return []
    const needle = q.trim().toLowerCase()
    const out: { cut: number; regionCodWorkos: string; comuna: string; region: string }[] = []
    for (const p of Object.values(data.comunaPropsByCut)) {
      if (p.comuna.toLowerCase().includes(needle)) {
        const regionCodWorkos = INE_INVERSE[parseInt(p.codigo_region, 10)]
        if (!regionCodWorkos) continue
        out.push({ cut: parseInt(p.codigo_comuna, 10), regionCodWorkos, comuna: p.comuna, region: p.region })
        if (out.length >= 12) break
      }
    }
    return out
  }, [data, q])

  function elegir(s: { cut: number; regionCodWorkos: string; comuna: string }) {
    onNavigateComuna(s.regionCodWorkos, s.cut, s.comuna)
    setQ('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150) }}
        placeholder="Buscar comuna"
        className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
      />
      {open && sugerencias.length > 0 && (
        <div className="absolute left-0 top-full z-[1200] mt-1 max-h-72 w-full min-w-[200px] overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {sugerencias.map((s) => (
            <button
              key={`${s.cut}`}
              onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); elegir(s) }}
              className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-[12.5px] hover:bg-slate-50"
            >
              <span className="font-medium text-slate-700">{s.comuna}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{s.region}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
