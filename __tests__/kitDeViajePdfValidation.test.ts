import { describe, it, expect } from 'vitest'
import { validatePlanPdfBuffer } from '@/lib/kitDeViaje/pdfValidation'
import { PLAN_PDF_MIN_BYTES } from '@/lib/kitDeViaje/constants'

/**
 * Cubre el caso canónico Ñuble (XVI.pdf, 328 bytes en prod) que hoy la
 * ruta minuta trata como 'ok' y termina alimentando basura al AI.
 */

const PDF_MAGIC = '%PDF-1.4\n'

function buildValidPdfBuffer(): Buffer {
  // Buffer > PLAN_PDF_MIN_BYTES que empieza con magic bytes.
  const filler = Buffer.alloc(PLAN_PDF_MIN_BYTES + 1024, 0x20)
  const magic = Buffer.from(PDF_MAGIC, 'ascii')
  magic.copy(filler, 0)
  return filler
}

describe('validatePlanPdfBuffer', () => {
  it('devuelve "missing" cuando buf es null', () => {
    expect(validatePlanPdfBuffer(null)).toBe('missing')
  })

  it('devuelve "invalid" cuando el buffer es más chico que el mínimo (caso Ñuble 328B)', () => {
    const nubleLike = Buffer.alloc(328, 0x00)
    // Le ponemos magic bytes correctas para probar que el chequeo de tamaño
    // gana igual — la corrupción de Ñuble en prod pasa cualquier magic check
    // ingenuo porque los primeros bytes suelen estar OK.
    Buffer.from(PDF_MAGIC, 'ascii').copy(nubleLike, 0)
    expect(validatePlanPdfBuffer(nubleLike)).toBe('invalid')
  })

  it('devuelve "invalid" cuando el buffer es lo bastante grande pero SIN magic bytes', () => {
    const notPdf = Buffer.alloc(PLAN_PDF_MIN_BYTES + 512, 0x00)
    // Los primeros bytes son 0x00, no "%PDF-"
    expect(validatePlanPdfBuffer(notPdf)).toBe('invalid')
  })

  it('devuelve "ok" para un buffer válido (>= mínimo + magic bytes)', () => {
    expect(validatePlanPdfBuffer(buildValidPdfBuffer())).toBe('ok')
  })

  it('acepta Uint8Array además de Buffer', () => {
    const u8 = new Uint8Array(buildValidPdfBuffer())
    expect(validatePlanPdfBuffer(u8)).toBe('ok')
  })
})
