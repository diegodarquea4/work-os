'use client'

import { useState, useEffect, useRef } from 'react'

type DocRow = {
  region_cod:    string
  region_nombre: string
  cargado:       boolean
  archivo_url:   string | null
  uploaded_at:   string | null
  uploaded_by:   string | null
}

type Tipo = 'plan' | 'conflictos'

const ENDPOINT: Record<Tipo, string> = {
  plan:       '/api/admin/plan-regional',
  conflictos: '/api/admin/conflictos-regionales',
}
const TIPO_LABEL: Record<Tipo, string> = {
  plan:       'Plan Regional',
  conflictos: 'Conflictos',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Panel de carga de documentos por región (vista de Administración).
 * Dos tipos por región: Plan Regional (alimenta la minuta) y Conflictos
 * (PDF que se usará en las minutas regionales). Cada tipo clona la misma
 * infraestructura de storage; acá se muestran juntos en una tabla comprimida.
 */
export default function DocumentosRegionalesPanel() {
  const [planes, setPlanes]         = useState<DocRow[]>([])
  const [conflictos, setConflictos] = useState<DocRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [uploading, setUploading]   = useState<string | null>(null) // `${tipo}:${cod}`
  const [deleting, setDeleting]     = useState<string | null>(null) // `${tipo}:${cod}`
  const [error, setError]           = useState<string | null>(null)
  const fileInputRef                = useRef<HTMLInputElement>(null)
  const [target, setTarget]         = useState<{ tipo: Tipo; cod: string } | null>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [planRes, confRes] = await Promise.all([
      fetch(ENDPOINT.plan),
      fetch(ENDPOINT.conflictos),
    ])
    if (planRes.ok) setPlanes(await planRes.json())
    if (confRes.ok) setConflictos(await confRes.json())
    setLoading(false)
  }

  function setTipoState(tipo: Tipo, rows: DocRow[]) {
    if (tipo === 'plan') setPlanes(rows)
    else setConflictos(rows)
  }
  function getTipoState(tipo: Tipo): DocRow[] {
    return tipo === 'plan' ? planes : conflictos
  }

  function handleUploadClick(tipo: Tipo, cod: string) {
    setTarget({ tipo, cod })
    fileInputRef.current?.click()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !target) return
    e.target.value = ''
    const { tipo, cod } = target
    const key = `${tipo}:${cod}`

    setUploading(key)
    setError(null)
    const formData = new FormData()
    formData.append('pdf', file)

    const res = await fetch(`${ENDPOINT[tipo]}/${cod}`, { method: 'POST', body: formData })
    if (res.ok) {
      await loadAll()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Error al subir el archivo')
    }
    setUploading(null)
    setTarget(null)
  }

  async function handleDelete(tipo: Tipo, cod: string, nombre: string) {
    if (!confirm(`¿Eliminar el documento "${TIPO_LABEL[tipo]}" de ${nombre}?`)) return
    const key = `${tipo}:${cod}`
    setDeleting(key)
    setError(null)
    const res = await fetch(`${ENDPOINT[tipo]}/${cod}`, { method: 'DELETE' })
    if (res.ok) {
      setTipoState(tipo, getTipoState(tipo).map(r => r.region_cod === cod
        ? { ...r, cargado: false, archivo_url: null, uploaded_at: null, uploaded_by: null }
        : r
      ))
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Error al eliminar el documento')
    }
    setDeleting(null)
  }

  // Filas alineadas por región (ambos endpoints devuelven las 16 en orden de REGIONS).
  const confByCod = new Map(conflictos.map(c => [c.region_cod, c]))
  const rows = planes.map(p => ({ plan: p, conflicto: confByCod.get(p.region_cod) ?? null }))

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-base font-bold text-gray-900">Documentos por región</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Plan Regional (lo usa el agente IA al generar minutas) y Conflictos regionales (para las minutas).
          </p>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          Planes {planes.filter(p => p.cargado).length}/{planes.length} · Conflictos {conflictos.filter(c => c.cargado).length}/{conflictos.length}
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
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Cargando documentos...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Región</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Plan Regional</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">Conflictos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ plan, conflicto }) => (
                <tr key={plan.region_cod} className="hover:bg-gray-50 transition-colors align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-gray-900 leading-tight">{plan.region_nombre}</div>
                    <div className="text-xs text-gray-400">{plan.region_cod}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    <DocCell
                      row={plan}
                      busy={uploading === `plan:${plan.region_cod}` || deleting === `plan:${plan.region_cod}`}
                      uploadingThis={uploading === `plan:${plan.region_cod}`}
                      onUpload={() => handleUploadClick('plan', plan.region_cod)}
                      onDelete={() => handleDelete('plan', plan.region_cod, plan.region_nombre)}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <DocCell
                      row={conflicto ?? { ...plan, cargado: false, archivo_url: null, uploaded_at: null, uploaded_by: null }}
                      busy={uploading === `conflictos:${plan.region_cod}` || deleting === `conflictos:${plan.region_cod}`}
                      uploadingThis={uploading === `conflictos:${plan.region_cod}`}
                      onUpload={() => handleUploadClick('conflictos', plan.region_cod)}
                      onDelete={() => handleDelete('conflictos', plan.region_cod, plan.region_nombre)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ── Celda compacta de documento: estado + (fecha · autor) + acciones ──────────
function DocCell({
  row, busy, uploadingThis, onUpload, onDelete,
}: {
  row: DocRow
  busy: boolean
  uploadingThis: boolean
  onUpload: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {row.cargado ? (
        <div>
          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M2 5l2.5 2.5L8 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cargado
          </span>
          <div className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[180px]">
            {fmtDate(row.uploaded_at)}{row.uploaded_by ? ` · ${row.uploaded_by}` : ''}
          </div>
        </div>
      ) : (
        <span className="inline-flex w-fit items-center gap-1 text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
          Sin cargar
        </span>
      )}

      <div className="flex items-center gap-1.5">
        {row.cargado && row.archivo_url && (
          <a
            href={row.archivo_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-gray-400 hover:text-blue-600 transition-colors rounded hover:bg-blue-50"
            title="Ver PDF"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 7s2-4 5-4 5 4 5 4-2 4-5 4-5-4-5-4z"/>
              <circle cx="7" cy="7" r="1.5"/>
            </svg>
          </a>
        )}
        <button
          onClick={onUpload}
          disabled={busy}
          className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title={row.cargado ? 'Reemplazar PDF' : 'Subir PDF'}
        >
          {uploadingThis ? (
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
              {row.cargado ? 'Reemplazar' : 'Subir PDF'}
            </>
          )}
        </button>
        {row.cargado && (
          <button
            onClick={onDelete}
            disabled={busy}
            className="p-1 text-gray-300 hover:text-red-500 transition-colors rounded hover:bg-red-50 disabled:opacity-40"
            title="Eliminar documento"
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 3.5h9M5 3.5V2h3v1.5M4.5 6.5v3.5M8.5 6.5v3.5M3 3.5l.8 7.5h5.4l.8-7.5"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
