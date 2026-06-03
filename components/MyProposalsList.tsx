'use client'

import { useEffect, useState } from 'react'

/**
 * Lista compacta de las propuestas del usuario logueado.
 * Se muestra en VistaRegional como un banner que informa el estado de cargas
 * en curso. Si no hay propuestas, no renderiza nada (silent).
 *
 * El refresh es manual: se carga al montar y cuando el padre invoca `refreshKey`.
 */

type Proposal = {
  id:                number
  created_at:        string
  file_name:         string
  regions_claim:     string[] | null
  status:            'pending' | 'approved' | 'rejected' | 'applied_with_errors'
  reviewer_note:     string | null
  reviewed_at:       string | null
  applied_inserted:  number | null
  applied_updated:   number | null
}

type Props = {
  /** Cambiar este número fuerza un reload (ej. después de subir una nueva). */
  refreshKey?: number
  /** Si se pasa, solo mostramos las propuestas cuyo regions_claim incluye este nombre. */
  regionName?: string
  /** Callback para "Cargar nueva" en una propuesta rechazada (abre el modal de propuesta). */
  onRetry?: () => void
}

export default function MyProposalsList({ refreshKey = 0, regionName, onRetry }: Props) {
  const [items, setItems] = useState<Proposal[]>([])
  const [deleting, setDeleting] = useState<Set<number>>(new Set())

  useEffect(() => {
    fetch('/api/proposals')
      .then(r => r.ok ? r.json() : [])
      .then(data => setItems(data ?? []))
      .catch(() => setItems([]))
  }, [refreshKey])

  // Al hacer ✕ la propuesta se elimina de verdad (no es un dismiss local):
  //   - pending → cancela la solicitud y borra el archivo del Storage
  //     (pedimos confirmación porque es destructivo).
  //   - resuelta → solo limpia la fila de BD; el archivo ya no existe.
  // El audit permanente sigue vivo en `import_log`.
  async function handleDelete(p: Proposal) {
    if (p.status === 'pending') {
      const ok = window.confirm(
        `¿Cancelar esta propuesta?\n\nEl archivo "${p.file_name}" se eliminará y el administrador del DCI no la verá más.`
      )
      if (!ok) return
    }
    setDeleting(prev => new Set(prev).add(p.id))
    const res = await fetch(`/api/proposals/${p.id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(x => x.id !== p.id))
    }
    setDeleting(prev => { const next = new Set(prev); next.delete(p.id); return next })
  }

  // Mostramos solo: pending + resueltas en los últimos 7 días.
  // Si `regionName` está definido, además filtramos a las propuestas cuya
  // declaración de regiones incluye esta — así Mi Región no muestra cargas
  // de otras regiones del mismo usuario.
  const visible = items.filter(p => {
    if (regionName && !(p.regions_claim ?? []).includes(regionName)) return false
    if (p.status === 'pending') return true
    const ref = p.reviewed_at ?? p.created_at
    const days = (Date.now() - new Date(ref).getTime()) / 86_400_000
    return days < 7
  })

  if (visible.length === 0) return null

  return (
    <div className="mb-4 space-y-2">
      {visible.map(p => (
        <ProposalCard
          key={p.id}
          p={p}
          busy={deleting.has(p.id)}
          onDelete={() => handleDelete(p)}
          onRetry={onRetry}
        />
      ))}
    </div>
  )
}

function ProposalCard({
  p, busy, onDelete, onRetry,
}: {
  p: Proposal
  busy: boolean
  onDelete: () => void
  onRetry?: () => void
}) {
  const cfg = STATUS_CONFIG[p.status]
  // Tooltip del ✕: pending = cancela y borra archivo; resuelta = quita el aviso.
  const deleteTitle = p.status === 'pending'
    ? 'Cancelar esta propuesta (también elimina el archivo cargado)'
    : 'Eliminar este aviso de Mi Región'
  return (
    <div className={`rounded-lg border px-4 py-2.5 flex items-center gap-3 ${cfg.bg} ${cfg.border}`}>
      <div className={`w-8 h-8 rounded-full ${cfg.iconBg} flex items-center justify-center flex-shrink-0`}>
        {cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${cfg.text}`}>{cfg.label}</span>
          <span className="text-xs text-gray-500 truncate">· {p.file_name}</span>
        </div>
        {p.status === 'pending' && (
          <p className="text-xs text-gray-600 mt-0.5">Un administrador del DCI la revisará y confirmará.</p>
        )}
        {(p.status === 'approved' || p.status === 'applied_with_errors') && (
          <p className="text-xs text-gray-600 mt-0.5">
            Aplicada: <strong>{p.applied_inserted ?? 0}</strong> insertadas · <strong>{p.applied_updated ?? 0}</strong> actualizadas
            {p.status === 'applied_with_errors' && <span className="text-amber-700"> · con errores parciales</span>}
          </p>
        )}
        {p.status === 'rejected' && p.reviewer_note && (
          <p className="text-xs text-gray-600 mt-0.5 italic">Motivo: "{p.reviewer_note}"</p>
        )}
      </div>
      {p.status === 'rejected' && onRetry && (
        <button
          onClick={onRetry}
          disabled={busy}
          className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold bg-red-700 text-white rounded-md hover:bg-red-800 transition-colors disabled:opacity-50"
          title="Corregir el archivo y enviar una nueva propuesta"
        >
          Cargar nueva
        </button>
      )}
      <button
        onClick={onDelete}
        disabled={busy}
        className="text-gray-300 hover:text-gray-600 flex-shrink-0 disabled:opacity-30"
        title={deleteTitle}
      >
        {busy ? '…' : '✕'}
      </button>
    </div>
  )
}

const STATUS_CONFIG: Record<Proposal['status'], {
  label:    string
  bg:       string
  border:   string
  text:     string
  iconBg:   string
  icon:     React.ReactNode
}> = {
  pending: {
    label:  'Propuesta enviada — esperando revisión',
    bg:     'bg-yellow-50',
    border: 'border-yellow-200',
    text:   'text-yellow-800',
    iconBg: 'bg-yellow-100',
    icon:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-yellow-700"><circle cx="7" cy="7" r="6"/><path d="M7 3v4l2 2" strokeLinecap="round"/></svg>,
  },
  approved: {
    label:  'Propuesta aprobada',
    bg:     'bg-green-50',
    border: 'border-green-200',
    text:   'text-green-800',
    iconBg: 'bg-green-100',
    icon:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.4" className="text-green-700"><path d="M3 7l3 3 5-6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  },
  applied_with_errors: {
    label:  'Propuesta aplicada con errores parciales',
    bg:     'bg-amber-50',
    border: 'border-amber-200',
    text:   'text-amber-800',
    iconBg: 'bg-amber-100',
    icon:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-amber-700"><path d="M7 1l6 12H1L7 1z"/><path d="M7 6v3M7 11v.1" strokeLinecap="round"/></svg>,
  },
  rejected: {
    label:  'Propuesta rechazada',
    bg:     'bg-red-50',
    border: 'border-red-200',
    text:   'text-red-800',
    iconBg: 'bg-red-100',
    icon:   <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-700"><path d="M3 3l8 8M11 3l-8 8" strokeLinecap="round"/></svg>,
  },
}
