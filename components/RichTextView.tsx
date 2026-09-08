/**
 * Vista read-only + helpers PUROS del rich text — SIN Tiptap.
 *
 * Se separó de RichTextEditor.tsx (perf): el path de LECTURA (RichTextView,
 * isHtmlEmpty, plainTextLength, normalizeRichText) ya no arrastra el bundle de
 * Tiptap/ProseMirror (~440 KB). El editor real vive en RichTextEditor.tsx y se
 * carga con next/dynamic vía RichTextEditorLazy.tsx (solo baja cuando el usuario
 * edita, no al abrir la vista).
 *
 * Ningún import de tiptap acá — mantenerlo así.
 */

import DOMPurify from 'isomorphic-dompurify'

/**
 * Etiquetas y atributos permitidos: exactamente el schema que produce el editor
 * (StarterKit con headings 1-2 + Link). Todo lo demás se descarta.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 's', 'code', 'pre',
  'h1', 'h2', 'ul', 'ol', 'li', 'blockquote', 'a', 'hr',
]
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class']

/**
 * Sanea HTML antes de inyectarlo con dangerouslySetInnerHTML.
 *
 * Por qué (auditoría 2026-09-04): `normalizeRichText` daba por bueno cualquier
 * valor que EMPEZARA con una etiqueta del schema, y lo devolvía sin tocar. O
 * sea, `<p></p><img src=x onerror=...>` guardado en la descripción de una fase
 * de desalojo pasaba entero y se ejecutaba en el navegador de quien la leyera.
 * El editor nunca genera eso, pero el campo se puede escribir por API o
 * directamente en la base, y no hay CSP que sirva de segunda barrera.
 *
 * DOMPurify también neutraliza `href="javascript:..."`, que era el otro camino.
 */
export function sanitizeRichText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR })
}

/**
 * Vista read-only del contenido. Para usar en cards colapsadas o en lectura.
 * Renderea el mismo HTML constrained al schema de Tiptap.
 */
export function RichTextView({ html, className = '' }: { html: string | null; className?: string }) {
  if (!html || isHtmlEmpty(html)) return null
  return (
    <div
      className={`rt-content ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(normalizeRichText(html)) }}
    />
  )
}

export function isHtmlEmpty(html: string | null | undefined): boolean {
  return plainTextLength(html) === 0
}

/**
 * Largo en texto plano de un HTML del editor. Útil para min/max-length
 * (p.ej. justificación de FaseStepper que pide 10-1000 chars). Strip de
 * tags + collapse de entidades. NO usa DOMParser para mantenerse server-safe.
 */
export function plainTextLength(html: string | null | undefined): number {
  if (!html) return 0
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .length
}

/**
 * Normaliza valores legacy de texto plano a HTML del schema de Tiptap.
 * Si el valor ya tiene tags HTML, lo devuelve sin tocar. Para texto plano
 * con saltos de línea, escapa entidades y arma párrafos (doble salto →
 * párrafo nuevo, salto simple → <br>). Sin esto, las descripciones
 * existentes pre-rich-text perderían los saltos al renderizar como HTML.
 */
export function normalizeRichText(value: string | null | undefined): string {
  if (!value) return ''
  // Detección estricta: Tiptap SIEMPRE arranca con un bloque del schema
  // (p, h1, h2, ul, ol, blockquote, pre). Si la string empieza con uno
  // de esos, la dejamos pasar tal cual; si no, se trata como texto plano
  // y se escapa (así una descripción legacy conserva sus saltos de línea).
  //
  // OJO: esto es NORMALIZACIÓN, no saneamiento — mira solo la primera
  // etiqueta. Quien inyecte con dangerouslySetInnerHTML debe pasar además
  // por `sanitizeRichText`.
  if (/^\s*<(p|h[12]|ul|ol|blockquote|pre|code)\b/i.test(value)) return value
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped
    .split(/\n\n+/)
    .map(par => `<p>${par.replace(/\n/g, '<br>')}</p>`)
    .join('')
}
