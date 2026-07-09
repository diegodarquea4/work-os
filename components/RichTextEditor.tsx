'use client'

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { useEffect } from 'react'
import { normalizeRichText } from './RichTextView'

// RichTextView / isHtmlEmpty / plainTextLength / normalizeRichText se movieron a
// ./RichTextView (sin tiptap) para no arrastrar este bundle en el path de lectura.
// Este archivo se carga con dynamic() vía ./RichTextEditorLazy.

/**
 * Editor de texto enriquecido. Basado en Tiptap (ProseMirror) — la salida
 * es HTML constrained al schema (paragraph, heading h1/h2, bulletList,
 * orderedList, blockquote, code, bold, italic, strike, link, hardBreak).
 * No hay forma de inyectar <script>, atributos `on*`, ni estilos via la UI.
 *
 * Storage: HTML como TEXT en la columna `descripcion`. Para descripciones
 * pre-existentes en texto plano (sin tags), Tiptap las parsea como un
 * párrafo y siguen renderizando bien.
 *
 * El toolbar se muestra siempre (no condicionado a focus) para que el user
 * descubra qué opciones hay sin tener que clickear primero el editor.
 */

type Props = {
  value:        string                       // HTML
  onUpdate:     (html: string) => void
  placeholder?: string
  autofocus?:   boolean
  disabled?:    boolean
  minHeight?:   string                       // p.ej. 'min-h-[60px]'
}

/**
 * El editor NO autosave on blur — el padre maneja el save explícitamente
 * (botón Guardar/Cancelar). El motivo: clickear un botón del toolbar (B, I,
 * etc.) hacía perder focus al editor, lo que disparaba un autosave en
 * paralelo con el siguiente click — race condition. Con el patrón
 * Guardar explícito + onMouseDown preventDefault en cada toolbar button,
 * el flujo queda determinista.
 */
export default function RichTextEditor({
  value, onUpdate, placeholder, autofocus, disabled, minHeight = 'min-h-[64px]',
}: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Link.configure({
        openOnClick: false,
        autolink:    true,
        HTMLAttributes: { class: 'text-blue-600 underline underline-offset-2', rel: 'noopener noreferrer', target: '_blank' },
      }),
    ],
    content:           normalizeRichText(value),
    editable:          !disabled,
    autofocus,
    immediatelyRender: false,
    onUpdate:  ({ editor }) => onUpdate(editor.getHTML()),
    editorProps: {
      attributes: {
        class: `rt-content focus:outline-none text-gray-800 text-xs px-2 py-1.5 ${minHeight}`,
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    const next = normalizeRichText(value)
    const current = editor.getHTML()
    if (next !== current && !editor.isFocused) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [value, editor])

  useEffect(() => {
    if (editor) editor.setEditable(!disabled)
  }, [editor, disabled])

  if (!editor) return null

  return (
    <div className="rt-editor border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-slate-400 focus-within:border-slate-400">
      <Toolbar editor={editor} disabled={disabled} />
      <div className="relative">
        {editor.isEmpty && placeholder && (
          <span className="absolute top-1.5 left-2 pointer-events-none text-gray-400 text-xs">
            {placeholder}
          </span>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

/**
 * Botón del toolbar. CRÍTICO: `onMouseDown={e => e.preventDefault()}` es lo
 * que evita que el botón le robe focus al editor. Sin esto, clickear B/I/S
 * dispara `editor.onBlur` y rompe los chains de comandos encadenados (el
 * bug reportado: tras poner negrita, click en tachado fallaba porque el
 * editor estaba blureado y el chain `.focus().toggleStrike()` no enganchaba).
 */
function TbBtn({
  active, onClick, disabled, ariaLabel, title, children,
}: {
  active:    boolean
  onClick:   () => void
  disabled?: boolean
  ariaLabel: string
  title:     string
  children:  React.ReactNode
}) {
  const cls = active
    ? 'h-6 min-w-6 px-1.5 rounded text-[11px] font-medium bg-slate-200 text-slate-900 flex items-center justify-center'
    : 'h-6 min-w-6 px-1.5 rounded text-[11px] font-medium text-gray-700 hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center'
  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={cls}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor, disabled }: { editor: Editor; disabled?: boolean }) {
  function handleLink() {
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL del enlace:', previousUrl ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b border-gray-200 bg-gray-50 rounded-t flex-wrap">
      <TbBtn active={editor.isActive('bold')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBold().run()}
        ariaLabel="Negrita" title="Negrita (⌘B)">
        <strong>B</strong>
      </TbBtn>
      <TbBtn active={editor.isActive('italic')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        ariaLabel="Cursiva" title="Cursiva (⌘I)">
        <em>I</em>
      </TbBtn>
      <TbBtn active={editor.isActive('strike')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        ariaLabel="Tachado" title="Tachado">
        <span className="line-through">S</span>
      </TbBtn>
      <span className="mx-0.5 h-4 w-px bg-gray-300 self-center" />
      <TbBtn active={editor.isActive('heading', { level: 1 })} disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        ariaLabel="Título 1" title="Título 1">
        H1
      </TbBtn>
      <TbBtn active={editor.isActive('heading', { level: 2 })} disabled={disabled}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        ariaLabel="Título 2" title="Título 2">
        H2
      </TbBtn>
      <span className="mx-0.5 h-4 w-px bg-gray-300 self-center" />
      <TbBtn active={editor.isActive('bulletList')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        ariaLabel="Lista con viñetas" title="Lista con viñetas">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="3" cy="4"  r="1" fill="currentColor" />
          <circle cx="3" cy="8"  r="1" fill="currentColor" />
          <circle cx="3" cy="12" r="1" fill="currentColor" />
          <line x1="6" y1="4"  x2="14" y2="4" />
          <line x1="6" y1="8"  x2="14" y2="8" />
          <line x1="6" y1="12" x2="14" y2="12" />
        </svg>
      </TbBtn>
      <TbBtn active={editor.isActive('orderedList')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        ariaLabel="Lista numerada" title="Lista numerada">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <text x="0" y="6" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">1</text>
          <text x="0" y="10.5" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">2</text>
          <text x="0" y="15" fontSize="5" fill="currentColor" stroke="none" fontWeight="700">3</text>
          <line x1="6" y1="4"  x2="14" y2="4" />
          <line x1="6" y1="8"  x2="14" y2="8" />
          <line x1="6" y1="12" x2="14" y2="12" />
        </svg>
      </TbBtn>
      <TbBtn active={editor.isActive('blockquote')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        ariaLabel="Cita" title="Cita">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3 5c0-1 .8-2 2-2v1c-.6 0-1 .4-1 1v1h2v3H3V5zm6 0c0-1 .8-2 2-2v1c-.6 0-1 .4-1 1v1h2v3H9V5z" />
        </svg>
      </TbBtn>
      <TbBtn active={editor.isActive('code')} disabled={disabled}
        onClick={() => editor.chain().focus().toggleCode().run()}
        ariaLabel="Código en línea" title="Código en línea">
        <svg width="14" height="12" viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="5,3 2,6 5,9" />
          <polyline points="11,3 14,6 11,9" />
        </svg>
      </TbBtn>
      <TbBtn active={editor.isActive('link')} disabled={disabled}
        onClick={handleLink}
        ariaLabel="Enlace" title="Enlace">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 8.5l3-3M5 11l-1.5-1.5a2.5 2.5 0 010-3.5l2-2a2.5 2.5 0 013.5 0L10.5 5M11 5l1.5 1.5a2.5 2.5 0 010 3.5l-2 2a2.5 2.5 0 01-3.5 0L5.5 11" />
        </svg>
      </TbBtn>
    </div>
  )
}

// RichTextView, isHtmlEmpty, plainTextLength y normalizeRichText viven ahora en
// ./RichTextView (sin dependencia de tiptap). Importar desde allí.
