import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import path from 'path'
import fs from 'fs'
import MinutaDocument from '@/components/MinutaDocument'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'
import { INE_CODE } from '@/lib/regions'
import { requireAuth } from '@/lib/apiAuth'
import { generateMinutaContent, type MinutaTipo } from '@/lib/minutaAI'

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-pdf.png')

// Read logo as base64 data URL at startup — more reliable than file paths in serverless
// NOTE: logo-pdf.png is an RGB PNG converted from the original CMYK JPEG.
// react-pdf v4 cannot handle CMYK JPEG images (4-component) — they corrupt the page layout.
function readLogoDataUrl(): string | null {
  try {
    const buf = fs.readFileSync(LOGO_PATH)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
const LOGO_DATA_URL = readLogoDataUrl()

export async function POST(request: Request) {
  if (!await requireAuth()) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const body = await request.json() as { region: Region; fecha: string; tipo?: MinutaTipo }
  const tipo: MinutaTipo = body.tipo ?? 'completo'

  let projects: Iniciativa[]
  let metrics: RegionMetrics | null = null
  let seiaProjects: SeiaProject[] | null = null
  let mopProjects:  MopProject[]  | null = null
  let planPdfBase64: string | null = null

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
            .select('id,nombre,tipo,estado,inversion_mm,fecha_presentacion')
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

    // Fetch Plan Regional PDF from Storage for AI context
    try {
      const { data: pdfData, error: pdfError } = await sb.storage
        .from('plan-regional')
        .download(`${body.region.cod}.pdf`)
      if (!pdfError && pdfData) {
        const arrayBuf = await pdfData.arrayBuffer()
        planPdfBase64 = Buffer.from(arrayBuf).toString('base64')
      }
    } catch {
      // No plan regional uploaded — AI will work with panel data only
    }
  } else {
    const { getProjects } = await import('@/lib/projects')
    const all = getProjects()
    projects = all.filter(p => p.cod === body.region.cod)
  }

  console.log(`[minuta] ${tipo} for ${body.region.nombre} — projects: ${projects.length}, metrics: ${!!metrics}, seia: ${seiaProjects?.length ?? 0}, mop: ${mopProjects?.length ?? 0}, planPdf: ${!!planPdfBase64}`)

  // Generate AI narrative (non-blocking — if it fails, PDF still renders)
  const aiContent = await generateMinutaContent(
    tipo,
    body.region.nombre,
    body.fecha,
    projects,
    metrics,
    planPdfBase64,
    seiaProjects,
    mopProjects,
  )

  const regionSlug = body.region.nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  let element: React.ReactElement

  if (tipo === 'ejecutiva') {
    const MinutaEjecutiva = (await import('@/components/MinutaEjecutiva')).default
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    element = React.createElement(MinutaEjecutiva as any, {
      region: body.region,
      projects,
      metrics,
      seiaProjects,
      mopProjects,
      fecha: body.fecha,
      aiContent,
      logoSrc: LOGO_DATA_URL,
    })
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    element = React.createElement(MinutaDocument as any, {
      region: body.region,
      projects,
      metrics,
      seiaProjects,
      mopProjects,
      fecha: body.fecha,
      aiContent,
      logoSrc: LOGO_DATA_URL,
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let buffer: Buffer
  try {
    buffer = await renderToBuffer(element as any)
  } catch (err) {
    console.error('[minuta] renderToBuffer error:', err)
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 })
  }
  const suffix = tipo === 'ejecutiva' ? '-ejecutiva' : ''

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="minuta-${regionSlug}${suffix}.pdf"`,
    },
  })
}
