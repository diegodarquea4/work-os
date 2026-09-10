'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useCan, useCurrentUserEmail } from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { ComiteEconomicoProyecto } from '@/lib/types'
import { SEMAFORO_CONFIG } from '@/lib/config'
import TagChips from './TagChips'
import FilterPopover, { type FilterOption } from './FilterPopover'
import ActiveFiltersBar, { setChip } from './ActiveFiltersBar'
import NuevoProyectoEconomicoModal from './NuevoProyectoEconomicoModal'
import ProyectoEconomicoFichaModal from './ProyectoEconomicoFichaModal'
import PasCatalogoModal from './PasCatalogoModal'
import ConsolaSesionShell from './sesiones/ConsolaSesionShell'

/**
 * Cartera de proyectos del Comité Económico — dos fuentes NO unificadas
 * (toggle, nunca ambas al mismo tiempo, mismo criterio que el resto del
 * panel: o se ve una instancia o se ve la otra):
 *   · Privados: tabla propia `comite_economico_proyecto` (mig 094),
 *     cargados a mano — filtros + orden por columna.
 *   · Públicos: iniciativas con la etiqueta 'CER' — mismo patrón de card
 *     que ComiteInfraestructuraTab.tsx (semáforo + TagChips + avance),
 *     click abre la ficha completa vía onAbrirIniciativa (igual que ahí).
 *
 * Se muestra en DOS modos, porque la cartera entera no cabe dentro del panel
 * del comité sin tapar lo que ese panel es (la sesión):
 *   · 'preview'  — la tarjeta que vive dentro de ComiteInversionPanel: SOLO
 *     los proyectos priorizados, sin filtros ni alta. Es un vistazo.
 *   · 'completo' — la cartera a pantalla completa (mismo esqueleto que la
 *     consola de sesión), con el toggle Privado/Público, los filtros, el
 *     orden por columna, Descargar Excel y + Nuevo proyecto.
 */

const TAG_ECONOMICO = 'CER'

type SortCol = 'mano_obra_directa' | 'mano_obra_indirecta' | 'inversion_monto'

type Props = {
  region: Region
  iniciativas: Iniciativa[]
  onAbrirIniciativa: (p: Iniciativa) => void
  modo?: 'preview' | 'completo'
  /** 'preview': abrir la cartera completa. */
  onVerTodos?: () => void
  /** 'completo': salir de la pantalla completa. */
  onClose?: () => void
  /** 'completo': saltar directo a la consola de sesión (ida y vuelta). */
  onIrASesion?: () => void
}

export default function ComiteEconomicoProyectosPanel({
  region, iniciativas, onAbrirIniciativa, modo = 'completo', onVerTodos, onClose, onIrASesion,
}: Props) {
  const puedeOperar = useCan('comite.economico.operar', region.cod)
  const userEmail = useCurrentUserEmail()

  const [vista, setVista] = useState<'privado' | 'publico'>('privado')
  const [proyectos, setProyectos] = useState<ComiteEconomicoProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [fichaId, setFichaId] = useState<number | null>(null)
  const [fichaReciénImportada, setFichaReciénImportada] = useState(false)
  const [catalogoOpen, setCatalogoOpen] = useState(false)

  const [fPlazo, setFPlazo]           = useState<Set<string>>(new Set())
  const [fPriorizado, setFPriorizado] = useState<Set<string>>(new Set())
  const [fSeremi, setFSeremi]         = useState<Set<string>>(new Set())
  const [fRiesgo, setFRiesgo]         = useState<Set<string>>(new Set())
  const [fEstado, setFEstado]         = useState<Set<string>>(new Set())
  const [fPermiso, setFPermiso]       = useState<Set<string>>(new Set())
  const [sortCol, setSortCol]         = useState<SortCol | null>(null)
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')
  const [exportando, setExportando]   = useState(false)

  // Qué permisos tiene cada proyecto, por N° PAS. Se lee de los permisos YA
  // asociados a proyectos de esta región — no del catálogo completo: filtrar
  // por un PAS que nadie tramita solo ofrece resultados vacíos.
  const [permisosPorProyecto, setPermisosPorProyecto] = useState<Map<number, Set<string>>>(new Map())

  const cargar = useCallback(async () => {
    setLoading(true)
    const sb = getSupabase()
    const { data } = await sb
      .from('comite_economico_proyecto').select('*')
      .eq('region_cod', region.cod)
      .order('nombre')
    const filas = (data ?? []) as ComiteEconomicoProyecto[]
    setProyectos(filas)

    const ids = filas.map(p => p.id)
    if (ids.length) {
      const { data: links } = await sb
        .from('comite_economico_proyecto_permiso')
        .select('proyecto_id, pas:pas_catalogo(n_pas)')
        .in('proyecto_id', ids)
      const mapa = new Map<number, Set<string>>()
      for (const l of (links ?? []) as unknown as { proyecto_id: number; pas: { n_pas: string } | null }[]) {
        if (!l.pas?.n_pas) continue
        const set = mapa.get(l.proyecto_id) ?? new Set<string>()
        set.add(l.pas.n_pas)
        mapa.set(l.proyecto_id, set)
      }
      setPermisosPorProyecto(mapa)
    } else {
      setPermisosPorProyecto(new Map())
    }
    setLoading(false)
  }, [region.cod])

  useEffect(() => { if (puedeOperar) cargar() }, [puedeOperar, cargar])

  const iniciativasCER = useMemo(
    () => iniciativas.filter(p => (p.tags ?? []).includes(TAG_ECONOMICO)),
    [iniciativas],
  )

  // Lo que esta región ya trajo del catálogo (mig 106). El importador los
  // esconde: agregar dos veces el mismo expediente es el error obvio de una
  // pantalla que ofrece cientos de proyectos.
  const yaImportados = useMemo(
    () => new Set(proyectos.map(p => p.origen_id).filter((x): x is string => !!x)),
    [proyectos],
  )

  const opcionesSeremi = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const p of proyectos) if (p.seremi_lider) vistos.add(p.seremi_lider)
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [proyectos])

  const opcionesEstado = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const p of proyectos) if (p.estado_actual) vistos.add(p.estado_actual)
    return [...vistos].sort().map(v => ({ value: v, label: v }))
  }, [proyectos])

  // Solo los N° PAS que algún proyecto de la región tramita, ordenados como
  // se leen ("PAS 9" antes que "PAS 111", no al revés).
  const opcionesPermiso = useMemo((): FilterOption[] => {
    const vistos = new Set<string>()
    for (const set of permisosPorProyecto.values()) for (const n of set) vistos.add(n)
    return [...vistos]
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))
      .map(v => ({ value: v, label: v }))
  }, [permisosPorProyecto])

  const filtrados = useMemo(() => {
    let list = proyectos
    if (fPlazo.size)      list = list.filter(p => p.plazo && fPlazo.has(p.plazo))
    if (fPriorizado.size) list = list.filter(p => fPriorizado.has(p.priorizado ? 'Si' : 'No'))
    if (fSeremi.size)     list = list.filter(p => p.seremi_lider && fSeremi.has(p.seremi_lider))
    if (fRiesgo.size)     list = list.filter(p => fRiesgo.has(p.riesgo ? 'Si' : 'No'))
    if (fEstado.size)     list = list.filter(p => p.estado_actual && fEstado.has(p.estado_actual))
    // Multi-select: basta con que el proyecto tramite ALGUNO de los elegidos.
    if (fPermiso.size)    list = list.filter(p => {
      const suyos = permisosPorProyecto.get(p.id)
      return !!suyos && [...fPermiso].some(n => suyos.has(n))
    })
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? -Infinity
        const bv = b[sortCol] ?? -Infinity
        return sortDir === 'asc' ? av - bv : bv - av
      })
    }
    return list
  }, [proyectos, fPlazo, fPriorizado, fSeremi, fRiesgo, fEstado, fPermiso, permisosPorProyecto, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortCol(col)
    setSortDir('desc')
  }

  function clearFiltros() {
    setFPlazo(new Set()); setFPriorizado(new Set()); setFSeremi(new Set())
    setFRiesgo(new Set()); setFEstado(new Set()); setFPermiso(new Set())
  }

  async function handleExportar() {
    setExportando(true)
    try {
      const { exportProyectosEconomicosXlsx } = await import('@/lib/comiteEconomico')
      await exportProyectosEconomicosXlsx(filtrados, region.nombre)
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setExportando(false)
    }
  }

  const chips = [
    setChip('Plazo', fPlazo, () => setFPlazo(new Set())),
    setChip('Priorizado', fPriorizado, () => setFPriorizado(new Set())),
    setChip('SEREMI líder', fSeremi, () => setFSeremi(new Set())),
    setChip('Riesgo', fRiesgo, () => setFRiesgo(new Set())),
    setChip('Estado actual', fEstado, () => setFEstado(new Set())),
    setChip('Permiso', fPermiso, () => setFPermiso(new Set())),
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  if (!puedeOperar) return null

  // ── Modo preview: solo los priorizados, dentro del panel del comité ───────
  if (modo === 'preview') {
    const priorizados = proyectos.filter(p => p.priorizado)
    return (
      <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 pt-3 pb-2 flex items-center gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Proyectos priorizados</p>
          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
            {priorizados.length} de {proyectos.length}
          </span>
        </div>
        <div className="px-4 pb-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-6">Cargando proyectos…</p>
          ) : priorizados.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">
              {proyectos.length === 0
                ? 'Sin proyectos privados cargados todavía.'
                : 'Ningún proyecto está marcado como priorizado.'}
            </p>
          ) : (
            <div className="space-y-1">
              {priorizados.slice(0, 10).map(p => (
                <button
                  key={p.id}
                  onClick={() => setFichaId(p.id)}
                  className="w-full text-left px-2.5 py-2 border border-slate-200 rounded-lg hover:border-violet-300 hover:bg-violet-50/50 transition-colors flex items-center gap-2.5"
                  title="Ver la ficha del proyecto"
                >
                  <span className="text-sm text-slate-800 font-medium truncate flex-1 min-w-0">{p.nombre}</span>
                  {p.riesgo && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0">Riesgo</span>
                  )}
                  {p.plazo && <span className="text-[10px] text-gray-400 flex-shrink-0">{p.plazo}</span>}
                  {p.estado_actual && (
                    <span className="text-xs text-gray-400 truncate max-w-[150px] flex-shrink-0">{p.estado_actual}</span>
                  )}
                </button>
              ))}
              {priorizados.length > 10 && (
                <button
                  onClick={onVerTodos}
                  className="w-full text-center text-[11px] text-violet-700 hover:text-violet-900 font-medium py-1.5 hover:underline"
                >
                  y {priorizados.length - 10} priorizados más — ver todos los proyectos →
                </button>
              )}
            </div>
          )}
        </div>

        {fichaId != null && (
          <ProyectoEconomicoFichaModal
            proyectoId={fichaId}
            puedeOperar={puedeOperar}
            currentUserEmail={userEmail}
            onClose={() => setFichaId(null)}
            onChanged={cargar}
          />
        )}
      </div>
    )
  }

  // ── Modo completo: la cartera entera a pantalla completa ──────────────────
  return (
    <ConsolaSesionShell
      ariaLabel="Cartera de proyectos — Comité Económico"
      mainMaxWidth="max-w-7xl"
      onEscape={onClose}
      header={
        <>
          <span className="text-[14.5px] font-bold text-slate-900">
            Cartera de proyectos <span className="font-medium text-slate-400">· {region.nombre}</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            {onIrASesion && (
              <button
                onClick={onIrASesion}
                title="Ir a la sesión del comité"
                className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                Ir a la sesión →
              </button>
            )}
            <button
              onClick={onClose}
              title="Volver"
              className="text-slate-400 hover:text-slate-700"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
          </div>
        </>
      }
    >
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-violet-700">Proyectos</p>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => setVista('privado')}
              className={`text-xs px-3 py-1 font-medium transition-colors ${vista === 'privado' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Privado
            </button>
            <button
              onClick={() => setVista('publico')}
              className={`text-xs px-3 py-1 font-medium transition-colors border-l border-gray-200 ${vista === 'publico' ? 'bg-violet-700 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Público
            </button>
          </div>
        </div>
        {vista === 'privado' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCatalogoOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:text-violet-700 hover:border-violet-200 transition-colors"
              title="Ver, editar o agregar permisos del catálogo PAS (compartido por todas las regiones)"
            >
              Catálogo de permisos
            </button>
            <button
              onClick={handleExportar}
              disabled={exportando || filtrados.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 hover:text-violet-700 hover:border-violet-200 transition-colors disabled:opacity-50"
              title="Descarga la lista filtrada, con el último avance y los permisos de cada proyecto"
            >
              {exportando ? 'Generando…' : '↓ Descargar Excel'}
            </button>
            <button
              onClick={() => setNuevoOpen(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800"
              title="Elegirlo del catálogo del SEIA o cargarlo a mano"
            >
              + Nuevo proyecto
            </button>
          </div>
        )}
      </div>

      {vista === 'privado' ? (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-1.5 flex-wrap mb-2">
            <FilterPopover label="Plazo" options={[{ value: 'CP', label: 'Corto plazo' }, { value: 'MP', label: 'Mediano plazo' }, { value: 'LP', label: 'Largo plazo' }]} selected={fPlazo} onChange={setFPlazo} />
            <FilterPopover label="Priorizado" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={fPriorizado} onChange={setFPriorizado} />
            <FilterPopover label="SEREMI líder" options={opcionesSeremi} selected={fSeremi} onChange={setFSeremi} />
            <FilterPopover label="Riesgo" options={[{ value: 'Si', label: 'Sí' }, { value: 'No', label: 'No' }]} selected={fRiesgo} onChange={setFRiesgo} />
            <FilterPopover label="Estado actual" options={opcionesEstado} selected={fEstado} onChange={setFEstado} />
            {/* Solo aparece si hay permisos tramitándose: sin eso el filtro no
                tendría por dónde filtrar. */}
            {opcionesPermiso.length > 0 && (
              <FilterPopover label="Permiso" options={opcionesPermiso} selected={fPermiso} onChange={setFPermiso} />
            )}
          </div>
          {chips.length > 0 && (
            <div className="mb-2">
              <ActiveFiltersBar chips={chips} clearFilters={clearFiltros} />
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando proyectos…</p>
          ) : filtrados.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">
              {proyectos.length === 0 ? 'Sin proyectos privados cargados todavía.' : 'Ningún proyecto calza con los filtros.'}
            </p>
          ) : (
            <div className="overflow-x-auto overflow-y-auto max-h-[65vh] -mx-4 px-4">
              <table className="w-full text-xs border-collapse min-w-[820px]">
                <thead className="sticky top-0 bg-white z-[1]">
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left font-semibold py-1.5 pr-3">Nombre</th>
                    <th className="text-left font-semibold py-1.5 pr-3">Plazo</th>
                    <th className="text-left font-semibold py-1.5 pr-3">Priorizado</th>
                    <th className="text-left font-semibold py-1.5 pr-3">SEREMI líder</th>
                    <SortableHeader label="Inversión (MM$)" active={sortCol === 'inversion_monto'} dir={sortDir} onClick={() => handleSort('inversion_monto')} />
                    <SortableHeader label="M.O. directa" active={sortCol === 'mano_obra_directa'} dir={sortDir} onClick={() => handleSort('mano_obra_directa')} />
                    <SortableHeader label="M.O. indirecta" active={sortCol === 'mano_obra_indirecta'} dir={sortDir} onClick={() => handleSort('mano_obra_indirecta')} />
                    <th className="text-left font-semibold py-1.5 pr-3">Estado actual</th>
                    <th className="text-left font-semibold py-1.5">Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setFichaId(p.id)}
                      className="border-b border-gray-100 hover:bg-violet-50/50 cursor-pointer"
                    >
                      <td className="py-2 pr-3 font-medium text-gray-800 max-w-[220px] truncate">{p.nombre}</td>
                      <td className="py-2 pr-3 text-gray-600">{p.plazo ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {p.priorizado
                          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Sí</span>
                          : <span className="text-gray-400">No</span>}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[160px] truncate">{p.seremi_lider ?? '—'}</td>
                      <td className="py-2 pr-3 text-gray-600 tabular-nums">
                        {p.inversion_monto != null ? `${p.inversion_monto.toLocaleString('es-CL')}${p.inversion_moneda ? ` ${p.inversion_moneda}` : ''}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-gray-600 tabular-nums">{p.mano_obra_directa != null ? p.mano_obra_directa.toLocaleString('es-CL') : '—'}</td>
                      <td className="py-2 pr-3 text-gray-600 tabular-nums">{p.mano_obra_indirecta != null ? p.mano_obra_indirecta.toLocaleString('es-CL') : '—'}</td>
                      <td className="py-2 pr-3 text-gray-600 max-w-[180px] truncate">{p.estado_actual ?? '—'}</td>
                      <td className="py-2">
                        {p.riesgo
                          ? <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">Sí</span>
                          : <span className="text-gray-400">No</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] text-gray-400">Iniciativas con la etiqueta &quot;{TAG_ECONOMICO}&quot;</span>
            <span className="text-[10px] text-gray-400 ml-auto">{iniciativasCER.length}</span>
          </div>
          {iniciativasCER.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-6 border border-dashed border-gray-200 rounded-lg">
              Ninguna iniciativa tiene la etiqueta &quot;{TAG_ECONOMICO}&quot; todavía — agrégala desde su ficha.
            </p>
          ) : (
            <div className="space-y-1 overflow-y-auto max-h-[65vh] -mx-1 px-1">
              {iniciativasCER.map(p => (
                <IniciativaCard key={p.id} p={p} onClick={() => onAbrirIniciativa(p)} />
              ))}
            </div>
          )}
        </div>
      )}

      {nuevoOpen && (
        <NuevoProyectoEconomicoModal
          region={region}
          currentUserEmail={userEmail}
          yaImportados={yaImportados}
          onClose={() => setNuevoOpen(false)}
          onCreated={(ids, desdeCatalogo) => {
            setNuevoOpen(false)
            cargar()
            // Lo traído del catálogo llega a medio llenar: se abre la ficha del
            // primero para completar ahí mismo. Lo cargado a mano ya viene con
            // lo que la persona quiso poner — abrirle la ficha sería repetirle
            // el formulario que acaba de enviar.
            if (desdeCatalogo && ids.length > 0) {
              setFichaId(ids[0])
              setFichaReciénImportada(true)
            }
          }}
        />
      )}
      {fichaId != null && (
        <ProyectoEconomicoFichaModal
          proyectoId={fichaId}
          puedeOperar={puedeOperar}
          currentUserEmail={userEmail}
          reciénImportado={fichaReciénImportada}
          onClose={() => { setFichaId(null); setFichaReciénImportada(false) }}
          onChanged={cargar}
        />
      )}
      {catalogoOpen && (
        <PasCatalogoModal currentUserEmail={userEmail} onClose={() => setCatalogoOpen(false)} />
      )}
    </div>
    </ConsolaSesionShell>
  )
}

function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="text-right font-semibold py-1.5 pr-3">
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-violet-700 ${active ? 'text-violet-700' : ''}`}>
        {label}
        <span className="text-[9px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

/** Clon liviano de IniciativaCard (ComiteInfraestructuraTab.tsx) — mismo lenguaje visual. */
function IniciativaCard({ p, onClick }: { p: Iniciativa; onClick: () => void }) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-2.5 py-2 border border-slate-200 rounded-lg hover:border-violet-300 hover:shadow-sm bg-white transition-all flex items-center gap-2.5"
      title="Ver ficha completa de la iniciativa"
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />
      <span className="text-sm text-slate-800 font-medium line-clamp-1 flex-1 min-w-0">{p.nombre}</span>
      <TagChips tags={p.tags} max={2} className="flex-shrink-0" />
      {p.ministerio && (
        <span className="text-xs text-gray-400 truncate max-w-[140px] flex-shrink-0">{p.ministerio}</span>
      )}
      <span className="text-xs font-semibold text-gray-600 tabular-nums flex-shrink-0 w-9 text-right">
        {p.pct_avance ?? 0}%
      </span>
    </button>
  )
}
