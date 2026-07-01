/**
 * Barrel del módulo Kit de Viaje.
 *
 * Fase A.1  — types, constants, pdfValidation.
 * Fase A.2  — assembler, prompts.
 * Fase B    — renderPdf.
 * Fase C    — renderDocx (lazy import desde route.ts para no inflar bundle).
 */

export * from './types'
export * from './constants'
export { validatePlanPdfBuffer } from './pdfValidation'
export { buildKitDeViajeData, type AssemblerInputs } from './assembler'
export * from './format'
export {
  buildContextPrompt,
  buildPregoPrompt,
  type ContextPromptInput,
  type ContextPromptOutput,
  type PregoPromptInput,
  type PregoPromptOutput,
} from './prompts'
export { renderKitDeViajePdf } from './renderPdf'
