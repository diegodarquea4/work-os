'use client'

import { useRef, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoChecklistEstado,
  DesalojoDimension,
  DesalojoDocumento,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoSeguimiento,
  DesalojoSeguimientoTipo,
  SemaforoDimension,
} from '@/lib/types'
import { FASE_CFG, checklistProgreso } from '@/lib/desalojos'
import { formatResponsableDisplay } from '@/lib/responsable'
import DesalojoChecklistFase from './DesalojoChecklistFase'
import DesalojoMatrizJuridica from './DesalojoMatrizJuridica'
import DesalojoProtocoloFinanciamiento from './DesalojoProtocoloFinanciamiento'
import RichTextEditor from './RichTextEditorLazy'
import { RichTextView, isHtmlEmpty } from './RichTextView'

/**
 * Card de una fase. Es la pieza central del tab Avance v3 — reemplaza al
 * DesalojoDimensionSection del v2. Cada fase tiene:
 *
 *   - Header: sigla + label + descripción + chips de semáforo + progreso checklist.
 *   - Checklist específico (tipología × fase) con barra de progreso.
 *   - Campos estructurados de la capa que aplican a esta fase (edit inline).
 *   - Documentos de la fase (filtrados por dimensión equivalente).
 *   - Timeline de seguimientos de la fase (filtrados por dimensión equivalente).
 *   - Notas libres por fase (en desalojo_fase_estado.notas).
 *
 * Las dimensiones (jurídico/seguridad/social/financiamiento) se mapean a fases
 * para compatibilidad con seguimientos y documentos v2: PR↔jurídico,
 * F1↔seguridad, F2↔social, F3↔seguridad, F4↔financiamiento, F5↔social.
 */

// Mapeo fase → dimensión para filtrar seguimientos y documentos del v2.
const FASE_TO_DIMENSION: Record<DesalojoFaseConSemaforo, DesalojoDimension> = {
  pr: 'juridico',
  f1: 'seguridad',
  f2: 'social',
  f3: 'seguridad',
  f4: 'financiamiento',
  f5: 'social',
}

// Campos estructurados que aplican a cada fase. Si una capa los tiene llenos,
// se muestran en su fase correspondiente y se editan inline.
type FieldType = 'text' | 'textarea' | 'date' | 'int' | 'num' | 'bool'
type FieldCfg = { key: keyof DesalojoCapa; label: string; type: FieldType; hint?: string }

const FASE_FIELDS: Record<DesalojoFaseConSemaforo, FieldCfg[]> = {
  pr: [
    { key: 'instrumento',       label: 'Instrumento habilitante', type: 'text' },
    { key: 'fecha_instrumento', label: 'Fecha del instrumento',   type: 'date' },
    { key: 'via_juridica',      label: 'Vía jurídica',            type: 'text' },
    { key: 'notas_juridico',    label: 'Notas jurídicas',         type: 'textarea' },
  ],
  f1: [
    { key: 'plan_operativo_listo',      label: 'Plan operativo Carabineros listo', type: 'bool' },
    { key: 'contingente',               label: 'Contingente',                       type: 'text' },
    { key: 'fecha_tentativa_operativo', label: 'Fecha tentativa de operativo',      type: 'date' },
    { key: 'notas_seguridad',           label: 'Notas de seguridad',                type: 'textarea' },
  ],
  f2: [
    { key: 'albergue_validado', label: 'Albergue validado', type: 'bool',
      hint: 'Con NNA, no se fija fecha sin oferta validada (Ley 21.430).' },
    { key: 'notas_social',      label: 'Notas sociales',    type: 'textarea' },
  ],
  f3: [
    { key: 'fecha_tentativa_operativo', label: 'Fecha de operativo', type: 'date' },
    { key: 'sitios_total',              label: 'Sitios total',       type: 'int' },
    { key: 'sitios_desocupados',        label: 'Sitios desocupados', type: 'int' },
  ],
  f4: [
    { key: 'costo_demolicion_mm',      label: 'Costo demolición (MM$)', type: 'num' },
    { key: 'fuente',                   label: 'Fuente de financiamiento', type: 'text' },
    { key: 'financiamiento_asegurado', label: 'Recursos confirmados',     type: 'bool',
      hint: 'Regla de la Mesa: sin recursos confirmados no se autoriza el operativo.' },
    { key: 'notas_financiamiento',     label: 'Notas de financiamiento',  type: 'textarea' },
  ],
  f5: [],
}

const SEMAFORO_OPTS: { value: SemaforoDimension; label: string; dot: string; chipActive: string }[] = [
  { value: 'verde', label: 'En verde',    dot: 'bg-green-500', chipActive: 'bg-green-100 text-green-700 ring-green-300' },
  { value: 'ambar', label: 'En revisión', dot: 'bg-amber-400', chipActive: 'bg-amber-100 text-amber-700 ring-amber-300' },
  { value: 'rojo',  label: 'Bloqueado',   dot: 'bg-red-500',   chipActive: 'bg-red-100   text-red-700   ring-red-300'   },
  { value: 'gris',  label: 'Sin evaluar', dot: 'bg-gray-300',  chipActive: 'bg-gray-200  text-gray-700  ring-gray-400'  },
]

const TIPO_OPTS: { value: DesalojoSeguimientoTipo; label: string; cls: string }[] = [
  { value: 'avance',  label: 'Avance',  cls: 'bg-blue-50   text-blue-700  ring-blue-200'  },
  { value: 'reunion', label: 'Reunión', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
  { value: 'hito',    label: 'Hito',    cls: 'bg-green-50  text-green-700 ring-green-200' },
  { value: 'alerta',  label: 'Alerta',  cls: 'bg-red-50    text-red-700   ring-red-200'   },
]

type Props = {
  capa:              DesalojoCapa
  fase:              DesalojoFaseConSemaforo
  estado:            DesalojoFaseEstado
  seguimientos:      DesalojoSeguimiento[]    // ya filtrados a esta capa
  documentos:        DesalojoDocumento[]      // ya filtrados a esta capa
  onPatchCapa:       (patch: Partial<DesalojoCapa>) => Promise<void>
  onPatchFase:       (patch: { semaforo?: SemaforoDimension; notas?: string | null; checklist_patch?: DesalojoChecklistEstado }) => Promise<void>
  onAddSeguimiento:  (dimension: DesalojoDimension, tipo: DesalojoSeguimientoTipo, descripcion: string) => Promise<void>
  onUploadDoc:       (dimension: DesalojoDimension, file: File) => Promise<void>
  /** Subir un doc vinculado a un item del checklist de esta fase. */
  onUploadDocItem?:  (itemKey: string, file: File) => Promise<void>
  onDeleteDoc:       (docId: number) => Promise<void>
  open?:             boolean
  onToggleOpen?:     () => void
  /** Modo compacto para layout horizontal: oculta descripción del header,
      padding más chico, sigla más pequeña. */
  compact?:          boolean
}

export default function DesalojoFaseCard({
  capa, fase, estado, seguimientos, documentos,
  onPatchCapa, onPatchFase, onAddSeguimiento, onUploadDoc, onUploadDocItem, onDeleteDoc,
  open = true, onToggleOpen, compact = false,
}: Props) {
  const cfg            = FASE_CFG[fase]
  const fields         = FASE_FIELDS[fase]
  const dimEquiv       = FASE_TO_DIMENSION[fase]
  const semValue       = estado.semaforo
  // Docs vinculados a items del checklist de esta fase (item_key NOT NULL).
  const docsItems      = documentos.filter(d => d.fase === fase && d.item_key)
  // Conteo por item para que el progreso honre los extras DOC required.
  const docsCountByItem: Record<string, number> = {}
  for (const d of docsItems) if (d.item_key) docsCountByItem[d.item_key] = (docsCountByItem[d.item_key] ?? 0) + 1
  const { completos, total } = checklistProgreso(capa.tipologia, fase, estado.checklist_estado, docsCountByItem)

  const segFase  = seguimientos.filter(s => s.dimension === dimEquiv)
  const docsFase = documentos.filter(d => d.dimension === dimEquiv)

  const [editingField, setEditingField] = useState<string | null>(null)
  const [draftValue, setDraftValue]     = useState<string>('')
  const [saving, setSaving]             = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [formTipo, setFormTipo]         = useState<DesalojoSeguimientoTipo>('avance')
  const [formDesc, setFormDesc]         = useState('')
  const [savingForm, setSavingForm]     = useState(false)
  const [editingNotas, setEditingNotas] = useState(false)
  const [notasDraft, setNotasDraft]     = useState(estado.notas ?? '')
  const [savingNotas, setSavingNotas]   = useState(false)
  const [uploading, setUploading]       = useState(false)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  async function handleSemaforo(next: SemaforoDimension) {
    if (next === semValue) return
    setSaving(true)
    try { await onPatchFase({ semaforo: next }) }
    finally { setSaving(false) }
  }

  function startEdit(field: FieldCfg) {
    const current = capa[field.key]
    setEditingField(String(field.key))
    if (field.type === 'bool') {
      setDraftValue(current === true ? 'true' : 'false')
    } else if (current === null || current === undefined) {
      setDraftValue('')
    } else {
      setDraftValue(String(current))
    }
  }

  async function commitEdit(field: FieldCfg) {
    const current = capa[field.key]
    let parsed: string | number | boolean | null = null

    if (draftValue === '' && field.type !== 'bool') {
      parsed = null
    } else if (field.type === 'bool') {
      parsed = draftValue === 'true'
    } else if (field.type === 'int') {
      const n = parseInt(draftValue, 10)
      if (!Number.isFinite(n) || n < 0) { window.alert('Valor debe ser entero ≥ 0'); return }
      parsed = n
    } else if (field.type === 'num') {
      const n = parseFloat(draftValue.replace(',', '.'))
      if (!Number.isFinite(n) || n < 0) { window.alert('Valor debe ser número ≥ 0'); return }
      parsed = n
    } else if (field.type === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draftValue)) { window.alert('Formato de fecha inválido (YYYY-MM-DD)'); return }
      parsed = draftValue
    } else if (field.type === 'textarea') {
      // textarea ahora es rich text — draftValue es HTML. isHtmlEmpty filtra
      // '<p></p>' (Tiptap empty) y whitespace-only.
      parsed = isHtmlEmpty(draftValue) ? null : draftValue
    } else {
      parsed = draftValue.trim() || null
    }

    if (parsed === current) { setEditingField(null); return }
    setSaving(true)
    try {
      await onPatchCapa({ [field.key]: parsed } as Partial<DesalojoCapa>)
      setEditingField(null)
    } finally {
      setSaving(false)
    }
  }

  function renderFieldValue(field: FieldCfg): React.ReactNode {
    const v = capa[field.key]
    if (v === null || v === undefined || v === '') return '—'
    if (field.type === 'bool') return v ? 'Sí' : 'No'
    if (field.type === 'date' && typeof v === 'string') {
      const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
      return m ? `${m[3]}-${m[2]}-${m[1]}` : String(v)
    }
    if (field.type === 'num' && typeof v === 'number') return `${v.toLocaleString('es-CL')} MM$`
    if (field.type === 'textarea' && typeof v === 'string') {
      return isHtmlEmpty(v) ? '—' : <RichTextView html={v} />
    }
    return String(v)
  }

  async function handleSubmitSeguimiento(e: React.FormEvent) {
    e.preventDefault()
    if (isHtmlEmpty(formDesc)) return
    setSavingForm(true)
    try {
      await onAddSeguimiento(dimEquiv, formTipo, formDesc)
      setFormDesc('')
      setFormTipo('avance')
      setShowForm(false)
    } finally { setSavingForm(false) }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try { await onUploadDoc(dimEquiv, file) }
    finally { setUploading(false) }
  }

  async function commitNotas() {
    const valor = isHtmlEmpty(notasDraft) ? null : notasDraft
    if (valor === (estado.notas ?? null)) { setEditingNotas(false); return }
    setSavingNotas(true)
    try {
      await onPatchFase({ notas: valor })
      setEditingNotas(false)
    } finally { setSavingNotas(false) }
  }

  function fmtBytes(n: number | null): string {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  // Aviso especial F4: sin financiamiento asegurado, banner inline.
  const sinFinanciamientoWarning = fase === 'f4' && capa.financiamiento_asegurado === false

  return (
    <section className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <header
        onClick={onToggleOpen}
        className={`flex items-center gap-2.5 ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${onToggleOpen ? 'cursor-pointer hover:bg-gray-50' : ''} border-b border-gray-100`}
      >
        <span className={`${compact ? 'w-8 h-8 text-[10px]' : 'w-10 h-10 text-xs'} rounded-full bg-slate-900 text-white font-bold flex items-center justify-center flex-shrink-0`}>
          {cfg.short}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className={`${compact ? 'text-xs' : 'text-sm'} font-bold text-gray-900 leading-tight`} title={cfg.descripcion}>{cfg.label}</h3>
          {!compact && (
            <p className="text-xs text-gray-500 mt-0.5 leading-tight">{cfg.descripcion}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
          {total > 0 && (
            <span className="text-[10px] text-gray-500 tabular-nums bg-gray-50 px-1.5 py-0.5 rounded">
              {completos}/{total}
            </span>
          )}
          {SEMAFORO_OPTS.map(opt => {
            const active = opt.value === semValue
            return (
              <button
                key={opt.value}
                onClick={() => handleSemaforo(opt.value)}
                disabled={saving}
                title={opt.label}
                aria-label={opt.label}
                aria-pressed={active}
                className={`w-5 h-5 rounded-full transition-all flex items-center justify-center disabled:opacity-50 ${
                  active
                    ? `${opt.dot} ring-2 ring-offset-1 ring-gray-700 scale-110`
                    : `${opt.dot} opacity-30 hover:opacity-70`
                }`}
              />
            )
          })}
        </div>
        {onToggleOpen && (
          <svg
            width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          >
            <path d="M4 6l4 4 4-4"/>
          </svg>
        )}
      </header>

      {open && (
        <div className="px-4 py-3 space-y-4">

          {/* Aviso de financiamiento en F4 */}
          {sinFinanciamientoWarning && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              <p className="font-bold">Sin financiamiento asegurado</p>
              <p className="leading-snug mt-0.5">Regla de la Mesa, sin excepción. Marca &quot;Recursos confirmados&quot; abajo cuando se valide.</p>
            </div>
          )}

          {/* Tipo C: progreso de sitios desocupados (en F3) */}
          {fase === 'f3' && capa.tipologia === 'C' && capa.sitios_total != null && capa.sitios_total > 0 && (() => {
            const desoc = capa.sitios_desocupados ?? 0
            const total = capa.sitios_total ?? 0
            const pct   = Math.min(100, Math.round((desoc / total) * 100))
            return (
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-violet-700">Desocupación gradual (Tipo C)</span>
                  <span className="text-violet-700 tabular-nums">{desoc} / {total} sitios · {pct}%</span>
                </div>
                <div className="bg-violet-100 rounded-full h-1.5">
                  <div className="bg-violet-600 h-1.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })()}

          {/* PR: matriz jurídica como referencia */}
          {fase === 'pr' && <DesalojoMatrizJuridica tipologia={capa.tipologia} />}

          {/* F4: protocolo de aseguramiento de financiamiento como árbol de decisión */}
          {fase === 'f4' && <DesalojoProtocoloFinanciamiento capa={capa} />}

          {/* Checklist */}
          <DesalojoChecklistFase
            tipologia={capa.tipologia}
            fase={fase}
            estado={estado.checklist_estado}
            docs={docsItems}
            onPatch={async patch => { await onPatchFase({ checklist_patch: patch }) }}
            onUploadDoc={onUploadDocItem ? async (itemKey, file) => { await onUploadDocItem(itemKey, file) } : undefined}
            onDeleteDoc={onDeleteDoc}
          />

          {/* Campos estructurados de la fase */}
          {fields.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                Datos de esta fase
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {fields.map(field => {
                  const isEditing = editingField === String(field.key)
                  return (
                    <div key={String(field.key)} className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">{field.label}</label>
                      {isEditing ? (
                        <div className="flex items-start gap-2">
                          {field.type === 'textarea' ? (
                            <div className="flex-1 min-w-0">
                              <RichTextEditor
                                value={draftValue}
                                onUpdate={setDraftValue}
                                autofocus
                                disabled={saving}
                                minHeight="min-h-[80px]"
                              />
                            </div>
                          ) : field.type === 'bool' ? (
                            <select
                              autoFocus
                              value={draftValue}
                              onChange={e => setDraftValue(e.target.value)}
                              className="flex-1 text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
                            >
                              <option value="false">No</option>
                              <option value="true">Sí</option>
                            </select>
                          ) : (
                            <input
                              autoFocus
                              type={field.type === 'date' ? 'date' : field.type === 'int' || field.type === 'num' ? 'number' : 'text'}
                              value={draftValue}
                              onChange={e => setDraftValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter')  { e.preventDefault(); commitEdit(field) }
                                if (e.key === 'Escape') { setEditingField(null) }
                              }}
                              className="flex-1 text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                            />
                          )}
                          <button onClick={() => commitEdit(field)} disabled={saving}
                            className="text-xs px-2 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 font-medium">
                            Guardar
                          </button>
                          <button onClick={() => setEditingField(null)} disabled={saving}
                            className="text-xs px-2 py-1.5 rounded text-gray-500 hover:bg-gray-100">
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(field)}
                          className="w-full text-left text-sm text-gray-800 px-2.5 py-1.5 rounded border border-transparent hover:border-gray-200 hover:bg-gray-50 min-h-[36px]"
                        >
                          {renderFieldValue(field)}
                        </button>
                      )}
                      {field.hint && (
                        <p className="text-[11px] text-gray-400 leading-tight">{field.hint}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notas de la fase */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Notas de la fase</h4>
              {!editingNotas && (
                <button
                  type="button"
                  onClick={() => { setNotasDraft(estado.notas ?? ''); setEditingNotas(true) }}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  Editar
                </button>
              )}
            </div>
            {editingNotas ? (
              <div className="space-y-2">
                <RichTextEditor
                  value={notasDraft}
                  onUpdate={setNotasDraft}
                  autofocus
                  disabled={savingNotas}
                  minHeight="min-h-[80px]"
                />
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingNotas(false)} disabled={savingNotas}
                    className="text-xs px-3 py-1.5 rounded text-gray-500 hover:bg-gray-100">
                    Cancelar
                  </button>
                  <button onClick={commitNotas} disabled={savingNotas}
                    className="text-xs px-3 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 font-semibold">
                    {savingNotas ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ) : (
              isHtmlEmpty(estado.notas) ? (
                <span className="text-gray-400 italic text-xs">Sin notas en esta fase.</span>
              ) : (
                <RichTextView html={estado.notas ?? null} className="text-xs text-gray-700" />
              )
            )}
          </div>

          {/* Documentos */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                Documentos {docsFase.length > 0 && <span className="text-gray-400 normal-case font-normal">({docsFase.length})</span>}
              </h4>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1 disabled:opacity-50"
              >
                {uploading ? 'Subiendo…' : '+ Subir'}
              </button>
            </div>
            {docsFase.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-2">Sin documentos en esta fase.</p>
            ) : (
              <ul className="space-y-1">
                {docsFase.map(d => (
                  <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded text-xs">
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-slate-700 hover:text-slate-900 truncate" title={d.nombre}>
                      {d.nombre}
                    </a>
                    {d.tamano_bytes && <span className="text-gray-400 flex-shrink-0">{fmtBytes(d.tamano_bytes)}</span>}
                    <button
                      onClick={() => onDeleteDoc(d.id)}
                      className="text-gray-400 hover:text-red-600 flex-shrink-0 text-base leading-none px-1"
                      title="Eliminar"
                      aria-label="Eliminar documento"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Timeline */}
          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Seguimientos</h4>
              {!showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="text-xs text-slate-600 hover:text-slate-900 font-medium"
                >
                  + Agregar
                </button>
              )}
            </div>
            {showForm && (
              <form onSubmit={handleSubmitSeguimiento} className="mb-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {TIPO_OPTS.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setFormTipo(t.value)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ring-1 transition-colors ${
                        formTipo === t.value ? t.cls : 'bg-white text-gray-500 ring-gray-200 hover:ring-gray-300'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <RichTextEditor
                  value={formDesc}
                  onUpdate={setFormDesc}
                  placeholder="Describe el seguimiento..."
                  disabled={savingForm}
                  minHeight="min-h-[64px]"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setShowForm(false); setFormDesc('') }} disabled={savingForm}
                    className="text-xs px-3 py-1.5 rounded bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 font-medium">
                    Cancelar
                  </button>
                  <button type="submit" disabled={savingForm || isHtmlEmpty(formDesc)}
                    className="text-xs px-3 py-1.5 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50 font-semibold">
                    {savingForm ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            )}
            {segFase.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Sin seguimientos en esta fase.</p>
            ) : (
              <ul className="space-y-2">
                {segFase.map(s => {
                  const tipoOpt = TIPO_OPTS.find(t => t.value === s.tipo)
                  const fecha = s.created_at.slice(0, 10).split('-').reverse().join('-')
                  return (
                    <li key={s.id} className="flex items-start gap-2 px-2.5 py-2 bg-gray-50 rounded">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ring-1 flex-shrink-0 ${tipoOpt?.cls ?? 'bg-gray-100 text-gray-600 ring-gray-200'}`}>
                        {tipoOpt?.label ?? s.tipo}
                      </span>
                      <div className="flex-1 min-w-0">
                        <RichTextView html={s.descripcion ?? null} className="text-xs text-gray-800" />
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {fecha}
                          {s.created_by && <> · {formatResponsableDisplay(s.created_by)}</>}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

        </div>
      )}
    </section>
  )
}
