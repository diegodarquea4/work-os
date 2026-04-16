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

const FASES_E3      = PREGO_FASES.filter(f => f.key.startsWith('e3_'))
const FASES_PRE_E3  = PREGO_FASES.filter(f => !f.key.startsWith('e3_')).slice(0, 3)
const FASES_POST_E3 = PREGO_FASES.filter(f => !f.key.startsWith('e3_')).slice(3)

const ESTADO_LABEL: Record<PregoEstado, string> = {
  pendiente:  'Pendiente',
  en_curso:   'En curso',
  completado: 'Completado',
  bloqueado:  'Bloqueado',
}

function calcAvance(row: PregoRow): number {
  const completadas = PREGO_FASES.filter(f => row[f.key] === 'completado').length
  return Math.round((completadas / PREGO_FASES.length) * 100)
}

function AvanceBar({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-400' : pct > 0 ? 'bg-blue-400' : 'bg-gray-200'
  return (
    <div className="flex items-center gap-2">
      <div className="w-28 bg-gray-100 rounded-full h-2.5">
        <div className={`${color} h-2.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-gray-600 w-8 text-right">{pct}%</span>
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
        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all
          ${cfg.pill} ${saving ? 'opacity-40 cursor-wait' : 'hover:opacity-70 cursor-pointer'}`}
      >
        {saving ? '…' : cfg.dot}
      </button>

      {open && (
        <div className="absolute top-7 z-50 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-32">
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

function exportCSV(rows: PregoRow[]) {
  const headers = ['Región', 'Capital', ...PREGO_FASES.map(f => `${f.label} ${f.sublabel}`), 'Avance (%)']
  const lines = rows.map(row => {
    const region = REGIONS.find(r => r.cod === row.region_cod)
    return [
      region?.nombre ?? row.region_cod,
      region?.capital ?? '',
      ...PREGO_FASES.map(f => ESTADO_LABEL[row[f.key]]),
      calcAvance(row).toString(),
    ].map(v => `"${v}"`).join(',')
  })
  const csv = [headers.map(h => `"${h}"`).join(','), ...lines].join('\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `prego-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportPDF(rows: PregoRow[], avgAvance: number) {
  const faseHeaders = PREGO_FASES.map(f => `<th>${f.label} ${f.sublabel}</th>`).join('')
  const stateCell = (s: PregoEstado) => {
    const colors: Record<PregoEstado, string> = {
      pendiente: '#e5e7eb',
      en_curso: '#fef3c7',
      completado: '#d1fae5',
      bloqueado: '#fee2e2',
    }
    const textColors: Record<PregoEstado, string> = {
      pendiente: '#6b7280',
      en_curso: '#92400e',
      completado: '#065f46',
      bloqueado: '#991b1b',
    }
    return `<td style="text-align:center;padding:4px 6px;">
      <span style="display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;background:${colors[s]};color:${textColors[s]}">
        ${ESTADO_LABEL[s]}
      </span>
    </td>`
  }
  const tableRows = rows.map(row => {
    const region = REGIONS.find(r => r.cod === row.region_cod)
    const avance = calcAvance(row)
    return `<tr>
      <td style="padding:4px 8px;font-weight:500">${region?.nombre ?? row.region_cod}</td>
      ${PREGO_FASES.map(f => stateCell(row[f.key])).join('')}
      <td style="text-align:right;padding:4px 8px;font-weight:600">${avance}%</td>
    </tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>PREGO — Situación actual</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; font-size: 11px; color: #111; padding: 24px 20px; }
    h1 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
    .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 12px; }
    .summary { display: flex; gap: 16px; margin-bottom: 14px; font-size: 11px; color: #374151; }
    .summary span strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f9fafb; }
    th { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 5px 6px; border-bottom: 1px solid #e5e7eb; text-align: center; white-space: nowrap; }
    th:first-child { text-align: left; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    tbody tr td { border-bottom: 1px solid #f3f4f6; }
    @media print { @page { margin: 12mm; size: A4 landscape; } }
  </style>
</head>
<body>
  <h1>PREGO — Situación actual</h1>
  <div class="subtitle">Panel Seguimiento Gubernamental · Regiones · ${new Date().toLocaleDateString('es-CL', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
  <div class="summary">
    <span>Avance promedio: <strong>${avgAvance}%</strong></span>
    <span>Completadas: <strong>${rows.filter((_, i) => calcAvance(rows[i]) === 100).length}</strong></span>
    <span>Regiones: <strong>${rows.length}</strong></span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="text-align:left">Región</th>
        ${faseHeaders}
        <th>Avance</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
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
      <div className="flex-shrink-0 px-4 py-2.5 border-b border-gray-100 bg-white">
        <div className="flex items-center gap-2 flex-wrap">
          <SummaryCard label="Completadas" value={completadas.toString()} color="text-green-700" bg="bg-green-50"  dot="bg-green-500" />
          <SummaryCard label="En proceso"  value={enProceso.toString()}   color="text-amber-700" bg="bg-amber-50"  dot="bg-amber-400" />
          <SummaryCard label="Sin iniciar" value={sinIniciar.toString()}  color="text-gray-600"  bg="bg-gray-100" dot="bg-gray-300" />
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-slate-50 rounded-lg px-3 py-1.5">
              <span className="text-xs text-gray-500">Avance promedio</span>
              <span className="text-base font-bold text-slate-700">{avgAvance}%</span>
            </div>
            {rows.length > 0 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => exportCSV(rows)}
                  title="Descargar CSV"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  CSV
                </button>
                <button
                  onClick={() => exportPDF(rows, avgAvance)}
                  title="Descargar PDF"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  PDF
                </button>
              </div>
            )}
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
          <div className="flex justify-center py-6 px-4">
          <table className="text-sm border-collapse bg-white rounded-xl shadow-sm overflow-hidden">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider w-44">
                  Región
                </th>
                {FASES_PRE_E3.map(f => (
                  <th key={f.key} className="px-1 py-2 text-center w-28">
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">{f.label}</div>
                    <div className="text-gray-400 text-xs font-normal normal-case tracking-normal mt-0.5">{f.sublabel}</div>
                  </th>
                ))}
                <th colSpan={FASES_E3.length} className="px-2 py-1.5 text-center border-l border-r border-gray-100">
                  <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">F3 — Revisiones paralelas</div>
                  <div className="flex justify-around mt-0.5">
                    {FASES_E3.map(f => (
                      <span key={f.key} className="text-gray-400 text-xs w-20 text-center">{f.sublabel}</span>
                    ))}
                  </div>
                </th>
                {FASES_POST_E3.map((f, i) => (
                  <th key={f.key} className={`px-1 py-2 text-center w-28${i === 0 ? ' border-l border-gray-100' : ''}`}>
                    <div className="text-xs font-bold text-gray-600 uppercase tracking-wider">{f.label}</div>
                    <div className="text-gray-400 text-xs font-normal normal-case tracking-normal mt-0.5">{f.sublabel}</div>
                  </th>
                ))}
                <th className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider text-center w-44">
                  Avance
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, i) => {
                const region = REGIONS.find(r => r.cod === row.region_cod)
                return (
                  <tr key={row.region_cod} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-gray-800 text-sm leading-tight">{region?.nombre ?? row.region_cod}</div>
                      <div className="text-gray-400 text-xs mt-0.5">{region?.capital}</div>
                    </td>
                    {FASES_PRE_E3.map(f => (
                      <td key={f.key} className="px-1 py-2 text-center w-28">
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    {FASES_E3.map(f => (
                      <td key={f.key} className="px-1 py-2 text-center w-20 border-l first:border-l-0 border-gray-100">
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    {FASES_POST_E3.map((f, i) => (
                      <td key={f.key} className={`px-1 py-2 text-center w-28${i === 0 ? ' border-l border-gray-100' : ''}`}>
                        <CeldaEstado
                          estado={row[f.key]}
                          saving={saving === `${row.region_cod}:${f.key}`}
                          onChange={e => handleChange(row.region_cod, f.key, e)}
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2">
                      <div className="flex justify-center">
                        <AvanceBar pct={avances[i]} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color, bg, dot }: {
  label: string; value: string; color: string; bg: string; dot?: string
}) {
  return (
    <div className={`flex items-center gap-1.5 ${bg} rounded-lg px-3 py-1.5`}>
      {dot && <span className={`w-2 h-2 rounded-full ${dot} flex-shrink-0`} />}
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-base font-bold ${color}`}>{value}</span>
    </div>
  )
}
