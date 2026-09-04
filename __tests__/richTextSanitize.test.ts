import { describe, it, expect } from 'vitest'
import { sanitizeRichText, normalizeRichText } from '@/components/RichTextView'

/**
 * `RichTextView` inyecta con dangerouslySetInnerHTML y no hay CSP que sirva de
 * segunda barrera, así que estos casos son la barrera. El agujero que cerraron:
 * `normalizeRichText` daba por bueno todo lo que EMPEZARA con una etiqueta del
 * schema y lo devolvía intacto.
 */

describe('sanitizeRichText', () => {
  it('conserva el HTML que produce el editor', () => {
    const ok = '<p>Texto con <strong>negrita</strong> y <em>cursiva</em></p><ul><li>uno</li></ul>'
    expect(sanitizeRichText(ok)).toBe(ok)
    expect(sanitizeRichText('<h1>Título</h1><h2>Subtítulo</h2>')).toBe('<h1>Título</h1><h2>Subtítulo</h2>')
    expect(sanitizeRichText('<blockquote><p>cita</p></blockquote>')).toContain('blockquote')
  })

  it('quita el script disfrazado tras un párrafo vacío (el bypass real)', () => {
    // Empieza con <p>, así que normalizeRichText lo dejaba pasar entero.
    const payload = '<p></p><img src=x onerror="alert(1)">'
    const limpio = sanitizeRichText(normalizeRichText(payload))
    expect(limpio).not.toContain('onerror')
    expect(limpio).not.toContain('<img')
  })

  it('quita script, iframe y manejadores de eventos', () => {
    expect(sanitizeRichText('<p>hola</p><script>alert(1)</script>')).not.toContain('script')
    expect(sanitizeRichText('<p>hola</p><iframe src="//evil"></iframe>')).not.toContain('iframe')
    expect(sanitizeRichText('<p onclick="alert(1)">hola</p>')).not.toContain('onclick')
  })

  it('neutraliza href javascript: pero deja los enlaces normales', () => {
    expect(sanitizeRichText('<p><a href="javascript:alert(1)">x</a></p>')).not.toContain('javascript:')
    expect(sanitizeRichText('<p><a href="https://interior.gob.cl">x</a></p>')).toContain('https://interior.gob.cl')
  })

  it('el texto plano legacy se sigue escapando y conserva los saltos', () => {
    const salida = sanitizeRichText(normalizeRichText('línea 1\nlínea 2\n\npárrafo 2'))
    expect(salida).toContain('<br>')
    expect(salida).toContain('<p>')
    expect(sanitizeRichText(normalizeRichText('<script>alert(1)</script>'))).not.toContain('<script')
  })
})
