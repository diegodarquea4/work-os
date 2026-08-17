'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { useCanEditOperational, useCurrentUserEmail } from '@/lib/context/UserContext'
import type { GabineteTema } from '@/lib/types'

/**
 * Tarjeta "Temas a tratar" del pane Gabinete → Preparación (mig 053 + 054).
 *
 * Puntos libres pre-reunión (vocerías, temas generales que no son iniciativas
 * concretas). Mínimo 4 filas visibles (persistidas + slots vacíos) y botón
 * "+ Agregar tema". Cada tema persistido admite SUB-ITEMS (mig 054, JSONB en
 * la misma fila): puntos secundarios indentados, con "+ subtema" por tema.
 * Escritura onBlur con safeWrite/safeDelete (patrón commitApunte de
 * SesionModal): slot con texto → INSERT; fila editada → UPDATE; fila vaciada
 * o "✕" → DELETE. Al cerrar la sesión de gabinete, el server archiva los
 * pendientes a esa sesión y la lista parte vacía.
 *
 * El hook useTemasGabinete vive en AttentionTray (el conteo también gatea el
 * botón "Descargar cronograma"); acá llegan `temas` + `setTemas` por props.
 */

const MIN_FILAS = 4

/**
 * Auto-ajuste sutil de altura: el textarea crece para mostrar todo lo escrito
 * (sin barra de scroll). Se llama como `ref` (alto inicial de las filas con
 * texto) y en `onInput` (mientras se escribe).
 */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

/** Chincheta (pin) — rellena cuando el tema está fijado. */
function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </svg>
  )
}

type Props = {
  regionCod: string
  temas: GabineteTema[]
  setTemas: React.Dispatch<React.SetStateAction<GabineteTema[]>>
  className?: string
}

export default function TemasGabinetePanel({ regionCod, temas, setTemas, className }: Props) {
  const canEdit = useCanEditOperational()
  const currentUserEmail = useCurrentUserEmail()
  // Slots vacíos extra sobre el mínimo (botón "+ Agregar tema").
  const [extraSlots, setExtraSlots] = useState(0)
  // Slots vacíos de sub-item por tema (link "+ subtema").
  const [subSlots, setSubSlots] = useState<Record<number, number>>({})
  // Bump para remontar inputs no controlados tras un fallo de escritura
  // (revierte visualmente al valor persistido).
  const [bump, setBump] = useState(0)

  // Filas vacías = mínimo de relleno (no borrables, son el lienzo por defecto)
  // + las agregadas con "+ Agregar tema" (borrables con la ✕).
  const baseEmpty = Math.max(0, MIN_FILAS - temas.length)
  const emptyCount = baseEmpty + extraSlots

  async function commitNuevo(texto: string) {
    const t = texto.trim()
    if (!t) return
    const nextOrden = temas.length ? Math.max(...temas.map(x => x.orden)) + 1 : 1
    try {
      const rows = await safeWrite(
        getSupabase().from('gabinete_temas').insert({
          region_cod: regionCod,
          texto: t,
          orden: nextOrden,
          created_by_email: currentUserEmail || null,
        }),
        'gabinete_temas insert',
      )
      // Con 4+ persistidos, el slot vino de "+ Agregar tema" — se consume.
      if (temas.length >= MIN_FILAS) setExtraSlots(s => Math.max(0, s - 1))
      const row = rows[0] as GabineteTema
      setTemas(prev => [...prev, { ...row, subitems: Array.isArray(row.subitems) ? row.subitems : [] }])
    } catch (err) {
      window.alert((err as Error).message)
      setBump(b => b + 1)
    }
  }

  async function commitEdicion(tema: GabineteTema, texto: string) {
    const t = texto.trim()
    if (t === tema.texto) return
    try {
      if (!t) {
        // Vaciada en blur = borrar (una fila vacía no aporta y el cierre la archivaría).
        await safeDelete(
          getSupabase().from('gabinete_temas').delete().eq('id', tema.id),
          `gabinete_temas delete id=${tema.id}`,
        )
        setTemas(prev => prev.filter(x => x.id !== tema.id))
      } else {
        await safeWrite(
          getSupabase().from('gabinete_temas').update({ texto: t }).eq('id', tema.id),
          `gabinete_temas update id=${tema.id}`,
        )
        setTemas(prev => prev.map(x => x.id === tema.id ? { ...x, texto: t } : x))
      }
    } catch (err) {
      window.alert((err as Error).message)
      setBump(b => b + 1)
    }
  }

  async function quitarTema(tema: GabineteTema) {
    try {
      await safeDelete(
        getSupabase().from('gabinete_temas').delete().eq('id', tema.id),
        `gabinete_temas delete id=${tema.id}`,
      )
      setTemas(prev => prev.filter(x => x.id !== tema.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  /** Fija/desfija un tema recurrente (mig 057): fijado = no se consume al cerrar. */
  async function toggleFijo(tema: GabineteTema) {
    const next = !tema.fijo
    try {
      await safeWrite(
        getSupabase().from('gabinete_temas').update({ fijo: next }).eq('id', tema.id),
        `gabinete_temas fijo id=${tema.id}`,
      )
      setTemas(prev => prev.map(x => x.id === tema.id ? { ...x, fijo: next } : x))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  /** Persiste el array completo de sub-items del tema (JSONB, misma fila). */
  async function commitSubitems(tema: GabineteTema, next: string[]) {
    try {
      await safeWrite(
        getSupabase().from('gabinete_temas').update({ subitems: next }).eq('id', tema.id),
        `gabinete_temas subitems id=${tema.id}`,
      )
      setTemas(prev => prev.map(x => x.id === tema.id ? { ...x, subitems: next } : x))
    } catch (err) {
      window.alert((err as Error).message)
      setBump(b => b + 1)
    }
  }

  function editarSubitem(tema: GabineteTema, idx: number, valor: string) {
    const v = valor.trim()
    if (v === tema.subitems[idx]) return
    const next = v
      ? tema.subitems.map((s, i) => i === idx ? v : s)
      : tema.subitems.filter((_, i) => i !== idx)   // vaciado en blur = quitar
    commitSubitems(tema, next)
  }

  function agregarSubitem(tema: GabineteTema, valor: string) {
    const v = valor.trim()
    if (!v) return
    setSubSlots(prev => ({ ...prev, [tema.id]: Math.max(0, (prev[tema.id] ?? 1) - 1) }))
    commitSubitems(tema, [...tema.subitems, v])
  }

  function quitarSubitem(tema: GabineteTema, idx: number) {
    commitSubitems(tema, tema.subitems.filter((_, i) => i !== idx))
  }

  const subInputCls = 'flex-1 min-w-0 text-[13px] text-gray-600 border border-gray-100 rounded-md px-2 py-1 leading-snug resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-violet-200 focus:border-violet-200'

  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 ${className ?? ''}`}>
      <h3 className="text-sm font-bold text-gray-800">Temas a tratar:</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-snug">
        Puntos generales para la próxima sesión (vocerías, contexto). Se archivan en el acta al cerrarla;
        los fijados (📌) se mantienen para la próxima por ser recurrentes.
      </p>

      <div className="space-y-1.5">
        {temas.map((t, i) => (
          <div key={`${t.id}:${bump}`}>
            <div className="group flex items-start gap-2">
              <span className="text-xs text-gray-400 tabular-nums w-4 text-right flex-shrink-0 mt-2">{i + 1}.</span>
              {canEdit ? (
                <>
                  <textarea
                    defaultValue={t.texto}
                    rows={1}
                    ref={autoGrow}
                    onInput={e => autoGrow(e.currentTarget)}
                    onBlur={e => commitEdicion(t, e.target.value)}
                    className="flex-1 min-w-0 text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 leading-snug resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-300"
                  />
                  <button
                    onClick={() => toggleFijo(t)}
                    className={`transition-opacity mt-2 flex-shrink-0 ${t.fijo ? 'text-violet-600' : 'text-gray-300 hover:text-violet-500 opacity-0 group-hover:opacity-100'}`}
                    title={t.fijo
                      ? 'Tema recurrente: no se borra al cerrar la sesión. Click para dejar de fijarlo.'
                      : 'Fijar como recurrente (no se borra al cerrar la sesión)'}
                  >
                    <PinIcon filled={t.fijo} />
                  </button>
                  <button
                    onClick={() => quitarTema(t)}
                    className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-2 flex-shrink-0"
                    title="Quitar tema"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                      <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                    </svg>
                  </button>
                </>
              ) : (
                <p className="flex-1 min-w-0 text-sm text-gray-700 leading-snug py-1.5">
                  {t.fijo && <span className="text-violet-500 mr-1" title="Tema recurrente">📌</span>}
                  {t.texto}
                </p>
              )}
            </div>

            {/* Sub-items del tema (mig 054) — indentados bajo el padre */}
            {(t.subitems.length > 0 || (canEdit && (subSlots[t.id] ?? 0) > 0)) && (
              <div className="ml-6 mt-1 space-y-1">
                {t.subitems.map((sub, si) => (
                  <div key={`${t.id}-s${si}:${bump}`} className="group flex items-start gap-1.5">
                    <span className="text-gray-300 text-xs flex-shrink-0 mt-1.5">·</span>
                    {canEdit ? (
                      <>
                        <textarea
                          defaultValue={sub}
                          rows={1}
                          ref={autoGrow}
                          onInput={e => autoGrow(e.currentTarget)}
                          onBlur={e => editarSubitem(t, si, e.target.value)}
                          className={subInputCls}
                        />
                        <button
                          onClick={() => quitarSubitem(t, si)}
                          className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 flex-shrink-0"
                          title="Quitar subtema"
                        >
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <p className="flex-1 min-w-0 text-[13px] text-gray-600 leading-snug py-1">{sub}</p>
                    )}
                  </div>
                ))}
                {canEdit && Array.from({ length: subSlots[t.id] ?? 0 }, (_, si) => (
                  <div key={`${t.id}-new${t.subitems.length}-${si}:${bump}`} className="group flex items-start gap-1.5">
                    <span className="text-gray-300 text-xs flex-shrink-0 mt-1.5">·</span>
                    <textarea
                      defaultValue=""
                      rows={1}
                      placeholder="Subtema…"
                      ref={autoGrow}
                      onInput={e => autoGrow(e.currentTarget)}
                      onBlur={e => agregarSubitem(t, e.target.value)}
                      className={`${subInputCls} border-dashed placeholder:text-gray-300 focus:border-solid`}
                    />
                    <button
                      onClick={() => setSubSlots(prev => ({ ...prev, [t.id]: Math.max(0, (prev[t.id] ?? 1) - 1) }))}
                      className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-1.5 flex-shrink-0"
                      title="Quitar subtema"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                        <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {canEdit && (
              <button
                onClick={() => setSubSlots(prev => ({ ...prev, [t.id]: (prev[t.id] ?? 0) + 1 }))}
                className="ml-6 mt-0.5 text-[11px] font-medium text-gray-400 hover:text-violet-700"
              >
                + subtema
              </button>
            )}
          </div>
        ))}

        {canEdit && Array.from({ length: emptyCount }, (_, i) => {
          // Los slots más allá del mínimo de relleno son "agregados" → borrables.
          const esAgregado = i >= baseEmpty
          return (
            <div key={`new-${temas.length}-${i}-${bump}`} className="group flex items-start gap-2">
              <span className="text-xs text-gray-300 tabular-nums w-4 text-right flex-shrink-0 mt-2">{temas.length + i + 1}.</span>
              <textarea
                defaultValue=""
                rows={1}
                placeholder="Escribe un tema…"
                ref={autoGrow}
                onInput={e => autoGrow(e.currentTarget)}
                onBlur={e => commitNuevo(e.target.value)}
                className="flex-1 min-w-0 text-sm text-gray-700 border border-dashed border-gray-200 rounded-lg px-2.5 py-1.5 leading-snug resize-none overflow-hidden placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-solid focus:border-violet-300"
              />
              {esAgregado && (
                <button
                  onClick={() => setExtraSlots(s => Math.max(0, s - 1))}
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity mt-2 flex-shrink-0"
                  title="Quitar fila"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}

        {!canEdit && temas.length === 0 && (
          <p className="text-xs text-gray-500 italic py-2">Sin temas registrados.</p>
        )}
      </div>

      {canEdit && (
        <button
          onClick={() => setExtraSlots(s => s + 1)}
          className="mt-2.5 text-xs font-medium text-violet-700 hover:text-violet-900 hover:underline"
        >
          + Agregar tema
        </button>
      )}
    </div>
  )
}
