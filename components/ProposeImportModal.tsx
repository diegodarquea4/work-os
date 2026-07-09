'use client'

import { useState, useRef } from 'react'
// templateExcel/importParser arrastran xlsx (~424 KB) — se importan dinámicamente
// dentro de los handlers para no cargarlos al abrir Mi Región.
import type { ParsedRow } from '@/lib/importParser'
import { REGIONS } from '@/lib/regions'
import ImportErrorReport from './ImportErrorReport'
import type { Iniciativa } from '@/lib/projects'
import type { RegionEje } from '@/lib/types'

/**
 * Modal para que un usuario (típicamente regional) suba una propuesta de
 * actualización masiva. La propuesta queda en estado pending y un admin/editor
 * la revisa después desde "Usuarios → Propuestas de actualización".
 *
 * Diferencia con el flow directo del Dashboard:
 *   - NO aplica los cambios — solo deja la propuesta en pending.
 *   - SÍ valida el archivo en cliente con el mismo parser que el flow directo
 *     (lib/importParser) para que el regional vea errores y resumen antes de
 *     mandar la propuesta. Esto corta el loop "subir a ciegas → días después
 *     el admin la rechaza por header mal nombrado".
 *   - Si el parse encuentra errores, el botón "Enviar" sigue habilitado para
 *     que el regional pueda enviar igual con una nota explicativa, salvo que
 *     CERO filas hayan quedado válidas — en ese caso bloqueamos.
 */
type Props = {
  open: boolean
  onClose: () => void
  // Región a la que aplica la propuesta. Obligatoria: se deriva del contexto
  // de Mi Región (la región activa donde el usuario apretó "Proponer
  // actualización"). Se envía a `regions_claim` y permite que "Mis propuestas"
  // muestre solo las propuestas relevantes a esta región.
  regionName: string
  // Iniciativas vigentes de la región (para pre-llenar el Excel de descarga
  // y para validar updates con # contra iniciativas que existen).
  iniciativas?: Iniciativa[]
  // Catálogo formal de ejes de la región — alimenta la hoja "Ejes válidos"
  // del Excel descargado y valida los ejes del archivo en cliente.
  regionEjes?: RegionEje[]
  // Callback al submit exitoso (para refrescar "Mis propuestas").
  onSubmitted?: () => void
}

type ParsePreview = {
  rows:        ParsedRow[]
  fileErrors:  string[]
  rowErrors:   string[]
  inserts:     number
  updates:     number
  conErrores:  number
  sinCambios:  number
}

export default function ProposeImportModal({ open, onClose, regionName, iniciativas, regionEjes, onSubmitted }: Props) {
  const [file, setFile]       = useState<File | null>(null)
  const [note, setNote]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsePreview | null>(null)
  const [parsing, setParsing] = useState(false)
  // Errores devueltos por /api/proposals tras enviar (caso server-side reject).
  const [ejeErrors, setEjeErrors] = useState<string[]>([])
  const [success, setSuccess] = useState(false)
  const fileInputRef          = useRef<HTMLInputElement>(null)

  if (!open) return null

  function handleClose() {
    if (submitting) return
    setFile(null)
    setNote('')
    setError(null)
    setEjeErrors([])
    setPreview(null)
    setSuccess(false)
    onClose()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls')) {
      setError('El archivo debe ser .xlsx')
      return
    }
    setFile(f)
    setError(null)
    setEjeErrors([])
    setPreview(null)
    setParsing(true)
    try {
      const buffer = await f.arrayBuffer()
      // Catálogo de ejes solo de la región del usuario. Si el archivo tiene
      // iniciativas de otras regiones (no debería, RLS lo rechaza igual), el
      // parser las marcará como "eje no existe en catálogo" — el banner del
      // ImportErrorReport categoriza el caso bien.
      const ejesMap = new Map<string, RegionEje[]>()
      const cod = regionEjes?.[0]?.region_cod
        ?? REGIONS.find(r => r.nombre === regionName)?.cod
      if (cod && regionEjes && regionEjes.length > 0) {
        ejesMap.set(cod, regionEjes)
      }
      const { parseImportWorkbook } = await import('@/lib/importParser')
      const parsed = parseImportWorkbook(buffer, iniciativas ?? [], ejesMap)
      const rowErrors = parsed.rows.flatMap(r => r.errors.map(e => `#${r.n}: ${e}`))
      const inserts    = parsed.rows.filter(r => r.errors.length === 0 && r.isNew).length
      const updates    = parsed.rows.filter(r => r.errors.length === 0 && !r.isNew && Object.keys(r.patch).length > 0).length
      const conErrores = parsed.rows.filter(r => r.errors.length > 0).length
      const sinCambios = parsed.rows.filter(r => r.errors.length === 0 && !r.isNew && Object.keys(r.patch).length === 0).length
      setPreview({
        rows:       parsed.rows,
        fileErrors: parsed.fileErrors,
        rowErrors,
        inserts,
        updates,
        conErrores,
        sinCambios,
      })
    } catch (err) {
      setError('No se pudo leer el archivo. Verifica que sea un Excel válido.')
      console.error('[ProposeImportModal] parse failed', err)
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setSubmitting(true)
    setError(null)
    setEjeErrors([])

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
      const body = await res.json().catch(() => ({})) as { error?: string; ejeErrors?: string[] }
      setError(body.error ?? 'No se pudo subir la propuesta.')
      if (Array.isArray(body.ejeErrors) && body.ejeErrors.length > 0) {
        setEjeErrors(body.ejeErrors)
      }
    }
  }

  // Total de filas validas (con cambios reales). Si es 0, no tiene sentido
  // mandar la propuesta — bloqueamos el submit.
  const hayCambiosValidos = preview ? (preview.inserts + preview.updates) > 0 : true
  const todosLosErrores   = preview ? [...preview.fileErrors, ...preview.rowErrors] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={handleClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 leading-snug">Proponer actualización</p>
              <p className="text-xs text-gray-500 mt-0.5 truncate">Región: {regionName}</p>
            </div>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="text-gray-400 hover:text-gray-600 transition-colors mt-0.5 flex-shrink-0 disabled:opacity-50"
              title="Cerrar"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4l12 12M16 4L4 16"/>
              </svg>
            </button>
          </div>
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
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-600 leading-relaxed">
              Sube un Excel con los cambios que quieres proponer.{' '}
              <button
                type="button"
                onClick={async () => {
                  const { downloadPrefilled } = await import('@/lib/templateExcel')
                  downloadPrefilled(regionName, iniciativas ?? [], regionEjes)
                }}
                className="text-blue-600 hover:text-blue-800 font-medium underline"
              >
                Descarga las iniciativas actuales de {regionName}
              </button>{' '}
              para trabajar sobre la situación real.
              <br />
              <span className="text-slate-500">
                Modifica solo las celdas que cambiaron — las que dejes intactas se mantienen igual.
                Para crear iniciativas nuevas, agrégalas al final con la columna <strong>#</strong> vacía.
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
                  {parsing && ' · revisando…'}
                </p>
              )}
            </div>

            {preview && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  {preview.inserts > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 font-medium border border-blue-200">
                      + {preview.inserts} nueva{preview.inserts !== 1 ? 's' : ''}
                    </span>
                  )}
                  {preview.updates > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-green-100 text-green-800 font-medium border border-green-200">
                      ✓ {preview.updates} actualizacion{preview.updates !== 1 ? 'es' : ''}
                    </span>
                  )}
                  {preview.conErrores > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-800 font-medium border border-red-200">
                      ✗ {preview.conErrores} con errores
                    </span>
                  )}
                  {preview.sinCambios > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">
                      — {preview.sinCambios} sin cambios
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Cargar otro archivo
                  </button>
                </div>

                {todosLosErrores.length > 0 && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <ImportErrorReport errors={todosLosErrores} variant="compact" />
                  </div>
                )}

                {!hayCambiosValidos && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                    Ninguna fila quedó válida para proponer. Corrige el archivo y vuelve a cargarlo.
                  </div>
                )}
              </div>
            )}

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
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg leading-relaxed">
                <p className={ejeErrors.length > 0 ? 'font-semibold mb-1.5' : ''}>{error}</p>
                {ejeErrors.length > 0 && (
                  <ul className="list-disc pl-4 space-y-0.5 text-red-600">
                    {ejeErrors.slice(0, 10).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                    {ejeErrors.length > 10 && (
                      <li className="italic">… y {ejeErrors.length - 10} error{ejeErrors.length - 10 === 1 ? '' : 'es'} más</li>
                    )}
                  </ul>
                )}
              </div>
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
                disabled={!file || submitting || parsing || !hayCambiosValidos}
                className="flex-1 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-700 disabled:opacity-50"
                title={!hayCambiosValidos ? 'Corrige los errores antes de enviar' : undefined}
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
