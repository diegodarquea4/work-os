'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeDelete } from '@/lib/dbWrite'
import {
  useCanEditAny,
  useCanEditOperational,
  useCurrentUserEmail,
} from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { Metrica, RegionEje } from '@/lib/types'
import { composeEjeLabel } from '@/lib/ejes'
import { deltaPulso } from '@/lib/sesiones/helpers'
import { useSesionesResumen, useSerieValores } from '@/lib/hooks/useSesionesEje'
import MetricaEditModal from './MetricaEditModal'
import SesionModal from './SesionModal'
import HistorialSesionesModal from './HistorialSesionesModal'
import NominaModal from './NominaModal'

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
 *
 * Módulo Sesiones (mig 044): si el eje tiene `sesiones_habilitadas`, el
 * drawer suma el botón "Nueva sesión", un strip de resumen y el footer con
 * historial y nómina. TODO cuelga de `sesionesOn` — para viewer o eje sin
 * flag el drawer es idéntico al histórico y no dispara ningún query a las
 * tablas sesion_* (RLS le negaría el acceso a viewer).
 */

type Props = {
  region:  Region
  // Eje del catálogo formal (migración 015). El drawer recibe el objeto
  // completo para componer label y filtrar métricas por `eje_id` directo
  // (sin lookup adicional).
  eje:     RegionEje
  onClose: () => void
  // Modo empotrado: el drawer se monta fijo dentro de un panel (ej. el tab
  // "Comité Policial" de la sección Comités) en vez de flotar al lado de la
  // grid de ejes. Oculta el ✕ y la animación de entrada lateral.
  embedded?: boolean
  // Muestra el módulo Sesiones (botón Nueva sesión, strip, footer, modales).
  // El módulo se movió a la sección Comités, así que el drawer que abre desde
  // «Ejes estratégicos» lo pasa en false para no duplicarlo.
  showSesiones?: boolean
}

export default function MetricasEjeDrawer({ region, eje, onClose, embedded = false, showSesiones = true }: Props) {
  const canEditAny         = useCanEditAny()
  const canEditOperational = useCanEditOperational()
  const userEmail          = useCurrentUserEmail()

  // Gate único del módulo Sesiones: flag del eje + rol operativo (viewer
  // queda fuera — la RLS de sesion_* igual se lo negaría) + que el contenedor
  // pida mostrarlo (solo el tab Comité Policial, no el drawer de eje).
  const sesionesOn = eje.sesiones_habilitadas && canEditOperational && showSesiones

  const [metricas, setMetricas] = useState<Metrica[]>([])
  const [loading, setLoading]   = useState(true)
  const [editingMetrica, setEditingMetrica] = useState<Metrica | null>(null)
  const [createOpen, setCreateOpen]         = useState(false)
  const [confirmDelete, setConfirmDelete]   = useState<number | null>(null)

  // Módulo Sesiones
  const [sesionOpen, setSesionOpen]       = useState(false)
  const [historialOpen, setHistorialOpen] = useState(false)
  const [nominaOpen, setNominaOpen]       = useState(false)
  const { resumen, refresh: refreshResumen } = useSesionesResumen(region.cod, eje.id, sesionesOn)

  // Mount animation — el panel arranca invisible y entra suave para que
  // no aparezca de golpe junto con el reflow de la grid de la izquierda.
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    const t = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(t)
  }, [])

  const loadMetricas = useCallback(async () => {
    setLoading(true)
    // Filtramos por eje_id (FK al catálogo). region_cod redundante con eje.id
    // pero lo mantenemos por defensa (RLS lo deja pasar igual).
    const { data } = await getSupabase()
      .from('metricas_eje')
      .select('*')
      .eq('region_cod', region.cod)
      .eq('eje_id', eje.id)
      .order('created_at', { ascending: true })
    setMetricas((data ?? []) as Metrica[])
    setLoading(false)
  }, [region.cod, eje.id])

  useEffect(() => { loadMetricas() }, [loadMetricas])

  async function handleDelete(id: number) {
    try {
      await safeDelete(
        getSupabase().from('metricas_eje').delete().eq('id', id),
        `metricas_eje delete id=${id}`,
      )
      setConfirmDelete(null)
      await loadMetricas()
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  return (
    <>
      <aside
        className={`bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col overflow-hidden transition-all duration-200 ease-out ${
          embedded ? '' : 'h-full'
        } ${entered ? 'opacity-100 translate-x-0' : `opacity-0 ${embedded ? '' : 'translate-x-1'}`}`}
      >
        {/* Header chico: ✕ en su propia fila para no colisionar con
            "Nueva métrica". El eje seleccionado ya se marca con borde
            dashed verde en la columna izquierda, así que el header queda
            mínimo a propósito. En modo empotrado no hay ✕ (el panel es fijo). */}
        {!embedded && (
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
        )}

        {/* Acciones: Nueva métrica (admin/editor) + Nueva sesión (operativo,
            solo con el módulo Sesiones activo). Grid 2 col si están ambas. */}
        {(canEditAny || sesionesOn) && (
          <div className={`flex-shrink-0 px-4 ${embedded ? 'pt-3' : 'pt-1'} pb-2 ${canEditAny && sesionesOn ? 'grid grid-cols-2 gap-2' : ''}`}>
            {canEditAny && (
              <button
                onClick={() => setCreateOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:border-slate-400 hover:text-slate-800 hover:bg-slate-50/60 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 2v8M2 6h8" strokeLinecap="round"/>
                </svg>
                Nueva métrica
              </button>
            )}
            {sesionesOn && (
              <button
                onClick={() => setSesionOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800 transition-colors"
                title={resumen.borradorId ? 'Continuar el borrador de sesión' : `Nueva sesión de ${eje.sesiones_nombre ?? 'la instancia'}`}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="10" height="9" rx="1.5"/>
                  <path d="M2 6h10M5 1.5V4M9 1.5V4"/>
                </svg>
                {resumen.borradorId ? 'Continuar sesión' : 'Nueva sesión'}
              </button>
            )}
          </div>
        )}

        {/* Strip resumen del módulo Sesiones */}
        {sesionesOn && (
          <div className="flex-shrink-0 px-4 pb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-violet-900 bg-violet-50 border border-violet-100 rounded-lg px-2.5 py-1.5">
              <span className="font-semibold">{resumen.compromisosAbiertos}</span>
              <span>compromiso{resumen.compromisosAbiertos === 1 ? '' : 's'} abierto{resumen.compromisosAbiertos === 1 ? '' : 's'}</span>
              <span className="text-violet-300">·</span>
              <span>
                {resumen.ultimaSesionFecha
                  ? `última sesión ${fmtFechaCorta(resumen.ultimaSesionFecha)}`
                  : 'sin sesiones cerradas aún'}
              </span>
            </div>
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
                  sesionesOn={sesionesOn}
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

        {/* Footer del módulo Sesiones: historial + nómina */}
        {sesionesOn && (
          <div className="flex-shrink-0 border-t border-violet-100 bg-violet-50/50 px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-700">
              Sesiones de {eje.sesiones_nombre ?? 'la instancia'}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setNominaOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
                title="Nómina fija del comité (titulares y suplentes)"
              >
                Nómina
              </button>
              <span className="text-violet-200">|</span>
              <button
                onClick={() => setHistorialOpen(true)}
                className="text-xs text-violet-700 hover:text-violet-900 font-medium hover:underline"
              >
                Ver historial →
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Modal de crear / editar definición */}
      <MetricaEditModal
        open={createOpen || editingMetrica !== null}
        onClose={() => { setCreateOpen(false); setEditingMetrica(null) }}
        metrica={editingMetrica}
        regionCod={region.cod}
        eje={eje}
        ejeLabel={composeEjeLabel(eje.numero, eje.nombre)}
        currentUserEmail={userEmail}
        onSaved={loadMetricas}
        sesionesOn={sesionesOn}
      />

      {/* Módulo Sesiones — modales (solo montan con el gate activo) */}
      {sesionesOn && sesionOpen && (
        <SesionModal
          region={region}
          eje={eje}
          borradorId={resumen.borradorId}
          currentUserEmail={userEmail}
          onClose={() => {
            setSesionOpen(false)
            refreshResumen()
            loadMetricas()   // el cierre pudo actualizar valor_actual de métricas
          }}
        />
      )}
      {sesionesOn && historialOpen && (
        <HistorialSesionesModal
          region={region}
          eje={eje}
          onClose={() => setHistorialOpen(false)}
        />
      )}
      {sesionesOn && nominaOpen && (
        <NominaModal
          region={region}
          eje={eje}
          onClose={() => setNominaOpen(false)}
        />
      )}
    </>
  )
}

function fmtFechaCorta(fecha: string): string {
  // date puro YYYY-MM-DD — anclar a mediodía evita el corrimiento de día
  // por timezone (mismo patrón que TareasTab/SeguimientoTab).
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/**
 * Card individual de una métrica. Maneja el inline edit del valor_actual
 * y los íconos de editar/borrar la definición.
 */
function MetricaCard({
  m,
  canEditAny,
  canEditOperational,
  sesionesOn,
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
  // Módulo Sesiones visible para este usuario/eje. Con false la card pulso
  // degrada a "solo valor" y NO consulta la serie (RLS negaría a viewer).
  sesionesOn: boolean
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

  const esPulso = m.tipo === 'pulso'
  // El valor de una métrica reportada en sesión entra por el cierre de
  // sesión — la edición inline se bloquea (refuerzo BD: trigger mig 044).
  const valorBloqueado = m.se_reporta_en_sesion
  // Serie histórica para Δ + sparkline de la card pulso. enabled solo si
  // corresponde — jamás consultar sesion_valores fuera del gate.
  const serie = useSerieValores(m.id, sesionesOn && esPulso)
  const delta = serie.length >= 2
    ? deltaPulso(serie[serie.length - 2].valor, serie[serie.length - 1].valor)
    : null

  // Avance = actual / objetivo, capped 0..100 para barra visual.
  const pct = !esPulso && m.valor_actual != null && m.objetivo > 0
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
    <div className="bg-slate-50/70 border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
      {/* Título + acciones definición */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="text-sm font-semibold text-slate-900 flex-1 min-w-0">
          {m.titulo}
          {sesionesOn && m.se_reporta_en_sesion && (
            <span
              className={`ml-1.5 align-middle text-[9px] font-bold tracking-wide px-1.5 py-0.5 rounded ${
                esPulso ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
              }`}
              title={esPulso
                ? 'Se reporta en sesión — cada sesión reemplaza el valor (foto semanal)'
                : 'Se reporta en sesión — cada sesión suma al acumulado'}
            >
              SESIÓN · {esPulso ? 'PULSO' : 'SUMA'}
            </span>
          )}
        </h3>
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

      {esPulso ? (
        /* ── Card pulso: valor grande + Δ vs sesión anterior + sparkline ──
           Sin barra ni objetivo (foto semanal). El valor entra por sesión
           así que tampoco hay edición inline. */
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                {m.valor_actual != null ? fmtNum(Number(m.valor_actual)) : <span className="text-gray-400 text-sm font-normal italic">Sin reporte aún</span>}
              </span>
              {m.unidad && m.valor_actual != null && <span className="text-xs text-gray-500">{m.unidad}</span>}
            </div>
            {delta && (
              <p className={`text-[11px] font-semibold mt-0.5 ${delta.abs > 0 ? 'text-red-600' : delta.abs < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {delta.abs > 0 ? '▲' : delta.abs < 0 ? '▼' : '—'} {fmtNum(Math.abs(delta.abs))}
                {delta.pct != null && ` (${Math.abs(delta.pct).toFixed(1)}%)`}
                <span className="text-gray-400 font-normal"> vs sesión anterior</span>
              </p>
            )}
          </div>
          {serie.length >= 2 && <Sparkline puntos={serie.map(p => p.valor)} />}
        </div>
      ) : (
        <>
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
                  if (!canEditOperational || valorBloqueado) return
                  setDraftValue(m.valor_actual != null ? String(m.valor_actual) : '')
                  setEditingValue(true)
                }}
                disabled={!canEditOperational || valorBloqueado}
                className={`font-semibold text-slate-900 px-1 -mx-1 rounded ${canEditOperational && !valorBloqueado ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}
                title={valorBloqueado ? 'Este valor se alimenta desde las sesiones' : canEditOperational ? 'Click para editar' : ''}
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
        </>
      )}

      {/* Footer chico — quién reportó el último valor */}
      {m.valor_updated_by_email && m.valor_updated_at && (
        <p className="text-[10px] text-gray-400 mt-2">
          Actualizado por {m.valor_updated_by_email} · {fmtRelative(m.valor_updated_at)}
        </p>
      )}
    </div>
  )
}

/** Sparkline mínimo (SVG) para la serie de una métrica pulso. */
function Sparkline({ puntos }: { puntos: number[] }) {
  const W = 72, H = 28, PAD = 2
  const min = Math.min(...puntos)
  const max = Math.max(...puntos)
  const range = max - min || 1
  const coords = puntos.map((v, i) => {
    const x = PAD + (i / (puntos.length - 1)) * (W - PAD * 2)
    const y = PAD + (1 - (v - min) / range) * (H - PAD * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = coords[coords.length - 1].split(',').map(Number)
  return (
    <svg width={W} height={H} className="flex-shrink-0 text-sky-500" aria-hidden>
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="2" fill="currentColor" />
    </svg>
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
