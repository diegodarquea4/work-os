'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { INE_CODE, type Region } from '@/lib/regions'
import { filaDesdeCandidato, extenderSeleccion, type CandidatoCatalogo } from '@/lib/carteraOrigen'
import FilterPopover, { type FilterOption } from './FilterPopover'

/**
 * Elegir proyectos del catálogo para sumarlos a la cartera del Comité
 * Económico. Vive DENTRO del modal de "Nuevo proyecto" (una de sus dos
 * pestañas), no como pantalla aparte: agregar un proyecto es una sola
 * intención, y de dónde salen los datos —del catálogo o de tus manos— es un
 * detalle de esa intención, no otra tarea.
 *
 * El catálogo (`v2_proyectos_inversion`) lo mantienen los syncs y sabe qué
 * proyectos existen en la región. La cartera la mantienen las personas y sabe
 * cuáles le importan al comité. Este componente es el único punto donde uno
 * pasa al otro, y siempre porque alguien lo eligió: nada se importa solo.
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
  onCancel: () => void
  /** Devuelve los ids de la cartera recién creados, en el orden en que se insertaron. */
  onImported: (idsCreados: number[]) => void
}

/**
 * Tope de filas traídas del catálogo. La región más grande ronda las 1.000 y
 * el filtrado es en memoria: traer todo de una vez es más rápido que consultar
 * la base en cada tecla.
 */
const MAX_FILAS = 2000

export default function SelectorCatalogoProyectos({
  region, currentUserEmail, yaImportados, onCancel, onImported,
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
  const [actualizando, setActualizando]   = useState(false)
  const [avisoSync, setAvisoSync]         = useState<string | null>(null)

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

  /**
   * Marcar de a uno, o un rango entero con Shift. Con cientos de proyectos en
   * pantalla, marcar uno por uno no es una forma razonable de armar una
   * cartera: el gesto de Shift+click es el mismo de cualquier lista de
   * archivos. La regla del rango vive en `extenderSeleccion` y tiene test.
   */
  const ultimoTocado = useRef<number | null>(null)

  function toggle(id: string, indice: number, extenderRango = false) {
    if (yaImportados.has(id)) return
    if (extenderRango && ultimoTocado.current != null) {
      const desde = ultimoTocado.current
      setSeleccion(prev => extenderSeleccion(prev, filtrados, desde, indice, yaImportados))
      ultimoTocado.current = indice
      return
    }
    ultimoTocado.current = indice
    setSeleccion(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function seleccionarTodosLosFiltrados() {
    setSeleccion(prev => {
      const next = new Set(prev)
      for (const c of seleccionables) next.add(c.id)
      return next
    })
  }

  function limpiarSeleccion() {
    setSeleccion(new Set())
    ultimoTocado.current = null
  }

  function toggleTodos() {
    if (todosSeleccionados) {
      setSeleccion(prev => {
        const next = new Set(prev)
        for (const c of seleccionables) next.delete(c.id)
        return next
      })
    } else {
      seleccionarTodosLosFiltrados()
    }
  }

  /**
   * Traer del SEIA lo último de ESTA región. Acotado a la región a propósito:
   * una corrida nacional tarda varios minutos y necesita reinvocarse, lo que no
   * es algo que se pueda esperar frente a un modal. Una región sola son tres
   * consultas por página y termina en segundos.
   *
   * No reemplaza al cron nacional, que sigue corriendo los lunes: este botón es
   * para cuando alguien necesita el dato fresco AHORA, no para mantener la base
   * al día. Tampoco toca el cursor del cron — el endpoint se encarga.
   */
  async function handleActualizar() {
    setActualizando(true)
    setAvisoSync(null)
    try {
      const res = await fetch(`/api/seia-sync-v2?region=${encodeURIComponent(region.cod)}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || json.ok === false) {
        setAvisoSync(json.error ?? `No se pudo actualizar (HTTP ${res.status}).`)
        return
      }
      await cargar()
      setSeleccion(new Set())
      setAvisoSync(
        json.partial
          ? `El SEIA cortó a medio camino: se guardaron ${json.upserted ?? 0} expedientes. Vuelve a apretar para completar.`
          : `Catálogo al día — ${json.upserted ?? 0} expedientes revisados en ${Math.round((json.duration_ms ?? 0) / 1000)}s.`,
      )
    } catch (err) {
      setAvisoSync((err as Error).message)
    } finally {
      setActualizando(false)
    }
  }

  async function handleImportar() {
    if (seleccion.size === 0) return
    setImportando(true)
    try {
      const ahora = new Date().toISOString()
      const filas = candidatos
        .filter(c => seleccion.has(c.id) && !yaImportados.has(c.id))
        .map(c => filaDesdeCandidato(c, region.cod, currentUserEmail || null, ahora))
      if (filas.length === 0) { onCancel(); return }
      const creados = await safeWrite(
        getSupabase().from('comite_economico_proyecto').insert(filas),
        'comite_economico_proyecto import',
      )
      onImported((creados as { id: number }[]).map(f => f.id))
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
    <>
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
        <button
          type="button"
          onClick={handleActualizar}
          disabled={actualizando || loading}
          title={`Traer del SEIA los proyectos de ${region.nombre}`}
          className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-violet-700 hover:border-violet-200 disabled:opacity-50 flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={actualizando ? 'animate-spin' : ''}>
            <path d="M21 12a9 9 0 11-3-6.7M21 3v6h-6"/>
          </svg>
          {actualizando ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>

      {avisoSync && (
        <p className="flex-shrink-0 px-5 py-2 text-[11px] text-slate-600 bg-slate-50 border-b border-gray-100">
          {avisoSync}
        </p>
      )}

      {/* Barra de selección masiva. El checkbox de la cabecera hace lo mismo,
          pero es chico y no se ve: armar una cartera de decenas de proyectos
          tiene que ser un gesto explícito, no un descubrimiento. */}
      {!loading && !error && seleccionables.length > 0 && (
        <div className="flex-shrink-0 px-5 py-2 border-b border-gray-100 bg-slate-50/70 flex items-center gap-3 flex-wrap">
          <button
            onClick={seleccionarTodosLosFiltrados}
            disabled={todosSeleccionados}
            className="text-xs font-semibold px-2.5 py-1 rounded-md border border-violet-200 text-violet-700 hover:bg-violet-50 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            Seleccionar los {seleccionables.length.toLocaleString('es-CL')} en pantalla
          </button>
          {seleccion.size > 0 && (
            <button
              onClick={limpiarSeleccion}
              className="text-xs font-medium px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-white"
            >
              Quitar selección ({seleccion.size.toLocaleString('es-CL')})
            </button>
          )}
          <span className="text-[11px] text-gray-500 ml-auto">
            Consejo: <kbd className="px-1 py-0.5 rounded border border-gray-300 bg-white font-sans text-[10px]">Shift</kbd> + click marca todo el rango.
          </span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-10">Cargando el catálogo…</p>
        ) : error ? (
          <p className="text-center text-sm text-red-600 py-10">{error}</p>
        ) : candidatos.length === 0 ? (
          <div className="text-center py-10 px-6 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-600 font-medium">El catálogo no tiene proyectos de esta región todavía.</p>
            <p className="text-xs text-gray-500 mt-1">
              Se llena con el sync del SEIA. Si nunca corrió para {region.nombre}, no hay de dónde agregar — cárgalo a mano en la otra pestaña.
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
              {filtrados.map((c, i) => {
                const yaEsta = yaImportados.has(c.id)
                return (
                  <tr
                    key={c.id}
                    onClick={e => toggle(c.id, i, e.shiftKey)}
                    className={`border-b border-gray-100 select-none ${yaEsta ? 'opacity-45' : 'cursor-pointer hover:bg-violet-50/50'} ${seleccion.has(c.id) ? 'bg-violet-50' : ''}`}
                  >
                    <td className="py-2 text-center">
                      <input
                        type="checkbox"
                        checked={yaEsta || seleccion.has(c.id)}
                        disabled={yaEsta}
                        onChange={() => { /* el click de abajo hace el trabajo: necesita saber si venía con Shift */ }}
                        onClick={e => { e.stopPropagation(); toggle(c.id, i, e.shiftKey) }}
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
            : loading
              ? 'Cargando…'
              : `${nuevos.toLocaleString('es-CL')} sin agregar · se prellenan nombre, titular, inversión y estado`}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={onCancel} disabled={importando} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
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
    </>
  )
}
