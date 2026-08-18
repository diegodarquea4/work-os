'use client'

/**
 * Modal «Carrito de descarga». Arma filas por (modo, nivel) con obtenerFilasCarrito,
 * permite agregarlas al carrito (por fila, por grupo o todo lo visible) y descargar
 * el carrito completo a Excel (una hoja por categoría). Espejo del PTS.
 */

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Tabs } from '@/components/ui/Tabs'
import { obtenerFilasCarrito, exportCarritoXlsx, type CarritoModo, type CarritoFila, type CarritoItem } from '@/lib/territorial/carrito'
import { useTerritorialCtx } from './TerritorialProvider'
import type { NivelAutoridad } from '@/lib/territorial/types'

type Props = { onClose: () => void }

const MODO_ITEMS = [{ key: 'proximas', label: 'Próximas elecciones' }, { key: 'pasadas', label: 'Elecciones pasadas' }]
const NIVEL_BASE = [
  { key: 'alcalde', label: 'Alcaldes' },
  { key: 'gobernador', label: 'Gobernadores' },
  { key: 'diputado', label: 'Diputados' },
  { key: 'senador', label: 'Senadores' },
]

function filaAItem(fila: CarritoFila, nivel: NivelAutoridad, modo: CarritoModo): CarritoItem {
  return { id: fila.id, categoria: `${nivel}_${modo}`, nivel, modo, datos: fila.datos }
}

function Grupo({ titulo, filas, enCarrito, onAddGrupo, onAddFila }: {
  titulo: string
  filas: CarritoFila[]
  enCarrito: Set<string>
  onAddGrupo: () => void
  onAddFila: (f: CarritoFila) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-slate-100">
      <div className="flex items-center gap-2 px-1 py-2">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <span className="text-slate-400">{open ? '▾' : '▸'}</span>
          <span className="flex-1 text-[13px] font-semibold text-slate-700">{titulo}</span>
          <span className="rounded-full bg-slate-100 px-2 text-[11px] text-slate-500">{filas.length}</span>
        </button>
        <button onClick={onAddGrupo} className="rounded-md border border-slate-200 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 hover:text-slate-700">+ Agregar todos</button>
      </div>
      {open && (
        <div className="pb-2 pl-2">
          {filas.map((f) => {
            const ya = enCarrito.has(f.id)
            return (
              <div key={f.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                <span className="min-w-0 flex-1">
                  <span className="text-[13px] font-medium text-slate-700">{f.etiqueta}</span>
                  <span className="ml-1 truncate text-[12px] text-slate-400">— {f.detalle}</span>
                </span>
                <button
                  onClick={() => onAddFila(f)}
                  disabled={ya}
                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold ${ya ? 'text-slate-400' : 'border border-slate-200 text-slate-600 hover:text-slate-800'}`}
                >
                  {ya ? '✓ Agregado' : '+ Agregar'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CarritoModal({ onClose }: Props) {
  const { data, state, carrito, addCarrito, clearCarrito } = useTerritorialCtx()
  const [modo, setModo] = useState<CarritoModo>('proximas')
  const [nivel, setNivel] = useState<NivelAutoridad>('alcalde')

  // «Delegados» solo existe en «pasadas»; si se cambia a próximas estando en delegado, cae a alcalde.
  const nivelItems = modo === 'pasadas' ? [...NIVEL_BASE, { key: 'delegado', label: 'Delegados' }] : NIVEL_BASE
  const nivelEfectivo: NivelAutoridad = (modo === 'proximas' && nivel === 'delegado') ? 'alcalde' : nivel

  const filas = useMemo(
    () => (data ? obtenerFilasCarrito(data, state, nivelEfectivo, modo) : []),
    [data, state, nivelEfectivo, modo],
  )
  const enCarrito = useMemo(() => new Set(carrito.map((c) => c.id)), [carrito])

  const porGrupo = useMemo(() => {
    const m: Record<string, CarritoFila[]> = {}
    filas.forEach((f) => { (m[f.grupo] = m[f.grupo] || []).push(f) })
    return m
  }, [filas])
  const grupos = Object.keys(porGrupo).sort()

  const footer = (
    <>
      <span className="flex-1 self-center text-[12.5px] text-slate-500">{carrito.length} item{carrito.length === 1 ? '' : 's'} para descargar</span>
      <button onClick={clearCarrito} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800">Vaciar</button>
      <button
        onClick={() => { if (carrito.length) void exportCarritoXlsx(carrito) }}
        disabled={!carrito.length}
        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
      >
        Descargar Excel
      </button>
    </>
  )

  return (
    <Modal open onClose={onClose} title="Descarga de datos" size="lg" footer={footer}>
      <div className="mb-3 flex flex-wrap gap-2">
        <Tabs variant="segmented" ariaLabel="Modo" value={modo} onChange={(k) => setModo(k as CarritoModo)} items={MODO_ITEMS} />
        <Tabs variant="segmented" ariaLabel="Nivel" value={nivelEfectivo} onChange={(k) => setNivel(k as NivelAutoridad)} items={nivelItems} />
      </div>

      {filas.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-400">No hay datos para esta combinación.</div>
      ) : (
        <>
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => addCarrito(filas.map((f) => filaAItem(f, nivelEfectivo, modo)))}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-[11.5px] font-semibold text-slate-600 hover:text-slate-800"
            >
              + Agregar todo lo visible ({filas.length})
            </button>
          </div>
          {grupos.map((g) => (
            <Grupo
              key={g}
              titulo={g}
              filas={porGrupo[g].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta))}
              enCarrito={enCarrito}
              onAddGrupo={() => addCarrito(porGrupo[g].map((f) => filaAItem(f, nivelEfectivo, modo)))}
              onAddFila={(f) => addCarrito([filaAItem(f, nivelEfectivo, modo)])}
            />
          ))}
        </>
      )}
    </Modal>
  )
}
