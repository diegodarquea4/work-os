'use client'

import { useEffect, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoPlanificacion,
  DesalojoPlanificacionEstado,
} from '@/lib/types'
import { estadoEventoPlanificacion } from '@/lib/desalojos'
import RichTextEditor, { RichTextView, isHtmlEmpty } from './RichTextEditor'

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
  hitos:      DesalojoPlanificacion[]          // hitos hijos (parent_id === evento.id), ya ordenados
  onPatch:    (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:   (id: number) => Promise<void>
  onAddHito:  (input: {
    parent_id:    number
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
  /** Entra al modo foco del Gantt para este evento. */
  onSelectFocus?: () => void
  /** Cuando true, la card se destaca visualmente (evento en foco del Gantt). */
  focused?:   boolean
  /** Ref para que el Gantt pueda scrollear hasta acá al click. */
  cardRef?:   React.RefObject<HTMLLIElement | null>
  /** Activa flash visual 600ms cuando se invoca desde el Gantt. */
  flash?:     boolean
  /** Salta al mapa enfocando esta Etapa. */
  onVerEnMapa?: (etapaId: number) => void
  /** Nº de polígonos asociados a esta Etapa en el mapa. */
  poligonoCount?: number
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

export default function DesalojoTimelineCard({
  evento, capa, hitos, onPatch, onDelete, onAddHito, onSelectFocus, focused, cardRef, flash,
  onVerEnMapa, poligonoCount = 0,
}: Props) {
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
    // Tiptap devuelve '<p></p>' para contenido vacío — lo normalizamos a null
    // para no llenar la DB con HTML inútil.
    const normalized = isHtmlEmpty(descripcionDraft) ? null : descripcionDraft
    if (normalized === (evento.descripcion ?? null)) return
    setSaving(true)
    try { await onPatch(evento.id, { descripcion: normalized }) }
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

  // Padre del evento: rango efectivo para validar fechas de hitos.
  const padreFin = evento.fecha_fin ?? evento.fecha_inicio

  return (
    <li
      ref={cardRef}
      className={`relative pl-6 pb-5 group transition-colors duration-200 ${
        flash ? 'bg-amber-50/60 rounded-lg -mx-2 px-2' :
        focused ? 'bg-slate-50 rounded-lg -mx-2 px-2 ring-1 ring-slate-300' : ''
      }`}
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
        {hitos.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-50 ring-1 ring-slate-200 text-slate-600 tabular-nums">
            {hitos.length} hito{hitos.length === 1 ? '' : 's'}
          </span>
        )}
        {onVerEnMapa && (
          poligonoCount > 0 ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 ring-1 ring-emerald-200 text-emerald-700 tabular-nums flex items-center gap-0.5" title={`${poligonoCount} polígono(s) en el mapa`}>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1C3.8 1 2 2.8 2 5c0 2.6 4 6 4 6s4-3.4 4-6c0-2.2-1.8-4-4-4z"/><circle cx="6" cy="5" r="1.3"/></svg>
              {poligonoCount}
            </span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 ring-1 ring-amber-200 text-amber-700" title="Esta etapa aún no tiene polígonos en el mapa">
              sin polígono
            </span>
          )
        )}
        <div className="ml-auto flex items-center gap-1">
          {onVerEnMapa && (
            <button
              type="button"
              onClick={() => onVerEnMapa(evento.id)}
              className="text-[11px] px-1.5 py-0.5 rounded text-gray-500 hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1"
              aria-label="Ver esta etapa en el mapa"
              title="Ver esta etapa en el mapa"
            >
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 1C3.8 1 2 2.8 2 5c0 2.6 4 6 4 6s4-3.4 4-6c0-2.2-1.8-4-4-4z"/><circle cx="6" cy="5" r="1.3"/></svg>
              <span className="font-medium">Mapa</span>
            </button>
          )}
          {onSelectFocus && (
            <button
              type="button"
              onClick={onSelectFocus}
              className={`text-[11px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                focused
                  ? 'bg-slate-900 text-white'
                  : 'text-gray-500 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label={focused ? 'Salir del foco' : 'Ver en Gantt con detalle de hitos'}
              title={focused ? 'Salir del foco' : 'Ver desglose en Gantt'}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="5" />
                <circle cx="8" cy="8" r="1.5" fill="currentColor" />
              </svg>
              <span className="font-medium">{focused ? 'En foco' : 'Foco'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="opacity-0 group-hover:opacity-100 text-[11px] text-gray-400 hover:text-red-600 transition-opacity disabled:opacity-30 px-1"
            aria-label="Eliminar evento"
            title="Eliminar"
          >
            ✕
          </button>
        </div>
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
      {!expanded && !isHtmlEmpty(evento.descripcion) && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(true)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(true) } }}
          className="text-xs text-gray-600 mt-1 line-clamp-2 hover:text-gray-900 cursor-pointer"
        >
          <RichTextView html={evento.descripcion} />
        </div>
      )}
      {expanded && (
        <div className="mt-2 space-y-2">
          <RichTextEditor
            value={descripcionDraft}
            onUpdate={setDescripcionDraft}
            disabled={saving}
            placeholder="Descripción del evento…"
            minHeight="min-h-[72px]"
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
          <div className="flex items-center gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setDescripcionDraft(evento.descripcion ?? '')
                setExpanded(false)
              }}
              disabled={saving}
              className="text-[11px] px-2.5 py-1 rounded text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={async () => { await commitDescripcion(); setExpanded(false) }}
              disabled={saving}
              className="text-[11px] px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
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

      {/* Hitos del evento — siempre visibles abajo de la descripción.
          Cada hito es una mini-card con fecha + título; click → editar.
          El form de "agregar hito" valida que las fechas caigan dentro
          del rango del padre con min/max en los inputs date. */}
      <HitosSection
        evento={evento}
        hitos={hitos}
        padreFin={padreFin}
        onPatch={onPatch}
        onDelete={onDelete}
        onAddHito={onAddHito}
      />
    </li>
  )
}

/**
 * Sub-sección de hitos dentro de una card de evento.
 *
 * Maneja: lista de hitos (compactos, edit inline) + form para agregar.
 * Las fechas del form usan min/max derivados del rango del padre para que
 * el usuario no pueda físicamente elegir fechas fuera (el server además
 * re-valida, esto es solo UX).
 */
function HitosSection({
  evento, hitos, padreFin, onPatch, onDelete, onAddHito,
}: {
  evento:    DesalojoPlanificacion
  hitos:     DesalojoPlanificacion[]
  padreFin:  string
  onPatch:   (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:  (id: number) => Promise<void>
  onAddHito: (input: {
    parent_id:    number
    titulo:       string
    descripcion?: string | null
    fecha_inicio: string
    fecha_fin?:   string | null
  }) => Promise<void>
}) {
  const [adding, setAdding] = useState(false)

  return (
    <div className="mt-2 pl-3 border-l-2 border-slate-100">
      {hitos.length > 0 && (
        <ul className="space-y-1">
          {hitos.map(h => (
            <HitoMini
              key={h.id}
              hito={h}
              padreInicio={evento.fecha_inicio}
              padreFin={padreFin}
              onPatch={onPatch}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
      {adding ? (
        <HitoAddForm
          parentId={evento.id}
          padreInicio={evento.fecha_inicio}
          padreFin={padreFin}
          onAdd={async input => { await onAddHito(input); setAdding(false) }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] text-gray-400 hover:text-slate-700 mt-1.5 flex items-center gap-1"
        >
          + agregar hito
        </button>
      )}
    </div>
  )
}

/**
 * Hito individual — vista compact + edit inline.
 *
 * Estado calculado vs hoy (mismo helper que el evento). Click sobre el
 * título o el chip de fecha entra en modo edit. El edit acepta titulo +
 * fechas con min/max al rango del padre.
 */
function HitoMini({
  hito, padreInicio, padreFin, onPatch, onDelete,
}: {
  hito:        DesalojoPlanificacion
  padreInicio: string
  padreFin:    string
  onPatch:     (id: number, patch: Partial<DesalojoPlanificacion>) => Promise<void>
  onDelete:    (id: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [tit, setTit]         = useState(hito.titulo)
  const [ini, setIni]         = useState(hito.fecha_inicio)
  const [fin, setFin]         = useState(hito.fecha_fin ?? '')
  const [isRango, setIsRango] = useState(hito.fecha_fin !== null)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [descDraft, setDescDraft]     = useState(hito.descripcion ?? '')
  const [savingDesc, setSavingDesc]   = useState(false)

  useEffect(() => { setTit(hito.titulo) },                  [hito.titulo])
  useEffect(() => { setIni(hito.fecha_inicio) },            [hito.fecha_inicio])
  useEffect(() => { setFin(hito.fecha_fin ?? '') },         [hito.fecha_fin])
  useEffect(() => { setIsRango(hito.fecha_fin !== null) },  [hito.fecha_fin])
  useEffect(() => { setDescDraft(hito.descripcion ?? '') }, [hito.descripcion])

  const estado = estadoEventoPlanificacion(hito)
  const colors = ESTADO_COLORS[estado]
  const tieneDetalle = !isHtmlEmpty(hito.descripcion)

  async function commitDetalle() {
    const normalized = isHtmlEmpty(descDraft) ? null : descDraft
    if (normalized === (hito.descripcion ?? null)) { setDetalleOpen(false); return }
    setSavingDesc(true)
    try {
      await onPatch(hito.id, { descripcion: normalized })
      setDetalleOpen(false)
    } finally { setSavingDesc(false) }
  }

  async function commit() {
    const finFinal = isRango ? (fin || null) : null
    if (!tit.trim()) { window.alert('Título del hito requerido'); return }
    // Doble check cliente — el server también valida.
    if (ini < padreInicio || ini > padreFin) {
      window.alert(`La fecha debe estar entre ${padreInicio} y ${padreFin}`)
      return
    }
    if (finFinal !== null && (finFinal < padreInicio || finFinal > padreFin)) {
      window.alert(`La fecha de fin debe estar entre ${padreInicio} y ${padreFin}`)
      return
    }
    setSaving(true)
    try {
      await onPatch(hito.id, {
        titulo:       tit.trim(),
        fecha_inicio: ini,
        fecha_fin:    finFinal,
      })
      setEditing(false)
    } finally { setSaving(false) }
  }

  async function handleDeleteHito() {
    if (!window.confirm(`¿Eliminar el hito "${hito.titulo}"?`)) return
    setSaving(true)
    try { await onDelete(hito.id) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <li className="group text-xs">
        <div className="flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
          <span className={`text-[10px] px-1 py-0 rounded ring-1 font-medium tabular-nums flex-shrink-0 ${colors.chip}`}>
            {formatFecha(hito.fecha_inicio, hito.fecha_fin)}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-gray-700 hover:text-slate-900 text-left truncate flex-1 min-w-0"
            title={hito.titulo}
          >
            {hito.titulo}
          </button>
          <button
            type="button"
            onClick={() => setDetalleOpen(o => !o)}
            className={`text-[10px] transition-colors flex-shrink-0 ${
              tieneDetalle ? 'text-slate-600 hover:text-slate-900 font-medium' : 'text-gray-400 hover:text-slate-700 opacity-0 group-hover:opacity-100'
            }`}
            title={tieneDetalle ? 'Ver/editar detalle' : 'Agregar detalle'}
          >
            {tieneDetalle ? '• Detalle' : '+ Detalle'}
          </button>
          <button
            type="button"
            onClick={handleDeleteHito}
            disabled={saving}
            className="opacity-0 group-hover:opacity-100 text-[10px] text-gray-400 hover:text-red-600 transition-opacity flex-shrink-0"
            aria-label="Eliminar hito"
          >
            ✕
          </button>
        </div>
        {detalleOpen && (
          <div className="mt-1.5 ml-3.5 pl-2 border-l-2 border-slate-100 space-y-1.5">
            <RichTextEditor
              value={descDraft}
              onUpdate={setDescDraft}
              placeholder="Detalle del hito…"
              minHeight="min-h-[48px]"
            />
            <div className="flex items-center justify-end gap-1.5">
              <button type="button" onClick={() => { setDescDraft(hito.descripcion ?? ''); setDetalleOpen(false) }} disabled={savingDesc}
                className="text-[10px] px-2 py-0.5 rounded text-gray-600 hover:bg-gray-100">
                Cancelar
              </button>
              <button type="button" onClick={commitDetalle} disabled={savingDesc}
                className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-white hover:bg-slate-900 disabled:opacity-50 font-semibold">
                {savingDesc ? 'Guardando…' : 'Guardar detalle'}
              </button>
            </div>
          </div>
        )}
      </li>
    )
  }

  return (
    <li className="bg-slate-50 border border-slate-200 rounded p-2 space-y-1.5">
      <input
        type="text"
        value={tit}
        onChange={e => setTit(e.target.value)}
        placeholder="Título del hito"
        className="w-full text-xs font-medium px-2 py-1 border border-slate-200 rounded text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] font-semibold text-gray-600">
          Inicio
          <input
            type="date"
            value={ini}
            min={padreInicio}
            max={padreFin}
            onChange={e => setIni(e.target.value)}
            className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded text-gray-800 bg-white mt-0.5"
          />
        </label>
        <label className="text-[10px] font-semibold text-gray-600 flex flex-col">
          <span className="flex items-center gap-1">
            Fin
            <label className="text-[9px] text-gray-500 font-normal flex items-center gap-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isRango}
                onChange={e => { setIsRango(e.target.checked); if (!e.target.checked) setFin('') }}
                className="w-2.5 h-2.5"
              />
              rango
            </label>
          </span>
          <input
            type="date"
            value={fin}
            min={ini || padreInicio}
            max={padreFin}
            onChange={e => setFin(e.target.value)}
            disabled={!isRango}
            className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded text-gray-800 bg-white disabled:bg-gray-50 disabled:opacity-50 mt-0.5"
          />
        </label>
      </div>
      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={() => setEditing(false)} disabled={saving}
          className="text-[10px] px-2 py-0.5 rounded text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
        <button type="button" onClick={commit} disabled={saving}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-white hover:bg-slate-900 disabled:opacity-50 font-semibold">
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </li>
  )
}

/**
 * Form atómico para agregar un hito. Submit con título + fechas dentro del
 * rango del padre. Misma forma que el editor de eventos pero más compacto.
 */
function HitoAddForm({
  parentId, padreInicio, padreFin, onAdd, onCancel,
}: {
  parentId:    number
  padreInicio: string
  padreFin:    string
  onAdd:       (input: { parent_id: number; titulo: string; descripcion?: string | null; fecha_inicio: string; fecha_fin?: string | null }) => Promise<void>
  onCancel:    () => void
}) {
  const [tit,       setTit]      = useState('')
  const [ini,       setIni]      = useState(padreInicio)
  const [isRango,   setIsRango]  = useState(false)
  const [fin,       setFin]      = useState('')
  const [saving,    setSaving]   = useState(false)
  const [err,       setErr]      = useState<string | null>(null)
  const [detalleOpen, setDetalleOpen] = useState(false)
  const [desc,        setDesc]        = useState('')

  async function submit() {
    const t = tit.trim()
    if (!t) { setErr('Título requerido'); return }
    if (ini < padreInicio || ini > padreFin) { setErr(`Fecha fuera del rango del evento (${padreInicio} – ${padreFin})`); return }
    if (isRango && fin && (fin < padreInicio || fin > padreFin)) { setErr(`Fecha de fin fuera del rango del evento`); return }
    setSaving(true)
    setErr(null)
    try {
      await onAdd({ parent_id: parentId, titulo: t, descripcion: isHtmlEmpty(desc) ? null : desc, fecha_inicio: ini, fecha_fin: isRango ? (fin || null) : null })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded p-2 space-y-1.5">
      <input
        type="text"
        value={tit}
        onChange={e => setTit(e.target.value)}
        autoFocus
        placeholder="Título del hito (ej: Acta firmada)"
        className="w-full text-xs font-medium px-2 py-1 border border-slate-200 rounded text-gray-900 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400"
      />
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10px] font-semibold text-gray-600">
          Inicio
          <input
            type="date"
            value={ini}
            min={padreInicio}
            max={padreFin}
            onChange={e => setIni(e.target.value)}
            className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded text-gray-800 bg-white mt-0.5"
          />
        </label>
        <label className="text-[10px] font-semibold text-gray-600 flex flex-col">
          <span className="flex items-center gap-1">
            Fin
            <label className="text-[9px] text-gray-500 font-normal flex items-center gap-0.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isRango}
                onChange={e => { setIsRango(e.target.checked); if (!e.target.checked) setFin('') }}
                className="w-2.5 h-2.5"
              />
              rango
            </label>
          </span>
          <input
            type="date"
            value={fin}
            min={ini || padreInicio}
            max={padreFin}
            onChange={e => setFin(e.target.value)}
            disabled={!isRango}
            className="w-full text-xs px-1.5 py-0.5 border border-slate-200 rounded text-gray-800 bg-white disabled:bg-gray-50 disabled:opacity-50 mt-0.5"
          />
        </label>
      </div>
      {detalleOpen ? (
        <div className="space-y-1">
          <RichTextEditor
            value={desc}
            onUpdate={setDesc}
            placeholder="Detalle del hito…"
            minHeight="min-h-[48px]"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setDetalleOpen(true)}
          className="text-[10px] text-gray-400 hover:text-slate-700">
          + Detalle
        </button>
      )}
      {err && <p className="text-[10px] text-rose-700">{err}</p>}
      <p className="text-[10px] text-gray-500">
        Rango permitido: <span className="tabular-nums">{padreInicio} – {padreFin}</span>
      </p>
      <div className="flex items-center justify-end gap-1.5 pt-0.5">
        <button type="button" onClick={onCancel} disabled={saving}
          className="text-[10px] px-2 py-0.5 rounded text-gray-600 hover:bg-gray-100">
          Cancelar
        </button>
        <button type="button" onClick={submit} disabled={saving || !tit.trim()}
          className="text-[10px] px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold">
          {saving ? 'Creando…' : 'Crear hito'}
        </button>
      </div>
    </div>
  )
}
