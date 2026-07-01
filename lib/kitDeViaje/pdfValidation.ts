/**
 * Validación del PDF plan-regional para la sección PREGO.
 *
 * Zero-dep: chequea magic bytes `%PDF-` + tamaño mínimo. Cubre 100% del caso
 * canónico Ñuble (XVI.pdf, 328 bytes en prod — pasaría cualquier chequeo
 * ingenuo `download.error === null`). Si más adelante querés detectar PDFs
 * "válidos según magic pero sin páginas" (encoded errors), upgradeá a
 * pdfjs-dist getDocument().numPages — reemplazá el implementation acá y
 * el resto del pipeline sigue igual.
 */

import { PDF_MAGIC_BYTES, PLAN_PDF_MIN_BYTES } from './constants'
import type { PlanPdfState } from './types'

/**
 * Determina el estado de un PDF plan-regional a partir del buffer descargado.
 *
 * @param buf   Buffer del objeto Storage, o `null` si `download` devolvió
 *              null/error (bucket sin objeto para la región).
 * @returns     'ok' | 'missing' | 'invalid'
 */
export function validatePlanPdfBuffer(buf: Buffer | Uint8Array | null): PlanPdfState {
  if (!buf) return 'missing'
  if (buf.byteLength < PLAN_PDF_MIN_BYTES) return 'invalid'

  // Magic bytes: los PDFs válidos empiezan con "%PDF-" (0x25 0x50 0x44 0x46 0x2D).
  // Chequeamos como string ASCII de los primeros 5 bytes.
  const head = Buffer.from(buf.slice(0, 5)).toString('ascii')
  if (head !== PDF_MAGIC_BYTES) return 'invalid'

  return 'ok'
}
