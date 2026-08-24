'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Campo de texto con opción de EXTENDER: escribe inline (auto-grow) o abre un
 * editor amplio a pantalla para redactar cómodo. Un solo estado de texto
 * alimenta ambos, así no se desincronizan; commit onBlur del inline y al
 * guardar/cerrar el editor. Usado en la Consola del Gabinete v2 (relato,
 * intervenciones, "lo solicitado"). Controlado internamente: el padre remonta
 * por `key` al cambiar de punto, así el valor inicial llega fresco.
 */

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

export default function ExpandableText({
  value, onCommit, placeholder, disabled = false, minRows = 2, titulo = 'Redactar',
  className = '', wrapperClassName = 'relative', botonTono = 'slate',
}: {
  value: string
  onCommit: (text: string) => void
  placeholder?: string
  disabled?: boolean
  minRows?: number
  titulo?: string
  className?: string
  wrapperClassName?: string
  botonTono?: 'slate' | 'violet'
}) {
  const [text, setText] = useState(value)
  const [open, setOpen] = useState(false)
  const inlineRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { autoGrow(inlineRef.current) }, [text])

  const commit = () => { if (text !== value) onCommit(text) }
  const cerrar = () => { commit(); setOpen(false) }

  const btnColor = botonTono === 'violet'
    ? 'text-violet-300 hover:text-violet-700'
    : 'text-slate-300 hover:text-violet-600'

  return (
    <div className={wrapperClassName}>
      <textarea
        ref={inlineRef}
        value={text}
        rows={minRows}
        disabled={disabled}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        placeholder={placeholder}
        className={className}
      />
      {!disabled && (
        <button type="button" onClick={() => setOpen(true)} title="Extender para escribir"
          className={`absolute top-1.5 right-1.5 ${btnColor} rounded p-0.5 bg-white/60`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-[85] bg-slate-900/40 grid place-items-center p-4" onMouseDown={cerrar}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col" onMouseDown={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-200 flex-none">
              <h2 className="text-[15px] font-extrabold text-slate-900">{titulo}</h2>
              <button onClick={cerrar} className="ml-auto text-slate-400 hover:text-slate-700 p-1" title="Cerrar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <div className="p-4">
              <textarea autoFocus value={text} onChange={e => setText(e.target.value)} placeholder={placeholder} rows={16}
                className="w-full text-[14.5px] text-slate-900 leading-relaxed border border-slate-200 rounded-lg px-3.5 py-3 resize-y focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-400" />
            </div>
            <div className="px-5 py-3 border-t border-slate-200 flex justify-end flex-none">
              <button onClick={cerrar} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
