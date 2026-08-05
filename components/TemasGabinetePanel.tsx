'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { useCanEditOperational, useCurrentUserEmail } from '@/lib/context/UserContext'
import type { GabineteTema } from '@/lib/types'

/**
 * Tarjeta "Temas a tratar" del pane Gabinete → Preparación (mig 053).
 *
 * Puntos libres pre-reunión (vocerías, temas generales que no son iniciativas
 * concretas). Mínimo 4 filas visibles (persistidas + slots vacíos) y botón
 * "+ Agregar tema". Escritura onBlur con safeWrite/safeDelete (patrón
 * commitApunte de SesionModal): slot con texto → INSERT; fila editada →
 * UPDATE; fila vaciada o "✕" → DELETE. Al cerrar la sesión de gabinete, el
 * server archiva los pendientes a esa sesión y la lista parte vacía.
 *
 * El hook useTemasGabinete vive en AttentionTray (el conteo también gatea el
 * botón "Descargar cronograma"); acá llegan `temas` + `setTemas` por props.
 */

const MIN_FILAS = 4

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
  // Bump para remontar inputs no controlados tras un fallo de escritura
  // (revierte visualmente al valor persistido).
  const [bump, setBump] = useState(0)

  const emptyCount = Math.max(MIN_FILAS, temas.length) + extraSlots - temas.length

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
      setTemas(prev => [...prev, rows[0] as GabineteTema])
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

  return (
    <div className={`bg-white rounded-xl border border-gray-100 p-4 ${className ?? ''}`}>
      <h3 className="text-sm font-bold text-gray-800">Temas a tratar:</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-3 leading-snug">
        Puntos generales para la próxima sesión (vocerías, contexto). Se archivan en el acta al cerrarla.
      </p>

      <div className="space-y-1.5">
        {temas.map((t, i) => (
          <div key={`${t.id}:${bump}`} className="group flex items-start gap-2">
            <span className="text-xs text-gray-400 tabular-nums w-4 text-right flex-shrink-0 mt-2">{i + 1}.</span>
            {canEdit ? (
              <>
                <textarea
                  defaultValue={t.texto}
                  rows={1}
                  onBlur={e => commitEdicion(t, e.target.value)}
                  className="flex-1 min-w-0 text-sm text-gray-700 border border-gray-200 rounded-lg px-2.5 py-1.5 leading-snug resize-none focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-violet-300"
                />
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
              <p className="flex-1 min-w-0 text-sm text-gray-700 leading-snug py-1.5">{t.texto}</p>
            )}
          </div>
        ))}

        {canEdit && Array.from({ length: emptyCount }, (_, i) => (
          <div key={`new-${temas.length}-${i}-${bump}`} className="flex items-start gap-2">
            <span className="text-xs text-gray-300 tabular-nums w-4 text-right flex-shrink-0 mt-2">{temas.length + i + 1}.</span>
            <textarea
              defaultValue=""
              rows={1}
              placeholder="Escribe un tema…"
              onBlur={e => commitNuevo(e.target.value)}
              className="flex-1 min-w-0 text-sm text-gray-700 border border-dashed border-gray-200 rounded-lg px-2.5 py-1.5 leading-snug resize-none placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-300 focus:border-solid focus:border-violet-300"
            />
          </div>
        ))}

        {!canEdit && temas.length === 0 && (
          <p className="text-xs text-gray-400 italic py-2">Sin temas registrados.</p>
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
