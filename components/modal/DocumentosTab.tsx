'use client'

import { useRef, useState } from 'react'
import type { Documento } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'

type Props = {
  prioridadId: number
  documentos: Documento[]
  onRefresh: () => Promise<void>
  canEdit?: boolean
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtBytes(b: number | null) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(tipo: string | null) {
  if (!tipo) return '📎'
  if (tipo.includes('pdf'))                                           return '📄'
  if (tipo.includes('sheet') || tipo.includes('excel') || tipo.includes('csv')) return '📊'
  if (tipo.includes('word') || tipo.includes('doc'))                  return '📝'
  if (tipo.includes('image'))                                         return '🖼️'
  if (tipo.includes('presentation') || tipo.includes('powerpoint'))   return '📑'
  return '📎'
}

export default function DocumentosTab({ prioridadId, documentos, onRefresh, canEdit = true }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const sb   = getSupabase()
    const path = `${prioridadId}/${Date.now()}_${file.name}`
    const { error: storageErr } = await sb.storage.from('project-docs').upload(path, file)
    if (storageErr) {
      setUploadError(`Error subiendo archivo: ${storageErr.message}`)
      setUploading(false)
      return
    }
    const { data: { publicUrl } } = sb.storage.from('project-docs').getPublicUrl(path)
    await sb.from('documentos_prioridad').insert({
      prioridad_id: prioridadId,
      nombre:       file.name,
      url:          publicUrl,
      tipo_archivo: file.type || null,
      tamano_bytes: file.size,
    })
    await onRefresh()
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDelete(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return
    await getSupabase().from('documentos_prioridad').delete().eq('id', doc.id)
    await onRefresh()
  }

  return (
    <div className="px-6 py-4">
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleUpload} />
      {uploadError && (
        <div className="flex items-center justify-between gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span>{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {canEdit && <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-slate-300 hover:text-slate-500 transition-colors disabled:opacity-50 mb-4"
      >
        {uploading ? (
          <>
            <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="animate-spin">
              <circle cx="6" cy="6" r="4" strokeDasharray="12" strokeDashoffset="4"/>
            </svg>
            Subiendo...
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 10V2M3 6l4-4 4 4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 11h10" strokeLinecap="round"/>
            </svg>
            Subir archivo (minuta, Excel, PDF…)
          </>
        )}
      </button>}

      {documentos.length === 0 ? (
        <div className="text-center py-10 text-gray-300">
          <svg className="mx-auto mb-3" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14,2 14,8 20,8"/>
          </svg>
          <p className="text-sm">Sin documentos adjuntos</p>
        </div>
      ) : (
        <div className="space-y-2">
          {documentos.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:shadow-sm transition-all group">
              <span className="text-xl flex-shrink-0">{fileIcon(doc.tipo_archivo)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{doc.nombre}</p>
                <p className="text-xs text-gray-500">
                  {fmtDate(doc.created_at)}
                  {doc.tamano_bytes ? ` · ${fmtBytes(doc.tamano_bytes)}` : ''}
                  {doc.subido_por ? ` · ${doc.subido_por}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 text-gray-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-gray-50"
                  title="Abrir"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11 9v3a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1h3"/>
                    <path d="M8 1h5v5M5.5 8.5L13 1"/>
                  </svg>
                </a>
                {canEdit && (
                <button
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title="Eliminar"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M2 4h10M5 4V2h4v2M5.5 7v4M8.5 7v4M3 4l1 8h6l1-8"/>
                  </svg>
                </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
