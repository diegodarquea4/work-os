'use client'

import { useEffect, useState } from 'react'

/**
 * Panel para que admin/editor revise propuestas de actualización.
 *
 * Vive en AdminUsersView (columna derecha del layout "Documentos regionales").
 *
 * Flow esperado:
 *   1. Lista de pending arriba (badge verde).
 *   2. Admin click "Descargar" → abre el .xlsx en nueva tab.
 *   3. Admin revisa offline en Excel.
 *   4. Admin click "Confirmar carga" → aplica los cambios via POST approve.
 *      O "Rechazar" → pide motivo y descarta la propuesta.
 *   5. Una vez resuelta, la propuesta sale de pending y va al histórico colapsable.
 *      El archivo se borró del Storage al resolverse — el histórico solo guarda metadata.
 */

type Proposal = {
  id:                number
  created_at:        string
  proposer_email:    string
  file_name:         string
  regions_claim:     string[] | null
  proposer_note:     string | null
  status:            'pending' | 'approved' | 'rejected' | 'applied_with_errors'
  reviewer_email:    string | null
  reviewer_note:     string | null
  reviewed_at:       string | null
  applied_inserted:  number | null
  applied_updated:   number | null
  applied_errors:    string[] | null
}

type ActionResult = {
  status:   string
  inserted?: number
  updated?:  number
  errors?:   string[]
}

export default function ImportProposalsPanel() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState<number | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{ id: number; result: ActionResult } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [rejectModalFor, setRejectModalFor] = useState<Proposal | null>(null)

  useEffect(() => { loadProposals() }, [])

  async function loadProposals() {
    setLoading(true)
    const res = await fetch('/api/proposals')
    if (res.ok) setProposals(await res.json())
    setLoading(false)
  }

  async function handleDownload(p: Proposal) {
    setError(null)
    const res = await fetch(`/api/proposals/${p.id}/file`)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'No se pudo descargar el archivo.')
      return
    }
    const { url } = await res.json() as { url: string }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleApprove(p: Proposal) {
    if (!confirm(`Confirmar carga de la propuesta #${p.id} de ${p.proposer_email}?\n\nSe aplicará al sistema y el archivo se borrará del Storage.`)) return
    setBusy(p.id)
    setError(null)
    const res = await fetch(`/api/proposals/${p.id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) {
      setError(body.error ?? 'No se pudo aplicar la propuesta.')
      return
    }
    setLastResult({ id: p.id, result: body as ActionResult })
    await loadProposals()
  }

  async function handleRejectSubmit(p: Proposal, note: string) {
    if (!note.trim()) {
      setError('Se requiere una nota explicando el rechazo.')
      return
    }
    setBusy(p.id)
    setError(null)
    const res = await fetch(`/api/proposals/${p.id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewer_note: note.trim() }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    setRejectModalFor(null)
    if (!res.ok) {
      setError(body.error ?? 'No se pudo rechazar la propuesta.')
      return
    }
    await loadProposals()
  }

  const pending  = proposals.filter(p => p.status === 'pending')
  const resolved = proposals.filter(p => p.status !== 'pending').slice(0, 20)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Propuestas de actualización</h3>
          <p className="text-xs text-gray-500 mt-0.5">Cargas masivas enviadas por las delegaciones esperando revisión</p>
        </div>
        <span className="text-xs text-gray-400">
          {pending.length} pendiente{pending.length === 1 ? '' : 's'}
        </span>
      </div>

      {error && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {lastResult && (
        <div className="mb-3 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          <strong>Propuesta #{lastResult.id} aplicada.</strong>{' '}
          {lastResult.result.inserted ?? 0} insertadas · {lastResult.result.updated ?? 0} actualizadas
          {(lastResult.result.errors?.length ?? 0) > 0 && (
            <span className="text-amber-700"> · {lastResult.result.errors!.length} error{lastResult.result.errors!.length === 1 ? '' : 'es'}</span>
          )}
          <button onClick={() => setLastResult(null)} className="float-right text-green-500 hover:text-green-700">✕</button>
        </div>
      )}

      {/* ── Pending ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando propuestas...</div>
        ) : pending.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            No hay propuestas pendientes.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {pending.map(p => (
              <div key={p.id} className="px-5 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-start gap-3">
                  {/* Badge verde — "propuesta cargada" */}
                  <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-1 rounded-full font-medium border border-green-200 flex-shrink-0 mt-0.5">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Cargada
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900 truncate">{p.file_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.proposer_email} · {fmtRelative(p.created_at)}
                      {p.regions_claim && p.regions_claim.length > 0 && (
                        <span> · {p.regions_claim.join(', ')}</span>
                      )}
                    </div>
                    {p.proposer_note && (
                      <p className="text-xs text-gray-600 italic mt-1 line-clamp-2">"{p.proposer_note}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleDownload(p)}
                      disabled={busy === p.id}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      title="Descargar el archivo para revisar offline"
                    >
                      Descargar
                    </button>
                    <button
                      onClick={() => handleApprove(p)}
                      disabled={busy === p.id}
                      className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busy === p.id ? '...' : 'Confirmar carga'}
                    </button>
                    <button
                      onClick={() => setRejectModalFor(p)}
                      disabled={busy === p.id}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Histórico ───────────────────────────────────────────────────────── */}
      {resolved.length > 0 && (
        <details className="mt-4 group" open={showHistory} onToggle={e => setShowHistory((e.target as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-800 select-none list-none flex items-center gap-1.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2" className="group-open:rotate-90 transition-transform">
              <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Histórico ({resolved.length})
          </summary>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Proponente</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 uppercase tracking-wider">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resolved.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-700">{p.proposer_email}</td>
                    <td className="px-4 py-2 text-gray-500">{fmtRelative(p.reviewed_at ?? p.created_at)}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {p.status === 'rejected' ? (
                        p.reviewer_note ? <span className="italic">"{p.reviewer_note}"</span> : '—'
                      ) : (
                        <>
                          {p.applied_inserted ?? 0} ins · {p.applied_updated ?? 0} act
                          {(p.applied_errors?.length ?? 0) > 0 && (
                            <span className="text-amber-700"> · {p.applied_errors!.length} err</span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* ── Modal Rechazar ─────────────────────────────────────────────────── */}
      {rejectModalFor && (
        <RejectModal
          proposal={rejectModalFor}
          busy={busy === rejectModalFor.id}
          onCancel={() => setRejectModalFor(null)}
          onSubmit={note => handleRejectSubmit(rejectModalFor, note)}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: Proposal['status'] }) {
  const config = {
    pending:             { label: 'Pendiente',     cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
    approved:            { label: 'Aprobada',      cls: 'bg-green-50 text-green-700 border-green-200' },
    rejected:            { label: 'Rechazada',     cls: 'bg-red-50 text-red-700 border-red-200' },
    applied_with_errors: { label: 'Con errores',   cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  }[status]
  return (
    <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium border ${config.cls}`}>
      {config.label}
    </span>
  )
}

function RejectModal({
  proposal, busy, onCancel, onSubmit,
}: {
  proposal: Proposal
  busy: boolean
  onCancel: () => void
  onSubmit: (note: string) => void
}) {
  const [note, setNote] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={busy ? undefined : onCancel}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
        <header className="bg-slate-900 px-5 py-3 flex items-center justify-between">
          <span className="text-white font-semibold text-sm">Rechazar propuesta</span>
          <button onClick={onCancel} disabled={busy} className="text-slate-400 hover:text-white">✕</button>
        </header>
        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-gray-600">
            Estás por rechazar la propuesta <strong>#{proposal.id}</strong> de{' '}
            <strong>{proposal.proposer_email}</strong>. El archivo se eliminará del Storage y la persona
            verá tu motivo en "Mis propuestas".
          </p>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Motivo del rechazo <span className="text-red-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={3}
              placeholder="Ej: faltan datos obligatorios en filas 5-8; favor corregir y reenviar."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              autoFocus
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onCancel} disabled={busy} className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button
              onClick={() => onSubmit(note)}
              disabled={busy || !note.trim()}
              className="flex-1 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Rechazando...' : 'Rechazar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diffMin = Math.floor((now - d.getTime()) / 60000)
  if (diffMin < 1)  return 'hace un instante'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `hace ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)    return `hace ${diffD} d`
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}
