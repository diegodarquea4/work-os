'use client'

import { useMemo, useState } from 'react'
import {
  agruparPorOaeca,
  claveOaeca,
  type GrupoOaeca,
  type OficioSeguimiento,
} from '@/lib/oficiosSeguimiento'
import type { SesionNomina } from '@/lib/types'
import { ChevronPlegado, type CompromisoAbierto } from './OficiosSeguimientoBloque'

/**
 * Compromisos de seguimiento precargados, uno por ORGANISMO con oficios
 * pendientes en la región.
 *
 * ── Por qué acá y no en la zona de oficios ─────────────────────────────────
 *
 * Los oficios se leen por proyecto, que es como recorre la sesión la cartera.
 * Pero un compromiso cubre al organismo en TODA la región —es una sola
 * conversación con la DGA, no una por proyecto—, así que ofrecerlo dentro de
 * la tarjeta de un proyecto haría parecer que es de ese proyecto. Acá, entre
 * los compromisos nuevos, el alcance queda claro: es un compromiso más de la
 * sesión, con su responsable y su plazo, solo que ya viene escrito.
 *
 * ── Qué trae precargado ────────────────────────────────────────────────────
 *
 * El organismo y la descripción, que son hechos —cuántos oficios, de cuántos
 * proyectos, cuántos vencidos— y no una redacción. Lo que pone la sesión es lo
 * único que no está en ningún archivo: QUIÉN lo persigue, de la nómina del
 * comité, y para cuándo. La DGA no está en la sala: comprometer a quien no
 * está es no comprometer a nadie.
 *
 * Un organismo ya comprometido no aparece: la mig 120 admite un solo
 * compromiso abierto por organismo y región, porque lo que tiene que
 * reaparecer en quince días es ESE, con su historia, y no uno nuevo.
 */

type Props = {
  oficios: OficioSeguimiento[]
  compromisos: CompromisoAbierto[]
  nomina: SesionNomina[]
  hoy: string
  onComprometer: (g: GrupoOaeca, responsable: SesionNomina, plazo: string | null) => Promise<void>
}

export default function CompromisosOaecaSugeridos({
  oficios, compromisos, nomina, hoy, onComprometer,
}: Props) {
  const comprometidos = useMemo(() => {
    const s = new Set<string>()
    for (const c of compromisos) {
      if (!c.oaeca_objetivo || c.estado === 'cumplido') continue
      s.add(claveOaeca(c.oaeca_objetivo))
    }
    return s
  }, [compromisos])

  // Abierto por defecto: es una lista de cosas por hacer, no un archivo.
  const [abierto, setAbierto] = useState(true)

  const sugeridos = useMemo(
    () => agruparPorOaeca(oficios, hoy).filter(g => !comprometidos.has(g.clave)),
    [oficios, hoy, comprometidos],
  )

  if (sugeridos.length === 0) return null

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
      <button
        type="button"
        onClick={() => setAbierto(v => !v)}
        aria-expanded={abierto}
        className="w-full flex items-baseline gap-2 text-left"
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
          Seguimiento de oficios
        </span>
        <span className="text-[10px] text-gray-500">
          {sugeridos.length} organismo{sugeridos.length === 1 ? '' : 's'} sin seguimiento
        </span>
        <span className="ml-auto">
          <ChevronPlegado abierto={abierto} />
        </span>
      </button>

      {abierto && (
        <div className="space-y-1.5">
          {sugeridos.map(g => (
            <Sugerido key={g.clave} g={g} nomina={nomina} onComprometer={onComprometer} />
          ))}
        </div>
      )}
    </div>
  )
}

function Sugerido({ g, nomina, onComprometer }: {
  g: GrupoOaeca
  nomina: SesionNomina[]
  onComprometer: Props['onComprometer']
}) {
  const [nominaId, setNominaId]   = useState<number | ''>('')
  const [plazo, setPlazo]         = useState('')
  const [guardando, setGuardando] = useState(false)

  async function comprometer() {
    const r = nomina.find(n => n.id === nominaId)
    if (!r) return
    setGuardando(true)
    try {
      await onComprometer(g, r, plazo || null)
      setNominaId(''); setPlazo('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-white rounded-lg border border-violet-100 px-3 py-2">
      <p className="text-sm text-slate-800 font-medium leading-snug">{g.nombre}</p>
      <p className="text-[11px] text-gray-500 mt-0.5">
        {g.vencidos > 0 && (
          <span className="text-red-700 font-semibold">
            {g.vencidos} vencido{g.vencidos === 1 ? '' : 's'}
          </span>
        )}
        {g.vencidos > 0 && g.porVencer > 0 && <span className="text-gray-300"> · </span>}
        {g.porVencer > 0 && <span className="text-amber-700 font-semibold">{g.porVencer} por vencer</span>}
        <span className="text-gray-300"> · </span>
        {g.proyectos.length} proyecto{g.proyectos.length === 1 ? '' : 's'}
      </p>

      {/* Los proyectos, que son el contenido del reclamo: «de estos 2
          proyectos». Sin ellos la fila no alcanza para hablar con nadie. */}
      <p className="text-[11px] text-gray-500 mt-1 leading-snug">
        {g.proyectos.map(p => `${p.nombre} (${p.oficios})`).join(' · ')}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        <select
          value={nominaId}
          onChange={e => setNominaId(e.target.value === '' ? '' : Number(e.target.value))}
          className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-300"
        >
          <option value="">Quién hace el seguimiento…</option>
          {nomina.map(n => (
            <option key={n.id} value={n.id}>{n.nombre} — {n.institucion}</option>
          ))}
        </select>
        <input
          type="date"
          value={plazo}
          onChange={e => setPlazo(e.target.value)}
          title="Plazo"
          className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        <button
          type="button"
          disabled={nominaId === '' || guardando}
          onClick={comprometer}
          className="text-[11px] px-2.5 py-1 rounded bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Comprometer'}
        </button>
      </div>

      {nomina.length === 0 && (
        <p className="text-[11px] text-amber-700 mt-1">
          La nómina del comité está vacía: cargala primero para poder asignar a alguien.
        </p>
      )}
    </div>
  )
}
