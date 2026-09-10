'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { INE_CODE, type Region } from '@/lib/regions'
import { filaDesdeCandidato, extenderSeleccion, montoEnMillones, type CandidatoCatalogo } from '@/lib/carteraOrigen'
import FilterPopover, { type FilterOption } from './FilterPopover'
import { LISTA_CANONICA } from '@/lib/ministerios'
import { ESTADO_ACTUAL_ECONOMICO_OPCIONES } from '@/lib/comiteEconomico'

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

/**
 * Los campos que el SEIA no puede responder y que el comité llena en el paso de
 * revisión, ANTES de guardar. Todos opcionales: exigirlos volvería imposible
 * traer diez proyectos de una, que es justamente para lo que sirve el selector.
 */
type Borrador = {
  plazo: '' | 'CP' | 'MP' | 'LP'
  seremi_lider: string
  mano_obra_directa: string
  mano_obra_indirecta: string
  kpi: string
  meta_2026_2027: string
  estado_inicial: string
  vida_util_anios: string
  estado_actual: string
  priorizado: boolean
  riesgo: boolean
}

const BORRADOR_VACIO: Borrador = {
  plazo: '', seremi_lider: '', mano_obra_directa: '', mano_obra_indirecta: '',
  kpi: '', meta_2026_2027: '', estado_inicial: '', vida_util_anios: '',
  estado_actual: '', priorizado: false, riesgo: false,
}

const inputCls = 'px-2 py-1.5 border border-slate-200 rounded-lg text-[13px] text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 w-full'
const labelCls = 'text-[10px] text-gray-500 font-medium'

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
  // Agregar es en dos pasos: primero se ve qué va a quedar guardado, después se
  // confirma. Insertar de una hacía imposible revisar antes de escribir.
  const [confirmando, setConfirmando]     = useState(false)
  // Lo que la persona escribe en el paso de revisión, por candidato. Vive acá y
  // no en la base: hasta que confirme, nada de esto existe.
  const [borradores, setBorradores]       = useState<Record<string, Borrador>>({})
  const [revisando, setRevisando]         = useState(0)

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

  /** Exactamente las filas que se van a insertar. La vista previa muestra esto
   *  mismo, no una aproximación: lo que se ve es lo que queda guardado. */
  const aGuardar = useMemo(
    () => candidatos
      .filter(c => seleccion.has(c.id) && !yaImportados.has(c.id))
      .map(c => ({ candidato: c, fila: filaDesdeCandidato(c, region.cod, currentUserEmail || null) })),
    [candidatos, seleccion, yaImportados, region.cod, currentUserEmail],
  )

  /** Abre el paso de revisión con un borrador limpio por candidato. */
  function irARevisar() {
    setBorradores(Object.fromEntries(aGuardar.map(({ candidato }) => [candidato.id, { ...BORRADOR_VACIO }])))
    setRevisando(0)
    setConfirmando(true)
  }

  function editarBorrador(id: string, cambio: Partial<Borrador>) {
    setBorradores(prev => ({ ...prev, [id]: { ...(prev[id] ?? BORRADOR_VACIO), ...cambio } }))
  }

  /**
   * Copiar un campo del proyecto que se está revisando a todos los demás. Con
   * diez proyectos de la misma cartera, el plazo y la SEREMI líder suelen ser
   * los mismos: sin esto habría que escribirlos diez veces.
   */
  function aplicarATodos(campo: 'plazo' | 'seremi_lider' | 'estado_actual') {
    const valor = borradores[aGuardar[revisando]?.candidato.id]?.[campo]
    if (valor == null) return
    setBorradores(prev => {
      const next = { ...prev }
      for (const { candidato } of aGuardar) {
        next[candidato.id] = { ...(next[candidato.id] ?? BORRADOR_VACIO), [campo]: valor }
      }
      return next
    })
  }

  const num = (v: string) => (v.trim() === '' ? null : Number(v))

  async function handleImportar() {
    if (seleccion.size === 0) return
    setImportando(true)
    try {
      const ahora = new Date().toISOString()
      const filas = aGuardar.map(({ candidato, fila }) => {
        const b = borradores[candidato.id] ?? BORRADOR_VACIO
        return {
          ...fila,
          origen_importado_at: ahora,
          plazo:                 b.plazo || null,
          seremi_lider:          b.seremi_lider || null,
          mano_obra_directa:     num(b.mano_obra_directa),
          mano_obra_indirecta:   num(b.mano_obra_indirecta),
          kpi:                   b.kpi.trim() || null,
          meta_2026_2027:        b.meta_2026_2027.trim() || null,
          estado_inicial:        b.estado_inicial.trim() || null,
          vida_util_anios:       num(b.vida_util_anios),
          // Lo que el SEIA tradujo es el punto de partida; si la persona lo
          // corrigió en la revisión, manda lo que ella puso.
          estado_actual:         b.estado_actual || fila.estado_actual,
          priorizado:            b.priorizado,
          riesgo:                b.riesgo,
        }
      })
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
      <div className={`flex-shrink-0 px-5 py-3 border-b border-gray-100 items-center gap-2 flex-wrap ${confirmando ? 'hidden' : 'flex'}`}>
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

      <div className="flex-1 overflow-y-auto px-5 py-3">
        {confirmando ? (() => {
          const actual = aGuardar[revisando]
          if (!actual) return null
          const { candidato: c, fila } = actual
          const b = borradores[c.id] ?? BORRADOR_VACIO
          const botonTodos = (campo: 'plazo' | 'seremi_lider' | 'estado_actual') =>
            aGuardar.length > 1 && b[campo] ? (
              <button
                type="button"
                onClick={() => aplicarATodos(campo)}
                className="text-[10px] text-violet-700 font-semibold hover:underline"
              >
                aplicar a los {aGuardar.length}
              </button>
            ) : null

          return (
            <div className="space-y-3">
              {/* Navegación de la tanda. Se llena uno y se pasa al siguiente:
                  diez formularios apilados no se revisan, se scrollean. */}
              <div className="flex items-center gap-2">
                {aGuardar.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setRevisando(i => Math.max(0, i - 1))}
                      disabled={revisando === 0}
                      aria-label="Proyecto anterior"
                      className="p-1 rounded-md text-gray-400 hover:text-violet-700 hover:bg-violet-50 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                    </button>
                    <span className="text-[11px] font-semibold text-gray-500 tabular-nums">
                      {revisando + 1} de {aGuardar.length}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRevisando(i => Math.min(aGuardar.length - 1, i + 1))}
                      disabled={revisando === aGuardar.length - 1}
                      aria-label="Siguiente proyecto"
                      className="p-1 rounded-md text-gray-400 hover:text-violet-700 hover:bg-violet-50 disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                    </button>
                  </>
                )}
                <span className="text-[11px] text-gray-400 ml-auto">
                  Todo es opcional &mdash; se puede completar después en la ficha.
                </span>
              </div>

              <p className="text-sm font-semibold text-gray-900 leading-snug">{fila.nombre}</p>

              {/* Lo que trae el SEIA: se muestra, no se pide de nuevo. */}
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px] rounded-lg bg-slate-50 border border-gray-200 px-3 py-2">
                <div>
                  <dt className="text-gray-400">Inversión</dt>
                  <dd className="text-gray-700 font-medium tabular-nums">
                    {fila.inversion_monto != null ? `${fila.inversion_monto.toLocaleString('es-CL')} ${fila.inversion_moneda}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-400">Comuna</dt>
                  <dd className="text-gray-700 font-medium">{c.comuna_nombre ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Financia</dt>
                  <dd className="text-gray-700 font-medium truncate" title={fila.fuente_financiamiento ?? ''}>{fila.fuente_financiamiento ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-gray-400">Opera</dt>
                  <dd className="text-gray-700 font-medium truncate" title={fila.responsable_operativo ?? ''}>{fila.responsable_operativo ?? '—'}</dd>
                </div>
              </dl>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>Plazo {botonTodos('plazo')}</span>
                  <select value={b.plazo} onChange={e => editarBorrador(c.id, { plazo: e.target.value as Borrador['plazo'] })} className={inputCls}>
                    <option value="">—</option>
                    <option value="CP">Corto plazo</option>
                    <option value="MP">Mediano plazo</option>
                    <option value="LP">Largo plazo</option>
                  </select>
                </label>
                <label className="flex flex-col gap-0.5 col-span-2">
                  <span className={labelCls}>SEREMI líder {botonTodos('seremi_lider')}</span>
                  <select value={b.seremi_lider} onChange={e => editarBorrador(c.id, { seremi_lider: e.target.value })} className={inputCls}>
                    <option value="">—</option>
                    {LISTA_CANONICA.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>M. de obra directa</span>
                  <input type="number" value={b.mano_obra_directa} onChange={e => editarBorrador(c.id, { mano_obra_directa: e.target.value })} placeholder="0" className={inputCls} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>M. de obra indirecta</span>
                  <input type="number" value={b.mano_obra_indirecta} onChange={e => editarBorrador(c.id, { mano_obra_indirecta: e.target.value })} placeholder="0" className={inputCls} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>Vida útil (años)</span>
                  <input type="number" value={b.vida_util_anios} onChange={e => editarBorrador(c.id, { vida_util_anios: e.target.value })} className={inputCls} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>KPI</span>
                  <input type="text" value={b.kpi} onChange={e => editarBorrador(c.id, { kpi: e.target.value })} placeholder="MW, m² construidos…" className={inputCls} />
                </label>
                <label className="flex flex-col gap-0.5 col-span-2">
                  <span className={labelCls}>
                    Estado actual {botonTodos('estado_actual')}
                    {!b.estado_actual && fila.estado_actual && (
                      <span className="text-gray-400 font-normal"> &middot; el SEIA dice &quot;{fila.estado_actual}&quot;</span>
                    )}
                  </span>
                  <select value={b.estado_actual} onChange={e => editarBorrador(c.id, { estado_actual: e.target.value })} className={inputCls}>
                    <option value="">{fila.estado_actual ? `Dejar: ${fila.estado_actual}` : '—'}</option>
                    {ESTADO_ACTUAL_ECONOMICO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>Meta 2026 - 2027</span>
                  <textarea value={b.meta_2026_2027} onChange={e => editarBorrador(c.id, { meta_2026_2027: e.target.value })} rows={2} className={`${inputCls} resize-y`} />
                </label>
                <label className="flex flex-col gap-0.5">
                  <span className={labelCls}>Estado inicial</span>
                  <textarea value={b.estado_inicial} onChange={e => editarBorrador(c.id, { estado_inicial: e.target.value })} rows={2} className={`${inputCls} resize-y`} />
                </label>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={b.priorizado} onChange={e => editarBorrador(c.id, { priorizado: e.target.checked })} className="rounded border-gray-300 text-violet-700 focus:ring-violet-400" />
                  <span className="text-[13px] text-gray-700">Priorizado</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={b.riesgo} onChange={e => editarBorrador(c.id, { riesgo: e.target.checked })} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
                  <span className="text-[13px] text-gray-700">En riesgo</span>
                </label>
              </div>

              {fila.notas && (
                <p className="text-[10px] text-gray-500 whitespace-pre-line border-t border-gray-100 pt-2">
                  {fila.notas}
                </p>
              )}
            </div>
          )
        })() : loading ? (

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
                <th className="text-right font-semibold py-1.5 pr-3">Inversión (MM$)</th>
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
                      {/* La misma escala que se va a guardar: la fuente entrega
                          unidades y la cartera anota millones. Mostrar el crudo
                          acá y guardar otra cosa sería mentir en la vista previa. */}
                      {montoEnMillones(c.inversion) != null
                        ? `${montoEnMillones(c.inversion)!.toLocaleString('es-CL')} MM$`
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
        <p className="text-xs text-gray-500 flex items-center gap-2 flex-wrap">
          {confirmando ? (
            <span>Completa lo que falte. Nada se escribe hasta que confirmes.</span>
          ) : seleccion.size > 0 ? (
            <>
              <span>{seleccion.size} seleccionado{seleccion.size === 1 ? '' : 's'}</span>
              <button onClick={limpiarSeleccion} className="text-violet-700 font-medium hover:underline">
                quitar
              </button>
            </>
          ) : loading ? (
            'Cargando…'
          ) : (
            <>
              <span>{nuevos.toLocaleString('es-CL')} sin agregar</span>
              <span className="text-gray-400">·</span>
              <span>
                <kbd className="px-1 py-0.5 rounded border border-gray-300 bg-white font-sans text-[10px]">Shift</kbd>
                {' '}+ click marca un rango
              </span>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          {confirmando ? (
            <>
              <button
                onClick={() => setConfirmando(false)}
                disabled={importando}
                className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50"
              >
                ← Volver a elegir
              </button>
              <button
                onClick={handleImportar}
                disabled={importando || aGuardar.length === 0}
                className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
              >
                {importando ? 'Agregando…' : `Confirmar y agregar ${aGuardar.length}`}
              </button>
            </>
          ) : (
            <>
              <button onClick={onCancel} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white">
                Cancelar
              </button>
              <button
                onClick={irARevisar}
                disabled={seleccion.size === 0}
                className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50"
              >
                Revisar{seleccion.size ? ` ${seleccion.size}` : ''} →
              </button>
            </>
          )}
        </div>
      </footer>
    </>
  )
}
