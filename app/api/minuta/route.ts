import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import MinutaDocumentV2 from '@/components/MinutaDocumentV2'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject, Seguimiento, SemaforoLog } from '@/lib/types'
import { INE_CODE } from '@/lib/regions'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { generateMinutaContent, type MinutaTipo, type LeystopMinuta, type SeguimientoMinuta, type SemaforoTrendSummary, type NationalBenchmark, type TrendSummaries, type FichaRegionalContent, type FichaExtraData } from '@/lib/minutaAI'
import provinciasData from '@/data/provincias-comunas.json'
import { getSupabaseColega } from '@/lib/supabaseColega'
import { registerPdfFonts } from '@/lib/pdfFonts'

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
  // Enriched context data (fase 2)
  let seguimientosMinuta: SeguimientoMinuta[] = []
  let semaforoTrends: SemaforoTrendSummary | null = null
  let nationalBenchmark: NationalBenchmark[] = []
  let trendSummaries: TrendSummaries | null = null
  // V2 extras
  let autoridades: { cargo: string; nombre: string; partido: string | null; territorio: string | null }[] = []
  let periodMetrics: { metric_name: string; period_2018?: number | null; period_2022?: number | null; period_2026?: number | null; current?: number | null }[] = []
  let fichaExtra: FichaExtraData | null = null

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

    // ── V2 extras: autoridades + period metrics for Reporte Completo ────────
    if (tipo === 'completo') {
      const [autoridadesRes, tsDesempleo, tsPib] = await Promise.all([
        sb.from('autoridades_regionales')
          .select('cargo, nombre, partido, territorio')
          .eq('region_cod', body.region.cod)
          .order('cargo'),
        regionId !== undefined
          ? sb.from('regional_metrics')
              .select('value, period')
              .eq('region_id', regionId)
              .eq('metric_name', 'tasa_desocupacion')
              .order('period', { ascending: true })
          : Promise.resolve({ data: null }),
        regionId !== undefined
          ? sb.from('regional_metrics')
              .select('value, period')
              .eq('region_id', regionId)
              .eq('metric_name', 'pib_regional_anual')
              .order('period', { ascending: true })
          : Promise.resolve({ data: null }),
      ])

      autoridades = (autoridadesRes.data ?? []) as typeof autoridades

      // Build period comparison: closest value to 2018, 2022, 2025 (annual)
      function closestTo(series: { value: number; period: string }[], target: string): number | null {
        if (!series.length) return null
        let best = series[0]
        let bestDiff = Math.abs(new Date(series[0].period).getTime() - new Date(target).getTime())
        for (const s of series) {
          const diff = Math.abs(new Date(s.period).getTime() - new Date(target).getTime())
          if (diff < bestDiff) { best = s; bestDiff = diff }
        }
        // Only use if within 6 months of target
        return bestDiff < 180 * 86400000 ? best.value : null
      }

      const desSeries = (tsDesempleo.data ?? []) as { value: number; period: string }[]
      const pibSeries = (tsPib.data ?? []) as { value: number; period: string }[]

      const pmList: typeof periodMetrics = []
      if (desSeries.length > 0) {
        pmList.push({
          metric_name: 'tasa_desocupacion',
          period_2018: closestTo(desSeries, '2018-03-01'),
          period_2022: closestTo(desSeries, '2022-03-01'),
          period_2026: closestTo(desSeries, '2026-03-01'),
          current: desSeries[desSeries.length - 1]?.value ?? null,
        })
      }
      if (pibSeries.length > 0) {
        pmList.push({
          metric_name: 'pib_regional_anual',
          period_2018: closestTo(pibSeries, '2018-01-01'),
          period_2022: closestTo(pibSeries, '2022-01-01'),
          period_2026: closestTo(pibSeries, '2025-01-01'),
          current: pibSeries[pibSeries.length - 1]?.value ?? null,
        })
      }
      periodMetrics = pmList
    }

    // ── FASE 2: Enriched context (needs initiative IDs from fase 1) ──────────
    if (!cachedAiContent) {
      const allIds = projects.map(p => p.n)
      const rojoAmbarIds = projects
        .filter(p => p.estado_semaforo === 'rojo' || p.estado_semaforo === 'ambar')
        .map(p => p.n)

      const sixtyDaysAgo  = new Date(Date.now() - 60  * 86400000).toISOString()
      const ninetyDaysAgo = new Date(Date.now() - 90  * 86400000).toISOString()

      const [seguimientosRes, semaforoLogRes, nationalRes, stopHistoryRes, regionalTsRes, empleoIneRes, pibAnualRes] = await Promise.all([
        // Recent seguimientos for rojo/ambar initiatives
        rojoAmbarIds.length > 0
          ? sb.from('seguimientos')
              .select('prioridad_id, fecha, tipo, descripcion, estado')
              .in('prioridad_id', rojoAmbarIds)
              .gte('created_at', sixtyDaysAgo)
              .order('created_at', { ascending: false })
              .limit(100)
          : Promise.resolve({ data: null }),
        // Semaforo change history
        allIds.length > 0
          ? sb.from('semaforo_log')
              .select('prioridad_id, valor_anterior, valor_nuevo, created_at')
              .in('prioridad_id', allIds)
              .eq('campo', 'semaforo')
              .gte('created_at', ninetyDaysAgo)
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: null }),
        // National benchmark metrics (region_id = 0)
        sb.from('regional_metrics')
          .select('metric_name, value, period')
          .eq('region_id', 0)
          .in('metric_name', ['tasa_desocupacion', 'tasa_delictual'])
          .order('period', { ascending: false })
          .limit(10),
        // Stop stats history (8 weeks) for crime trend
        regionId !== undefined
          ? sb.from('stop_stats')
              .select('semana_id, fecha_desde, casos_ultima_semana, controles_total')
              .eq('region_id', regionId)
              .order('semana_id', { ascending: false })
              .limit(8)
          : Promise.resolve({ data: null }),
        // Regional unemployment time-series (6 months)
        regionId !== undefined
          ? sb.from('regional_metrics')
              .select('metric_name, value, period')
              .eq('region_id', regionId)
              .eq('metric_name', 'tasa_desocupacion')
              .order('period', { ascending: false })
              .limit(6)
          : Promise.resolve({ data: null }),
        // Latest ocupados, fuerza de trabajo, ventas from INE/BCCh
        regionId !== undefined
          ? sb.from('regional_metrics')
              .select('metric_name, value, period')
              .eq('region_id', regionId)
              .in('metric_name', ['ocupados_miles', 'fuerza_trabajo_miles', 'ventas_regionales'])
              .order('period', { ascending: false })
              .limit(6)
          : Promise.resolve({ data: null }),
        // Latest PIB regional anual from BCCh (for minuta context)
        regionId !== undefined
          ? sb.from('regional_metrics')
              .select('metric_name, value, period')
              .eq('region_id', regionId)
              .eq('metric_name', 'pib_regional_anual')
              .order('period', { ascending: false })
              .limit(1)
          : Promise.resolve({ data: null }),
      ])

      // Build seguimientos lookup
      const segData = (seguimientosRes.data ?? []) as Pick<Seguimiento, 'prioridad_id' | 'fecha' | 'tipo' | 'descripcion' | 'estado'>[]
      const nameMap = new Map(projects.map(p => [p.n, p.nombre]))
      const segByInit = new Map<number, typeof segData>()
      for (const s of segData) {
        const arr = segByInit.get(s.prioridad_id) ?? []
        if (arr.length < 3) arr.push(s)  // max 3 per initiative
        segByInit.set(s.prioridad_id, arr)
      }
      seguimientosMinuta = Array.from(segByInit.entries()).map(([pid, entries]) => ({
        prioridad_id: pid,
        nombre: nameMap.get(pid) ?? `#${pid}`,
        estado_semaforo: projects.find(p => p.n === pid)?.estado_semaforo ?? null,
        pct_avance: projects.find(p => p.n === pid)?.pct_avance ?? null,
        entries: entries.map(e => ({ fecha: e.fecha, tipo: e.tipo, descripcion: e.descripcion })),
      }))

      // Build semaforo trends
      const logData = (semaforoLogRes.data ?? []) as Pick<SemaforoLog, 'prioridad_id' | 'valor_anterior' | 'valor_nuevo' | 'created_at'>[]
      const SEVERITY: Record<string, number> = { gris: 0, verde: 1, ambar: 2, rojo: 3 }
      const deteriorated: string[] = []
      const improved: string[] = []
      const chronic: string[] = []

      // Group log by initiative — check first and last change
      const logByInit = new Map<number, typeof logData>()
      for (const l of logData) {
        const arr = logByInit.get(l.prioridad_id) ?? []
        arr.push(l)
        logByInit.set(l.prioridad_id, arr)
      }
      const initIdsWithChanges = new Set(logByInit.keys())
      for (const [pid, logs] of logByInit.entries()) {
        const name = nameMap.get(pid) ?? `#${pid}`
        const first = logs[logs.length - 1]  // oldest (sorted desc)
        const last = logs[0]                  // newest
        const oldSev = SEVERITY[first.valor_anterior ?? ''] ?? 0
        const newSev = SEVERITY[last.valor_nuevo] ?? 0
        if (newSev > oldSev) deteriorated.push(`${name}: ${first.valor_anterior}→${last.valor_nuevo}`)
        else if (newSev < oldSev) improved.push(`${name}: ${first.valor_anterior}→${last.valor_nuevo}`)
      }
      // Chronic: currently rojo with no improving change in 90 days
      for (const p of projects) {
        if (p.estado_semaforo === 'rojo' && !initIdsWithChanges.has(p.n)) {
          chronic.push(p.nombre)
        }
      }
      semaforoTrends = { deteriorated, improved, chronic }

      // Build national benchmark (latest value per metric)
      const natData = (nationalRes.data ?? []) as { metric_name: string; value: number; period: string }[]
      const natMap = new Map<string, { value: number; period: string }>()
      for (const r of natData) {
        if (!natMap.has(r.metric_name)) natMap.set(r.metric_name, { value: r.value, period: r.period })
      }
      nationalBenchmark = Array.from(natMap.entries()).map(([metric, d]) => ({
        metric_name: metric,
        national_value: d.value,
        period: d.period,
      }))

      // Build trend summaries
      const stopData = (stopHistoryRes.data ?? []) as { semana_id: number; casos_ultima_semana: number | null }[]
      const regTsData = (regionalTsRes.data ?? []) as { value: number; period: string }[]

      let unemploymentTrend: TrendSummaries['unemployment'] = null
      if (regTsData.length >= 2) {
        const latest = regTsData[0]
        const oldest = regTsData[regTsData.length - 1]
        unemploymentTrend = {
          current: latest.value,
          previous: oldest.value,
          delta: parseFloat((latest.value - oldest.value).toFixed(1)),
          months: regTsData.length,
          latestPeriod: latest.period,
        }
      }

      let crimeTrend: TrendSummaries['crime'] = null
      if (stopData.length >= 4) {
        const recent4 = stopData.slice(0, 4).map(d => d.casos_ultima_semana ?? 0)
        const older4  = stopData.slice(4, 8).map(d => d.casos_ultima_semana ?? 0)
        const avgRecent = recent4.reduce((a, b) => a + b, 0) / recent4.length
        const avgOlder  = older4.length > 0 ? older4.reduce((a, b) => a + b, 0) / older4.length : null
        crimeTrend = {
          avgRecent4w: Math.round(avgRecent),
          avgPrevious4w: avgOlder != null ? Math.round(avgOlder) : null,
          pctChange: avgOlder != null && avgOlder > 0 ? parseFloat(((avgRecent - avgOlder) / avgOlder * 100).toFixed(1)) : null,
        }
      }

      // Build INE employment + ventas data
      const empleoIneData = (empleoIneRes.data ?? []) as { metric_name: string; value: number; period: string }[]
      let empleoINE: TrendSummaries['empleoINE'] = null
      const ocuRow = empleoIneData.find(r => r.metric_name === 'ocupados_miles')
      const ftrRow = empleoIneData.find(r => r.metric_name === 'fuerza_trabajo_miles')
      if (ocuRow) {
        empleoINE = {
          ocupados_miles: ocuRow.value,
          fuerza_trabajo_miles: ftrRow?.value,
          period: ocuRow.period,
        }
      }
      let ventas: TrendSummaries['ventas'] = null
      const ventasRow = empleoIneData.find(r => r.metric_name === 'ventas_regionales')
      if (ventasRow) {
        ventas = { current: ventasRow.value, period: ventasRow.period }
      }

      // Build PIB anual from BCCh
      let pibAnual: TrendSummaries['pibAnual'] = null
      const pibAnualData = (pibAnualRes.data ?? []) as { metric_name: string; value: number; period: string }[]
      if (pibAnualData.length > 0) {
        pibAnual = { value: pibAnualData[0].value, period: pibAnualData[0].period }
      }

      trendSummaries = { unemployment: unemploymentTrend, crime: crimeTrend, empleoINE, ventas, pibAnual }
    }

    // ── Kit de Viaje extra data (PIB all regions, sectorial, history) ────────
    if (tipo === 'ficha' && regionId !== undefined) {
      const [allPibRes, sectorRes, nacBenchRes, pibHistoryRes] = await Promise.all([
        sb.from('v2_indicadores_ultimo')
          .select('codigo_indicador, region_id, valor')
          .in('codigo_indicador', ['ECO_PIB_ANUAL', 'ECO_PCT_PIB'])
          .gt('region_id', 0),
        sb.from('v2_indicadores_ultimo')
          .select('codigo_indicador, valor')
          .like('codigo_indicador', 'ECO_PIB_%')
          .eq('region_id', regionId),
        sb.from('v2_indicadores_ultimo')
          .select('codigo_indicador, valor')
          .eq('region_id', 0)
          .in('codigo_indicador', ['EMP_DESOC_TASA']),
        sb.from('regional_metrics')
          .select('value, period')
          .eq('region_id', regionId)
          .eq('metric_name', 'pib_regional_anual')
          .order('period', { ascending: true }),
      ])

      const allPib = (allPibRes.data ?? []) as { codigo_indicador: string; region_id: number; valor: number }[]
      const pibByRegion = new Map<number, { pib: number; pct: number }>()
      for (const r of allPib) {
        const entry = pibByRegion.get(r.region_id) ?? { pib: 0, pct: 0 }
        if (r.codigo_indicador === 'ECO_PIB_ANUAL') entry.pib = r.valor
        if (r.codigo_indicador === 'ECO_PCT_PIB') entry.pct = r.valor
        pibByRegion.set(r.region_id, entry)
      }

      const { REGIONS } = await import('@/lib/regions')
      const allRegionsPib = [...pibByRegion.entries()]
        .map(([rid, d]) => ({
          region_id: rid,
          nombre: REGIONS.find(r => INE_CODE[r.cod] === rid)?.nombre ?? `Región ${rid}`,
          pib_mm: d.pib,
          pct_pib: d.pct,
        }))
        .sort((a, b) => b.pib_mm - a.pib_mm)

      // Sectorial breakdown
      const sectorData = (sectorRes.data ?? []) as { codigo_indicador: string; valor: number }[]
      const SECTOR_NAMES: Record<string, string> = {
        ECO_PIB_AGRO: 'Agropecuario-silvícola', ECO_PIB_PESCA: 'Pesca',
        ECO_PIB_MINERIA: 'Minería', ECO_PIB_INDUSTRIA: 'Industria manufacturera',
        ECO_PIB_ELECTRIC: 'Electricidad, gas y agua', ECO_PIB_CONSTRUC: 'Construcción',
        ECO_PIB_COMERCIO: 'Comercio', ECO_PIB_REST_HOT: 'Restaurantes y hoteles',
        ECO_PIB_TRANSPORTE: 'Transporte y comunicaciones', ECO_PIB_FINANCIERO: 'Servicios financieros',
        ECO_PIB_VIVIENDA: 'Propiedad de vivienda', ECO_PIB_SERV_PERS: 'Servicios personales',
        ECO_PIB_ADM_PUB: 'Administración pública',
      }
      const sectorRows = sectorData
        .filter(s => SECTOR_NAMES[s.codigo_indicador])
        .map(s => ({ sector: SECTOR_NAMES[s.codigo_indicador], valor: s.valor }))
        .sort((a, b) => b.valor - a.valor)
      const sectorTotal = sectorRows.reduce((s, r) => s + r.valor, 0)
      const pibSectorial = sectorRows.map(s => ({
        ...s,
        pct: sectorTotal > 0 ? (s.valor / sectorTotal) * 100 : 0,
      }))

      const nacBench = (nacBenchRes.data ?? []) as { codigo_indicador: string; valor: number }[]
      const desocNac = nacBench.find(r => r.codigo_indicador === 'EMP_DESOC_TASA')?.valor ?? null

      const pibHistory = (pibHistoryRes.data ?? []) as { value: number; period: string }[]

      fichaExtra = {
        allRegionsPib,
        pibSectorial,
        desocupacionNacional: desocNac,
        pibAnualRegion: trendSummaries?.pibAnual ?? null,
        pibAnualHistory: pibHistory.map(h => ({ period: h.period, value: h.value })),
      }
    }
  } else {
    const { getIniciativas } = await import('@/lib/projects')
    const all = getIniciativas()
    projects = all.filter(p => p.cod === body.region.cod)
  }

  // Use cached AI content or generate fresh
  let aiContent: unknown
  if (cachedAiContent) {
    console.log(`[minuta] cache HIT ${body.region.cod}/${tipo}`)
    aiContent = cachedAiContent
  } else {
    console.log(`[minuta] ${tipo} for ${body.region.nombre} — projects: ${projects.length}, metrics: ${!!metrics}, seia: ${seiaProjects?.length ?? 0}, mop: ${mopProjects?.length ?? 0}, leystop: ${!!leystopData}, planPdf: ${!!planPdfBase64}, seguimientos: ${seguimientosMinuta.length}, trends: ${!!trendSummaries}`)
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
      seguimientosMinuta,
      semaforoTrends,
      nationalBenchmark,
      trendSummaries,
      fichaExtra,
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

  // Register Carlito font for all PDF renders
  registerPdfFonts()

  let element: React.ReactElement

  if (tipo === 'ficha') {
    const FichaRegional = (await import('@/components/FichaRegional')).default
    const regionProvs = (provinciasData as Record<string, { provincias: { nombre: string; comunas: string }[] }>)[body.region.cod]?.provincias ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    element = React.createElement(FichaRegional as any, {
      region: body.region,
      metrics,
      leystopData,
      fecha: body.fecha,
      aiContent,
      provinciasData: regionProvs,
      allRegionsPib: fichaExtra?.allRegionsPib ?? [],
      pibSectorial: fichaExtra?.pibSectorial ?? [],
      trendSummaries,
      logoSrc: LOGO_DATA_URL,
    })
  } else if (tipo === 'ejecutiva') {
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
    element = React.createElement(MinutaDocumentV2 as any, {
      region: body.region,
      projects,
      metrics,
      seiaProjects,
      mopProjects,
      fecha: body.fecha,
      aiContent,
      autoridades: [],      // Eliminado: decisión v2 — tabla vacía
      periodMetrics: [],    // Eliminado: decisión v2 — no comparar gobiernos
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
  const suffix = tipo === 'ejecutiva' ? '-ejecutiva' : tipo === 'ficha' ? '-kit-viaje' : ''

  // Log to v2_minutas_log (no content stored — just metadata + hash)
  if (sbRef) {
    const regionId = INE_CODE[body.region.cod]
    const tipoLog = tipo === 'completo' ? 'kit_viaje' : tipo
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    sbRef.from('v2_minutas_log').insert({
      region_id: regionId,
      tipo: tipoLog,
      generado_por: authProfile.id,
      hash_pdf: hash,
      parametros: { fecha: body.fecha, force, ai: !!aiContent },
    }).then(({ error }) => { if (error) console.error('[minuta] v2_minutas_log:', error.message) })
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="minuta-${regionSlug}${suffix}.pdf"`,
    },
  })
}
