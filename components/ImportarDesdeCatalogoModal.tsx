'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { INE_CODE, type Region } from '@/lib/regions'
import { filaDesdeCandidato, type CandidatoCatalogo } from '@/lib/carteraOrigen'
import FilterPopover, { type FilterOption } from './FilterPopover'

/**
 * Importar proyectos del catálogo a la cartera del Comité Económico.
 *
 * El catálogo (`v2_proyectos_inversion`) lo mantienen los syncs y sabe qué
 * proyectos existen en la región. La cartera la mantienen las personas y sabe
 * cuáles le importan al comité. Esta pantalla es el único punto donde uno pasa
 * al otro, y siempre porque alguien lo eligió: nada se importa solo.
 *
 * Lo que se prellena sale de `lib/carteraOrigen.ts` y es deliberadamente poco
 * — el catálogo responde qué es el proyecto, no qué va a hacer el comité con
 * él. Plazo, priorización, SEREMI líder, mano de obra y metas quedan vacíos.
 */

type Props = {
  region: Region
  currentUserEmail: string
  /** origen_id de los proyectos que la región ya importó — no se ofrecen de nuevo. */
  yaImportados: Set<string>
  onClose: () => void
  onImported: (cuantos: number) => void
}

/**
 * Tope de filas traídas del catálogo. La región más grande ronda las 1.000 y
 * el filtrado es en memoria: traer todo de una vez es más rápido que consultar
 * la base en cada tecla.
 */
const MAX_FILAS = 2000

export default function ImportarDesdeCatalogoModal({
  region, currentUserEmail, yaImportados, onClose, onImported,
}: Props) {
  const [candidatos, setCandidatos] = useState<CandidatoCatalogo[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [importando, setImportando] = useState(false)

  const [busqueda, setBusqueda]           = useState('')
  const [fEstado, setFEstado]             = useState<Set<string>>(new Set())
  const [fComuna, setFComuna]             = useState<Set<string>>(new Set())
  const [fVia, setFVia]                   = useState<Set<string>>(new Set())
  const [seleccion, setSeleccion]         = useState<Set<string>>(new Set())
  const [verImportados, setVerImportados] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    const regionId = INE_CODE[region.cod]
    if (regionId === undefined) {
      setError(`No hay código INE para la región ${region.cod}.`)
      setLoading(false)
      return
    }
    const { data, error: dbErr } = await getSupabase()
      .from('v2_proyectos_inversion')
      .select('id, sistema_origen, nombre, titular, estado, tipo, comuna_nombre, inversion, moneda, fecha_presentacion, via_ingreso, url_ficha, synced_at')
      .eq('region_id', regionId)
      .order('inversion', { ascending: false, nullsFirst: false })
      .limit(MAX_FILAS)
    if (dbErr) {
      setError(dbErr.message)
      setCandidatos([])
    } else {
      setCandidatos((data ?? []) as CandidatoCatalogo[])
    }
    setLoading(false)
  }, [region.cod])

  useEffect(() => { cargar() }, [cargar])

  // Escape cierra, igual que el resto de los modales del comité.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const opciones = useCallback((campo: keyof CandidatoCatalogo): FilterOption[] => {
    const cuenta = new Map<string, number>()
    for (const c of candidatos) {
      const v = c[campo]
      if (typeof v !== 'string' || !v) continue
      cuenta.set(v, (cuenta.get(v) ?? 0) + 1)
    }
    return [...cuenta.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, label: value, count }))
  }, [candidatos])

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return candidatos.filter(c => {
      if (!verImportados && yaImportados.has(c.id)) return false
      if (fEstado.size && !(c.estado && fEstado.has(c.estado))) return false
      if (fComuna.size && !(c.comuna_nombre && fComuna.has(c.comuna_nombre))) return false
      if (fVia.size && !(c.via_ingreso && fVia.has(c.via_ingreso))) return false
      if (q) {
        const heno = `${c.nombre} ${c.titular ?? ''}`.toLowerCase()
        if (!heno.includes(q)) return false
      }
      return true
    })
  }, [candidatos, busqueda, fEstado, fComuna, fVia, verImportados, yaImportados])

  const seleccionables = useMemo(
    () => filtrados.filter(c => !yaImportados.has(c.id)),
    [filtrados, yaImportados],
  )
  const todosSeleccionados = seleccionables.length > 0
    && seleccionables.every(c => seleccion.has(c.id))

  function toggle(id: string) {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSeleccion(prev => {
      const next = new Set(prev)
      if (todosSeleccionados) for (const c of seleccionables) next.delete(c.id)
      else for (const c of seleccionables) next.add(c.id)
      return next
    })
  }

  async function handleImportar() {
    if (seleccion.size === 0) return
    setImportando(true)
    try {
      const ahora = new Date().toISOString()
      const filas = candidatos
        .filter(c => seleccion.has(c.id) && !yaImportados.has(c.id))
        .map(c => filaDesdeCandidato(c, region.cod, currentUserEmail || null, ahora))
      if (filas.length === 0) { onClose(); return }
      await safeWrite(
        getSupabase().from('comite_economico_proyecto').insert(filas),
        'comite_economico_proyecto import',
      )
      onImported(filas.length)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setImportando(false)
    }
  }

  const nuevos = useMemo(
    () => candidatos.filter(c => !yaImportados.has(c.id)).length,
    [candidatos, yaImportados],
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Agregar proyectos desde el catálogo"
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 bg-violet-50/40">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold text-gray-900">Agregar desde el catálogo</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {region.nombre} · {loading
                  ? 'cargando…'
                  : `${nuevos.toLocaleString('es-CL')} sin agregar, de ${candidatos.length.toLocaleString('es-CL')} en el catálogo`}
              </p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Cerrar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        </header>

        <div className="flex-shrink-0 px-5 py-3 border-b border-gray-100 flex items-center gap-2 flex-wrap">
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o titular…"
            className="flex-1 min-w-[220px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300"
            autoFocus
          />
          <FilterPopover label="Estado" options={opciones('estado')} selected={fEstado} onChange={setFEstado} />
          <FilterPopover label="Comuna" options={opciones('comuna_nombre')} selected={fComuna} onChange={setFComuna} />
          <FilterPopover label="Vía de ingreso" options={opciones('via_ingreso')} selected={fVia} onChange={setFVia} />
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={verImportados}
              onChange={e => setVerImportados(e.target.checked)}
              className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
            />
            Ver los ya agregados
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-10">Cargando el catálogo…</p>
          ) : error ? (
            <p className="text-center text-sm text-red-600 py-10">{error}</p>
          ) : candidatos.length === 0 ? (
            <div className="text-center py-10 px-6 border border-dashed border-gray-200 rounded-lg">
              <p className="text-sm text-gray-600 font-medium">El catálogo no tiene proyectos de esta región todavía.</p>
              <p className="text-xs text-gray-500 mt-1">
                Se llena con el sync del SEIA. Si nunca corrió para {region.nombre}, no hay de dónde agregar.
              </p>
            </div>
          ) : filtrados.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8 border border-dashed border-gray-200 rounded-lg">
              Ningún proyecto calza con los filtros.
            </p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-white z-[1]">
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="w-8 py-1.5">
                    <input
                      type="checkbox"
                      checked={todosSeleccionados}
                      onChange={toggleTodos}
                      disabled={seleccionables.length === 0}
                      title="Seleccionar todo lo filtrado"
                      aria-label="Seleccionar todo lo filtrado"
                      className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                    />
                  </th>
                  <th className="text-left font-semibold py-1.5 pr-3">Proyecto</th>
                  <th className="text-left font-semibold py-1.5 pr-3">Titular</th>
                  <th className="text-left font-semibold py-1.5 pr-3">Comuna</th>
                  <th className="text-left font-semibold py-1.5 pr-3">Estado</th>
                  <th className="text-right font-semibold py-1.5 pr-3">Inversión</th>
                  <th className="w-8 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => {
                  const yaEsta = yaImportados.has(c.id)
                  return (
                    <tr
                      key={c.id}
                      onClick={() => { if (!yaEsta) toggle(c.id) }}
                      className={`border-b border-gray-100 ${yaEsta ? 'opacity-45' : 'cursor-pointer hover:bg-violet-50/50'}`}
                    >
                      <td className="py-2 text-center">
                        <input
                          type="checkbox"
                          checked={yaEsta || seleccion.has(c.id)}
                          disabled={yaEsta}
                          onChange={() => toggle(c.id)}
                          onClick={e => e.stopPropagation()}
                          aria-label={`Seleccionar ${c.nombre}`}
                          className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                        />
                      </td>
                      <td className="py-2 pr-3 font-medium text-gray-800 max-w-[300px]">
                        <span className="block truncate" title={c.nombre}>{c.nombre}</span>
                        {yaEsta && <span className="text-[10px] text-violet-700 font-semibold">Ya está en la cartera</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[180px] truncate" title={c.titular ?? ''}>{c.titular ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.comuna_nombre ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-600">{c.estado ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-600 tabular-nums text-right">
                        {c.inversion != null
                          ? `${c.inversion.toLocaleString('es-CL')} ${c.moneda === 'USD_MM' ? 'MMUSD' : (c.moneda ?? '')}`.trim()
                          : '—'}
                      </td>
                      <td className="py-2 text-right">
                        {c.url_ficha && (
                          <a
                            href={c.url_ficha}
                            target="_blank"
                            rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            title="Ver el expediente en la fuente"
                            className="text-gray-300 hover:text-violet-700 inline-block"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">
            {seleccion.size > 0
              ? `${seleccion.size} seleccionado${seleccion.size === 1 ? '' : 's'}`
              : 'Se prellenan nombre, titular, inversión y estado. El resto lo completa el comité.'}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={importando} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
              Cancelar
            </button>
            <button
              onClick={handleImportar}
              disabled={importando || seleccion.size === 0}
              className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
            >
              {importando ? 'Agregando…' : `Agregar${seleccion.size ? ` ${seleccion.size}` : ''}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
