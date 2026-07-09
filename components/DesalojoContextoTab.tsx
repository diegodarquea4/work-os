'use client'

import { useRef, useState } from 'react'
import type {
  DesalojoCapa,
  DesalojoDetalle,
  DesalojoDocumento,
  DesalojoFaseEstado,
} from '@/lib/types'
import DesalojoCapasMiniTable from './DesalojoCapasMiniTable'
import RichTextEditor from './RichTextEditorLazy'
import { RichTextView, isHtmlEmpty } from './RichTextView'

/**
 * Tab Contexto: lo que pertenece al CASO (no a una capa específica).
 *
 * Compone:
 *   - Detalle del caso editable inline (persiste en desalojo_detalle.resumen_narrativo)
 *   - Mini-tabla de capas con acciones (crear / renombrar / archivar)
 *   - Catastro consolidado (suma de capas activas)
 *   - Documentos generales del caso (capa_id IS NULL)
 *
 * La identificación (región, comuna, ministerio, responsable) ya vive en el
 * header de DesalojoCaseView — no se repite acá.
 */

type Props = {
  detalle:      DesalojoDetalle
  capas:        DesalojoCapa[]
  fasesEstado:  DesalojoFaseEstado[]
  documentos:   DesalojoDocumento[]    // recibidos completos; filtramos a capa_id===null acá
  onPatchResumen: (resumen: string | null) => Promise<void>
  onSelectCapa:   (capaId: number) => void
  onCrearCapa:    (nombre: string) => Promise<void>
  onRenombrarCapa:(capaId: number, nombre: string) => Promise<void>
  onArchivarCapa: (capaId: number) => Promise<void>
  onUploadDoc:    (file: File) => Promise<void>
  onDeleteDoc:    (docId: number) => Promise<void>
}

export default function DesalojoContextoTab({
  detalle, capas, fasesEstado, documentos,
  onPatchResumen, onSelectCapa,
  onCrearCapa, onRenombrarCapa, onArchivarCapa,
  onUploadDoc, onDeleteDoc,
}: Props) {
  const [editingResumen, setEditingResumen] = useState(false)
  const [draftResumen, setDraftResumen]     = useState(detalle.resumen_narrativo ?? '')
  const [savingResumen, setSavingResumen]   = useState(false)
  const [uploading, setUploading]           = useState(false)
  const fileRef                             = useRef<HTMLInputElement>(null)

  const activas = capas.filter(c => c.activa)

  // Catastro consolidado: suma de capas activas (Sección II del 038).
  const catastro = {
    viviendas:             activas.reduce((s, c) => s + (c.viviendas             ?? 0), 0),
    hogares:               activas.reduce((s, c) => s + (c.hogares               ?? 0), 0),
    personas:              activas.reduce((s, c) => s + (c.personas              ?? 0), 0),
    nna:                   activas.reduce((s, c) => s + (c.nna                   ?? 0), 0),
    adultos_mayores:       activas.reduce((s, c) => s + (c.adultos_mayores       ?? 0), 0),
    embarazadas:           activas.reduce((s, c) => s + (c.embarazadas           ?? 0), 0),
    personas_discapacidad: activas.reduce((s, c) => s + (c.personas_discapacidad ?? 0), 0),
    migrantes_regular:     activas.reduce((s, c) => s + (c.migrantes_regular     ?? 0), 0),
    migrantes_irregular:   activas.reduce((s, c) => s + (c.migrantes_irregular   ?? 0), 0),
    superficie_ha:         activas.reduce((s, c) => s + (c.superficie_ha         ?? 0), 0),
  }
  const tieneCatastro = Object.values(catastro).some(v => v > 0)

  const docsGenerales = documentos.filter(d => d.capa_id === null)

  async function commitResumen() {
    const valor = isHtmlEmpty(draftResumen) ? null : draftResumen
    if (valor === (detalle.resumen_narrativo ?? null)) {
      setEditingResumen(false)
      return
    }
    setSavingResumen(true)
    try {
      await onPatchResumen(valor)
      setEditingResumen(false)
    } finally { setSavingResumen(false) }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    try { await onUploadDoc(file) }
    finally { setUploading(false) }
  }

  function fmtBytes(n: number | null): string {
    if (!n) return ''
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-4">
      {/* Detalle del caso */}
      <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">Detalle del caso</h3>
          {!editingResumen && (
            <button
              type="button"
              onClick={() => { setDraftResumen(detalle.resumen_narrativo ?? ''); setEditingResumen(true) }}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium"
            >
              Editar
            </button>
          )}
        </div>
        {editingResumen ? (
          <div className="space-y-2">
            <RichTextEditor
              value={draftResumen}
              onUpdate={setDraftResumen}
              autofocus
              disabled={savingResumen}
              placeholder="Antecedentes, historia del caso, particularidades a tener en cuenta."
              minHeight="min-h-[120px]"
            />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditingResumen(false)} disabled={savingResumen}
                className="text-xs px-3 py-1.5 rounded text-gray-500 hover:bg-gray-100">
                Cancelar
              </button>
              <button type="button" onClick={commitResumen} disabled={savingResumen}
                className="text-xs px-3 py-1.5 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-semibold">
                {savingResumen ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        ) : (
          isHtmlEmpty(detalle.resumen_narrativo) ? (
            <p className="text-sm text-gray-400 italic">Sin detalle. Edita para sumar contexto del caso.</p>
          ) : (
            <RichTextView html={detalle.resumen_narrativo ?? null} className="text-sm text-gray-700 leading-relaxed" />
          )
        )}
      </section>

      {/* Mini-tabla de capas */}
      <DesalojoCapasMiniTable
        capas={capas}
        fasesEstado={fasesEstado}
        onSelectCapa={onSelectCapa}
        onCreate={onCrearCapa}
        onRenombrar={onRenombrarCapa}
        onArchivar={onArchivarCapa}
      />

      {/* Catastro consolidado (Sección II del 038) */}
      {tieneCatastro && (
        <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900">Catastro consolidado</h3>
          <p className="text-[11px] text-gray-500 mb-3 leading-tight">
            Suma derivada de las capas activas. Los valores se editan por capa en la pestaña Avance.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <CatastroCell label="Viviendas"            value={catastro.viviendas} />
            <CatastroCell label="Hogares"              value={catastro.hogares} />
            <CatastroCell label="Personas"             value={catastro.personas} />
            <CatastroCell label="NNA"                  value={catastro.nna} />
            <CatastroCell label="Adultos mayores"      value={catastro.adultos_mayores} />
            <CatastroCell label="Embarazadas"          value={catastro.embarazadas} />
            <CatastroCell label="Personas en sit. de discapacidad" value={catastro.personas_discapacidad} />
            <CatastroCell label="Migrantes regulares"   value={catastro.migrantes_regular} />
            <CatastroCell label="Migrantes irregulares" value={catastro.migrantes_irregular} />
            <CatastroCell label="Superficie (ha)"      value={catastro.superficie_ha} />
          </div>
        </section>
      )}

      {/* Documentos generales */}
      <section className="border border-gray-200 rounded-xl bg-white px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-900">
            Documentos generales {docsGenerales.length > 0 && <span className="font-normal text-gray-400">({docsGenerales.length})</span>}
          </h3>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="text-xs px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-50 font-medium"
          >
            {uploading ? 'Subiendo…' : '+ Subir'}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mb-2 leading-tight">
          Para documentos vinculados a una capa o fase, súbelos desde la pestaña Avance.
        </p>
        {docsGenerales.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-3">Sin documentos generales todavía.</p>
        ) : (
          <ul className="space-y-1">
            {docsGenerales.map(d => (
              <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 rounded text-xs">
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-w-0 text-slate-700 hover:text-slate-900 truncate"
                  title={d.nombre}
                >
                  {d.nombre}
                </a>
                {d.tamano_bytes && <span className="text-gray-400 flex-shrink-0">{fmtBytes(d.tamano_bytes)}</span>}
                <button
                  onClick={() => onDeleteDoc(d.id)}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0 text-base leading-none px-1"
                  title="Eliminar"
                  aria-label="Eliminar documento"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function CatastroCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-3 py-2 bg-gray-50 rounded">
      <p className="text-[10px] text-gray-500 uppercase tracking-wide leading-tight">{label}</p>
      <p className="text-base font-bold text-gray-800 tabular-nums mt-0.5">{value.toLocaleString('es-CL')}</p>
    </div>
  )
}
