'use client'

import { useState, type ReactNode } from 'react'
import { EmptyState } from '@/components/ui'
import type { EjeSesion, SesionCompromiso } from '@/lib/types'

/**
 * Piezas de UI compartidas por los historiales de sesión (Comité Policial,
 * Comité Económico, Gabinete Regional). Antes cada modal reimplementaba el
 * mismo shell/fila/asistencia/compromisos con texto minúsculo y apretado;
 * acá viven una sola vez, más amplios y prolijos (rediseño 2026-08), para que
 * las tres instancias se vean idénticas. El detalle específico de cada
 * instancia (reporte por institución / iniciativas / proyectos+oficios) se
 * compone en cada modal usando <SeccionLabel> + <DetalleCard>.
 */

export type SesionResumen = EjeSesion & { sesion_asistencia: { count: number }[] }

export type AsistenciaRow = {
  presente: boolean
  invitado_nombre: string | null
  invitado_institucion: string | null
  nomina: { nombre: string; institucion: string; calidad: string } | null
}

const ESTADO_COMP_CLASS = {
  pendiente: 'bg-slate-100 text-slate-600',
  en_curso:  'bg-blue-100 text-blue-700',
  cumplido:  'bg-green-100 text-green-700',
} as const

const ESTADO_COMP_LABEL = { pendiente: 'Pendiente', en_curso: 'En curso', cumplido: 'Cumplido' } as const

export function fmtFechaLarga(fecha: string): string {
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Lógica compartida de descargar / reintentar acta (GET/POST /acta). */
export function useActaAcciones(reload: () => Promise<void> | void) {
  const [working, setWorking] = useState(false)

  async function descargarActa(sesionId: number) {
    setWorking(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/acta`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.url) window.open(body.url, '_blank')
      else window.alert(body.error ?? 'No se pudo obtener el acta')
    } finally {
      setWorking(false)
    }
  }

  async function reintentarActa(sesionId: number) {
    setWorking(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/acta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.acta_generada) await reload()
      else window.alert(body.error ?? 'No se pudo generar el acta')
    } finally {
      setWorking(false)
    }
  }

  // Borrar la sesión del historial (registro + acta). Solo admin — el gate real
  // es la ruta DELETE (service-role); acá el call-site decide si ofrecer la X.
  async function eliminarSesion(sesionId: number) {
    if (!window.confirm(
      '¿Borrar esta acta del historial?\n\nSe elimina el registro de la sesión y su acta PDF. Esta acción no se puede deshacer.',
    )) return
    setWorking(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}`, { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) await reload()
      else window.alert(body.error ?? 'No se pudo borrar el acta')
    } finally {
      setWorking(false)
    }
  }

  return { working, descargarActa, reintentarActa, eliminarSesion }
}

// ── Shell del modal ──────────────────────────────────────────────────────────

export function HistorialShell({
  title, subtitle, onClose, loading, isEmpty, children,
}: {
  title: string
  subtitle: string
  onClose: () => void
  loading: boolean
  isEmpty: boolean
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-slate-200 flex items-start justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-slate-900">{title}</p>
            <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 mt-1" title="Cerrar">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <p className="text-center text-sm text-slate-400 py-12">Cargando historial…</p>
          ) : isEmpty ? (
            <EmptyState
              title="Aún no hay sesiones registradas"
              description="Las sesiones cerradas van quedando en este historial."
            />
          ) : (
            <div className="space-y-3">{children}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fila de sesión (colapsable) ──────────────────────────────────────────────

function EstadoActaPill({ sesion }: { sesion: SesionResumen }) {
  const base = 'text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0'
  if (sesion.estado === 'borrador') return <span className={`${base} bg-amber-100 text-amber-700`}>Borrador</span>
  if (sesion.acta_path) return <span className={`${base} bg-green-100 text-green-700`}>Acta lista</span>
  return <span className={`${base} bg-red-100 text-red-700`}>Acta pendiente</span>
}

export function SesionCard({
  sesion, nAsis, expanded, onToggle, onDelete, children,
}: {
  sesion: SesionResumen
  nAsis: number
  expanded: boolean
  onToggle: () => void
  /** Solo admin: muestra la X (arriba a la derecha) para borrar la sesión. */
  onDelete?: () => void
  children: ReactNode
}) {
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-stretch">
        <button
          onClick={onToggle}
          className="flex-1 min-w-0 flex items-center gap-3.5 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
        >
          <svg
            width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
            className={`text-slate-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          >
            <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-slate-800">
              {fmtFechaLarga(sesion.fecha)}{sesion.lugar ? ` · ${sesion.lugar}` : ''}
            </p>
            <p className="text-sm text-slate-500 mt-0.5">{nAsis} en asistencia</p>
          </div>
          <EstadoActaPill sesion={sesion} />
        </button>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Borrar acta (solo administrador)"
            aria-label="Borrar acta"
            className="flex-shrink-0 self-stretch px-4 flex items-center border-l border-slate-100 text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-5 py-5 bg-slate-50/70 space-y-4">
          {children}
        </div>
      )}
    </div>
  )
}

// ── Primitivos del detalle ───────────────────────────────────────────────────

export function SeccionLabel({ children }: { children: string }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2.5">{children}</p>
}

export function DetalleCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4">{children}</div>
}

export function CargandoDetalle() {
  return <p className="text-sm text-slate-400">Cargando detalle…</p>
}

export function SinDetalle() {
  return <p className="text-sm text-slate-400">Sesión sin registros de detalle.</p>
}

// ── Acciones de acta ─────────────────────────────────────────────────────────

export function ActaAcciones({
  sesion, working, onDescargar, onReintentar,
}: {
  sesion: SesionResumen
  working: boolean
  onDescargar: () => void
  onReintentar: () => void
}) {
  if (sesion.estado !== 'cerrada') return null
  return (
    <div className="flex items-center gap-2.5">
      {sesion.acta_path ? (
        <button
          onClick={onDescargar}
          disabled={working}
          className="text-sm px-3.5 py-2 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-50"
        >
          ⬇ Descargar acta
        </button>
      ) : (
        <>
          <span className="text-sm text-red-600">El acta no se generó al cerrar.</span>
          <button
            onClick={onReintentar}
            disabled={working}
            className="text-sm px-3.5 py-2 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50"
          >
            {working ? 'Generando…' : 'Reintentar acta'}
          </button>
        </>
      )}
    </div>
  )
}

// ── Asistencia (chips) ───────────────────────────────────────────────────────

export function AsistenciaCard({ asistencia }: { asistencia: AsistenciaRow[] }) {
  if (asistencia.length === 0) return null
  return (
    <DetalleCard>
      <SeccionLabel>Asistencia</SeccionLabel>
      <div className="flex flex-wrap gap-1.5">
        {asistencia.map((a, i) => {
          const nombre = a.nomina?.nombre ?? a.invitado_nombre ?? '—'
          const inst = a.nomina?.institucion ?? a.invitado_institucion ?? ''
          return (
            <span
              key={i}
              className={`text-xs px-2.5 py-1 rounded-full ${a.presente ? 'bg-white border border-slate-200 text-slate-700' : 'bg-slate-100 text-slate-400 line-through'}`}
              title={inst}
            >
              {!a.nomina && '👤 '}{nombre}
            </span>
          )
        })}
      </div>
    </DetalleCard>
  )
}

// ── Compromisos ──────────────────────────────────────────────────────────────

export function CompromisosCard({
  compromisos, seccionLabel,
}: {
  compromisos: SesionCompromiso[]
  seccionLabel?: (c: SesionCompromiso) => string | null
}) {
  if (compromisos.length === 0) return null
  return (
    <DetalleCard>
      <SeccionLabel>Compromisos de esta sesión</SeccionLabel>
      <div className="space-y-2">
        {compromisos.map(c => {
          const tag = seccionLabel?.(c)
          return (
            <div key={c.id} className="flex items-start gap-2.5 text-sm text-slate-700">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${ESTADO_COMP_CLASS[c.estado]}`}>
                {ESTADO_COMP_LABEL[c.estado]}
              </span>
              <span className="flex-1 leading-snug">
                {tag && <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-1.5">[{tag}]</span>}
                {c.descripcion} <span className="text-slate-400">— {c.responsable_institucion}</span>
              </span>
            </div>
          )
        })}
      </div>
    </DetalleCard>
  )
}
