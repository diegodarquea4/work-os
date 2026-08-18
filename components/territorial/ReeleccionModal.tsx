'use client'

/**
 * Modal «Reelección 2028». Para alcalde/gobernador lista las comunas que sí/no
 * pueden repostular (excluye tbd), agrupadas por región o en lista plana. Para
 * diputado/senador lista las personas de CONGRESO_REELECCION por territorio.
 * Click en una fila navega a esa comuna/territorio. Espejo del PTS.
 */

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { INE_INVERSE } from '@/lib/regions'
import { COLOR_HEX, titleCase, ladoDePartido } from '@/lib/territorial/politica'
import { periodoTextoAlcalde, personasPartido, esNivelCongreso } from '@/lib/territorial/derive'
import { useTerritorialCtx } from './TerritorialProvider'
import type { ComunaProps, CongresoReeleccionRow } from '@/lib/territorial/types'

type Props = {
  onClose: () => void
  onNavigateComuna: (regionCod: string, cut: number, comuna: string) => void
}

const ESTADO_ITEMS = [{ key: 'si', label: 'Sí pueden' }, { key: 'no', label: 'No pueden' }]
const VISTA_ITEMS = [{ key: 'agrupada', label: 'Agrupada' }, { key: 'plana', label: 'Lista completa' }]

function Row({ dot, name, detail, onClick }: { dot: string; name: string; detail: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-slate-50">
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />
      <span className="text-[13px] font-medium text-slate-700">{name}</span>
      <span className="truncate text-[12px] text-slate-400">— {detail}</span>
    </button>
  )
}

function Grupo({ titulo, count, children }: { titulo: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-100">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-1 py-2 text-left">
        <span className="text-slate-400">{open ? '▾' : '▸'}</span>
        <span className="flex-1 text-[13px] font-semibold text-slate-700">{titulo}</span>
        <span className="rounded-full bg-slate-100 px-2 text-[11px] text-slate-500">{count}</span>
      </button>
      {open && <div className="pb-2 pl-2">{children}</div>}
    </div>
  )
}

export default function ReeleccionModal({ onClose, onNavigateComuna }: Props) {
  const { state, setState, setSelectedTerritorio } = useTerritorialCtx()
  const [estado, setEstado] = useState<'si' | 'no'>('si')
  const [vista, setVista] = useState<'agrupada' | 'plana'>('agrupada')
  const esCongreso = esNivelCongreso(state.nivel)

  const title = esCongreso
    ? `Reelección de ${state.nivel === 'diputado' ? 'diputados' : 'senadores'}`
    : 'Reelección de alcaldes 2028'

  return (
    <Modal open onClose={onClose} title={title} size="lg">
      <div className="mb-3 flex flex-wrap gap-2">
        <Tabs variant="segmented" ariaLabel="Estado" value={estado} onChange={(k) => setEstado(k as 'si' | 'no')} items={ESTADO_ITEMS} />
        <Tabs variant="segmented" ariaLabel="Vista" value={vista} onChange={(k) => setVista(k as 'agrupada' | 'plana')} items={VISTA_ITEMS} />
      </div>
      {esCongreso
        ? <CongresoTree estado={estado} vista={vista} onPick={(terr) => { setSelectedTerritorio(terr); onClose() }} />
        : <AlcaldeTree estado={estado} vista={vista} onPick={(p) => {
            const regionCodWorkos = INE_INVERSE[parseInt(p.codigo_region, 10)]
            if (!regionCodWorkos) return
            setState({ nivel: 'alcalde' })
            onNavigateComuna(regionCodWorkos, parseInt(p.codigo_comuna, 10), p.comuna)
            onClose()
          }} />}
    </Modal>
  )
}

// ── Árbol de alcaldes ──────────────────────────────────────────────────────
function AlcaldeTree({ estado, vista, onPick }: { estado: 'si' | 'no'; vista: 'agrupada' | 'plana'; onPick: (p: ComunaProps) => void }) {
  const { data, state } = useTerritorialCtx()
  const comunas = useMemo(() => {
    if (!data) return []
    return Object.values(data.comunaPropsByCut).filter((p) => {
      const r = p.reeleccion_2028
      return r && r.estado_confianza !== 'tbd' && r.puede_repostular === (estado === 'si')
    })
  }, [data, estado])

  if (!comunas.length) return <Empty texto="No hay comunas en esta categoría." />

  const dotDe = (p: ComunaProps) => {
    const lado = p.alcalde_2024 ? p.alcalde_2024[state.lado] : null
    return lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
  }
  const detalleDe = (p: ComunaProps) => {
    const periodo = periodoTextoAlcalde(p)
    return `${p.alcalde_2024 ? titleCase(p.alcalde_2024.nombre) : 'Sin dato'}${periodo ? ` · ${periodo}` : ''}`
  }

  if (vista === 'plana') {
    const ordenadas = [...comunas].sort((a, b) => a.comuna.localeCompare(b.comuna))
    return <div>{ordenadas.map((p) => <Row key={p.codigo_comuna} dot={dotDe(p)} name={p.comuna} detail={detalleDe(p)} onClick={() => onPick(p)} />)}</div>
  }

  const porRegion: Record<string, ComunaProps[]> = {}
  comunas.forEach((p) => { (porRegion[p.region] = porRegion[p.region] || []).push(p) })
  const regiones = Object.keys(porRegion).sort()
  return (
    <div>
      {regiones.map((reg) => {
        const items = porRegion[reg].sort((a, b) => a.comuna.localeCompare(b.comuna))
        return (
          <Grupo key={reg} titulo={reg} count={items.length}>
            {items.map((p) => <Row key={p.codigo_comuna} dot={dotDe(p)} name={p.comuna} detail={detalleDe(p)} onClick={() => onPick(p)} />)}
          </Grupo>
        )
      })}
    </div>
  )
}

// ── Árbol de congreso ──────────────────────────────────────────────────────
function CongresoTree({ estado, vista, onPick }: { estado: 'si' | 'no'; vista: 'agrupada' | 'plana'; onPick: (territorio: string) => void }) {
  const { data, state } = useTerritorialCtx()
  const nivel = state.nivel === 'senador' ? 'senador' : 'diputado'
  const filtradas = useMemo(() => {
    if (!data) return []
    return Object.values(data.CONGRESO_REELECCION[nivel] || {}).filter((r) => r.puede_repostular === (estado === 'si'))
  }, [data, nivel, estado])

  if (!filtradas.length) return <Empty texto="No hay personas en esta categoría." />

  const dotDe = (r: CongresoReeleccionRow) => {
    const lado = data ? ladoDePartido(personasPartido(data, state, r.territorio, r.nombre)) : null
    return lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
  }

  if (vista === 'plana') {
    const ordenadas = [...filtradas].sort((a, b) => a.nombre.localeCompare(b.nombre))
    return <div>{ordenadas.map((r) => <Row key={`${r.territorio}|${r.nombre}`} dot={dotDe(r)} name={titleCase(r.nombre)} detail={`${r.territorio} · ${r.periodos_consecutivos}º período`} onClick={() => onPick(r.territorio)} />)}</div>
  }

  const porTerr: Record<string, CongresoReeleccionRow[]> = {}
  filtradas.forEach((r) => { (porTerr[r.territorio] = porTerr[r.territorio] || []).push(r) })
  const terrs = Object.keys(porTerr).sort()
  return (
    <div>
      {terrs.map((terr) => (
        <Grupo key={terr} titulo={terr} count={porTerr[terr].length}>
          {porTerr[terr].map((r) => <Row key={r.nombre} dot={dotDe(r)} name={titleCase(r.nombre)} detail={`${r.periodos_consecutivos}º período`} onClick={() => onPick(terr)} />)}
        </Grupo>
      ))}
    </div>
  )
}

function Empty({ texto }: { texto: string }) {
  return <div className="py-6 text-center text-sm text-slate-400">{texto}</div>
}
