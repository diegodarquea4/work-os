'use client'

import { useEffect, useRef, useState } from 'react'
import type {
  DesalojoChecklistEstado,
  DesalojoChecklistItemEstado,
  DesalojoDocumento,
  DesalojoFaseConSemaforo,
  DesalojoTipologia,
} from '@/lib/types'
import { checklistItems, itemDone, type ChecklistItem, type ExtraSpec } from '@/lib/desalojos'

/**
 * Checklist genérico por tipología × fase. Cada item tiene:
 *   - Bool `done` con fecha de cumplimiento.
 *   - Opcionalmente, `extras`: campos estructurados (texto / número / fecha)
 *     y/o documento adjunto (kind: 'doc').
 *
 * Reglas de "completo":
 *   - Sin extras: item completo = bool done.
 *   - Con extras required: item completo = done && todos los extras required
 *     con valor (texto/num/fecha) o con al menos un doc (kind: 'doc').
 *
 * UI: cada item es expandible. Auto-expandido si está marcado o si tiene
 * algún extra con valor. Badge ámbar "incompleto" cuando done pero faltan
 * extras required.
 */

type Props = {
  tipologia:     DesalojoTipologia | null
  fase:          DesalojoFaseConSemaforo
  estado:        DesalojoChecklistEstado
  /** Documentos de esta capa × fase. Se filtran por item_key para cada item. */
  docs?:         DesalojoDocumento[]
  onPatch:       (patch: DesalojoChecklistEstado) => Promise<void>
  /** Subir un doc vinculado a un item del checklist. */
  onUploadDoc?:  (itemKey: string, file: File) => Promise<void>
  onDeleteDoc?:  (docId: number) => Promise<void>
}

export default function DesalojoChecklistFase({
  tipologia, fase, estado, docs = [], onPatch, onUploadDoc, onDeleteDoc,
}: Props) {
  const items = checklistItems(tipologia, fase)

  if (!tipologia) {
    return (
      <div className="text-xs text-gray-500 px-3 py-2 bg-gray-50 rounded">
        Asigna una tipología (A/B/C/D) para ver el checklist específico de esta fase.
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="text-xs text-gray-400 px-3 py-2">
        Sin checklist específico para esta fase.
      </div>
    )
  }

  // Conteo de docs por item.
  const docsByItem: Record<string, DesalojoDocumento[]> = {}
  for (const d of docs) {
    if (d.fase !== fase || !d.item_key) continue
    const arr = docsByItem[d.item_key] ?? []
    arr.push(d)
    docsByItem[d.item_key] = arr
  }

  // Progreso real considerando extras required.
  const completos = items.filter(it => {
    const itemDocs = docsByItem[it.key]?.length ?? 0
    return itemDone(it, estado?.[it.key], itemDocs)
  }).length
  const pct = Math.round((completos / items.length) * 100)

  return (
    <div className="space-y-2">
      {/* Barra de progreso */}
      <div className="flex items-center gap-2 text-xs text-gray-600">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-1.5 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-slate-700'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="tabular-nums font-medium text-gray-700">{completos} / {items.length}</span>
      </div>

      <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
        {items.map(item => (
          <ItemRow
            key={item.key}
            item={item}
            node={estado?.[item.key]}
            docs={docsByItem[item.key] ?? []}
            onPatch={onPatch}
            onUploadDoc={onUploadDoc}
            onDeleteDoc={onDeleteDoc}
          />
        ))}
      </ul>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────

function ItemRow({
  item, node, docs, onPatch, onUploadDoc, onDeleteDoc,
}: {
  item:        ChecklistItem
  node:        DesalojoChecklistItemEstado | undefined
  docs:        DesalojoDocumento[]
  onPatch:     (patch: DesalojoChecklistEstado) => Promise<void>
  onUploadDoc?: (itemKey: string, file: File) => Promise<void>
  onDeleteDoc?: (docId: number) => Promise<void>
}) {
  const done    = !!node?.done
  const extras  = node?.extras ?? {}
  const hasExtras = !!item.extras && item.extras.length > 0
  // Determinar si hay extras required faltantes.
  const completo = itemDone(item, node, docs.length)
  const incompleto = done && !completo

  // Auto-expandir si está marcado o tiene algún valor extra.
  const hasAnyValue = Object.values(extras).some(v => v != null && v !== '')
  const [expanded, setExpanded] = useState<boolean>(done || hasAnyValue || docs.length > 0)
  const [saving, setSaving]     = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function toggleDone() {
    setSaving(true)
    try { await onPatch({ [item.key]: { done: !done, fecha: node?.fecha ?? null } }) }
    finally { setSaving(false) }
    if (!done) setExpanded(true)
  }
  async function changeExtra(extraKey: string, value: string | number | null) {
    setSaving(true)
    try {
      await onPatch({ [item.key]: { done, fecha: node?.fecha ?? null, extras: { [extraKey]: value } } })
    } finally { setSaving(false) }
  }
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !onUploadDoc) return
    e.target.value = ''
    setSaving(true)
    try { await onUploadDoc(item.key, file) }
    finally { setSaving(false) }
  }

  function fmtBytes(n: number | null): string {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <li className="bg-white">
      <div className="px-3 py-2.5 flex items-start gap-3">
        <button
          type="button"
          onClick={toggleDone}
          disabled={saving}
          aria-pressed={done}
          className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center transition-colors disabled:opacity-50 flex-shrink-0 ${
            done
              ? incompleto
                ? 'bg-amber-500 border-amber-500 text-white'
                : 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-gray-300 text-transparent hover:border-slate-400'
          }`}
          title={incompleto ? 'Marcado pero faltan datos obligatorios' : undefined}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M2 6l3 3 5-6"/>
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="flex-1 min-w-0 text-left"
        >
          <p className={`text-sm font-medium leading-snug ${done && !incompleto ? 'text-gray-500 line-through' : 'text-gray-800'}`}>
            {item.label}
            {incompleto && (
              <span className="ml-2 inline-flex items-center text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-1.5 py-0.5">
                faltan datos
              </span>
            )}
          </p>
          {item.descripcion && (
            <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{item.descripcion}</p>
          )}
        </button>
        {hasExtras && (
          <button
            type="button"
            onClick={() => setExpanded(e => !e)}
            className="text-gray-400 hover:text-gray-700 flex-shrink-0 p-1"
            aria-label={expanded ? 'Ocultar campos' : 'Mostrar campos'}
            title={expanded ? 'Ocultar campos' : 'Mostrar campos'}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={`transition-transform ${expanded ? 'rotate-180' : ''}`}>
              <path d="M4 6l4 4 4-4"/>
            </svg>
          </button>
        )}
      </div>

      {hasExtras && expanded && (
        <div className="px-3 pb-3 pl-11 bg-gray-50 border-t border-gray-100 space-y-2">
          {item.extras!.map(extra => (
            <ExtraRow
              key={extra.key}
              extra={extra}
              value={extras[extra.key] ?? null}
              docs={extra.kind === 'doc' ? docs : []}
              saving={saving}
              onChange={(v) => changeExtra(extra.key, v)}
              onUploadClick={extra.kind === 'doc' && onUploadDoc ? () => fileRef.current?.click() : undefined}
              onDeleteDoc={onDeleteDoc}
              fmtBytes={fmtBytes}
            />
          ))}
          {onUploadDoc && (
            <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
          )}
        </div>
      )}
    </li>
  )
}

// ────────────────────────────────────────────────────────────────────────

function ExtraRow({
  extra, value, docs, saving, onChange, onUploadClick, onDeleteDoc, fmtBytes,
}: {
  extra:         ExtraSpec
  value:         string | number | null
  docs:          DesalojoDocumento[]
  saving:        boolean
  onChange:      (v: string | number | null) => void
  onUploadClick?: () => void
  onDeleteDoc?:  (docId: number) => Promise<void>
  fmtBytes:      (n: number | null) => string
}) {
  const labelEl = (
    <label className="text-[11px] font-semibold text-gray-600">
      {extra.label}
      {extra.required && <span className="text-rose-500 ml-0.5" title="Obligatorio">*</span>}
    </label>
  )

  if (extra.kind === 'doc') {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          {labelEl}
          {onUploadClick && (
            <button
              type="button"
              onClick={onUploadClick}
              disabled={saving}
              className="text-[11px] px-2 py-0.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-medium"
            >
              + Subir
            </button>
          )}
        </div>
        {extra.hint && (
          <p className="text-[10px] text-gray-500 leading-tight">{extra.hint}</p>
        )}
        {docs.length === 0 ? (
          <p className="text-[11px] text-gray-400 italic">Sin documento adjunto.</p>
        ) : (
          <ul className="space-y-1">
            {docs.map(d => (
              <li key={d.id} className="flex items-center gap-2 px-2 py-1 bg-white border border-gray-200 rounded text-[11px]">
                {d.url ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-slate-700 hover:text-slate-900 truncate" title={d.nombre}>
                    {d.nombre}
                  </a>
                ) : (
                  <span className="flex-1 min-w-0 text-slate-600 truncate" title={`${d.nombre} (descarga solo para administradores)`}>
                    {d.nombre}
                  </span>
                )}
                {d.tamano_bytes && <span className="text-gray-400 flex-shrink-0">{fmtBytes(d.tamano_bytes)}</span>}
                {onDeleteDoc && (
                  <button onClick={() => onDeleteDoc(d.id)} className="text-gray-400 hover:text-red-600 flex-shrink-0 text-sm leading-none px-1" title="Eliminar" aria-label="Eliminar documento">×</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Texto / número / fecha: draft local + commit on Enter o blur. Cada keystroke
  // ya no dispara un PATCH al server (era un bug de performance: tipear "12710"
  // ejecutaba 5 escrituras y 5 re-renders del modal completo).
  return (
    <ExtraInputDraft
      extra={extra}
      value={value}
      labelEl={labelEl}
      saving={saving}
      onCommit={onChange}
    />
  )
}

function ExtraInputDraft({
  extra, value, labelEl, saving, onCommit,
}: {
  extra:    ExtraSpec
  value:    string | number | null
  labelEl:  React.ReactNode
  saving:   boolean
  onCommit: (v: string | number | null) => void
}) {
  // El draft refleja el valor persistido cuando llega desde el server, pero
  // entre commits es el usuario quien manda. Re-sincronizamos cuando `value`
  // cambia desde afuera (otro usuario, refetch, etc.).
  const valueStr = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState<string>(valueStr)
  useEffect(() => { setDraft(valueStr) }, [valueStr])

  function commit() {
    if (draft === valueStr) return
    if (extra.kind === 'num') {
      onCommit(draft === '' ? null : Number(draft))
      return
    }
    onCommit(draft === '' ? null : draft)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      setDraft(valueStr)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const dirty = draft !== valueStr

  if (extra.kind === 'num') {
    return (
      <div className="space-y-0.5">
        {labelEl}
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={onKeyDown}
            disabled={saving}
            className={`flex-1 text-sm px-2 py-1 border rounded text-gray-800 disabled:opacity-50 ${
              dirty ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
            }`}
          />
          {extra.unit && <span className="text-[11px] text-gray-500">{extra.unit}</span>}
        </div>
        {dirty && <p className="text-[10px] text-amber-700">Enter o salir del campo para guardar.</p>}
      </div>
    )
  }

  if (extra.kind === 'fecha') {
    return (
      <div className="space-y-0.5">
        {labelEl}
        <input
          type="date"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={onKeyDown}
          disabled={saving}
          className={`text-sm px-2 py-1 border rounded text-gray-800 disabled:opacity-50 ${
            dirty ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
          }`}
        />
        {dirty && <p className="text-[10px] text-amber-700">Enter o salir del campo para guardar.</p>}
      </div>
    )
  }

  // texto
  const placeholder = extra.kind === 'texto' ? extra.placeholder : undefined
  return (
    <div className="space-y-0.5">
      {labelEl}
      <input
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
        disabled={saving}
        placeholder={placeholder}
        className={`w-full text-sm px-2 py-1 border rounded text-gray-800 placeholder:text-gray-400 disabled:opacity-50 ${
          dirty ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'
        }`}
      />
      {dirty && <p className="text-[10px] text-amber-700">Enter o salir del campo para guardar.</p>}
    </div>
  )
}
