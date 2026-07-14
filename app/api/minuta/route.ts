import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject, Seguimiento, SemaforoLog, RegionEje } from '@/lib/types'
import { INE_CODE } from '@/lib/regions'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { minutaPostSchema } from '@/lib/schemas'
import {
  generateMinutaContent,
  generateKitViajeContent,
  generateJustificacionEjes,
  generatePregoResumen,
  KitViajeAiHardError,
  type LeystopMinuta, type SeguimientoMinuta,
  type SemaforoTrendSummary, type NationalBenchmark, type TrendSummaries,
  type FichaExtraData,
  type JustificacionEjesOutput,
} from '@/lib/minutaAI'
import provinciasData from '@/data/provincias-comunas.json'
import { registerPdfFonts } from '@/lib/pdfFonts'
import {
  buildKitDeViajeData,
  buildRawDataLines,
  renderKitDeViajePdf,
  validatePlanPdfBuffer,
  type KitDeViajeAIContent,
  type PlanPdfState,
} from '@/lib/kitDeViaje'
import {
  buildGeoContexto,
  fetchCensoContexto,
  fetchPibContexto,
  fetchEmpleoContexto,
  fetchCasenContexto,
  fetchDmcsPct,
  type GeoContexto,
  type PibContexto,
  type EmpleoContexto,
  type CasenContexto,
} from '@/lib/kitDeViaje/metricasData'
import type { CensoRegionData } from '@/lib/hooks/useCensoRegiones'

// Cap a 300s: 7+ queries Supabase en serie + Anthropic AI con PDF + render react-pdf.
// Sin esto Vercel mata el handler a ~60s y el usuario ve "no se generó la minuta"
// (mismo vector que sufrió SEIA en mayo 2026 — timeout silencioso).
export const maxDuration = 300

const LOGO_PATH = path.join(process.cwd(), 'public', 'logo-pdf.png')
const FOOTER_BANNER_PATH = path.join(process.cwd(), 'public', 'footer-gobierno-chile.png')

// Read logo as base64 data URL at startup — more reliable than file paths in serverless
// NOTE: logo-pdf.png is an RGB PNG converted from the original CMYK JPEG.
// react-pdf v4 cannot handle CMYK JPEG images (4-component) — they corrupt the page layout.
function readPngDataUrl(filePath: string): string | null {
  try {
    const buf = fs.readFileSync(filePath)
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}
const LOGO_DATA_URL = readPngDataUrl(LOGO_PATH)
const FOOTER_BANNER_DATA_URL = readPngDataUrl(FOOTER_BANNER_PATH)

export async function GET(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const region_cod = url.searchParams.get('region_cod')
  const rawTipo = url.searchParams.get('tipo') ?? 'ejecutiva'
  if (rawTipo !== 'ejecutiva' && rawTipo !== 'ficha' && rawTipo !== 'kit_viaje') {
    return Response.json({ error: `tipo inválido: ${rawTipo}. Valores válidos: 'ejecutiva' | 'kit_viaje' | 'ficha' (legacy)` }, { status: 400 })
  }
  // Canonicalización Fase A.3: 'ficha' es alias legacy del Kit de Viaje.
  // Consultamos el cache con la clave canónica 'kit_viaje' para que ambas
  // formas de invocar devuelvan lo mismo.
  const cacheTipo = rawTipo === 'ficha' ? 'kit_viaje' : rawTipo

  if (!region_cod || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ cached: false, generated_at: null })
  }

  const today = new Date().toISOString().slice(0, 10)
  const sb = getSupabaseAdmin()
  const { data } = await sb.from('minuta_cache')
    .select('generated_at')
    .eq('region_cod', region_cod)
    .eq('tipo', cacheTipo)
    .eq('cache_date', today)
    .maybeSingle()

  return Response.json({ cached: !!data, generated_at: data?.generated_at ?? null })
}

export async function POST(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400 }) }

  const parse = minutaPostSchema.safeParse(rawBody)
  if (!parse.success) {
    const first = parse.error.issues[0]
    const hint = first ? `${first.path.join('.') || '(root)'}: ${first.message}` : undefined
    return new Response(
      JSON.stringify({ error: 'Solicitud inválida', hint, detalle: parse.error.issues }),
      { status: 400 },
    )
  }
  // El schema valida cod + nombre + fecha + tipo + format + force. El passthrough()
  // deja pasar el resto de Region (capital, zona) que el PDF puede usar.
  const body = parse.data as typeof parse.data & { region: Region }

  // regional / filtered-viewer can only generate minutas for their assigned regions
  const isRestricted = authProfile.role === 'regional' ||
    (authProfile.role === 'viewer' && authProfile.region_cods.length > 0)
  if (isRestricted && !authProfile.region_cods.includes(body.region.cod)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }
  // Canonicalización Fase A.3: 'ficha' es alias legacy del nuevo 'kit_viaje'.
  // Downstream (cache key, v2_minutas_log, dispatch) usa canonTipo, no body.tipo.
  // El schema sigue aceptando 'ficha' para no romper callers externos.
  const canonTipo: 'ejecutiva' | 'kit_viaje' =
    body.tipo === 'ficha' ? 'kit_viaje' : body.tipo
  const force = body.force
  const today = new Date().toISOString().slice(0, 10)

  let projects: Iniciativa[]
  let metrics: RegionMetrics | null = null
  let seiaProjects: SeiaProject[] | null = null
  let mopProjects:  MopProject[]  | null = null
  let leystopData: LeystopMinuta | null = null
  let planPdfBase64: string | null = null
  let planPdfState:  PlanPdfState = 'missing'
  let regionEjes: RegionEje[] = []
  let autoridadesFichaBuffer: Buffer | null = null
  let conflictosBuffer: Buffer | null = null
  let cachedAiContent: unknown = null
  let sbRef: ReturnType<typeof getSupabaseAdmin> | null = null
  // Enriched context data (fase 2)
  let seguimientosMinuta: SeguimientoMinuta[] = []
  let semaforoTrends: SemaforoTrendSummary | null = null
  let nationalBenchmark: NationalBenchmark[] = []
  let trendSummaries: TrendSummaries | null = null
  // Legacy passthrough para 'ejecutiva' (generateMinutaContent acepta el
  // parámetro pero nunca lo pobló ni antes ni ahora — Contexto Regional usa
  // metricasContexto en su lugar, no fichaExtra).
  const fichaExtra: FichaExtraData | null = null
  // "Contexto Regional" — datos exclusivamente de las tablas que alimentan
  // el panel de Métricas (registros_bce, registros_bce_empleo, casen_regiones,
  // censo_regiones.json). Nunca region_metrics ni v2_indicadores_*.
  let metricasContexto: {
    geo: GeoContexto
    censo: CensoRegionData | null
    pib: PibContexto
    empleo: EmpleoContexto
    casen: CasenContexto | null
    dmcsPct: number | null
  } = {
    geo: { km2: 0, pctTerritorioNacional: 0, comunasN: 0, provinciasN: 0 },
    censo: null,
    pib: { pibRegionMM: null, periodo: null, pctPibNacional: null, ranking: null, variacionAnualPct: null, sectores: [] },
    empleo: { tasaDesocupacion: null, ocupadosMiles: null, fuerzaTrabajoMiles: null, periodo: null, rankingDesocupacion: null, variacionTrimestralPp: null },
    casen: null,
    dmcsPct: null,
  }

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON) {
    const { getIniciativasByCod, getMetricsByCod } = await import('@/lib/db')
    const sb = getSupabaseAdmin()
    sbRef = sb
    const regionId = INE_CODE[body.region.cod]

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
      // `getSupabaseColega()` es hoy solo un alias de `getSupabase()` (los datos
      // se consolidaron al Supabase principal en la mig. 031) — se consulta
      // directo con `sb` (admin), sin depender de las env vars COLEGA_URL/ANON
      // que ya no existen y dejaban esta query siempre en null.
      regionId !== undefined
        ? sb.from('registros_leystop')
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
            .eq('tipo', canonTipo)
            .eq('cache_date', today)
            .maybeSingle(),
    ])

    // region_ejes catálogo. Ahora lo usa la minuta 'ejecutiva' (bloque
    // "Del diagnóstico a la priorización"). El Kit de Viaje ya no lo usa
    // porque Sección III se retiró.
    if (canonTipo === 'ejecutiva') {
      const { data: ejesRes } = await sb.from('region_ejes')
        .select('*')
        .eq('region_cod', body.region.cod)
        .order('numero', { ascending: true })
      regionEjes = (ejesRes ?? []) as RegionEje[]
    }

    // Ficha oficial de autoridades para el Kit de Viaje. Si existe en el
    // bucket, el post-proceso con pdf-lib la anexa como Sección IV; si no,
    // el renderer pinta disclaimer + sample data. Descarga barata (~200-500 KB).
    if (canonTipo === 'kit_viaje') {
      try {
        const { data: fichaData, error: fichaErr } = await sb.storage
          .from('autoridades-fichas')
          .download(`${body.region.cod}.pdf`)
        if (!fichaErr && fichaData) {
          const arrayBuf = await fichaData.arrayBuffer()
          autoridadesFichaBuffer = Buffer.from(arrayBuf)
        }
      } catch {
        // sin ficha para esta región — cae al fallback preview
      }
    }

    // PDF de "conflictos y alertas" de la región (bucket privado). Si existe,
    // el post-proceso con pdf-lib lo anexa como Sección IV, verbatim — mismo
    // patrón que la ficha de autoridades. Si no, el renderer pinta disclaimer.
    if (canonTipo === 'kit_viaje') {
      try {
        const { data: confData, error: confErr } = await sb.storage
          .from('conflictos-regionales')
          .download(`${body.region.cod}.pdf`)
        if (!confErr && confData) {
          const arrayBuf = await confData.arrayBuffer()
          conflictosBuffer = Buffer.from(arrayBuf)
        }
      } catch {
        // sin PDF de conflictos para esta región — el renderer muestra disclaimer
      }
    }

    projects     = prioridades
    metrics      = metricas
    seiaProjects = (seiaRes.data as SeiaProject[] | null)
    mopProjects  = (mopRes.data  as MopProject[]  | null)
    leystopData  = (leystopRes.data as LeystopMinuta | null)
    cachedAiContent = (cacheRes.data as { ai_content: unknown } | null)?.ai_content ?? null

    // Fetch Plan Regional PDF from Storage. Lo consumen:
    //   1. Minuta 'ejecutiva' — para el bloque "Del diagnóstico a la
    //      priorización" (justificación de ejes con AI + PDF como document input).
    //   2. Path legacy de `generateMinutaContent('ejecutiva', ...)` que también
    //      usa el PDF como contexto para la narrativa.
    //   3. Contexto Regional ('kit_viaje') — Sección III ("Plan Regional de
    //      Gobierno Región X") lo usa para el resumen redactado por
    //      `generatePregoResumen()`.
    // `validatePlanPdfBuffer` detecta el caso Ñuble XVI.pdf (328 bytes,
    // corrupto en prod) para no fabricar contenido cuando el PDF es basura.
    if (canonTipo === 'ejecutiva' || canonTipo === 'kit_viaje') {
      try {
        const { data: pdfData, error: pdfError } = await sb.storage
          .from('plan-regional')
          .download(`${body.region.cod}.pdf`)
        if (!pdfError && pdfData) {
          const arrayBuf = await pdfData.arrayBuffer()
          const buf = Buffer.from(arrayBuf)
          planPdfState = validatePlanPdfBuffer(buf)
          if (planPdfState === 'ok') {
            planPdfBase64 = buf.toString('base64')
          }
        } else {
          planPdfState = 'missing'
        }
      } catch {
        planPdfState = 'missing'
      }
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

    // ── Contexto Regional — datos de las tablas que alimentan Métricas ──────
    // Reemplaza el antiguo bloque "Kit de Viaje extra data" que consultaba
    // v2_indicadores_ultimo. Corre siempre para kit_viaje (no solo sin cache)
    // porque también alimenta los bullets deterministas del assembler, no
    // solo el prompt de IA.
    if (canonTipo === 'kit_viaje') {
      const [pib, empleo, casen, dmcsPct] = await Promise.all([
        fetchPibContexto(sb, body.region.nombre),
        fetchEmpleoContexto(sb, body.region.nombre),
        fetchCasenContexto(sb, body.region),
        regionId !== undefined ? fetchDmcsPct(sb, regionId) : Promise.resolve(null),
      ])
      metricasContexto = {
        geo: buildGeoContexto(body.region),
        censo: regionId !== undefined ? fetchCensoContexto(regionId) : null,
        pib,
        empleo,
        casen,
        dmcsPct,
      }
    }
  } else {
    const { getIniciativas } = await import('@/lib/projects')
    const all = getIniciativas()
    projects = all.filter(p => p.cod === body.region.cod)
  }

  // Use cached AI content or generate fresh.
  // El shape del ai_content depende de canonTipo:
  //   - 'ejecutiva'  → MinutaEjecutivaContent (path legacy)
  //   - 'kit_viaje'  → KitDeViajeAIContent    (Fase A del rediseño)
  // Rows del cache guardadas con tipo='ficha' quedan huérfanas y no se leen
  // más — el lookup usa canonTipo='kit_viaje'. Se pueden borrar en cleanup.
  let aiContent: unknown
  if (cachedAiContent) {
    console.log(`[minuta] cache HIT ${body.region.cod}/${canonTipo}`)
    aiContent = cachedAiContent
  } else if (canonTipo === 'kit_viaje') {
    console.log(`[minuta] kit_viaje for ${body.region.nombre} — projects: ${projects.length}, metrics: ${!!metrics}`)
    try {
      // El prompt recibe las mismas líneas de datos crudos que usa el fallback
      // determinístico (`buildRawDataLines`, única fuente de verdad) — así la
      // IA solo redacta, sin recalcular ni descuadrar cifras.
      const rawDataLines = buildRawDataLines({
        region: body.region,
        geo: metricasContexto.geo,
        censo: metricasContexto.censo,
        pib: metricasContexto.pib,
        empleo: metricasContexto.empleo,
        casen: metricasContexto.casen,
        leystop: leystopData,
        dmcsPct: metricasContexto.dmcsPct,
      })

      aiContent = await generateKitViajeContent({
        contextInput: {
          region: { cod: body.region.cod, nombre: body.region.nombre },
          raw: rawDataLines,
        },
      })

      // Sección III — resumen del PREGO. Llamada aparte porque lee un PDF
      // distinto (Plan Regional) y no depende de los bullets de Métricas.
      if (planPdfState === 'ok' && planPdfBase64) {
        const pregoResumen = await generatePregoResumen({
          region: { cod: body.region.cod, nombre: body.region.nombre },
          planPdfBase64,
        })
        if (pregoResumen) {
          aiContent = {
            ...(aiContent as KitDeViajeAIContent ?? { caracterizacion: {}, indicadores: {} }),
            plan_regional_parrafos: pregoResumen.parrafos,
          }
        }
      }
    } catch (err) {
      if (err instanceof KitViajeAiHardError) {
        // Créditos agotados o auth rota — corta acá con 503 + mensaje humano
        // en vez de generar un PDF vacío-sospechoso.
        console.error(`[minuta] AI hard error (${err.code}): ${err.detail}`)
        return new Response(
          JSON.stringify({
            error: err.message,
            code: `ai_${err.code}`,
            hint: 'Regenerar el Kit de Viaje una vez que se restablezca el servicio de AI.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        )
      }
      throw err
    }
    if (sbRef && aiContent) {
      const { error: cacheErr } = await sbRef.from('minuta_cache').upsert({
        region_cod:   body.region.cod,
        tipo:         canonTipo,
        cache_date:   today,
        ai_content:   aiContent as Record<string, unknown>,
        generated_by: authProfile.id,
      }, { onConflict: 'region_cod,tipo,cache_date' })
      if (cacheErr) console.error('[minuta] cache store:', cacheErr.message)
    }
  } else {
    // canonTipo === 'ejecutiva' — Avance PREGO.
    console.log(`[minuta] ejecutiva for ${body.region.nombre} — projects: ${projects.length}, metrics: ${!!metrics}, seia: ${seiaProjects?.length ?? 0}, mop: ${mopProjects?.length ?? 0}, leystop: ${!!leystopData}, planPdf: ${!!planPdfBase64}, seguimientos: ${seguimientosMinuta.length}, trends: ${!!trendSummaries}, ejes: ${regionEjes.length}`)
    aiContent = await generateMinutaContent(
      'ejecutiva',
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
    // Store in cache. Awaited: en serverless, escrituras fire-and-forget se
    // pierden cuando el contenedor se congela tras Response (ver O-04 en
    // CLAUDE.md — mismo síntoma que dejó a SEIA 53 días sin telemetría).
    if (sbRef) {
      const { error: cacheErr } = await sbRef.from('minuta_cache').upsert({
        region_cod:   body.region.cod,
        tipo:         canonTipo,
        cache_date:   today,
        ai_content:   aiContent as Record<string, unknown>,
        generated_by: authProfile.id,
      }, { onConflict: 'region_cod,tipo,cache_date' })
      if (cacheErr) console.error('[minuta] cache store:', cacheErr.message)
    }
  }

  // Justificación de ejes para el bloque "Del diagnóstico a la priorización".
  // Solo se calcula para 'ejecutiva'. Requiere PDF ok + al menos 1 eje.
  // Falla silenciosamente (devuelve {}) — el componente pinta disclaimer.
  let justificacionesEjes: JustificacionEjesOutput = {}
  if (canonTipo === 'ejecutiva' && planPdfState === 'ok' && planPdfBase64 && regionEjes.length > 0) {
    try {
      const j = await generateJustificacionEjes({
        region: { cod: body.region.cod, nombre: body.region.nombre },
        planPdfBase64,
        ejes: regionEjes,
      })
      if (j) justificacionesEjes = j
    } catch (err) {
      if (err instanceof KitViajeAiHardError) {
        console.error(`[minuta] justif ejes AI hard error (${err.code}): ${err.detail}`)
        return new Response(
          JSON.stringify({
            error: err.message,
            code: `ai_${err.code}`,
            hint: 'Regenerar la minuta una vez que se restablezca el servicio de AI.',
          }),
          { status: 503, headers: { 'Content-Type': 'application/json' } },
        )
      }
      console.error('[minuta] justif ejes fallo suave:', err)
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

  let buffer: Buffer
  try {
    if (canonTipo === 'kit_viaje') {
      // Contexto Regional (Kit de Viaje). renderKitDeViajePdf hace el
      // renderToBuffer internamente. Ya no incluye Sección III (PREGO).
      const regionProvs = (provinciasData as Record<string, { provincias: { nombre: string; comunas: string }[] }>)[body.region.cod]?.provincias ?? []
      const kitData = buildKitDeViajeData({
        region: body.region,
        fecha: body.fecha,
        numeroMinuta: body.numero,
        geo: metricasContexto.geo,
        censo: metricasContexto.censo,
        pib: metricasContexto.pib,
        empleo: metricasContexto.empleo,
        casen: metricasContexto.casen,
        leystop: leystopData,
        dmcsPct: metricasContexto.dmcsPct,
        planPdfState,
        aiContent: aiContent as KitDeViajeAIContent | null,
        provincias: regionProvs.map(p => ({ provincia: p.nombre, comunas: p.comunas })),
        logoDataUrl: LOGO_DATA_URL ?? '',
        footerBannerDataUrl: FOOTER_BANNER_DATA_URL ?? '',
        aiFresh: !cachedAiContent,
        hasAutoridadesFicha: !!autoridadesFichaBuffer,
        hasConflictos: !!conflictosBuffer,
      })
      buffer = await renderKitDeViajePdf(kitData)

      // Anexos verbatim con pdf-lib, EN ORDEN de sección: primero Conflictos
      // (Sección IV), después Autoridades (Sección V). Cuando el PDF existe, el
      // renderer omite por completo la sección (ambos PDFs traen su propio
      // encabezado) para no dejar una página de título semi-vacía antes del
      // anexo. Cada PDF preserva su layout 1:1 (texto vectorial + imágenes).
      if (conflictosBuffer || autoridadesFichaBuffer) {
        const t0 = Date.now()
        const { PDFDocument } = await import('pdf-lib')
        const kitDoc = await PDFDocument.load(new Uint8Array(buffer))
        let anexadas = 0
        for (const anexo of [conflictosBuffer, autoridadesFichaBuffer]) {
          if (!anexo) continue
          try {
            const anexoDoc = await PDFDocument.load(new Uint8Array(anexo))
            const pages = await kitDoc.copyPages(anexoDoc, anexoDoc.getPageIndices())
            for (const p of pages) kitDoc.addPage(p)
            anexadas += pages.length
          } catch (e) {
            // PDF anexo corrupto/no-parseable — se omite sin romper la minuta.
            console.warn('[minuta] no pude anexar un PDF (corrupto):', e)
          }
        }
        buffer = Buffer.from(await kitDoc.save())
        console.log(`[minuta] anexé ${anexadas} páginas (conflictos + autoridades) en ${Date.now() - t0}ms`)
      }
    } else {
      // canonTipo === 'ejecutiva' — Avance PREGO.
      const MinutaEjecutiva = (await import('@/components/MinutaEjecutiva')).default
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const element = React.createElement(MinutaEjecutiva as any, {
        region: body.region,
        projects,
        seiaProjects,
        mopProjects,
        fecha: body.fecha,
        aiContent,
        logoSrc: LOGO_DATA_URL,
        ejes: regionEjes,
        justificacionesEjes,
        planPdfState,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      buffer = await renderToBuffer(element as any)
    }
  } catch (err) {
    console.error('[minuta] render error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({ error: `No se pudo renderizar el PDF: ${msg}` }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
  const suffix = canonTipo === 'kit_viaje' ? '-kit-viaje' : '-ejecutiva'

  // Log to v2_minutas_log. Awaited por el mismo motivo que el cache upsert
  // — fire-and-forget en serverless se pierde tras Response.
  if (sbRef) {
    const regionId = INE_CODE[body.region.cod]
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
    const { error: logErr } = await sbRef.from('v2_minutas_log').insert({
      region_id: regionId,
      tipo: canonTipo,
      generado_por: authProfile.id,
      hash_pdf: hash,
      parametros: { fecha: body.fecha, force, ai: !!aiContent, planPdfState },
    })
    if (logErr) console.error('[minuta] v2_minutas_log:', logErr.message)
  }

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="minuta-${regionSlug}${suffix}.pdf"`,
    },
  })
}
