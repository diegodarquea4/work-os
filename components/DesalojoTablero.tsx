'use client'

import { useMemo, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type {
  DesalojoCapa,
  DesalojoFaseConSemaforo,
  DesalojoFaseEstado,
  DesalojoTipologia,
  SemaforoDimension,
} from '@/lib/types'
import {
  FASE_CFG,
  FASES_CON_SEMAFORO,
  SEV_ORDER,
  TIPOLOGIA_CFG,
  aplicaFase,
  diasDesdeTipologia,
  tipoDSinVia,
} from '@/lib/desalojos'
import { SEMAFORO_CONFIG } from '@/lib/config'
import DesalojoTipologiaChip from './DesalojoTipologiaChip'

/**
 * Vista de matriz para la sesión de la Mesa. Solo lectura.
 *
 * v3: una fila por CAPA activa. Columnas: tipología, fase actual, los 6
 * semáforos por fase (PR/F1/F2/F3/F4/F5), nudo crítico, fecha tentativa.
 * Rojos primero (por peor semáforo entre las 6 fases). Densidad y tipografía
 * mayores que el listado de trabajo, optimizado para proyectar.
 */

type Caso = {
  prioridad_id: number
  capas:        DesalojoCapa[]
  fases_estado: DesalojoFaseEstado[]
}

type Props = {
  cases:        Iniciativa[]
  casosByN:     Map<number, Caso>
  loading:      boolean
  loadError:    string | null
}

type Row = {
  iniciativa: Iniciativa
  capa:       DesalojoCapa
  fases:      Map<DesalojoFaseConSemaforo, SemaforoDimension>
  worstSev:   number
  esPrimera:  boolean
}

function worstSeverity(fases: Map<DesalojoFaseConSemaforo, SemaforoDimension>): number {
  let max = 0
  for (const v of fases.values()) {
    if (SEV_ORDER[v] > max) max = SEV_ORDER[v]
  }
  return max
}

function diasAOperativo(capa: DesalojoCapa): number | null {
  if (!capa.fecha_tentativa_operativo) return null
  const t = new Date(capa.fecha_tentativa_operativo + 'T00:00:00').getTime()
  if (isNaN(t)) return null
  return Math.floor((t - Date.now()) / (1000 * 60 * 60 * 24))
}

export default function DesalojoTablero({ cases, casosByN, loading, loadError }: Props) {
  const [filtroTipo, setFiltroTipo] = useState<Set<DesalojoTipologia | 'sin'>>(new Set())
  const [filtroReg, setFiltroReg]   = useState<Set<string>>(new Set())

  // Filas: 1 por capa activa.
  const allRows: Row[] = useMemo(() => {
    const rows: Row[] = []
    for (const ini of cases) {
      const caso  = casosByN.get(ini.n)
      const capas = (caso?.capas ?? []).filter(c => c.activa)
      const fases = caso?.fases_estado ?? []
      capas.forEach((capa, idx) => {
        const fasesMap = new Map<DesalojoFaseConSemaforo, SemaforoDimension>()
        // Sólo carga las fases que aplican a la tipología de la capa. Las
        // demás quedan undefined en el Map (la celda se renderiza vacía).
        for (const f of FASES_CON_SEMAFORO) {
          if (!aplicaFase(capa, f)) continue
          const e = fases.find(x => x.capa_id === capa.id && x.fase === f)
          fasesMap.set(f, e?.semaforo ?? 'gris')
        }
        rows.push({
          iniciativa: ini,
          capa,
          fases:      fasesMap,
          worstSev:   worstSeverity(fasesMap),
          esPrimera:  idx === 0,
        })
      })
    }
    return rows
  }, [cases, casosByN])

  const regionesAll = useMemo(
    () => Array.from(new Set(cases.map(c => c.region))).sort(),
    [cases],
  )

  const rows: Row[] = useMemo(() => {
    let r = allRows
    if (filtroTipo.size > 0) {
      r = r.filter(row => {
        const t = row.capa.tipologia
        if (t === null) return filtroTipo.has('sin')
        return filtroTipo.has(t)
      })
    }
    if (filtroReg.size > 0) {
      r = r.filter(row => filtroReg.has(row.iniciativa.region))
    }
    return [...r].sort((a, b) => {
      if (a.worstSev !== b.worstSev) return b.worstSev - a.worstSev
      return a.iniciativa.nombre.localeCompare(b.iniciativa.nombre)
    })
  }, [allRows, filtroTipo, filtroReg])

  // KPIs.
  const totalCasos     = cases.length
  const totalCapas     = allRows.length
  const porTipologia   = useMemo(() => {
    const m: Record<DesalojoTipologia | 'sin', number> = { A: 0, B: 0, C: 0, D: 0, sin: 0 }
    for (const r of allRows) {
      const t = r.capa.tipologia
      if (t === null) m.sin++
      else            m[t]++
    }
    return m
  }, [allRows])
  const sinFinanciamiento      = allRows.filter(r => r.capa.financiamiento_asegurado === false).length
  const tipoDSinViaN   = allRows.filter(r => tipoDSinVia(r.capa) && (diasDesdeTipologia(r.capa) ?? 0) > 30).length
  const proximos30d    = allRows.filter(r => {
    const d = diasAOperativo(r.capa)
    return d !== null && d >= 0 && d <= 30
  }).length

  function toggleTipo(t: DesalojoTipologia | 'sin') {
    setFiltroTipo(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else             next.add(t)
      return next
    })
  }
  function toggleReg(r: string) {
    setFiltroReg(prev => {
      const next = new Set(prev)
      if (next.has(r)) next.delete(r)
      else             next.add(r)
      return next
    })
  }

  return (
    <div className="px-6 py-4 space-y-3">

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label="Casos"  value={totalCasos}  />
        <Kpi label="Capas"  value={totalCapas} />
        {(['A','B','C','D'] as DesalojoTipologia[]).map(t => (
          <KpiTipo key={t} t={t} value={porTipologia[t]} />
        ))}
        <Kpi label="Sin financiamiento"  value={sinFinanciamiento}    accent={sinFinanciamiento > 0    ? 'red' : 'gray'} />
        <Kpi label="Tipo D >30 días"     value={tipoDSinViaN} accent={tipoDSinViaN > 0 ? 'red' : 'gray'} />
        <Kpi label="Operativos ≤30 días" value={proximos30d}  accent={proximos30d > 0  ? 'amber' : 'gray'} />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-white border border-gray-200 rounded-xl">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">Tipología:</span>
          {(['A','B','C','D'] as DesalojoTipologia[]).map(t => {
            const cfg = TIPOLOGIA_CFG[t]
            const active = filtroTipo.has(t)
            return (
              <button
                key={t}
                onClick={() => toggleTipo(t)}
                className={`text-xs px-2.5 py-1 rounded-full font-semibold ring-1 transition-colors ${
                  active ? `${cfg.chip.bg} ${cfg.chip.text} ${cfg.chip.ring}` : 'bg-white text-gray-500 ring-gray-200 hover:ring-gray-300'
                }`}
              >
                {cfg.short}
              </button>
            )
          })}
          <button
            onClick={() => toggleTipo('sin')}
            className={`text-xs px-2.5 py-1 rounded-full font-semibold ring-1 transition-colors ${
              filtroTipo.has('sin') ? 'bg-gray-200 text-gray-700 ring-gray-300' : 'bg-white text-gray-500 ring-gray-200 hover:ring-gray-300'
            }`}
          >
            Sin tipología
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-500">Región:</span>
          {regionesAll.map(r => {
            const active = filtroReg.has(r)
            return (
              <button
                key={r}
                onClick={() => toggleReg(r)}
                className={`text-xs px-2.5 py-1 rounded-full ring-1 transition-colors ${
                  active ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-gray-600 ring-gray-200 hover:ring-gray-300'
                }`}
              >
                {r}
              </button>
            )
          })}
        </div>
        {(filtroTipo.size + filtroReg.size > 0) && (
          <button
            onClick={() => { setFiltroTipo(new Set()); setFiltroReg(new Set()) }}
            className="text-xs text-gray-500 hover:text-gray-900 underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {loadError && (
        <div className="p-3 text-sm bg-red-50 border border-red-200 rounded-lg text-red-700">
          {loadError}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Caso · Capa</th>
              <th className="px-3 py-2 font-semibold">Tipología</th>
              <th className="px-3 py-2 font-semibold">Fase</th>
              {FASES_CON_SEMAFORO.map(f => (
                <th key={f} className="px-2 py-2 font-semibold text-center" title={FASE_CFG[f].label}>
                  {FASE_CFG[f].short}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold">Nudo crítico</th>
              <th className="px-3 py-2 font-semibold">Fecha tentativa</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5 + FASES_CON_SEMAFORO.length} className="px-4 py-8 text-center text-sm text-gray-400">
                  {loading ? 'Cargando capas…' : 'Sin capas que cumplan el filtro.'}
                </td>
              </tr>
            ) : rows.map((row, idx) => {
              const prev = rows[idx - 1]
              const cambioCaso = !prev || prev.iniciativa.n !== row.iniciativa.n
              const dias       = diasAOperativo(row.capa)
              const nudo       = row.capa.tipologia ? TIPOLOGIA_CFG[row.capa.tipologia].nudo_critico : '—'
              return (
                <tr
                  key={row.capa.id}
                  className={`h-12 ${cambioCaso && idx > 0 ? 'border-t-2 border-gray-100' : 'border-t border-gray-100'}`}
                >
                  <td className="px-3 py-2 align-middle">
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{row.iniciativa.nombre}</p>
                    <p className="text-xs text-gray-500 leading-tight mt-0.5 truncate">
                      {row.capa.nombre}
                      {row.capa.propietario && <> · <span className="text-gray-700">{row.capa.propietario}</span></>}
                      <span className="text-gray-400"> · {row.iniciativa.region}</span>
                    </p>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <DesalojoTipologiaChip tipologia={row.capa.tipologia} size="sm" withLabel={false} />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-semibold">
                      {FASE_CFG[row.capa.fase_actual].short}
                    </span>
                  </td>
                  {FASES_CON_SEMAFORO.map(f => {
                    const v = row.fases.get(f)
                    if (v === undefined) {
                      // Fase no aplica a la tipología de la capa.
                      return (
                        <td key={f} className="px-2 py-2 align-middle text-center text-gray-300"
                            title={`${FASE_CFG[f].label} — no aplica a tipología ${row.capa.tipologia ?? '?'}`}>
                          —
                        </td>
                      )
                    }
                    const cfg = SEMAFORO_CONFIG[v] ?? SEMAFORO_CONFIG.gris
                    return (
                      <td key={f} className="px-2 py-2 align-middle text-center">
                        <span title={`${FASE_CFG[f].label} — ${cfg.label}`} className={`inline-block w-3 h-3 rounded-full ${cfg.dot}`} />
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 align-middle">
                    <p className="text-sm text-gray-700 leading-tight line-clamp-1">{nudo}</p>
                  </td>
                  <td className="px-3 py-2 align-middle whitespace-nowrap">
                    {row.capa.fecha_tentativa_operativo ? (
                      <p className={`text-sm font-medium leading-tight ${
                        dias !== null && dias >= 0 && dias <= 30 ? 'text-amber-700' :
                        dias !== null && dias < 0                ? 'text-red-700'   :
                        'text-gray-700'
                      }`}>
                        {row.capa.fecha_tentativa_operativo.slice(0,10).split('-').reverse().join('-')}
                        {dias !== null && (
                          <span className="ml-1.5 text-[11px] text-gray-500">
                            ({dias >= 0 ? `en ${dias}d` : `hace ${-dias}d`})
                          </span>
                        )}
                      </p>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── KPIs ────────────────────────────────────────────────────────────────────

function Kpi({ label, value, accent = 'gray' }: { label: string; value: number; accent?: 'gray' | 'red' | 'amber' }) {
  const accentCls =
    accent === 'red'   ? 'text-red-700' :
    accent === 'amber' ? 'text-amber-700' :
                         'text-slate-900'
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 leading-tight">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${accentCls}`}>{value}</p>
    </div>
  )
}

function KpiTipo({ t, value }: { t: DesalojoTipologia; value: number }) {
  const cfg = TIPOLOGIA_CFG[t]
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 leading-tight">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${cfg.chip.bg.replace('-100', '-500')}`} />
        Tipo {cfg.short}
      </p>
      <p className="text-xl font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  )
}
