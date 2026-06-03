'use client'

import { useState, useRef } from 'react'
import { downloadTemplate } from '@/lib/templateExcel'

/**
 * Modal para que un usuario (típicamente regional) suba una propuesta de
 * actualización masiva. La propuesta queda en estado pending y un admin/editor
 * la revisa después desde "Usuarios → Propuestas de actualización".
 *
 * Diferencia con el flow directo del Dashboard:
 *   - NO parsea el .xlsx en cliente (lo hace el endpoint approve cuando se aprueba).
 *   - NO muestra preview de filas (la revisión es offline en Excel).
 *   - Solo sube el archivo + metadata opcional.
 */
type Props = {
  open: boolean
  onClose: () => void
  // Región a la que aplica la propuesta. Obligatoria: se deriva del contexto
  // de Mi Región (la región activa donde el usuario apretó "Proponer
  // actualización"). Se envía a `regions_claim` y permite que "Mis propuestas"
  // muestre solo las propuestas relevantes a esta región.
  regionName: string
  // Callback al submit exitoso (para refrescar "Mis propuestas").
  onSubmitted?: () => void
}

export default function ProposeImportModal({ open, onClose, regionName, onSubmitted }: Props) {
  const [file, setFile]       = useState<File | null>(null)
  const [note, setNote]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const fileInputRef          = useRef<HTMLInputElement>(null)

  if (!open) return null

  function handleClose() {
    if (submitting) return
    setFile(null)
    setNote('')
    setError(null)
    setSuccess(false)
    onClose()
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls')) {
      setError('El archivo debe ser .xlsx')
      return
    }
    setFile(f)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)

    const fd = new FormData()
    fd.append('file', file)
    if (note.trim()) fd.append('proposer_note', note.trim())
    fd.append('regions_claim', regionName)

    const res = await fetch('/api/proposals', { method: 'POST', body: fd })
    setSubmitting(false)
    if (res.ok) {
      setSuccess(true)
      onSubmitted?.()
    } else {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'No se pudo subir la propuesta.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="bg-slate-900 px-6 py-4 flex items-center justify-between">
          <div>
            <span className="text-white font-semibold block leading-tight">Proponer actualización</span>
            <span className="text-slate-400 text-xs">Región: {regionName}</span>
          </div>
          <button onClick={handleClose} className="text-slate-400 hover:text-white" disabled={submitting}>✕</button>
        </header>

        {success ? (
          <div className="px-6 py-8 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-green-600">
                <path d="M4 11l5 5 9-11" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Propuesta enviada</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              Un administrador del DCI la revisará y, si está OK, confirmará la carga. Puedes ver su
              estado en "Mis propuestas".
            </p>
            <button
              onClick={handleClose}
              className="mt-6 px-5 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600 leading-relaxed">
              Sube un Excel con los cambios que quieres proponer.{' '}
              <button
                type="button"
                onClick={() => downloadTemplate()}
                className="text-blue-600 hover:text-blue-800 font-medium underline"
              >
                Descarga el template
              </button>{' '}
              si no lo tienes.
              <br />
              <span className="text-slate-500">
                Recuerda: en una <strong>actualización</strong>, las celdas que dejes en blanco quedan sin tocar
                (no borran el valor previo).
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Archivo (.xlsx) <span className="text-red-500">*</span>
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile}
                required
                className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-700 file:text-xs file:font-semibold hover:file:bg-slate-200"
              />
              {file && (
                <p className="text-xs text-slate-500 mt-1">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Comentario para el revisor (opcional)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                rows={3}
                placeholder='Ej: "carga semanal Aysén — actualicé estado de los proyectos en ejecución".'
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 resize-none"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={!file || submitting}
                className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
              >
                {submitting ? 'Enviando...' : 'Enviar propuesta'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
