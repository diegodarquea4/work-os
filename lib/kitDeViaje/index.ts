/**
 * Barrel del módulo Kit de Viaje ("Contexto Regional").
 *
 * Historial:
 *   Fase A.1  — types, constants, pdfValidation.
 *   Fase A.2  — assembler, prompts.
 *   Fase B    — renderPdf.
 *   Rediseño de minutas — Sección III (PREGO) migró a `MinutaEjecutiva.tsx`.
 *   Fase C    — renderDocx (lazy import desde route.ts para no inflar bundle).
 */

export * from './types'
export * from './constants'
export { validatePlanPdfBuffer } from './pdfValidation'
export { buildKitDeViajeData, buildRawDataLines, type AssemblerInputs, type RawDataLines } from './assembler'
export * from './format'
export {
  buildContextPrompt,
  type ContextPromptInput,
  type ContextPromptOutput,
} from './prompts'
export { renderKitDeViajePdf } from './renderPdf'
