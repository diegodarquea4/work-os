'use client'

import { useEffect, useRef, useState } from 'react'
import { REGIONS } from '@/lib/regions'
import { PREGO_FASES, type PregoEstado, type PregoFaseKey, type PregoRow } from '@/lib/types'
import { getAllPrego, updatePregoFase } from '@/lib/db'

type Props = {
  userName?: string
}

const ESTADO_CONFIG: Record<PregoEstado, { label: string; pill: string; dot: string }> = {
  pendiente:  { label: 'Pendiente',  pill: 'bg-gray-100 text-gray-500 ring-1 ring-gray-200',  dot: '○' },
  en_curso:   { label: 'En curso',   pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', dot: '◐' },
  completado: { label: 'Completado', pill: 'bg-green-50 text-green-700 ring-1 ring-green-200', dot: '✓' },
  bloqueado:  { label: 'Bloqueado',  pill: 'bg-red-50 text-red-700 ring-1 ring-red-200',       dot: '✗' },
}

const ESTADOS: PregoEstado[] = ['pendiente', 'en_curso', 'completado', 'bloqueado']

// Derived once from the constant — E3 phases are grouped visually; pre/post appear as regular columns
const FASES_E3       = PREGO_FASES.filter(f => f.key.startsWith('e3_'))
const FASES_PRE_E3   = PREGO_FASES.filter(f => !f.key.startsWith('e3_')).slice(0, 3)
const FASES_POST_E3  = PREGO_FASES.filter(f => !f.key.startsWith('e3_')).slice(3)

function calcAvance(row: PregoRow): number {
  const completadas = PREGO_FASES.filter(f => row[f.key] === 'completado').length
  return Math.round((completadas / PREGO_FASES.length) * 100)
}

function AvanceBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : pct > 0 ? 'bg-blue-400' : 'bg-gray-200'
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 bg-gray-100 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-7 text-right">{pct}%</span>
    </div>
  )
}

function CeldaEstado({
  estado,
  saving,
  onChange,
}: {
  estado: PregoEstado
  saving: boolean
  onChange: (e: PregoEstado) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const cfg = ESTADO_CONFIG[estado]

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        title={cfg.label}
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
          ${cfg.pill} ${saving ? 'opacity-40 cursor-wait' : 'hover:opacity-70 cursor-pointer'}`}
      >
        {saving ? '…' : cfg.dot}
      </button>

      {open && (
        <div className="absolute top-8 z-50 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32">
          {ESTADOS.map(e => {
            const c = ESTADO_CONFIG[e]
            return (
              <button
                key={e}
                onClick={() => { onChange(e); setOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors
                  ${e === estado ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${c.pill}`}>
                  {c.dot}
                </span>
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PregoView({ userName }: Props) {
  const [rows, setRows] = useState<PregoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    getAllPrego()
      .then(data => {
        const order = REGIONS.map(r => r.cod)
        const sorted = [...data].sort((a, b) => order.indexOf(a.region_cod) - order.indexOf(b.region_cod))
        setRows(sorted)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleChange(regionCod: string, fase: PregoFaseKey, estado: PregoEstado) {
    const prev = rows.find(r => r.region_cod === regionCod)
    if (!prev) return

    setRows(rs => rs.map(r => r.region_cod === regionCod ? { ...r, [fase]: estado } : r))
    setSaving(`${regionCod}:${fase}`)

    try {
      await updatePregoFase(regionCod, fase, estado, userName)
    } catch {
      setRows(rs => rs.map(r => r.region_cod === regionCod ? { ...r, [fase]: prev[fase] } : r))
    } finally {
      setSaving(null)
    }
  }

  // Single pass: compute avance per row once, derive all stats from it
  const avances = rows.map(calcAvance)
  const completadas = avances.filter(p => p === 100).length
  const enProceso   = avances.filter(p => p > 0 && p < 100).length
  const sinIniciar  = avances.filter(p => p === 0).length
  const avgAvance   = avances.length > 0
    ? Math.round(avances.reduce((s, p) => s + p, 0) / avances.length)
    : 0

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Summary bar */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-3 flex-wrap">
          <SummaryCard label="Completadas" value={completadas.toString()} color="text-green-700" bg="bg-green-50"  dot="bg-green-500" />
          <SummaryCard label="En proceso"  value={enProceso.toString()}   color="text-amber-700" bg="bg-amber-50"  dot="bg-amber-400" />
          <SummaryCard label="Sin iniciar" value={sinIniciar.toString()}  color="text-gray-600"  bg="bg-gray-100" dot="bg-gray-300" />
          <div className="ml-auto flex items-center gap-2 bg-slate-50 rounded-xl px-4 py-2">
            <span className="text-xs text-gray-500">Avance promedio</span>
            <span className="text-lg font-bold text-slate-700">{avgAvance}%</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && (
          <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Cargando...</div>
        )}
        {error && (
          <div className="flex items-center justify-center h-48 text-red-500 text-sm">Error: {error}</div>
        )}
        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 gap-1 text-gray-400 text-sm">
            <p>No hay datos PREGO aún.</p>
            <p className="text-xs">Ejecuta el SQL de creación de tabla en Supabase.</p>
          </div>
        )}
        {!loading && !error && rows.length > 0 && (
          <table className="w-full text-sm border-collapse bg-white">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider w-36">
                  Región
                </th>
                {FASES_PRE_E3.map(f => (
                  <th key={f.key} className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th colSpan={FASES_E3.length} className="px-2 py-2 text-center border-l border-r border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">E3 — Revisiones paralelas</div>
                  <div className="flex justify-around mt-0.5">
                    {FASES_E3.map(f => (
                      <span key={f.key} className="text-gray-400 text-xs">{f.label.replace('E3 ', '')}</span>
                    ))}
                  </div>
                </th>
                {FASES_POST_E3.map(f => (
                  <th key={f.key} className="px-2 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center whitespace-nowrap">
                    {f.label}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right w-28">
                  Avance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => {
                const region = REGIONS.find(r => r.cod === row.region_cod)
                return (
                  <tr key={row.region_cod} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-gray-800 text-xs leading-tight">{region?.nombre ?? row.region_cod}</div>
                      <div className="text-gray-400 text-xs">{region?.capital}</div>
                    </td>
                    {FASES_PRE_E3.map(f => (
                      <td key={f.key} className="px-2 py-2.5 text-center">
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    {FASES_E3.map(f => (
                      <td key={f.key} className="px-1 py-2.5 text-center border-l first:border-l-0 border-gray-100">
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    {FASES_POST_E3.map(f => (
                      <td key={f.key} className="px-2 py-2.5 text-center">
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2.5 text-right">
                      <AvanceBar pct={avances[i]} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, bg, dot }: {
  label: string; value: string; color: string; bg: string; dot?: string
}) {
  return (
    <div className={`flex items-center gap-2 ${bg} rounded-xl px-4 py-2`}>
      {dot && <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />}
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-lg font-bold ${color}`}>{value}</span>
    </div>
  )
}
