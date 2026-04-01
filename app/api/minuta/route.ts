import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import MinutaDocument from '@/components/MinutaDocument'
import type { Project } from '@/lib/projects'
import type { Region } from '@/lib/regions'

export async function POST(request: Request) {
  const body = await request.json() as { region: Region; projects: Project[]; fecha: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(MinutaDocument as any, {
    region: body.region,
    projects: body.projects,
    fecha: body.fecha,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any)

  const regionSlug = body.region.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="minuta-${regionSlug}.pdf"`,
    },
  })
}
