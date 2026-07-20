'use client'

import { useState } from 'react'
import type { DesalojoCapa, DesalojoFaseConSemaforo, DesalojoFaseEstado, SemaforoDimension } from '@/lib/types'
import { FASE_CFG, FASES_CON_SEMAFORO, getFasesAplicables } from '@/lib/desalojos'
import { SEMAFORO_CONFIG } from '@/lib/config'
import DesalojoTipologiaChip from './DesalojoTipologiaChip'

/**
 * Tabla compacta de capas en la pestaña Contexto. Una fila por capa (activas
 * y archivadas, las archivadas atenuadas).
 *
 * Acciones admin (todas opcionales — el padre las pasa o no):
 *   - Crear capa
 *   - Renombrar inline
 *   - Archivar (soft-delete)
 *
 * Click en una fila pasa al tab Seguimiento con esa capa seleccionada.
 * La asignación de tipología NO se hace acá — la regla es "un lugar para
 * mutar" (decisión del PR). Acá solo se muestra.
 */

type Props = {
  capas:           DesalojoCapa[]
  fasesEstado:     DesalojoFaseEstado[]
  onSelectCapa:    (capaId: number) => void
  onCreate:        (nombre: string) => Promise<void>
  onRenombrar:     (capaId: number, nombre: string) => Promise<void>
  onArchivar:      (capaId: number) => Promise<void>
  readOnly?:       boolean
}

export default function DesalojoCapasMiniTable({
  capas, fasesEstado, onSelectCapa, onCreate, onRenombrar, onArchivar,
  readOnly = false,
}: Props) {
  // Lookup: capaId × fase → semáforo.
  const semByCapaFase = new Map<string, SemaforoDimension>()
  for (const f of fasesEstado) {
    semByCapaFase.set(`${f.capa_id}:${f.fase}`, f.semaforo)
  }
  function semDe(capaId: number, fase: DesalojoFaseConSemaforo): SemaforoDimension {
    return semByCapaFase.get(`${capaId}:${fase}`) ?? 'gris'
  }
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [busy, setBusy]             = useState(false)

  const [editingId, setEditingId]   = useState<number | null>(null)
  const [editName, setEditName]     = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!createName.trim()) return
    setBusy(true)
    try {
      await onCreate(createName.trim())
      setCreateName('')
      setShowCreate(false)
    } finally { setBusy(false) }
  }

  async function commitRename(capaId: number) {
    if (!editName.trim()) { setEditingId(null); return }
    setBusy(true)
    try {
      await onRenombrar(capaId, editName.trim())
      setEditingId(null)
    } finally { setBusy(false) }
  }

  async function handleArchivar(capa: DesalojoCapa) {
    if (!window.confirm(`Archivar la capa "${capa.nombre}"? Se conserva el historial; admin puede reactivarla en SQL si la necesita.`)) return
    setBusy(true)
    try { await onArchivar(capa.id) }
    finally { setBusy(false) }
  }

  return (
    <section className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900">Capas del caso</h3>
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">
            Cada capa es un polígono con tipología, fase y semáforos propios.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setShowCreate(s => !s)}
            className="text-xs px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 font-medium"
          >
            + Nueva capa
          </button>
        )}
      </header>

      {!readOnly && showCreate && (
        <form onSubmit={handleCreate} className="px-4 py-3 bg-slate-50 border-b border-gray-100 flex items-center gap-2">
          <input
            autoFocus
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            placeholder="Ej. Polígono Armada"
            className="flex-1 text-sm px-2.5 py-1.5 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
          <button type="submit" disabled={busy || !createName.trim()} className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold">
            Crear
          </button>
          <button type="button" onClick={() => { setShowCreate(false); setCreateName('') }} className="text-xs px-3 py-1.5 rounded text-gray-500 hover:bg-gray-100">
            Cancelar
          </button>
        </form>
      )}

      <ul className="divide-y divide-gray-100">
        {capas.map(c => {
          return (
            <li
              key={c.id}
              className="px-4 py-3 flex items-center gap-3"
            >
              {/* Nombre + tipología + fase */}
              <div className="flex-1 min-w-0">
                {editingId === c.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter')  { e.preventDefault(); commitRename(c.id) }
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      className="flex-1 text-sm px-2 py-1 border border-slate-300 rounded text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    <button type="button" onClick={() => commitRename(c.id)} disabled={busy} className="text-xs px-2 py-1 rounded bg-slate-700 text-white hover:bg-slate-800 disabled:opacity-50">
                      OK
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="text-xs px-2 py-1 rounded text-gray-500 hover:bg-gray-100">
                      ×
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => onSelectCapa(c.id)}
                      className="text-sm font-semibold text-gray-800 hover:text-slate-900 hover:underline"
                    >
                      {c.nombre}
                    </button>
                    <DesalojoTipologiaChip tipologia={c.tipologia} size="xs" withLabel={false} />
                    <span className="text-[10px] text-gray-500 px-1.5 py-0.5 rounded bg-gray-100">
                      {FASE_CFG[c.fase_actual].label.split('·')[0].trim()}
                    </span>
                  </div>
                )}
              </div>

              {/* Dots por fase — sólo las aplicables a la tipología de la capa */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {FASES_CON_SEMAFORO.map(f => {
                  const aplicables = new Set(getFasesAplicables(c.tipologia))
                  const aplica = aplicables.has(f)
                  if (!aplica) {
                    return (
                      <span
                        key={f}
                        title={`${FASE_CFG[f].label} — no aplica a tipología ${c.tipologia ?? '?'}`}
                        className="inline-flex items-center gap-0.5 text-[10px] text-gray-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-200" />
                        <span className="line-through">{FASE_CFG[f].short}</span>
                      </span>
                    )
                  }
                  const v   = semDe(c.id, f)
                  const cfg = SEMAFORO_CONFIG[v] ?? SEMAFORO_CONFIG.gris
                  const isCurrent = c.fase_actual === f
                  return (
                    <span
                      key={f}
                      title={`${FASE_CFG[f].label} — ${cfg.label}`}
                      className={`inline-flex items-center gap-0.5 text-[10px] ${isCurrent ? 'text-slate-900 font-semibold' : 'text-gray-400'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {FASE_CFG[f].short}
                    </span>
                  )
                })}
              </div>

              {/* Acciones */}
              {!readOnly && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => { setEditingId(c.id); setEditName(c.nombre) }}
                    className="text-gray-400 hover:text-slate-700 p-1"
                    title="Renombrar"
                    aria-label="Renombrar capa"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 2l3 3-8 8H1v-3z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchivar(c)}
                    className="text-gray-400 hover:text-red-600 p-1"
                    title="Archivar"
                    aria-label="Archivar capa"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1.5" y="2.5" width="11" height="2.5" rx="0.5"/>
                      <path d="M2.5 5v6.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V5"/>
                      <path d="M5.5 7.5h3"/>
                    </svg>
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
