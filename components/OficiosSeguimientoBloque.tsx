'use client'

import { useMemo, useState } from 'react'
import { diasHasta } from '@/lib/oficiosSeia'
import {
  agruparPorOaeca,
  claveOaeca,
  descripcionSeguimiento,
  type GrupoOaeca,
  type OficioSeguimiento,
} from '@/lib/oficiosSeguimiento'
import type { SesionCompromiso, SesionNomina } from '@/lib/types'

/**
 * Los oficios pendientes del SEIA en la sesión, agrupados por QUIEN DEBE
 * RESPONDER.
 *
 * ── Por qué por organismo ──────────────────────────────────────────────────
 *
 * Un oficio cuelga de un proyecto, pero quien responde es un OAECA, y la
 * conversación de la sesión es esa: «la SEREMI de Medio Ambiente le dice a la
 * DGA: tenés estos 4 oficios pendientes de estos 2 proyectos». Agrupado por
 * proyecto, esa misma conversación se parte en dos y el organismo se entera
 * dos veces de la mitad.
 *
 * ── El compromiso ──────────────────────────────────────────────────────────
 *
 * Es un `sesion_compromisos` normal, con `seccion = 'oficios'` y
 * `oaeca_objetivo` apuntando al organismo. Eso le da gratis lo que hace que
 * valga: los compromisos abiertos de sesiones anteriores YA reaparecen en la
 * sesión siguiente, con su responsable y su historia. Un objeto nuevo habría
 * que enseñarle todo eso de cero.
 *
 * El responsable se elige de la NÓMINA DEL COMITÉ, no del organismo: la DGA no
 * está en la sala, y comprometer a quien no está es no comprometer a nadie.
 *
 * ── Qué no hace ────────────────────────────────────────────────────────────
 *
 * No cambia el estado de ningún oficio. Lo manda el SEIA y la importación
 * siguiente lo trae; cuando al organismo no le queda nada pendiente, el
 * compromiso se cierra solo.
 */

export type CompromisoAbierto = Pick<
  SesionCompromiso,
  'id' | 'oaeca_objetivo' | 'estado' | 'responsable_institucion' | 'responsable_nombre' | 'plazo'
>

type Props = {
  oficios: OficioSeguimiento[]
  /** Compromisos con organismo, abiertos o no, de esta región. */
  compromisos: CompromisoAbierto[]
  nomina: SesionNomina[]
  hoy: string
  puedeOperar: boolean
  onAbrirProyecto: (id: number) => void
  /** Crea el compromiso. Devuelve cuando ya está guardado. */
  onComprometer: (g: GrupoOaeca, responsable: SesionNomina, plazo: string | null) => Promise<void>
}

export default function OficiosSeguimientoBloque({
  oficios, compromisos, nomina, hoy, puedeOperar, onAbrirProyecto, onComprometer,
}: Props) {
  const grupos = useMemo(() => agruparPorOaeca(oficios, hoy), [oficios, hoy])

  // Por organismo, el compromiso ABIERTO que ya lo persigue. La mig 120
  // garantiza que hay a lo sumo uno por región.
  const comprometidos = useMemo(() => {
    const m = new Map<string, CompromisoAbierto>()
    for (const c of compromisos) {
      if (!c.oaeca_objetivo || c.estado === 'cumplido') continue
      m.set(claveOaeca(c.oaeca_objetivo), c)
    }
    return m
  }, [compromisos])

  if (grupos.length === 0) return null

  const totalOficios = grupos.reduce((n, g) => n + g.oficios.length, 0)
  const sinComprometer = grupos.filter(g => !comprometidos.has(g.clave)).length

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <h5 className="text-[10px] font-semibold text-gray-500">Pendientes en el SEIA</h5>
        <span className="text-[10px] text-gray-400">
          por organismo que debe responder
        </span>
        <span className="text-xs text-gray-400 ml-auto tabular-nums">
          {grupos.length} organismo{grupos.length === 1 ? '' : 's'} · {totalOficios} oficio{totalOficios === 1 ? '' : 's'}
        </span>
      </div>

      {sinComprometer > 0 && puedeOperar && (
        <p className="text-[11px] text-gray-500 mb-2">
          {sinComprometer} sin nadie que lo persiga.
        </p>
      )}

      <div className="space-y-1.5">
        {grupos.map(g => (
          <GrupoCard
            key={g.clave}
            g={g}
            hoy={hoy}
            compromiso={comprometidos.get(g.clave) ?? null}
            nomina={nomina}
            puedeOperar={puedeOperar}
            onAbrirProyecto={onAbrirProyecto}
            onComprometer={onComprometer}
          />
        ))}
      </div>
    </div>
  )
}

function GrupoCard({ g, hoy, compromiso, nomina, puedeOperar, onAbrirProyecto, onComprometer }: {
  g: GrupoOaeca
  hoy: string
  compromiso: CompromisoAbierto | null
  nomina: SesionNomina[]
  puedeOperar: boolean
  onAbrirProyecto: (id: number) => void
  onComprometer: Props['onComprometer']
}) {
  const [abierto, setAbierto]   = useState(false)
  const [form, setForm]         = useState(false)
  const [nominaId, setNominaId] = useState<number | ''>('')
  const [plazo, setPlazo]       = useState('')
  const [guardando, setGuardando] = useState(false)

  const urgente = g.vencidos > 0

  async function comprometer() {
    const r = nomina.find(n => n.id === nominaId)
    if (!r) return
    setGuardando(true)
    try {
      await onComprometer(g, r, plazo || null)
      setForm(false); setNominaId(''); setPlazo('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className={`rounded-lg border ${urgente ? 'border-red-200 bg-red-50/40' : 'border-amber-200 bg-amber-50/30'}`}>
      <div className="px-3 py-2 flex items-start gap-3">
        <div className="flex-1 min-w-0">
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
        </div>
        <button
          type="button"
          onClick={() => setAbierto(v => !v)}
          className="flex-shrink-0 text-[11px] text-violet-700 hover:text-violet-900 font-medium"
        >
          {abierto ? 'Ocultar' : 'Ver detalle'}
        </button>
      </div>

      {/* Los proyectos siempre visibles: son el contenido del reclamo —«de
          estos 2 proyectos»— y sin ellos la fila no alcanza para hablar. */}
      <div className="px-3 pb-2 flex flex-wrap gap-1">
        {g.proyectos.map(p => (
          p.proyectoId != null ? (
            <button
              key={`p${p.proyectoId}`}
              type="button"
              onClick={() => onAbrirProyecto(p.proyectoId!)}
              className="text-[11px] px-2 py-0.5 rounded bg-white border border-gray-200 text-slate-700 hover:border-violet-300 hover:text-violet-800"
            >
              {p.nombre} <span className="text-gray-400">({p.oficios})</span>
            </button>
          ) : (
            // Sin ficha que abrir: el proyecto no está en la cartera. Se
            // muestra igual porque el oficio existe y hay que reclamarlo.
            <span
              key={`n${p.nombre}`}
              className="text-[11px] px-2 py-0.5 rounded bg-white border border-dashed border-gray-200 text-gray-500"
              title="No está en la cartera del comité"
            >
              {p.nombre} <span className="text-gray-400">({p.oficios})</span>
            </span>
          )
        ))}
      </div>

      {abierto && (
        <div className="px-3 pb-2 space-y-1 border-t border-white/60 pt-2">
          {g.oficios.map(o => {
            const d = o.fecha_limite ? diasHasta(o.fecha_limite, hoy) : null
            const venc = d != null && d < 0
            return (
              <div key={o.id} className="flex items-baseline gap-2 text-[11px]">
                <span className={`font-bold tabular-nums ${venc ? 'text-red-700' : 'text-amber-700'}`}>
                  {d == null ? 'sin plazo' : venc ? `${Math.abs(d)}d atraso` : `${d}d`}
                </span>
                <span className="text-slate-600 truncate">{o.nombre_proyecto ?? 'Proyecto sin nombre'}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* El estado del seguimiento, que es lo que hace que esto sirva en la
          sesión siguiente: o ya tiene quién lo persiga, o hay que asignarlo. */}
      <div className="px-3 py-2 border-t border-white/60">
        {compromiso ? (
          <p className="text-[11px] text-slate-700">
            <span className="font-semibold text-violet-800">Lo persigue</span>{' '}
            {compromiso.responsable_nombre
              ? `${compromiso.responsable_nombre} (${compromiso.responsable_institucion})`
              : compromiso.responsable_institucion}
            {compromiso.plazo && <span className="text-gray-500"> · al {fmt(compromiso.plazo)}</span>}
          </p>
        ) : !puedeOperar ? (
          <p className="text-[11px] text-gray-400">Sin responsable asignado.</p>
        ) : !form ? (
          <button
            type="button"
            onClick={() => setForm(true)}
            className="text-[11px] font-semibold text-violet-700 hover:text-violet-900"
          >
            + Comprometer seguimiento
          </button>
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-600">{descripcionSeguimiento(g)}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={nominaId}
                onChange={e => setNominaId(e.target.value === '' ? '' : Number(e.target.value))}
                className="text-[11px] px-2 py-1 border border-slate-200 rounded bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-violet-300"
              >
                <option value="">Quién lo persigue…</option>
                {nomina.map(n => (
                  <option key={n.id} value={n.id}>
                    {n.nombre} — {n.institucion}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={plazo}
                onChange={e => setPlazo(e.target.value)}
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
              <button
                type="button"
                onClick={() => { setForm(false); setNominaId(''); setPlazo('') }}
                className="text-[11px] px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Cancelar
              </button>
            </div>
            {nomina.length === 0 && (
              <p className="text-[11px] text-amber-700">
                La nómina del comité está vacía: cargala primero para poder asignar a alguien.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}
