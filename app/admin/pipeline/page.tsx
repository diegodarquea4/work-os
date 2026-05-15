'use client'

import { useState, useEffect, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { V2PipelineConfig, V2PipelineLog } from '@/lib/types'

type PipelineRow = V2PipelineConfig & {
  catalogo?: { nombre: string; categoria: string; frecuencia_esperada: string }
  logs?: V2PipelineLog[]
}

const METODO_LABEL: Record<string, { label: string; color: string }> = {
  api_rest: { label: 'API REST', color: '#22c55e' },
  sdmx:     { label: 'SDMX',     color: '#3b82f6' },
  descarga: { label: 'Descarga', color: '#f59e0b' },
  scraping: { label: 'Scraping', color: '#ef4444' },
  manual:   { label: 'Manual',   color: '#9ca3af' },
}

const ESTADO_LABEL: Record<string, { label: string; color: string }> = {
  ok:        { label: 'OK',       color: '#22c55e' },
  parcial:   { label: 'Parcial',  color: '#f59e0b' },
  error:     { label: 'Error',    color: '#ef4444' },
  pendiente: { label: 'Pendiente', color: '#9ca3af' },
}

function diasDesde(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function PipelinePage() {
  const [rows, setRows] = useState<PipelineRow[]>([])
  const [logs, setLogs] = useState<V2PipelineLog[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  useEffect(() => {
    const sb = getSupabase()
    Promise.all([
      sb.from('v2_indicadores_pipeline')
        .select('*, catalogo:v2_indicadores_catalogo(nombre, categoria, frecuencia_esperada)')
        .order('codigo_indicador'),
      sb.from('v2_indicadores_pipeline_log')
        .select('*')
        .order('ejecutado_at', { ascending: false })
        .limit(200),
    ]).then(([pRes, lRes]) => {
      setRows((pRes.data ?? []) as PipelineRow[])
      setLogs((lRes.data ?? []) as V2PipelineLog[])
      setLoading(false)
    })
  }, [])

  // Compute freshness
  const enriched = useMemo(() => {
    const FREQ_DAYS: Record<string, number> = {
      semanal: 7, mensual: 30, trimestral: 90, anual: 365, bianual: 730, censal: 1825,
    }

    return rows.map(r => {
      const freq = r.catalogo?.frecuencia_esperada ?? 'anual'
      const expectedDays = FREQ_DAYS[freq] ?? 365
      const age = diasDesde(r.ultima_ejecucion)
      const stale = age !== null ? age > expectedDays * 2 : r.metodo !== 'manual'
      const overdue = age !== null ? age > r.tolerancia_atraso_dias : false
      const recentLogs = logs.filter(l => l.codigo_indicador === r.codigo_indicador).slice(0, 5)
      return { ...r, age, stale, overdue, recentLogs }
    })
  }, [rows, logs])

  const filtered = filter === 'all' ? enriched
    : filter === 'errors' ? enriched.filter(r => r.ultima_ejecucion_estado === 'error')
    : filter === 'stale' ? enriched.filter(r => r.stale)
    : filter === 'overdue' ? enriched.filter(r => r.overdue)
    : enriched.filter(r => r.metodo === filter)

  // Stats
  const stats = {
    total: enriched.length,
    ok: enriched.filter(r => r.ultima_ejecucion_estado === 'ok').length,
    errors: enriched.filter(r => r.ultima_ejecucion_estado === 'error').length,
    stale: enriched.filter(r => r.stale).length,
    overdue: enriched.filter(r => r.overdue).length,
    neverRun: enriched.filter(r => !r.ultima_ejecucion).length,
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-slate-700 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pipeline de Indicadores</h1>
            <p className="text-sm text-gray-600 mt-1">
              Estado de actualización de los {stats.total} indicadores del catálogo v2
            </p>
          </div>
          <a href="/" className="text-sm text-blue-600 hover:underline">← Volver al Work OS</a>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total" value={stats.total} color="#374151" />
          <StatCard label="OK" value={stats.ok} color="#22c55e" />
          <StatCard label="Errores" value={stats.errors} color="#ef4444" onClick={() => setFilter('errors')} />
          <StatCard label="Obsoletos" value={stats.stale} color="#f59e0b" onClick={() => setFilter('stale')} />
          <StatCard label="Nunca ejecutados" value={stats.neverRun} color="#9ca3af" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {['all', 'api_rest', 'manual', 'errors', 'stale', 'overdue'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}>
              {f === 'all' ? 'Todos' : f === 'api_rest' ? 'API REST' : f === 'errors' ? 'Con errores' : f === 'stale' ? 'Obsoletos' : f === 'overdue' ? 'Atrasados' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span className="ml-1 opacity-60">
                ({f === 'all' ? enriched.length : f === 'errors' ? stats.errors : f === 'stale' ? stats.stale : f === 'overdue' ? stats.overdue : enriched.filter(r => r.metodo === f).length})
              </span>
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">Indicador</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-700">Categoría</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-700">Método</th>
                  <th className="text-center px-3 py-3 font-semibold text-gray-700">Estado</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-700">Última ejecución</th>
                  <th className="text-right px-3 py-3 font-semibold text-gray-700">Edad</th>
                  <th className="text-left px-3 py-3 font-semibold text-gray-700">Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const metodo = METODO_LABEL[r.metodo] ?? METODO_LABEL.manual
                  const estado = r.ultima_ejecucion_estado ? (ESTADO_LABEL[r.ultima_ejecucion_estado] ?? ESTADO_LABEL.pendiente) : ESTADO_LABEL.pendiente
                  return (
                    <tr key={r.id} className={`border-b border-gray-50 hover:bg-gray-50 ${r.overdue ? 'bg-red-50' : r.stale ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900 text-xs">{r.codigo_indicador}</p>
                        <p className="text-gray-600 text-[11px]">{r.catalogo?.nombre ?? ''}</p>
                      </td>
                      <td className="px-3 py-2.5 text-gray-700 text-xs">{r.catalogo?.categoria ?? '—'}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: metodo.color + '20', color: metodo.color }}>
                          {metodo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: estado.color + '20', color: estado.color }}>
                          {estado.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-gray-700">
                        {r.ultima_ejecucion
                          ? new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(r.ultima_ejecucion))
                          : <span className="text-gray-500">Nunca</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs">
                        {r.age !== null ? (
                          <span className={r.overdue ? 'text-red-600 font-semibold' : r.stale ? 'text-amber-600' : 'text-gray-700'}>
                            {r.age}d
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 max-w-[200px] truncate">
                        {r.ultima_ejecucion_mensaje ?? '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent logs */}
        {logs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Últimas ejecuciones</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-2.5 font-semibold text-gray-700">Indicador</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-gray-700">Estado</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-700">Filas</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-700">Duración</th>
                    <th className="text-right px-3 py-2.5 font-semibold text-gray-700">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 20).map(l => {
                    const estado = ESTADO_LABEL[l.estado] ?? ESTADO_LABEL.pendiente
                    return (
                      <tr key={l.id} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-900 font-medium">{l.codigo_indicador}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: estado.color + '20', color: estado.color }}>
                            {estado.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">{l.filas_persistidas}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{l.duracion_ms != null ? `${l.duracion_ms}ms` : '—'}</td>
                        <td className="px-3 py-2 text-right text-gray-600">
                          {new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(l.ejecutado_at))}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-4 text-center hover:shadow-sm transition-shadow"
      style={{ borderBottomWidth: 3, borderBottomColor: color }}>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-600 mt-1">{label}</p>
    </button>
  )
}
