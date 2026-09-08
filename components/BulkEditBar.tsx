'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Iniciativa, Capa } from '@/lib/projects'
import { SEMAFORO_CONFIG, type SemaforoKey } from '@/lib/config'
import { VALID_ETAPA } from '@/lib/enums'

/**
 * Barra de edición masiva del Dashboard. Aparece cuando hay iniciativas
 * seleccionadas. El usuario elige un CAMPO y un VALOR y lo aplica a todas de una
 * vez. Los campos definicionales (Etapa, Capa, Etiquetas) solo se ofrecen a
 * admin/editor (`canEditAny`) — mismo gate que la edición de tags uno-a-uno en
 * ProjectTrackerModal.tsx; Estado / En foco / Responsable son operativos
 * (también regional). El backstop real por rol/columna vive en el trigger de RLS.
 *
 * La barra NO escribe: construye los argumentos + etiquetas legibles y, tras la
 * confirmación (irreversible), llama `onApply`. El padre hace la escritura y
 * controla `applying` (spinner) y el limpiado de la selección.
 */

type BulkField = 'estado_semaforo' | 'en_foco' | 'responsable' | 'etapa_actual' | 'capa' | 'tags'

const FIELDS: { value: BulkField; label: string; definitional: boolean }[] = [
  { value: 'estado_semaforo', label: 'Estado',       definitional: false },
  { value: 'en_foco',         label: 'En foco',      definitional: false },
  { value: 'responsable',     label: 'Responsable',  definitional: false },
  { value: 'etapa_actual',    label: 'Etapa actual', definitional: true  },
  { value: 'capa',            label: 'Capa',         definitional: true  },
  { value: 'tags',            label: 'Etiquetas (agregar)', definitional: true },
]

const SEM_KEYS: SemaforoKey[] = ['verde', 'ambar', 'rojo', 'gris']
const CAPA_OPTS: { value: Capa; label: string }[] = [
  { value: 'l',   label: 'Capa I'   },
  { value: 'll',  label: 'Capa II'  },
  { value: 'lll', label: 'Capa III' },
]

// `tags` es aditivo (union con lo que ya tenía cada fila) — no cabe en un
// patch plano igual para todas, así que se distingue con `kind`.
export type BulkApplyArgs =
  | { kind: 'patch'; patch: Partial<Iniciativa>; campoLabel: string; valorLabel: string }
  | { kind: 'addTags'; tags: string[]; campoLabel: string; valorLabel: string }

type Props = {
  count: number
  /** admin/editor → habilita los campos definicionales (Etapa, Capa). */
  canEditAny: boolean
  applying: boolean
  onApply: (args: BulkApplyArgs) => void
  onClear: () => void
}

export default function BulkEditBar({ count, canEditAny, applying, onApply, onClear }: Props) {
  const fields = useMemo(() => FIELDS.filter(f => canEditAny || !f.definitional), [canEditAny])

  const [field, setField]   = useState<BulkField>(fields[0].value)
  const [semVal, setSemVal] = useState<SemaforoKey>('verde')
  const [focoVal, setFocoVal] = useState<boolean>(true)
  const [respVal, setRespVal] = useState<string>('')
  const [etapaVal, setEtapaVal] = useState<string>(VALID_ETAPA[0])
  const [capaVal, setCapaVal]   = useState<Capa>('l')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Etiquetas a agregar (multi-chip) + universo existente para autocompletar
  // — mismo dato que ProjectTrackerModal.tsx (/api/tags), cargado una vez.
  const [tagsVal, setTagsVal]     = useState<string[]>([])
  const [tagDraft, setTagDraft]   = useState('')
  const [tagsOpen, setTagsOpen]   = useState(false)
  const [universoEtiquetas, setUniversoEtiquetas] = useState<string[]>([])
  useEffect(() => {
    fetch('/api/tags').then(r => r.ok ? r.json() : []).then(setUniversoEtiquetas).catch(() => {})
  }, [])

  function addTagVal(t: string) {
    const v = t.trim()
    if (!v || tagsVal.includes(v)) { setTagDraft(''); return }
    setTagsVal(prev => [...prev, v])
    setTagDraft('')
  }

  // Responsable exige un valor: vaciarlo en masa borraría el responsable de N
  // filas por accidente. Etiquetas exige al menos una. El resto siempre tiene
  // un valor válido seleccionado.
  const canApply =
    field === 'responsable' ? respVal.trim().length > 0 :
    field === 'tags'        ? tagsVal.length > 0 :
    true

  function build(): BulkApplyArgs {
    switch (field) {
      case 'estado_semaforo':
        return { kind: 'patch', patch: { estado_semaforo: semVal }, campoLabel: 'Estado', valorLabel: SEMAFORO_CONFIG[semVal].label }
      case 'en_foco':
        return { kind: 'patch', patch: { en_foco: focoVal }, campoLabel: 'En foco', valorLabel: focoVal ? 'En foco' : 'Sin foco' }
      case 'responsable':
        return { kind: 'patch', patch: { responsable: respVal.trim() }, campoLabel: 'Responsable', valorLabel: respVal.trim() }
      case 'etapa_actual':
        return { kind: 'patch', patch: { etapa_actual: etapaVal }, campoLabel: 'Etapa actual', valorLabel: etapaVal }
      case 'capa':
        return { kind: 'patch', patch: { capa: capaVal }, campoLabel: 'Capa', valorLabel: CAPA_OPTS.find(c => c.value === capaVal)!.label }
      case 'tags':
        return { kind: 'addTags', tags: tagsVal, campoLabel: 'Etiquetas', valorLabel: tagsVal.join(', ') }
    }
  }

  const pending = build()

  return (
    <div className="flex-shrink-0 border-t border-violet-200 bg-violet-50/70 px-6 py-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-violet-900 tabular-nums whitespace-nowrap">
          {count} {count === 1 ? 'iniciativa seleccionada' : 'iniciativas seleccionadas'}
        </span>

        <span className="text-violet-300">·</span>

        {/* Campo */}
        <label className="flex items-center gap-1.5 text-xs text-violet-900">
          <span className="text-violet-500">Cambiar</span>
          <select
            value={field}
            onChange={e => setField(e.target.value as BulkField)}
            className="bg-white border border-violet-200 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {fields.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <span className="text-violet-500">a</span>
        </label>

        {/* Valor — depende del campo */}
        {field === 'estado_semaforo' && (
          <select
            value={semVal}
            onChange={e => setSemVal(e.target.value as SemaforoKey)}
            className="bg-white border border-violet-200 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {SEM_KEYS.map(k => <option key={k} value={k}>{SEMAFORO_CONFIG[k].label}</option>)}
          </select>
        )}

        {field === 'en_foco' && (
          <div className="inline-flex rounded-md border border-violet-200 overflow-hidden">
            <button
              onClick={() => setFocoVal(true)}
              className={`px-2.5 py-1 text-sm ${focoVal ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
            >
              Poner en foco
            </button>
            <button
              onClick={() => setFocoVal(false)}
              className={`px-2.5 py-1 text-sm border-l border-violet-200 ${!focoVal ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
            >
              Quitar de foco
            </button>
          </div>
        )}

        {field === 'responsable' && (
          <input
            type="text"
            value={respVal}
            onChange={e => setRespVal(e.target.value)}
            placeholder="Nombre del responsable"
            className="bg-white border border-violet-200 rounded-md px-2 py-1 text-sm text-slate-800 w-56 focus:outline-none focus:ring-2 focus:ring-violet-300"
          />
        )}

        {field === 'etapa_actual' && (
          <select
            value={etapaVal}
            onChange={e => setEtapaVal(e.target.value)}
            className="bg-white border border-violet-200 rounded-md px-2 py-1 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            {VALID_ETAPA.map(et => <option key={et} value={et}>{et}</option>)}
          </select>
        )}

        {field === 'capa' && (
          <div className="inline-flex rounded-md border border-violet-200 overflow-hidden">
            {CAPA_OPTS.map((c, i) => (
              <button
                key={c.value}
                onClick={() => setCapaVal(c.value)}
                className={`px-2.5 py-1 text-sm ${i > 0 ? 'border-l border-violet-200' : ''} ${capaVal === c.value ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-violet-50'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}

        {field === 'tags' && (
          <div className="relative">
            <div className="flex items-center gap-1 flex-wrap bg-white border border-violet-200 rounded-md px-1.5 py-1 min-w-[220px]">
              {tagsVal.map(t => (
                <span key={t} className="inline-flex items-center gap-1 text-xs bg-violet-100 text-violet-800 rounded px-1.5 py-0.5">
                  {t}
                  <button onClick={() => setTagsVal(prev => prev.filter(x => x !== t))} className="text-violet-500 hover:text-violet-800">✕</button>
                </span>
              ))}
              <input
                type="text"
                value={tagDraft}
                onChange={e => { setTagDraft(e.target.value); setTagsOpen(true) }}
                onFocus={() => setTagsOpen(true)}
                onBlur={() => setTimeout(() => setTagsOpen(false), 150)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); addTagVal(tagDraft) }
                  else if (e.key === 'Backspace' && tagDraft === '' && tagsVal.length > 0) setTagsVal(prev => prev.slice(0, -1))
                }}
                placeholder={tagsVal.length === 0 ? 'Nueva etiqueta…' : 'Agregar otra…'}
                className="flex-1 min-w-[100px] text-sm text-slate-800 focus:outline-none py-0.5"
              />
            </div>
            {tagsOpen && (() => {
              const q = tagDraft.trim().toLowerCase()
              const matches = universoEtiquetas.filter(t => !tagsVal.includes(t) && (!q || t.toLowerCase().includes(q))).slice(0, 8)
              if (matches.length === 0) return null
              return (
                <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {matches.map(t => (
                    <button
                      key={t}
                      type="button"
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => addTagVal(t)}
                      className="w-full text-left px-3 py-1.5 text-sm text-gray-800 hover:bg-violet-50"
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        <button
          onClick={() => setConfirmOpen(true)}
          disabled={!canApply || applying}
          className="ml-auto px-4 py-1.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {applying && (
            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          {applying ? 'Aplicando…' : `Aplicar a ${count}`}
        </button>

        <button
          onClick={onClear}
          disabled={applying}
          className="text-violet-600 hover:text-violet-900 text-sm font-medium disabled:opacity-50"
          title="Limpiar selección"
        >
          Limpiar
        </button>
      </div>

      {/* Confirmación — el cambio masivo es irreversible */}
      {confirmOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Confirmar cambio masivo</h2>
            </div>
            <div className="px-6 py-5 text-sm text-gray-700 leading-relaxed">
              {pending.kind === 'addTags' ? (
                <>Vas a agregar {pending.tags.length === 1 ? 'la etiqueta' : 'las etiquetas'}{' '}
                «<span className="font-semibold text-violet-800">{pending.valorLabel}</span>» a{' '}
                <span className="font-semibold tabular-nums">{count}</span>{' '}
                {count === 1 ? 'iniciativa' : 'iniciativas'} (sin quitar las que ya tenían).</>
              ) : (
                <>Vas a cambiar <span className="font-semibold">{pending.campoLabel}</span> a{' '}
                «<span className="font-semibold text-violet-800">{pending.valorLabel}</span>» en{' '}
                <span className="font-semibold tabular-nums">{count}</span>{' '}
                {count === 1 ? 'iniciativa' : 'iniciativas'}.</>
              )}
              <p className="text-xs text-gray-400 mt-2">Esta acción no se puede deshacer con un clic.</p>
            </div>
            <div className="px-6 py-3 bg-gray-50 flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="px-3.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={() => { setConfirmOpen(false); onApply(build()) }}
                className="px-4 py-1.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
              >
                Aplicar a {count}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
