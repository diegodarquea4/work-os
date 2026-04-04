import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import MinutaDocument from '@/components/MinutaDocument'
import type { Region } from '@/lib/regions'
import type { Project } from '@/lib/projects'
import type { RegionMetrics } from '@/lib/types'

export async function POST(request: Request) {
  const body = await request.json() as { region: Region; fecha: string }

  let projects: Project[]
  let metrics: RegionMetrics | null = null

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON) {
    const { getPrioridadesByCod, getMetricsByCod } = await import('@/lib/db')
    ;[projects, metrics] = await Promise.all([
      getPrioridadesByCod(body.region.cod),
      getMetricsByCod(body.region.cod),
    ])
  } else {
    const { getProjects } = await import('@/lib/projects')
    const all = getProjects()
    projects = all.filter(p => p.cod === body.region.cod)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(MinutaDocument as any, {
    region: body.region,
    projects,
    metrics,
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
