'use client'

import { useRef, useState } from 'react'
import type { Documento } from '@/lib/types'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { esUrlAbsoluta } from '@/lib/storagePath'
import { EmptyState } from '@/components/ui'

type Props = {
  prioridadId: number
  documentos: Documento[]
  onRefresh: () => Promise<void>
  // Cualquier autenticado puede subir y eliminar lo propio.
  canCreate?: boolean
  // Solo admin/editor puede eliminar lo ajeno.
  canDeleteAny?: boolean
  // Email del usuario actual — se auto-pobla en `subido_por` al subir.
  // Base para distinguir lo propio vs ajeno.
  currentUserEmail?: string
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

const BUCKET = 'project-docs'
/** TTL del link firmado: alcanza para abrir/descargar, no para compartir. */
const SIGNED_URL_TTL_SEC = 600

/**
 * Nombre seguro para el path del bucket: sin acentos, espacios ni separadores
 * de ruta. El nombre real se conserva aparte, en `documentos_prioridad.nombre`.
 */
function safeFileName(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
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

export default function DocumentosTab({
  prioridadId,
  documentos,
  onRefresh,
  canCreate = true,
  canDeleteAny = true,
  currentUserEmail = '',
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // "Mío vs ajeno" — los documentos viejos sin email se consideran ajenos.
  const isOwn = (d: Documento) => !!currentUserEmail && d.subido_por === currentUserEmail
  const canManage = (d: Documento) => canDeleteAny || isOwn(d)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    const sb   = getSupabase()
    const path = `${prioridadId}/${Date.now()}_${safeFileName(file.name)}`
    const { error: storageErr } = await sb.storage.from(BUCKET).upload(path, file)
    if (storageErr) {
      setUploadError(`Error subiendo archivo: ${storageErr.message}`)
      setUploading(false)
      return
    }
    // subido_por se auto-pobla con el email del usuario (no editable).
    try {
      await safeWrite(
        sb.from('documentos_prioridad').insert({
          prioridad_id: prioridadId,
          nombre:       file.name,
          // Se guarda el PATH: el bucket es privado y el link se firma al
          // abrirlo. Guardar la URL pública dejaba cada adjunto descargable
          // desde Internet sin sesión.
          url:          path,
          tipo_archivo: file.type || null,
          tamano_bytes: file.size,
          subido_por:   currentUserEmail || null,
        }),
        `documentos_prioridad insert prioridad=${prioridadId}`,
      )
      await onRefresh()
    } catch (err) {
      // El archivo ya está en Storage pero el row no se persistió. Mostrar
      // el error claro — el usuario puede reintentar o el admin limpiar el
      // archivo huérfano. No revertimos el upload por simplicidad.
      setUploadError((err as Error).message)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * Abre el documento con un link firmado. La pestaña se abre ANTES del await
   * (si no, el bloqueador de pop-ups la mata por no venir de un clic directo)
   * y después se le apunta la URL.
   */
  async function handleAbrir(doc: Documento) {
    if (esUrlAbsoluta(doc.url)) {
      window.open(doc.url, '_blank', 'noopener,noreferrer')
      return
    }
    const win = window.open('', '_blank', 'noopener,noreferrer')
    const { data, error } = await getSupabase().storage
      .from(BUCKET)
      .createSignedUrl(doc.url, SIGNED_URL_TTL_SEC)
    if (error || !data?.signedUrl) {
      win?.close()
      window.alert('No se pudo abrir el documento. Inténtalo de nuevo.')
      return
    }
    if (win) win.location.href = data.signedUrl
    else window.location.href = data.signedUrl  // pop-up bloqueado: misma pestaña
  }

  async function handleDelete(doc: Documento) {
    if (!confirm(`¿Eliminar "${doc.nombre}"?`)) return
    try {
      await safeDelete(
        getSupabase().from('documentos_prioridad').delete().eq('id', doc.id),
        `documentos_prioridad delete id=${doc.id}`,
      )
      await onRefresh()
    } catch (err) {
      window.alert((err as Error).message)
    }
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
      {canCreate && <button
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
        <EmptyState
          title="Sin documentos adjuntos"
          description="Adjunta actas, informes y respaldos de esta iniciativa."
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14,2 14,8 20,8"/>
            </svg>
          }
        />
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
                <button
                  onClick={() => handleAbrir(doc)}
                  className="p-1.5 text-gray-400 hover:text-slate-700 transition-colors rounded-lg hover:bg-gray-50"
                  title="Abrir"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M11 9v3a1 1 0 01-1 1H2a1 1 0 01-1-1V4a1 1 0 011-1h3"/>
                    <path d="M8 1h5v5M5.5 8.5L13 1"/>
                  </svg>
                </button>
                {canManage(doc) && (
                <button
                  onClick={() => handleDelete(doc)}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
                  title={isOwn(doc) ? 'Eliminar' : 'Eliminar (eres admin/editor)'}
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
