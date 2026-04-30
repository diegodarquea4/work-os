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
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { generateMinutaContent, type MinutaTipo, type LeystopMinuta } from '@/lib/minutaAI'
import { getSupabaseColega } from '@/lib/supabaseColega'

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

export async function GET(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const region_cod = url.searchParams.get('region_cod')
  const tipo = (url.searchParams.get('tipo') ?? 'ejecutiva') as MinutaTipo

  if (!region_cod || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ cached: false, generated_at: null })
  }

  const today = new Date().toISOString().slice(0, 10)
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('minuta_cache')
    .select('generated_at')
    .eq('region_cod', region_cod)
    .eq('tipo', tipo)
    .eq('cache_date', today)
    .maybeSingle()

  return Response.json({ cached: !!data, generated_at: data?.generated_at ?? null })
}

export async function POST(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  const body = await request.json() as { region: Region; fecha: string; tipo?: MinutaTipo; force?: boolean }

  // regional / filtered-viewer can only generate minutas for their assigned regions
  const isRestricted = authProfile.role === 'regional' ||
    (authProfile.role === 'viewer' && authProfile.region_cods.length > 0)
  if (isRestricted && !authProfile.region_cods.includes(body.region.cod)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  const tipo: MinutaTipo = body.tipo ?? 'completo'
  const force = body.force ?? false
  const today = new Date().toISOString().slice(0, 10)

  let projects: Iniciativa[]
  let metrics: RegionMetrics | null = null
  let seiaProjects: SeiaProject[] | null = null
  let mopProjects:  MopProject[]  | null = null
  let leystopData: LeystopMinuta | null = null
  let planPdfBase64: string | null = null
  let cachedAiContent: unknown = null
  let sbRef: ReturnType<typeof getSupabaseAdmin> | null = null

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON) {
    const { getIniciativasByCod, getMetricsByCod } = await import('@/lib/db')
    const sb = getSupabaseAdmin()
    sbRef = sb
    const regionId = INE_CODE[body.region.cod]

    const colegaOk = !!(process.env.NEXT_PUBLIC_SUPABASE_COLEGA_URL && process.env.NEXT_PUBLIC_SUPABASE_COLEGA_ANON)

    const [prioridades, metricas, seiaRes, mopRes, leystopRes, cacheRes] = await Promise.all([
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
      colegaOk && regionId !== undefined
        ? getSupabaseColega()
            .from('registros_leystop')
            .select('semana,tasa_registro,casos_ultima_semana,var_ultima_semana,var_28dias,var_anno_fecha,casos_anno_fecha,casos_anno_fecha_anterior,mayor_registro_1,pct_1,mayor_registro_2,pct_2,mayor_registro_3,pct_3,mayor_registro_4,pct_4,mayor_registro_5,pct_5,controles,controles_identidad,controles_vehicular,fiscalizaciones,incautaciones,incaut_fuego,incaut_blancas,allanamientos_anno,vehiculos_recuperados_anno,decomisos_anno')
            .eq('id_region', regionId)
            .order('id_semana', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      force
        ? Promise.resolve({ data: null })
        : sb.from('minuta_cache')
            .select('ai_content')
            .eq('region_cod', body.region.cod)
            .eq('tipo', tipo)
            .eq('cache_date', today)
            .maybeSingle(),
    ])

    projects     = prioridades
    metrics      = metricas
    seiaProjects = (seiaRes.data as SeiaProject[] | null)
    mopProjects  = (mopRes.data  as MopProject[]  | null)
    leystopData  = (leystopRes.data as LeystopMinuta | null)
    cachedAiContent = (cacheRes.data as { ai_content: unknown } | null)?.ai_content ?? null

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

  // Use cached AI content or generate fresh
  let aiContent: unknown
  if (cachedAiContent) {
    console.log(`[minuta] cache HIT ${body.region.cod}/${tipo}`)
    aiContent = cachedAiContent
  } else {
    console.log(`[minuta] ${tipo} for ${body.region.nombre} — projects: ${projects.length}, metrics: ${!!metrics}, seia: ${seiaProjects?.length ?? 0}, mop: ${mopProjects?.length ?? 0}, leystop: ${!!leystopData}, planPdf: ${!!planPdfBase64}`)
    aiContent = await generateMinutaContent(
      tipo,
      body.region.nombre,
      body.fecha,
      projects,
      metrics,
      planPdfBase64,
      seiaProjects,
      mopProjects,
      leystopData,
    )
    // Store in cache (fire-and-forget — don't delay the PDF response)
    if (sbRef) {
      sbRef.from('minuta_cache').upsert({
        region_cod:   body.region.cod,
        tipo,
        cache_date:   today,
        ai_content:   aiContent as Record<string, unknown>,
        generated_by: authProfile.id,
      }, { onConflict: 'region_cod,tipo,cache_date' })
        .then(({ error }) => { if (error) console.error('[minuta] cache store:', error.message) })
    }
  }

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
