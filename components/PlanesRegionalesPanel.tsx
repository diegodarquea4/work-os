'use client'

import { useState, useEffect, useRef } from 'react'

type PlanRow = {
  region_cod:    string
  region_nombre: string
  cargado:       boolean
  archivo_url:   string | null
  uploaded_at:   string | null
  uploaded_by:   string | null
}

export default function PlanesRegionalesPanel() {
  const [planes, setPlanes]     = useState<PlanRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [deleting, setDeleting]   = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)
  const fileInputRef              = useRef<HTMLInputElement>(null)
  const [targetCod, setTargetCod] = useState<string | null>(null)

  useEffect(() => { loadPlanes() }, [])

  async function loadPlanes() {
    setLoading(true)
    const res = await fetch('/api/admin/plan-regional')
    if (res.ok) setPlanes(await res.json())
    setLoading(false)
  }

  function handleUploadClick(cod: string) {
    setTargetCod(cod)
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !targetCod) return
    e.target.value = ''

    setUploading(targetCod)
    setError(null)
    const formData = new FormData()
    formData.append('pdf', file)

    const res = await fetch(`/api/admin/plan-regional/${targetCod}`, {
      method: 'POST',
      body: formData,
    })
    if (res.ok) {
      await loadPlanes()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Error al subir el archivo')
    }
    setUploading(null)
    setTargetCod(null)
  }

  async function handleDelete(cod: string, nombre: string) {
    if (!confirm(`¿Eliminar el Plan Regional de ${nombre}?`)) return
    setDeleting(cod)
    setError(null)
    const res = await fetch(`/api/admin/plan-regional/${cod}`, { method: 'DELETE' })
    if (res.ok) {
      setPlanes(prev => prev.map(p => p.region_cod === cod
        ? { ...p, cargado: false, archivo_url: null, uploaded_at: null, uploaded_by: null }
        : p
      ))
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Error al eliminar el plan')
    }
    setDeleting(null)
  }

  function fmtDate(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className="mt-8">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Planes Regionales de Gobierno</h3>
          <p className="text-xs text-gray-500 mt-0.5">PDFs usados por el agente IA al generar minutas regionales</p>
        </div>
        <span className="text-xs text-gray-400">
          {planes.filter(p => p.cargado).length} / {planes.length} cargados
        </span>
      </div>

      {error && (
        <div className="mb-3 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          {error}
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando planes...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Región</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Estado</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Subido</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {planes.map(p => {
                const busy = uploading === p.region_cod || deleting === p.region_cod
                return (
                  <tr key={p.region_cod} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-medium text-gray-900">{p.region_nombre}</span>
                      <span className="ml-2 text-xs text-gray-400">{p.region_cod}</span>
                    </td>
                    <td className="px-5 py-3">
                      {p.cargado ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Cargado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                          Sin cargar
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {p.uploaded_at ? (
                        <div>
                          <span className="text-xs text-gray-600">{fmtDate(p.uploaded_at)}</span>
                          {p.uploaded_by && (
                            <div className="text-xs text-gray-400">{p.uploaded_by}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {p.cargado && p.archivo_url && (
                          <a
                            href={p.archivo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50"
                            title="Ver PDF"
                          >
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 7s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z"/>
                              <circle cx="7" cy="7" r="1.5"/>
                            </svg>
                          </a>
                        )}
                        <button
                          onClick={() => handleUploadClick(p.region_cod)}
                          disabled={busy}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title={p.cargado ? 'Reemplazar PDF' : 'Subir PDF'}
                        >
                          {uploading === p.region_cod ? (
                            <>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
                                <circle cx="5.5" cy="5.5" r="3.5" strokeDasharray="11" strokeDashoffset="3"/>
                              </svg>
                              Subiendo...
                            </>
                          ) : (
                            <>
                              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M5.5 8V2M3 4.5l2.5-2.5L8 4.5M1.5 9.5h8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              {p.cargado ? 'Reemplazar' : 'Subir PDF'}
                            </>
                          )}
                        </button>
                        {p.cargado && (
                          <button
                            onClick={() => handleDelete(p.region_cod, p.region_nombre)}
                            disabled={busy}
                            className="p-1.5 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50 disabled:opacity-40"
                            title="Eliminar plan"
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 6.5v3.5M8.5 6.5v3.5M3 3.5l.8 7.5h5.4l.8-7.5"/>
                            </svg>
                          </button>
                        )}
                      </div>
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
