/**
 * Server-side wrapper para renderizar KitDeViajePdf a Buffer. Aísla el import
 * dinámico de @react-pdf/renderer del resto del pipeline, para no importar
 * react ni el renderer en módulos que no lo necesitan (assembler, prompts).
 *
 * Requiere que registerPdfFonts() haya corrido previamente (idempotente —
 * el caller en route.ts ya lo garantiza).
 */

import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import KitDeViajePdf from '@/components/KitDeViajePdf'
import type { KitDeViajeData } from './types'

/**
 * Renderiza el KitDeViajeData a Buffer PDF.
 * Errores de renderizado se propagan — el caller decide qué hacer
 * (route.ts los captura y devuelve 500 con mensaje).
 */
export async function renderKitDeViajePdf(data: KitDeViajeData): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(KitDeViajePdf as any, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(element as any)
}
