'use client'

import { useEffect, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoPlanificacion,
  DesalojoPlanificacionEstado,
} from '@/lib/types'
import { estadoEventoPlanificacion } from '@/lib/desalojos'

/**
 * Card individual del timeline de Planificación.
 *
 * - Edición inline con draft + commit on Enter/blur (titulo + descripcion).
 * - Fechas (inicio / fin) editables al expandir.
 * - Estado calculado (hecho / en_curso / planificado) → color del círculo
 *   del timeline y del chip de fecha.
 * - Soft delete confirmando con window.confirm.
 *
 * El componente recibe `evento` como prop y notifica cambios vía `onPatch`
 * y `onDelete`. La lógica optimistic vive en el padre.
 *
 * Patrón draft+commit duplicado localmente (no extraído a librería). Cuando
 * aparezca un tercer call-site se extrae — hoy solo lo usan checklist + esta
 * card, no justifica refactor.
 */

type Props = {
  evento:     DesalojoPlanificacion
  capa:       DesalojoCapa | null              // null si capa_id está null o si la capa fue archivada/eliminada
  onPatch:    (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:   (id: number) => Promise<void>
  /** Ref para que el Gantt pueda scrollear hasta acá al click. */
  cardRef?:   React.RefObject<HTMLLIElement | null>
  /** Activa flash visual 600ms cuando se invoca desde el Gantt. */
  flash?:     boolean
}

const ESTADO_COLORS: Record<DesalojoPlanificacionEstado, { dot: string; chip: string; label: string }> = {
  hecho:       { dot: 'bg-slate-900', chip: 'bg-slate-100 text-slate-700 ring-slate-200',     label: 'Hecho' },
  en_curso:    { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-800 ring-amber-200',      label: 'En curso' },
  planificado: { dot: 'bg-gray-300',  chip: 'bg-gray-50 text-gray-600 ring-gray-200',         label: 'Planificado' },
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function formatFecha(inicio: string, fin: string | null): string {
  const y = new Date().getFullYear()
  const [iy, im, id] = inicio.split('-').map(Number)
  const labelInicio = `${id} ${MESES[im - 1]}${iy !== y ? ' ' + iy : ''}`
  if (!fin) return labelInicio
  if (fin === inicio) return labelInicio
  const [fy, fm, fd] = fin.split('-').map(Number)
  // Mismo mes y año → "10–14 jun"
  if (iy === fy && im === fm) {
    return `${id}–${fd} ${MESES[fm - 1]}${fy !== y ? ' ' + fy : ''}`
  }
  // Mismo año → "10 jun – 5 jul"
  if (iy === fy) {
    return `${id} ${MESES[im - 1]} – ${fd} ${MESES[fm - 1]}${fy !== y ? ' ' + fy : ''}`
  }
  return `${id} ${MESES[im - 1]} ${iy} – ${fd} ${MESES[fm - 1]} ${fy}`
}

export default function DesalojoTimelineCard({ evento, capa, onPatch, onDelete, cardRef, flash }: Props) {
  const estado = estadoEventoPlanificacion(evento)
  const colors = ESTADO_COLORS[estado]

  const [expanded, setExpanded] = useState(false)
  const [saving,   setSaving]   = useState(false)

  // Draft fields — sincronizan con evento al cambiar (otro user editó, refetch).
  const [tituloDraft,      setTituloDraft]      = useState(evento.titulo)
  const [descripcionDraft, setDescripcionDraft] = useState(evento.descripcion ?? '')
  const [fechaIniDraft,    setFechaIniDraft]    = useState(evento.fecha_inicio)
  const [fechaFinDraft,    setFechaFinDraft]    = useState(evento.fecha_fin ?? '')
  const [isRango,          setIsRango]          = useState(evento.fecha_fin !== null)

  useEffect(() => { setTituloDraft(evento.titulo) },                    [evento.titulo])
  useEffect(() => { setDescripcionDraft(evento.descripcion ?? '') },    [evento.descripcion])
  useEffect(() => { setFechaIniDraft(evento.fecha_inicio) },            [evento.fecha_inicio])
  useEffect(() => { setFechaFinDraft(evento.fecha_fin ?? '') },         [evento.fecha_fin])
  useEffect(() => { setIsRango(evento.fecha_fin !== null) },            [evento.fecha_fin])

  async function commitTitulo() {
    const trimmed = tituloDraft.trim()
    if (!trimmed) { setTituloDraft(evento.titulo); return }
    if (trimmed === evento.titulo) return
    setSaving(true)
    try { await onPatch(evento.id, { titulo: trimmed }) }
    finally { setSaving(false) }
  }

  async function commitDescripcion() {
    const trimmed = descripcionDraft.trim() || null
    if (trimmed === (evento.descripcion ?? null)) return
    setSaving(true)
    try { await onPatch(evento.id, { descripcion: trimmed }) }
    finally { setSaving(false) }
  }

  async function commitFechas() {
    const nuevaIni = fechaIniDraft
    const nuevaFin = isRango ? (fechaFinDraft || null) : null
    if (nuevaIni === evento.fecha_inicio && nuevaFin === (evento.fecha_fin ?? null)) return
    if (nuevaFin !== null && nuevaFin < nuevaIni) {
      window.alert('La fecha de fin debe ser mayor o igual a la de inicio.')
      return
    }
    setSaving(true)
    try { await onPatch(evento.id, { fecha_inicio: nuevaIni, fecha_fin: nuevaFin }) }
    finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!window.confirm(`¿Eliminar el evento "${evento.titulo}"?`)) return
    setSaving(true)
    try { await onDelete(evento.id) }
    finally { setSaving(false) }
  }

  return (
    <li
      ref={cardRef}
      className={`relative pl-6 pb-5 group transition-colors duration-200 ${flash ? 'bg-amber-50/60 rounded-lg -mx-2 px-2' : ''}`}
    >
      {/* Círculo del timeline */}
      <span
        className={`absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${colors.dot}`}
        aria-label={colors.label}
      />

      {/* Chip de fecha + badge de capa + estado */}
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ring-1 font-medium tabular-nums ${colors.chip}`}>
          {formatFecha(evento.fecha_inicio, evento.fecha_fin)}
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${
          estado === 'hecho'    ? 'text-slate-500' :
          estado === 'en_curso' ? 'text-amber-700' : 'text-gray-500'
        }`}>
          {colors.label}
        </span>
        {capa && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${capa.activa ? 'bg-white ring-gray-200 text-gray-600' : 'bg-gray-100 ring-gray-200 text-gray-400 italic'}`}>
            {capa.nombre}{!capa.activa && ' (archivada)'}
          </span>
        )}
        <button
          type="button"
          onClick={handleDelete}
          disabled={saving}
          className="ml-auto opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-red-600 transition-opacity disabled:opacity-30"
          aria-label="Eliminar evento"
          title="Eliminar"
        >
          ✕
        </button>
      </div>

      {/* Título editable inline */}
      <input
        type="text"
        value={tituloDraft}
        onChange={e => setTituloDraft(e.target.value)}
        onBlur={commitTitulo}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLInputElement).blur() }
          if (e.key === 'Escape') { setTituloDraft(evento.titulo); (e.target as HTMLInputElement).blur() }
        }}
        disabled={saving}
        className="w-full text-sm font-medium text-gray-900 bg-transparent border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-400 focus:outline-none px-0 py-0.5 disabled:opacity-50"
        placeholder="Título del evento"
      />

      {/* Descripción truncada o expandida */}
      {!expanded && evento.descripcion && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-600 mt-1 text-left line-clamp-2 hover:text-gray-900"
        >
          {evento.descripcion}
        </button>
      )}
      {expanded && (
        <div className="mt-2 space-y-2">
          <textarea
            value={descripcionDraft}
            onChange={e => setDescripcionDraft(e.target.value)}
            onBlur={commitDescripcion}
            rows={3}
            disabled={saving}
            placeholder="Descripción del evento…"
            className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded text-gray-800 placeholder:text-gray-400 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[11px] font-semibold text-gray-600">
              Inicio
              <input
                type="date"
                value={fechaIniDraft}
                onChange={e => setFechaIniDraft(e.target.value)}
                onBlur={commitFechas}
                disabled={saving}
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-800 disabled:opacity-50 mt-0.5"
              />
            </label>
            <label className="text-[11px] font-semibold text-gray-600 flex flex-col">
              <span className="flex items-center gap-1.5">
                Fin
                <label className="text-[10px] text-gray-500 font-normal flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isRango}
                    onChange={e => {
                      setIsRango(e.target.checked)
                      if (!e.target.checked) {
                        setFechaFinDraft('')
                        // commitFechas se dispara al recibir onBlur del próximo input.
                        // Lo forzamos aquí para que el "destildar" sea suficiente.
                        onPatch(evento.id, { fecha_fin: null })
                      }
                    }}
                    disabled={saving}
                    className="w-3 h-3"
                  />
                  rango
                </label>
              </span>
              <input
                type="date"
                value={fechaFinDraft}
                onChange={e => setFechaFinDraft(e.target.value)}
                onBlur={commitFechas}
                disabled={saving || !isRango}
                min={fechaIniDraft}
                className="w-full text-xs px-2 py-1 border border-gray-200 rounded text-gray-800 disabled:opacity-50 disabled:bg-gray-50 mt-0.5"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-[11px] text-gray-500 hover:text-gray-800"
          >
            Colapsar
          </button>
        </div>
      )}

      {/* Toggle expand si está colapsada y no hay descripción */}
      {!expanded && !evento.descripcion && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] text-gray-400 hover:text-gray-700 mt-1"
        >
          + agregar descripción
        </button>
      )}
    </li>
  )
}
