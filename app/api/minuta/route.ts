import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import MinutaDocument from '@/components/MinutaDocument'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'
import { INE_CODE } from '@/lib/regions'
import { requireAuth } from '@/lib/apiAuth'

export async function POST(request: Request) {
  if (!await requireAuth()) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const body = await request.json() as { region: Region; fecha: string }

  let projects: Iniciativa[]
  let metrics: RegionMetrics | null = null
  let seiaProjects: SeiaProject[] | null = null
  let mopProjects:  MopProject[]  | null = null

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON) {
    const { getIniciativasByCod, getMetricsByCod } = await import('@/lib/db')
    const { getSupabaseAdmin } = await import('@/lib/supabaseServer')
    const sb = getSupabaseAdmin()
    const regionId = INE_CODE[body.region.cod]

    const [prioridades, metricas, seiaRes, mopRes] = await Promise.all([
      getIniciativasByCod(body.region.cod),
      getMetricsByCod(body.region.cod),
      regionId !== undefined
        ? sb.from('seia_projects')
            .select('id,nombre,estado,inversion_mm,fecha_presentacion')
            .eq('region_id', regionId)
            .order('fecha_presentacion', { ascending: false })
            .limit(15)
        : Promise.resolve({ data: null }),
      regionId !== undefined
        ? sb.from('mop_projects')
            .select('cod_p,nombre,servicio,etapa,inversion_miles')
            .eq('region_id', regionId)
            .order('nombre')
            .limit(15)
        : Promise.resolve({ data: null }),
    ])

    projects     = prioridades
    metrics      = metricas
    seiaProjects = (seiaRes.data as SeiaProject[] | null)
    mopProjects  = (mopRes.data  as MopProject[]  | null)
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
    seiaProjects,
    mopProjects,
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
