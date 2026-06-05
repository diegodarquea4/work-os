'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import {
  useCanEditAny,
  useCanEditOperational,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { Metrica } from '@/lib/types'
import MetricaEditModal from './MetricaEditModal'

/**
 * Panel inline con las métricas objetivo de un eje regional. Se monta al
 * lado de la grid de "Avance por eje" cuando el usuario selecciona uno —
 * no es overlay, complementa Mi Región sin taparla.
 *
 * Modelo de "compromiso":
 *  - admin/editor define la métrica (título, objetivo, descripción, unidad).
 *  - cualquier autenticado puede actualizar `valor_actual` (operativo).
 *
 * Las métricas se filtran por (region_cod, eje) — clave compuesta lógica.
 */

type Props = {
  region:  Region
  eje:     string
  onClose: () => void
}

export default function MetricasEjeDrawer({ region, eje, onClose }: Props) {
  const canEditAny         = useCanEditAny()
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()

  const [metricas, setMetricas] = useState<Metrica[]>([])
  const [loading, setLoading]   = useState(true)
  const [editingMetrica, setEditingMetrica] = useState<Metrica | null>(null)
  const [createOpen, setCreateOpen]         = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState<number | null>(null)

  // Mount animation — el panel arranca invisible y entra suave para que
  // no aparezca de golpe junto con el reflow de la grid de la izquierda.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const loadMetricas = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase()
      .from('metricas_eje')
      .select('*')
      .eq('region_cod', region.cod)
      .eq('eje', eje)
      .order('created_at', { ascending: true })
    setMetricas((data ?? []) as Metrica[])
    setLoading(false)
  }, [region.cod, eje])

  useEffect(() => { loadMetricas() }, [loadMetricas])

  async function handleDelete(id: number) {
    await getSupabase().from('metricas_eje').delete().eq('id', id)
    setConfirmDelete(null)
    await loadMetricas()
  }

  return (
    <>
      <aside
        className={`bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col h-full overflow-hidden transition-all duration-200 ease-out ${
          entered ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-1'
        }`}
      >
        {/* Header chico: ✕ en su propia fila para no colisionar con
            "Nueva métrica". El eje seleccionado ya se marca con borde
            dashed verde en la columna izquierda, así que el header queda
            mínimo a propósito. */}
        <div className="flex-shrink-0 flex justify-end px-2 pt-2">
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-700 hover:bg-gray-50 rounded p-1 leading-none transition-colors"
            title="Cerrar panel"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Acción crear (solo admin/editor) */}
        {canEditAny && (
          <div className="flex-shrink-0 px-4 pt-1 pb-2.5">
            <button
              onClick={() => setCreateOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-1.5 border-2 border-dashed border-slate-200 text-slate-500 text-xs font-medium rounded-lg hover:border-slate-400 hover:text-slate-700 transition-colors"
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 2v8M2 6h8" strokeLinecap="round"/>
              </svg>
              Nueva métrica
            </button>
          </div>
        )}

        {/* Lista — scroll si crece. */}
        <div className="flex-1 overflow-y-auto px-4 py-3 min-h-[200px] max-h-[520px]">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando métricas…</p>
          ) : metricas.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <svg className="mx-auto mb-3" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 17V9M13 17v-4M17 17v-7" strokeLinecap="round"/>
              </svg>
              <p className="text-sm">Aún no hay métricas para este eje.</p>
              {canEditAny && (
                <p className="text-xs mt-1 text-gray-400">Usa el botón de arriba para crear la primera.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {metricas.map(m => (
                <MetricaCard
                  key={m.id}
                  m={m}
                  canEditAny={canEditAny}
                  canEditOperational={canEditOperational}
                  userEmail={userEmail}
                  onEdit={() => setEditingMetrica(m)}
                  onAskDelete={() => setConfirmDelete(m.id)}
                  onValueChanged={loadMetricas}
                  isConfirmingDelete={confirmDelete === m.id}
                  onCancelDelete={() => setConfirmDelete(null)}
                  onConfirmDelete={() => handleDelete(m.id)}
                />
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Modal de crear / editar definición */}
      <MetricaEditModal
        open={createOpen || editingMetrica !== null}
        onClose={() => { setCreateOpen(false); setEditingMetrica(null) }}
        metrica={editingMetrica}
        regionCod={region.cod}
        eje={eje}
        currentUserEmail={userEmail}
        onSaved={loadMetricas}
      />
    </>
  )
}

/**
 * Card individual de una métrica. Maneja el inline edit del valor_actual
 * y los íconos de editar/borrar la definición.
 */
function MetricaCard({
  m,
  canEditAny,
  canEditOperational,
  userEmail,
  onEdit,
  onAskDelete,
  onValueChanged,
  isConfirmingDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  m: Metrica
  canEditAny: boolean
  canEditOperational: boolean
  userEmail: string
  onEdit: () => void
  onAskDelete: () => void
  onValueChanged: () => void
  isConfirmingDelete: boolean
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const [editingValue, setEditingValue] = useState(false)
  const [draftValue, setDraftValue]     = useState<string>(m.valor_actual != null ? String(m.valor_actual) : '')
  const [saving, setSaving]             = useState(false)

  // Avance = actual / objetivo, capped 0..100 para barra visual.
  const pct = m.valor_actual != null && m.objetivo > 0
    ? Math.min(100, Math.max(0, (Number(m.valor_actual) / Number(m.objetivo)) * 100))
    : null

  // Color barra: progresivo según avance.
  const barColor =
    pct == null         ? 'bg-gray-200'  :
    pct >= 100          ? 'bg-green-500' :
    pct >= 75           ? 'bg-blue-500'  :
    pct >= 40           ? 'bg-amber-500' :
                          'bg-red-500'

  async function commitValue() {
    const trimmed = draftValue.trim()
    const newVal: number | null = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'))
    if (newVal !== null && isNaN(newVal)) {
      // input inválido — revertir
      setDraftValue(m.valor_actual != null ? String(m.valor_actual) : '')
      setEditingValue(false)
      return
    }
    if (newVal === m.valor_actual) {
      setEditingValue(false)
      return
    }
    setSaving(true)
    // .select() devuelve la fila actualizada. Si RLS bloquea el UPDATE,
    // Supabase no devuelve error sino un array vacío — lo detectamos para
    // dar feedback claro en lugar de fallar silencioso.
    const { data, error } = await getSupabase()
      .from('metricas_eje')
      .update({
        valor_actual:           newVal,
        valor_updated_by_email: userEmail || null,
        valor_updated_at:       new Date().toISOString(),
        updated_at:             new Date().toISOString(),
      })
      .eq('id', m.id)
      .select('id, valor_actual')
    setSaving(false)
    setEditingValue(false)
    if (error) {
      console.error('[metricas] update valor_actual error:', error)
      window.alert(`No se pudo guardar el valor: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      console.error('[metricas] update silenciosamente vacío — probable RLS/permisos:', m.id)
      window.alert('No se pudo guardar el valor. Verifica que tengas permisos.')
      return
    }
    onValueChanged()
  }

  const fmtNum = (n: number) =>
    Number.isInteger(n) ? n.toLocaleString('es-CL') : n.toLocaleString('es-CL', { maximumFractionDigits: 2 })

  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
      {/* Título + acciones definición */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-semibold text-slate-900 flex-1 min-w-0">{m.titulo}</h3>
        {canEditAny && !isConfirmingDelete && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={onEdit}
              className="p-1 text-gray-400 hover:text-slate-700 rounded hover:bg-gray-100"
              title="Editar definición"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z" strokeLinejoin="round"/>
              </svg>
            </button>
            <button
              onClick={onAskDelete}
              className="p-1 text-gray-400 hover:text-red-500 rounded hover:bg-red-50"
              title="Eliminar"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 3.5h8M4.5 3.5V2h3v1.5M4 3.5l.5 7h3l.5-7"/>
              </svg>
            </button>
          </div>
        )}
        {isConfirmingDelete && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-red-600 font-medium">¿Eliminar?</span>
            <button onClick={onConfirmDelete} className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700">Sí</button>
            <button onClick={onCancelDelete} className="text-xs px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">No</button>
          </div>
        )}
      </div>

      {m.descripcion && (
        <p className="text-xs text-gray-500 mb-3 leading-snug">{m.descripcion}</p>
      )}

      {/* Barra de progreso */}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: pct == null ? '0%' : `${pct}%` }}
        />
      </div>

      {/* Valor actual (editable inline) / objetivo / unidad */}
      <div className="flex items-baseline gap-2 text-sm">
        {editingValue ? (
          <input
            type="number"
            value={draftValue}
            onChange={e => setDraftValue(e.target.value)}
            onBlur={commitValue}
            onKeyDown={e => {
              if (e.key === 'Enter') { (e.target as HTMLInputElement).blur() }
              if (e.key === 'Escape') {
                setDraftValue(m.valor_actual != null ? String(m.valor_actual) : '')
                setEditingValue(false)
              }
            }}
            step="any"
            autoFocus
            disabled={saving}
            className="w-20 px-1.5 py-0.5 border border-slate-300 rounded text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-400"
          />
        ) : (
          <button
            onClick={() => {
              if (!canEditOperational) return
              setDraftValue(m.valor_actual != null ? String(m.valor_actual) : '')
              setEditingValue(true)
            }}
            disabled={!canEditOperational}
            className={`font-semibold text-slate-900 px-1 -mx-1 rounded ${canEditOperational ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
            title={canEditOperational ? 'Click para editar' : ''}
          >
            {m.valor_actual != null ? fmtNum(Number(m.valor_actual)) : <span className="text-gray-400 font-normal italic">Sin reporte aún</span>}
          </button>
        )}
        <span className="text-gray-400">/</span>
        <span className="text-slate-600 font-medium">{fmtNum(Number(m.objetivo))}</span>
        {m.unidad && <span className="text-gray-500 text-xs">{m.unidad}</span>}
        {pct != null && (
          <span className="ml-auto text-xs text-gray-500">{Math.round(pct)}%</span>
        )}
      </div>

      {/* Footer chico — quién reportó el último valor */}
      {m.valor_updated_by_email && m.valor_updated_at && (
        <p className="text-[10px] text-gray-400 mt-2">
          Actualizado por {m.valor_updated_by_email} · {fmtRelative(m.valor_updated_at)}
        </p>
      )}
    </div>
  )
}

function fmtRelative(iso: string): string {
  const d = new Date(iso)
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000)
  if (diffMin < 1)  return 'hace un instante'
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24)   return `hace ${diffH} h`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7)    return `hace ${diffD} d`
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}
