import { describe, it, expect } from 'vitest'
import { isHtmlEmpty, normalizeRichText, plainTextLength } from '@/components/RichTextView'

/**
 * Tests para los helpers del editor rich text.
 *
 * Cubre los puntos frágiles:
 *   - isHtmlEmpty maneja el caso de '<p></p>' (Tiptap empty paragraph)
 *     y '<p>  </p>' (whitespace only) además de null/undefined.
 *   - normalizeRichText preserva HTML existente (idempotente) y convierte
 *     texto plano legacy con \n a párrafos / <br>. Sin esto, descripciones
 *     pre-rich-text perderían los saltos al renderizar con
 *     dangerouslySetInnerHTML.
 *   - normalizeRichText escapa entidades HTML del texto plano (XSS:
 *     "<script>" del legacy NUNCA debe parsearse como tag — debe quedar
 *     como texto literal "&lt;script&gt;").
 */

describe('isHtmlEmpty', () => {
  it('null → vacío', () => {
    expect(isHtmlEmpty(null)).toBe(true)
  })

  it('undefined → vacío', () => {
    expect(isHtmlEmpty(undefined)).toBe(true)
  })

  it('string vacío → vacío', () => {
    expect(isHtmlEmpty('')).toBe(true)
  })

  it('<p></p> (Tiptap empty) → vacío', () => {
    expect(isHtmlEmpty('<p></p>')).toBe(true)
  })

  it('<p>  &nbsp;  </p> (whitespace only) → vacío', () => {
    expect(isHtmlEmpty('<p>  &nbsp;  </p>')).toBe(true)
  })

  it('<p>texto</p> → no vacío', () => {
    expect(isHtmlEmpty('<p>texto</p>')).toBe(false)
  })

  it('texto plano sin tags → no vacío', () => {
    expect(isHtmlEmpty('texto plano')).toBe(false)
  })

  it('<p><strong>negrita</strong></p> → no vacío', () => {
    expect(isHtmlEmpty('<p><strong>negrita</strong></p>')).toBe(false)
  })
})

describe('plainTextLength', () => {
  it('null → 0', () => {
    expect(plainTextLength(null)).toBe(0)
  })

  it('texto plano sin tags', () => {
    expect(plainTextLength('hola mundo')).toBe(10)
  })

  it('HTML con tags → cuenta solo texto', () => {
    expect(plainTextLength('<p>hola</p>')).toBe(4)
  })

  it('HTML con strong/em → cuenta texto sin marcas', () => {
    expect(plainTextLength('<p><strong>negrita</strong> y <em>cursiva</em></p>')).toBe('negrita y cursiva'.length)
  })

  it('whitespace-only → 0', () => {
    expect(plainTextLength('<p>   </p>')).toBe(0)
    expect(plainTextLength('<p>&nbsp;&nbsp;</p>')).toBe(0)
  })

  it('entidades HTML → cuenta caracter decodificado', () => {
    expect(plainTextLength('<p>Tom &amp; Jerry</p>')).toBe('Tom & Jerry'.length)
  })
})

describe('normalizeRichText', () => {
  it('null → string vacío', () => {
    expect(normalizeRichText(null)).toBe('')
  })

  it('texto plano simple → <p>...</p>', () => {
    expect(normalizeRichText('hola mundo')).toBe('<p>hola mundo</p>')
  })

  it('texto con salto simple → <br>', () => {
    expect(normalizeRichText('línea 1\nlínea 2')).toBe('<p>línea 1<br>línea 2</p>')
  })

  it('texto con doble salto → párrafos', () => {
    expect(normalizeRichText('párrafo 1\n\npárrafo 2')).toBe('<p>párrafo 1</p><p>párrafo 2</p>')
  })

  it('HTML existente → idempotente (no toca)', () => {
    const html = '<p>ya es <strong>HTML</strong></p>'
    expect(normalizeRichText(html)).toBe(html)
  })

  it('texto plano con < y > → escapa entidades (anti-XSS)', () => {
    expect(normalizeRichText('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('texto plano con & → escapa', () => {
    expect(normalizeRichText('Tom & Jerry')).toBe('<p>Tom &amp; Jerry</p>')
  })

  it('triple salto → un solo párrafo nuevo (no múltiples vacíos)', () => {
    expect(normalizeRichText('a\n\n\nb')).toBe('<p>a</p><p>b</p>')
  })
})
