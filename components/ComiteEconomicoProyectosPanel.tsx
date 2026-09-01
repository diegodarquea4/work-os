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

/**
 * Cartera de proyectos del Comité Económico — dos fuentes NO unificadas
 * (toggle, nunca ambas al mismo tiempo, mismo criterio que el resto del
 * panel: o se ve una instancia o se ve la otra):
 *   · Privados: tabla propia `comite_economico_proyecto` (mig 086),
 *     cargados a mano — filtros + orden por columna.
 *   · Públicos: iniciativas con la etiqueta 'CER' — mismo patrón de card
 *     que ComiteInfraestructuraTab.tsx (semáforo + TagChips + avance),
 *     click abre la ficha completa vía onAbrirIniciativa (igual que ahí).
 *
 * Se monta debajo de la tarjeta de sesión de ComiteInversionPanel — no
 * reemplaza nada de lo que ya existe ahí.
 */

const TAG_ECONOMICO = 'CER'

type SortCol = 'mano_obra_directa' | 'mano_obra_indirecta' | 'inversion_monto'

type Props = {
  region: Region
  iniciativas: Iniciativa[]
  onAbrirIniciativa: (p: Iniciativa) => void
}

export default function ComiteEconomicoProyectosPanel({ region, iniciativas, onAbrirIniciativa }: Props) {
  const puedeOperar = useCan('comite.economico.operar', region.cod)
  const userEmail = useCurrentUserEmail()

  const [vista, setVista] = useState<'privado' | 'publico'>('privado')
  const [proyectos, setProyectos] = useState<ComiteEconomicoProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [fichaId, setFichaId] = useState<number | null>(null)

  const [fPlazo, setFPlazo]           = useState<Set<string>>(new Set())
  const [fPriorizado, setFPriorizado] = useState<Set<string>>(new Set())
  const [fSeremi, setFSeremi]         = useState<Set<string>>(new Set())
  const [fRiesgo, setFRiesgo]         = useState<Set<string>>(new Set())
  const [fEstado, setFEstado]         = useState<Set<string>>(new Set())
  const [sortCol, setSortCol]         = useState<SortCol | null>(null)
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc')

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase()
      .from('comite_economico_proyecto').select('*')
      .eq('region_cod', region.cod)
      .order('nombre')
    setProyectos((data ?? []) as ComiteEconomicoProyecto[])
    setLoading(false)
  }, [region.cod])

  useEffect(() => { if (puedeOperar) cargar() }, [puedeOperar, cargar])

  const iniciativasCER = useMemo(
    () => iniciativas.filter(p => (p.tags ?? []).includes(TAG_ECONOMICO)),
    [iniciativas],
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

  const filtrados = useMemo(() => {
    let list = proyectos
    if (fPlazo.size)      list = list.filter(p => p.plazo && fPlazo.has(p.plazo))
    if (fPriorizado.size) list = list.filter(p => fPriorizado.has(p.priorizado ? 'Si' : 'No'))
    if (fSeremi.size)     list = list.filter(p => p.seremi_lider && fSeremi.has(p.seremi_lider))
    if (fRiesgo.size)     list = list.filter(p => fRiesgo.has(p.riesgo ? 'Si' : 'No'))
    if (fEstado.size)     list = list.filter(p => p.estado_actual && fEstado.has(p.estado_actual))
    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = a[sortCol] ?? -Infinity
        const bv = b[sortCol] ?? -Infinity
        return sortDir === 'asc' ? av - bv : bv - av
      })
    }
    return list
  }, [proyectos, fPlazo, fPriorizado, fSeremi, fRiesgo, fEstado, sortCol, sortDir])

  function handleSort(col: SortCol) {
    if (sortCol === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return }
    setSortCol(col)
    setSortDir('desc')
  }

  function clearFiltros() {
    setFPlazo(new Set()); setFPriorizado(new Set()); setFSeremi(new Set())
    setFRiesgo(new Set()); setFEstado(new Set())
  }

  const chips = [
    setChip('Plazo', fPlazo, () => setFPlazo(new Set())),
    setChip('Priorizado', fPriorizado, () => setFPriorizado(new Set())),
    setChip('SEREMI líder', fSeremi, () => setFSeremi(new Set())),
    setChip('Riesgo', fRiesgo, () => setFRiesgo(new Set())),
    setChip('Estado actual', fEstado, () => setFEstado(new Set())),
  ].filter((c): c is NonNullable<typeof c> => c !== null)

  if (!puedeOperar) return null

  return (
    <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
          <button
            onClick={() => setNuevoOpen(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800"
          >
            + Nuevo proyecto
          </button>
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
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs border-collapse min-w-[820px]">
                <thead>
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
            <div className="space-y-1">
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
          onClose={() => setNuevoOpen(false)}
          onCreated={() => { setNuevoOpen(false); cargar() }}
        />
      )}
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
