'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeDelete, DbWriteError } from '@/lib/dbWrite'
import { composeEjeLabel } from '@/lib/ejes'
import type { Region } from '@/lib/regions'
import type { RegionEje } from '@/lib/types'
import { Alert } from '@/components/ui'

/**
 * Detalle de eliminación de un eje. Borrar un eje con iniciativas/métricas está
 * bloqueado por FK, así que este modal:
 *   - Cuenta qué cuelga del eje (iniciativas, métricas, historial de comité).
 *   - Si tiene historial de Comité → no se puede borrar (se explica).
 *   - Si está vacío → ofrece eliminarlo directo.
 *   - Si tiene iniciativas/métricas → pide un eje destino y hace
 *     `reasignar_y_borrar_eje` (mueve todo + borra, atómico).
 *
 * La RPC revalida todo server-side; los conteos de acá son sólo para el detalle.
 */

type Conteos = { inis: number; metricas: number; comite: number }

type Props = {
  region:     Region
  origen:     RegionEje
  candidatos: RegionEje[]   // otros ejes de la región (posibles destinos)
  onCancel:   () => void
  onDone:     () => void     // reasignó/borró OK → el padre recarga
  // Sincroniza en memoria las iniciativas movidas (el eje_id cambió) para que
  // las 4 vistas reflejen la reasignación sin recargar.
  onReasignado?: (origenEjeId: number, destino: { id: number; numero: number; nombre: string }) => void
}

export default function ReasignarEjeModal({ region, origen, candidatos, onCancel, onDone, onReasignado }: Props) {
  const [conteos, setConteos]   = useState<Conteos | null>(null)
  const [loading, setLoading]   = useState(true)
  const [destino, setDestino]   = useState<number | ''>('')
  const [working, setWorking]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const cargarConteos = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sb = getSupabase()
    try {
      const [inis, mets, ses, comp, nom] = await Promise.all([
        sb.from('prioridades_territoriales').select('*', { count: 'exact', head: true }).eq('eje_id', origen.id),
        sb.from('metricas_eje').select('*', { count: 'exact', head: true }).eq('eje_id', origen.id),
        sb.from('eje_sesiones').select('*', { count: 'exact', head: true }).eq('eje_id', origen.id),
        sb.from('sesion_compromisos').select('*', { count: 'exact', head: true }).eq('eje_id', origen.id),
        sb.from('sesion_nomina').select('*', { count: 'exact', head: true }).eq('eje_id', origen.id),
      ])
      setConteos({
        inis:     inis.count ?? 0,
        metricas: mets.count ?? 0,
        comite:   (ses.count ?? 0) + (comp.count ?? 0) + (nom.count ?? 0),
      })
    } catch (err) {
      setError(`No se pudo revisar el contenido del eje: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [origen.id])

  useEffect(() => { cargarConteos() }, [cargarConteos])

  async function handleReasignarYBorrar() {
    if (destino === '') return
    setWorking(true)
    setError(null)
    const { error: rpcError } = await getSupabase().rpc('reasignar_y_borrar_eje', {
      p_origen:  origen.id,
      p_destino: destino,
    })
    setWorking(false)
    if (rpcError) {
      setError(`No se pudo reasignar: ${rpcError.message}`)
      return
    }
    const dest = candidatos.find(e => e.id === destino)
    if (dest) onReasignado?.(origen.id, { id: dest.id, numero: dest.numero, nombre: dest.nombre })
    onDone()
  }

  async function handleBorrarVacio() {
    setWorking(true)
    setError(null)
    try {
      await safeDelete(
        getSupabase().from('region_ejes').delete().eq('id', origen.id),
        `region_ejes delete id=${origen.id}`,
      )
    } catch (err) {
      setWorking(false)
      const cause = (err as DbWriteError).cause as { code?: string } | undefined
      if (cause?.code === '23503') {
        setError('El eje pasó a tener referencias mientras se revisaba. Cierra y vuelve a abrir.')
      } else {
        setError((err as Error).message)
      }
      return
    }
    setWorking(false)
    onDone()
  }

  const comiteBloquea = !!conteos && conteos.comite > 0
  const vacio         = !!conteos && conteos.inis === 0 && conteos.metricas === 0 && conteos.comite === 0
  const conContenido  = !!conteos && !comiteBloquea && !vacio
  const destinoEje    = candidatos.find(e => e.id === destino)

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={working ? undefined : onCancel}
    >
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100">
          <p className="text-base font-semibold text-gray-900 leading-snug">Eliminar eje</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {composeEjeLabel(origen.numero, origen.nombre)} · {region.nombre}
          </p>
        </header>

        <div className="px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-6">Revisando qué hay en el eje…</p>
          ) : comiteBloquea ? (
            <>
              <Alert variant="warning">
                Este eje tiene <strong>{conteos!.comite}</strong> referencias de Comité (sesiones,
                compromisos o nómina). El historial de comité no se reasigna, así que el eje no se
                puede eliminar.
              </Alert>
              {(conteos!.inis > 0 || conteos!.metricas > 0) && (
                <p className="text-xs text-slate-500 leading-snug">
                  Además tiene {conteos!.inis} iniciativa(s) y {conteos!.metricas} métrica(s).
                </p>
              )}
            </>
          ) : vacio ? (
            <>
              <p className="text-sm text-slate-700 leading-snug">
                El eje no tiene iniciativas ni métricas vinculadas. Se puede eliminar directamente.
              </p>
              {error && <Alert variant="error">{error}</Alert>}
            </>
          ) : conContenido ? (
            <>
              <p className="text-sm text-slate-700 leading-snug">
                Este eje tiene{' '}
                {conteos!.inis > 0 && (
                  <><strong>{conteos!.inis}</strong> iniciativa{conteos!.inis === 1 ? '' : 's'}</>
                )}
                {conteos!.inis > 0 && conteos!.metricas > 0 && ' y '}
                {conteos!.metricas > 0 && (
                  <><strong>{conteos!.metricas}</strong> métrica{conteos!.metricas === 1 ? '' : 's'}</>
                )}
                . Elige a qué eje mover todo antes de eliminarlo.
              </p>

              {candidatos.length === 0 ? (
                <Alert variant="warning">
                  No hay otro eje en la región al que mover. Crea otro eje primero.
                </Alert>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Mover todo al eje
                  </label>
                  <select
                    value={destino}
                    onChange={e => setDestino(e.target.value ? Number(e.target.value) : '')}
                    disabled={working}
                    className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
                  >
                    <option value="">— Elegir eje destino —</option>
                    {candidatos.map(e => (
                      <option key={e.id} value={e.id}>{composeEjeLabel(e.numero, e.nombre)}</option>
                    ))}
                  </select>

                  {destinoEje && (
                    <p className="text-xs text-slate-500 leading-snug mt-2">
                      Las iniciativas pasarán a mostrarse como
                      «<strong>{composeEjeLabel(destinoEje.numero, destinoEje.nombre)}</strong>».
                      El {composeEjeLabel(origen.numero, origen.nombre)} se eliminará. No se puede deshacer.
                    </p>
                  )}
                </div>
              )}

              {error && <Alert variant="error">{error}</Alert>}
            </>
          ) : (
            error && <Alert variant="error">{error}</Alert>
          )}
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={working}
            className="px-3 py-1.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            {comiteBloquea ? 'Cerrar' : 'Cancelar'}
          </button>

          {vacio && (
            <button
              onClick={handleBorrarVacio}
              disabled={working}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {working ? 'Eliminando…' : 'Eliminar eje'}
            </button>
          )}

          {conContenido && candidatos.length > 0 && (
            <button
              onClick={handleReasignarYBorrar}
              disabled={working || destino === ''}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
            >
              {working ? 'Reasignando…' : 'Reasignar y eliminar'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
