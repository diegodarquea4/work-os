/**
 * PDF horizontal de la carta Gantt de tareas de una iniciativa (tab
 * Planificación → "Descargar PDF"). El cliente manda las tareas que ya tiene
 * cargadas (misma query RLS que pinta la pantalla) más la granularidad que
 * tenía seleccionada — no hay re-fetch server-side, no hay dato nuevo que
 * exponer más allá de lo que el usuario ya está viendo.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import { requireAuth } from '@/lib/apiAuth'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { tareaGanttPdfSchema } from '@/lib/schemas'
import TareaGanttPdf, { type TareaGanttPdfData } from '@/components/TareaGanttPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  // viewer es solo-lectura: no genera artefactos (PDF). Coherente con el resto
  // de las acciones "operativas" (mismo criterio que cerrar sesión).
  if (authProfile.role === 'viewer') {
    return new Response(JSON.stringify({ error: 'Sin permiso' }), { status: 403 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400 }) }

  const parse = tareaGanttPdfSchema.safeParse(rawBody)
  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: 'Solicitud inválida', detalle: parse.error.issues }),
      { status: 400 },
    )
  }
  const body = parse.data

  const data: TareaGanttPdfData = {
    nombreIniciativa: body.nombreIniciativa,
    granularidad: body.granularidad,
    generadoEn: new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }),
    tareas: body.tareas,
  }

  registerPdfFonts()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(TareaGanttPdf as any, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)

  const filename = `carta-gantt-${body.nombreIniciativa.toLowerCase().replace(/\s+/g, '-').slice(0, 60)}.pdf`

  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
