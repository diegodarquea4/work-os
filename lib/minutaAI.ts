import Anthropic from '@anthropic-ai/sdk'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

export type MinutaEjecutivaContent = {
  avances_relevantes: string[]      // 4-5 bullets de logros recientes
  alertas: string[]                 // 2-3 alertas narrativas
  contexto_region: string           // 2-3 oraciones de síntesis
  iniciativas_destacadas: string[]  // 3-4 iniciativas con estado
  tendencia_general?: string        // 1 línea: "Mejora en empleo; deterioro en seguridad"
}

export type MinutaTipo = 'ejecutiva' | 'ficha'

export type FichaRegionalContent = {
  introduccion: string           // I. párrafo contextual geográfico-político
  estructura_etaria: string      // I. narrativa edad/envejecimiento
  composicion: string            // I. narrativa pueblos originarios/inmigrantes/discapacidad
  pib_comentario: string         // II. variación PIB últimos años (2-3 oraciones)
  matriz_productiva: string      // II. narrativa sectores productivos
  mercado_laboral_nota: string   // II. contexto mercado laboral vs nacional (1-2 oraciones)
  ingresos_pobreza: string       // II. CASEN 2024 párrafo completo
  educacion_nota: string         // II. Censo 2024 educación
  salud_nota: string             // II. CASEN 2024 salud
  vivienda_nota: string          // II. Censo 2024 vivienda
  seguridad_nota: string         // II. LeyStop narrativa seguridad
  prego_intro: string            // III. párrafo intro PREGO
  prego_ejes: {
    numero: number
    nombre: string
    items: { letra: string; texto: string }[]
  }[]
}

/** Data passed to AI for ficha/kit-de-viaje generation */
export type FichaExtraData = {
  allRegionsPib: { region_id: number; nombre: string; pib_mm: number; pct_pib: number }[]
  pibSectorial: { sector: string; valor: number; pct: number }[]
  desocupacionNacional: number | null
  pibAnualRegion: { value: number; period: string } | null
  pibAnualHistory: { period: string; value: number }[]
}

// Subset of registros_leystop used in minuta context (DB field names — pct_N not n_N)
export type LeystopMinuta = {
  semana: string | null
  tasa_registro: number | null
  casos_ultima_semana: number | null
  var_ultima_semana: number | null
  var_28dias: number | null
  var_anno_fecha: number | null
  casos_anno_fecha: number | null
  casos_anno_fecha_anterior: number | null
  mayor_registro_1: string | null; pct_1: number | null
  mayor_registro_2: string | null; pct_2: number | null
  mayor_registro_3: string | null; pct_3: number | null
  mayor_registro_4: string | null; pct_4: number | null
  mayor_registro_5: string | null; pct_5: number | null
  controles: number | null
  controles_identidad: number | null
  controles_vehicular: number | null
  fiscalizaciones: number | null
  incautaciones: number | null
  incaut_fuego: number | null
  incaut_blancas: number | null
  allanamientos_anno: number | null
  vehiculos_recuperados_anno: number | null
  decomisos_anno: number | null
}

// ── Enriched context types (computed in route.ts) ────────────────────────────

export type SeguimientoMinuta = {
  prioridad_id: number
  nombre: string
  estado_semaforo: string | null
  pct_avance: number | null
  entries: { fecha: string; tipo: string; descripcion: string }[]
}

export type SemaforoTrendSummary = {
  deteriorated: string[]  // "Nombre: verde→rojo"
  improved: string[]      // "Nombre: rojo→ambar"
  chronic: string[]       // names of initiatives in rojo >90 days with no change
}

export type NationalBenchmark = {
  metric_name: string
  national_value: number
  period: string
}

export type TrendSummaries = {
  unemployment: { current: number; previous: number; delta: number; months: number; latestPeriod: string } | null
  crime: { avgRecent4w: number; avgPrevious4w: number | null; pctChange: number | null } | null
  empleoINE: { ocupados_miles: number; fuerza_trabajo_miles?: number; period: string } | null
  ventas: { current: number; period: string } | null
  pibAnual: { value: number; period: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

/** Format ISO period (e.g. "2026-03-01") to human-readable ("marzo 2026") */
function formatPeriod(period: string): string {
  const d = new Date(period + 'T12:00:00')
  const m = d.getMonth()
  const y = d.getFullYear()
  return `${MESES[m]} ${y}`
}

// ── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  regionNombre: string,
  fecha: string,
  projects: Iniciativa[],
  metrics: RegionMetrics | null,
  seiaProjects?: SeiaProject[] | null,
  mopProjects?: MopProject[] | null,
  leystopData?: LeystopMinuta | null,
  seguimientos?: SeguimientoMinuta[],
  semaforoTrends?: SemaforoTrendSummary | null,
  nationalBenchmark?: NationalBenchmark[],
  trendSummaries?: TrendSummaries | null,
): string {
  const total = projects.length
  const rojo  = projects.filter(p => p.estado_semaforo === 'rojo').length
  const ambar = projects.filter(p => p.estado_semaforo === 'ambar').length
  const verde = projects.filter(p => p.estado_semaforo === 'verde').length
  const gris  = projects.filter(p => p.estado_semaforo === 'gris').length
  const avgPct = total
    ? Math.round(projects.reduce((s, p) => s + (p.pct_avance ?? 0), 0) / total)
    : 0

  // Group by eje
  const ejes: Record<string, { total: number; rojo: number; ambar: number; verde: number; avgPct: number }> = {}
  for (const p of projects) {
    if (!ejes[p.eje]) ejes[p.eje] = { total: 0, rojo: 0, ambar: 0, verde: 0, avgPct: 0 }
    ejes[p.eje].total++
    if (p.estado_semaforo === 'rojo')  ejes[p.eje].rojo++
    if (p.estado_semaforo === 'ambar') ejes[p.eje].ambar++
    if (p.estado_semaforo === 'verde') ejes[p.eje].verde++
    ejes[p.eje].avgPct += p.pct_avance ?? 0
  }
  for (const eje of Object.keys(ejes)) {
    ejes[eje].avgPct = Math.round(ejes[eje].avgPct / ejes[eje].total)
  }

  const rojas = projects.filter(p => p.estado_semaforo === 'rojo').map(p =>
    `- ${p.nombre} (${p.ministerio ?? 'sin asignar'}, avance ${p.pct_avance ?? 0}%${p.etapa_actual ? `, etapa: ${p.etapa_actual}` : ''})`
  ).join('\n')

  const hitos = projects
    .filter(p => p.proximo_hito && p.fecha_proximo_hito)
    .sort((a, b) => (a.fecha_proximo_hito ?? '') < (b.fecha_proximo_hito ?? '') ? -1 : 1)
    .slice(0, 8)
    .map(p => `- ${p.nombre}: "${p.proximo_hito}" (${p.fecha_proximo_hito})`)
    .join('\n')

  const ejesStr = Object.entries(ejes)
    .map(([eje, d]) => `  • ${eje}: ${d.total} iniciativas, ${d.avgPct}% avance promedio, ${d.rojo} rojo, ${d.ambar} ambar, ${d.verde} verde`)
    .join('\n')

  // Compute the real period label for unemployment data
  const desempleoPeriod = trendSummaries?.unemployment?.latestPeriod
    ? (() => {
        const d = new Date(trendSummaries.unemployment!.latestPeriod + 'T12:00:00')
        const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
        const m = d.getMonth()
        const y = d.getFullYear()
        // INE reports rolling trimesters: the period date is the last month of the trimester
        const m1 = meses[(m - 2 + 12) % 12]
        const m3 = meses[m]
        const y1 = m < 2 ? y - 1 : y
        return `trimestre ${m1} ${y1}-${m3} ${y}`
      })()
    : null

  const metricsStr = metrics ? `
Indicadores socioeconómicos:
- Población total: ${metrics.poblacion_total?.toLocaleString('es-CL') ?? 'N/D'} hab (Censo 2024)
- Tasa desocupación: ${metrics.tasa_desocupacion ?? 'N/D'}%${desempleoPeriod ? ` (${desempleoPeriod}, INE-ENE)` : ' (fuente: INE-ENE, trimestre móvil)'}
- Pobreza por ingresos: ${metrics.pct_pobreza_ingresos ?? 'N/D'}% (CASEN 2024)
- Pobreza multidimensional: ${metrics.pct_pobreza_multidimensional ?? 'N/D'}% (CASEN 2024)
- PIB regional: ${trendSummaries?.pibAnual ? `${Math.round(trendSummaries.pibAnual.value).toLocaleString('es-CL')} MM$ (BCCh, ${formatPeriod(trendSummaries.pibAnual.period)})` : `${metrics.pib_regional ?? 'N/D'} MM$ (BCCh)`}
- % PIB nacional: ${metrics.pct_pib_nacional ?? 'N/D'}%
- Variación actividad económica: ${metrics.variacion_interanual ?? 'N/D'}%
- Tasa participación laboral: ${metrics.tasa_participacion_laboral ?? 'N/D'}%
- Déficit habitacional: ${metrics.deficit_habitacional?.toLocaleString('es-CL') ?? 'N/D'}
- Hogares víctimas DMCS: ${metrics.pct_hogares_victimas_dmcs ?? 'N/D'}% (ENUSC)
${trendSummaries?.empleoINE ? `- Personas ocupadas: ${(trendSummaries.empleoINE.ocupados_miles * 1000).toLocaleString('es-CL')} (INE-ENE, trimestre móvil al ${formatPeriod(trendSummaries.empleoINE.period)})${trendSummaries.empleoINE.fuerza_trabajo_miles ? `\n- Fuerza de trabajo: ${(trendSummaries.empleoINE.fuerza_trabajo_miles * 1000).toLocaleString('es-CL')} personas (INE-ENE)` : ''}` : `- Personas ocupadas: ${metrics.n_ocupado?.toLocaleString('es-CL') ?? 'N/D'} (Censo 2024, dato estático)`}
- Personas desocupadas: ${metrics.n_desocupado?.toLocaleString('es-CL') ?? 'N/D'} (Censo 2024)
${trendSummaries?.ventas ? `- Ventas regionales (facturación electrónica): ${trendSummaries.ventas.current.toLocaleString('es-CL', { maximumFractionDigits: 0 })} miles de millones CLP (${formatPeriod(trendSummaries.ventas.period)}, BCCh)` : ''}
- Sectores productivos: ${metrics.sectores_productivos_principales ?? 'N/D'}
- Vocación regional: ${metrics.vocacion_regional ?? 'N/D'}

IMPORTANTE: La tasa de desocupación proviene de la Encuesta Nacional de Empleo (ENE) del INE y corresponde a un trimestre móvil${desempleoPeriod ? ` (último disponible: ${desempleoPeriod})` : ''}. NO atribuir este dato al mes de la fecha del documento. Los datos de n_ocupado y n_desocupado son del Censo 2024 (dato puntual) y NO deben presentarse como cifras actuales de empleo.
` : 'Indicadores socioeconómicos: no disponibles.'

  const seiaStr = seiaProjects?.length ? `
Proyectos SEIA (inversión privada, evaluación ambiental):
${seiaProjects.slice(0, 8).map(p =>
    `- ${p.nombre} | Inversión: ${p.inversion_mm != null ? `${p.inversion_mm.toFixed(0)} MM$` : 'N/D'} | Estado: ${p.estado ?? 'N/D'}`
  ).join('\n')}
Total SEIA listados: ${seiaProjects.length}` : ''

  const mopStr = mopProjects?.length ? `
Proyectos MOP (obras públicas):
${mopProjects.slice(0, 8).map(p =>
    `- ${p.nombre} | Servicio: ${p.servicio ?? 'N/D'} | Etapa: ${p.etapa ?? 'N/D'} | Inversión: ${p.inversion_miles != null ? `${(p.inversion_miles / 1000).toFixed(0)} MM$` : 'N/D'}`
  ).join('\n')}
Total MOP listados: ${mopProjects.length}` : ''

  // ── NEW: Seguimientos narrativa ──
  const segStr = seguimientos?.length ? `
ACTIVIDAD RECIENTE POR INICIATIVA (últimos 60 días):
${seguimientos.map(s =>
    `- ${s.nombre} (${s.estado_semaforo ?? 'S/E'}, ${s.pct_avance ?? 0}%):\n${s.entries.map(e =>
      `  * [${e.fecha}, ${e.tipo}] ${e.descripcion}`
    ).join('\n')}`
  ).join('\n')}` : ''

  // ── NEW: Semaforo trends ──
  const trendStr = semaforoTrends ? (() => {
    const parts: string[] = []
    if (semaforoTrends.deteriorated.length)
      parts.push(`Deterioraron: ${semaforoTrends.deteriorated.length} (${semaforoTrends.deteriorated.join(', ')})`)
    if (semaforoTrends.improved.length)
      parts.push(`Mejoraron: ${semaforoTrends.improved.length} (${semaforoTrends.improved.join(', ')})`)
    if (semaforoTrends.chronic.length)
      parts.push(`Críticas sin mejora (>90 días en rojo): ${semaforoTrends.chronic.join(', ')}`)
    return parts.length ? `\nTENDENCIA SEMÁFOROS (últimos 90 días):\n${parts.join('\n')}` : ''
  })() : ''

  // ── NEW: National benchmark ──
  const benchStr = nationalBenchmark?.length ? (() => {
    const METRIC_LABELS: Record<string, string> = {
      tasa_desocupacion: 'Desempleo',
      tasa_delictual: 'Tasa delictual',
    }
    const lines = nationalBenchmark.map(b => {
      const label = METRIC_LABELS[b.metric_name] ?? b.metric_name
      const regional = metrics?.[b.metric_name as keyof RegionMetrics]
      if (regional == null || typeof regional !== 'number') return null
      const diff = parseFloat((regional - b.national_value).toFixed(1))
      const sign = diff > 0 ? '+' : ''
      return `- ${label}: ${regional} regional vs ${b.national_value} nacional (${sign}${diff})`
    }).filter(Boolean)
    return lines.length ? `\nCOMPARACIÓN CON PROMEDIO NACIONAL:\n${lines.join('\n')}` : ''
  })() : ''

  // ── NEW: Time-series trends ──
  const tsStr = trendSummaries ? (() => {
    const parts: string[] = []
    if (trendSummaries.unemployment) {
      const u = trendSummaries.unemployment
      const dir = u.delta < 0 ? 'mejorando' : u.delta > 0 ? 'empeorando' : 'estable'
      const periodNote = desempleoPeriod ? `, último dato: ${desempleoPeriod}` : ''
      parts.push(`- Desempleo: ${u.previous}% → ${u.current}% (${dir}, ${u.delta > 0 ? '+' : ''}${u.delta} pp en ${u.months} meses${periodNote})`)
    }
    if (trendSummaries.crime) {
      const c = trendSummaries.crime
      if (c.avgPrevious4w != null && c.pctChange != null) {
        parts.push(`- Delitos: promedio semanal ${c.avgPrevious4w} → ${c.avgRecent4w} casos (${c.pctChange > 0 ? '+' : ''}${c.pctChange}% últimas 4 sem vs 4 anteriores)`)
      } else {
        parts.push(`- Delitos: promedio semanal últimas 4 sem: ${c.avgRecent4w} casos`)
      }
    }
    return parts.length ? `\nTENDENCIAS (series de tiempo):\n${parts.join('\n')}` : ''
  })() : ''

  return `
FECHA: ${fecha}
REGIÓN: ${regionNombre}

ESTADO GENERAL DEL PLAN:
- Total iniciativas: ${total}
- Avance promedio: ${avgPct}%
- Semáforo rojo (bloqueadas): ${rojo}
- Semáforo ambar (en revisión): ${ambar}
- Semáforo verde: ${verde}
- Sin evaluar: ${gris}

AVANCE POR EJE ESTRATÉGICO:
${ejesStr}

INICIATIVAS BLOQUEADAS (ROJO):
${rojas || 'Ninguna en rojo.'}

PRÓXIMOS HITOS:
${hitos || 'Sin próximos hitos registrados.'}

${metricsStr}
${seiaStr}
${mopStr}
${leystopData ? `
SEGURIDAD PÚBLICA — LeyStop / Carabineros de Chile (${leystopData.semana ?? 'última semana disponible'}):
- Tasa de registro: ${leystopData.tasa_registro?.toFixed(0) ?? 'N/D'} casos por 100k hab
- Casos última semana: ${leystopData.casos_ultima_semana ?? 'N/D'}${leystopData.var_ultima_semana != null ? ` (${leystopData.var_ultima_semana > 0 ? '+' : ''}${leystopData.var_ultima_semana.toFixed(1)}% vs semana anterior)` : ''}${leystopData.var_28dias != null ? `, ${leystopData.var_28dias > 0 ? '+' : ''}${leystopData.var_28dias.toFixed(1)}% vs últimos 28 días` : ''}
- Variación año-a-fecha: ${leystopData.var_anno_fecha != null ? `${leystopData.var_anno_fecha > 0 ? '+' : ''}${leystopData.var_anno_fecha.toFixed(1)}%` : 'N/D'}${leystopData.casos_anno_fecha != null && leystopData.casos_anno_fecha_anterior != null ? ` (${leystopData.casos_anno_fecha} vs ${leystopData.casos_anno_fecha_anterior} casos mismo período año anterior)` : ''}
- Top 5 delitos: ${[
    leystopData.mayor_registro_1 ? `${leystopData.mayor_registro_1} (${leystopData.pct_1?.toFixed(0) ?? '?'}%)` : null,
    leystopData.mayor_registro_2 ? `${leystopData.mayor_registro_2} (${leystopData.pct_2?.toFixed(0) ?? '?'}%)` : null,
    leystopData.mayor_registro_3 ? `${leystopData.mayor_registro_3} (${leystopData.pct_3?.toFixed(0) ?? '?'}%)` : null,
    leystopData.mayor_registro_4 ? `${leystopData.mayor_registro_4} (${leystopData.pct_4?.toFixed(0) ?? '?'}%)` : null,
    leystopData.mayor_registro_5 ? `${leystopData.mayor_registro_5} (${leystopData.pct_5?.toFixed(0) ?? '?'}%)` : null,
  ].filter(Boolean).join(' | ')}
- Controles: ${leystopData.controles ?? 'N/D'} (${leystopData.controles_identidad ?? 'N/D'} identidad, ${leystopData.controles_vehicular ?? 'N/D'} vehicular)
- Fiscalizaciones: ${leystopData.fiscalizaciones ?? 'N/D'}
- Incautaciones: ${leystopData.incautaciones ?? 'N/D'} (${leystopData.incaut_fuego ?? 'N/D'} armas de fuego, ${leystopData.incaut_blancas ?? 'N/D'} armas blancas)
- Allanamientos año: ${leystopData.allanamientos_anno ?? 'N/D'} | Vehículos recuperados año: ${leystopData.vehiculos_recuperados_anno ?? 'N/D'} | Decomisos año: ${leystopData.decomisos_anno ?? 'N/D'}` : ''}
${segStr}
${trendStr}
${benchStr}
${tsStr}
`.trim()
}

// ── Main function ────────────────────────────────────────────────────────────

export async function generateMinutaContent(
  tipo: MinutaTipo,
  regionNombre: string,
  fecha: string,
  projects: Iniciativa[],
  metrics: RegionMetrics | null,
  planPdfBase64: string | null,
  seiaProjects?: SeiaProject[] | null,
  mopProjects?: MopProject[] | null,
  leystopData?: LeystopMinuta | null,
  seguimientos?: SeguimientoMinuta[],
  semaforoTrends?: SemaforoTrendSummary | null,
  nationalBenchmark?: NationalBenchmark[],
  trendSummaries?: TrendSummaries | null,
  fichaExtra?: FichaExtraData | null,
): Promise<MinutaEjecutivaContent | FichaRegionalContent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })

  // Kit de Viaje (ex Ficha Regional): generates full narrative content for sections I, II, III
  if (tipo === 'ficha') {
    const m = metrics
    const fe = fichaExtra

    // Build comprehensive data context for AI
    const dataContext = `
DATOS REGIÓN DE ${regionNombre.toUpperCase()} — ${fecha}

=== GEOGRAFÍA Y DEMOGRAFÍA ===
- Superficie: ${m?.superficie_km2?.toLocaleString('es-CL') ?? 'N/D'} km² (${m?.pct_territorio_nacional ?? 'N/D'}% del territorio nacional)
- Provincias: ${m?.provincias_n ?? 'N/D'} | Comunas: ${m?.comunas_n ?? 'N/D'} | Capital: ${m?.region_nombre ?? regionNombre}
- Población total (Censo 2024): ${m?.poblacion_total?.toLocaleString('es-CL') ?? 'N/D'} hab
- Mujeres: ${m?.pct_mujeres ?? 'N/D'}% (${m?.poblacion_total && m?.pct_mujeres ? Math.round(m.poblacion_total * m.pct_mujeres / 100).toLocaleString('es-CL') : 'N/D'}) | Hombres: ${m?.pct_hombres ?? 'N/D'}% (${m?.poblacion_total && m?.pct_hombres ? Math.round(m.poblacion_total * m.pct_hombres / 100).toLocaleString('es-CL') : 'N/D'})
- Promedio de edad: ${m?.promedio_edad ?? m?.prom_edad ?? 'N/D'} años | 60+ años: ${m?.pct_edad_60_mas ?? 'N/D'}%
- Población urbana: ${m?.pct_urbana ?? 'N/D'}% | Rural: ${m?.pct_rural ?? 'N/D'}%
- Pueblos originarios: ${m?.pct_indigena ?? 'N/D'}% (${m?.n_pueblos_orig?.toLocaleString('es-CL') ?? 'N/D'} personas)
- Inmigrantes: ${m?.pct_inmigrantes ?? 'N/D'}% (${m?.n_inmigrantes?.toLocaleString('es-CL') ?? 'N/D'} personas)
- Discapacidad: ${m?.n_discapacidad?.toLocaleString('es-CL') ?? 'N/D'} personas
- Jefatura femenina de hogar: ${m?.pct_jefatura_mujer ?? 'N/D'}%
- Densidad: ${m?.densidad_poblacional ?? 'N/D'} hab/km²

=== PIB REGIONAL (BCCh, nominal precios corrientes) ===
- PIB: $${fe?.pibAnualRegion ? Math.round(fe.pibAnualRegion.value).toLocaleString('es-CL') : 'N/D'} miles de millones (${fe?.pibAnualRegion ? formatPeriod(fe.pibAnualRegion.period) : 'N/D'})
- % del PIB nacional: ${fe?.allRegionsPib?.find(r => r.nombre === regionNombre)?.pct_pib?.toFixed(1) ?? 'N/D'}%
- Ranking: ${fe?.allRegionsPib ? (() => { const sorted = [...fe.allRegionsPib].sort((a, b) => b.pib_mm - a.pib_mm); const idx = sorted.findIndex(r => r.nombre === regionNombre); return idx >= 0 ? `${idx + 1}° de 16` : 'N/D' })() : 'N/D'}
${fe?.pibAnualHistory && fe.pibAnualHistory.length > 1 ? `- Evolución PIB anual: ${fe.pibAnualHistory.map(h => `${h.period.slice(0, 4)}: $${Math.round(h.value).toLocaleString('es-CL')} MM`).join(' → ')}` : ''}

=== PIB SECTORIAL (BCCh, top sectores) ===
${fe?.pibSectorial?.slice(0, 8).map(s => `- ${s.sector}: $${Math.round(s.valor).toLocaleString('es-CL')} MM (${s.pct.toFixed(1)}%)`).join('\n') ?? 'N/D'}
- Sectores principales: ${m?.sectores_productivos_principales ?? 'N/D'}
- Vocación regional: ${m?.vocacion_regional ?? 'N/D'}

=== MERCADO LABORAL (INE-ENE, trimestre móvil) ===
- Tasa desocupación: ${m?.tasa_desocupacion ?? 'N/D'}% (nacional: ${fe?.desocupacionNacional?.toFixed(1) ?? 'N/D'}%)
- Ocupados: ${trendSummaries?.empleoINE?.ocupados_miles ? `${Math.round(trendSummaries.empleoINE.ocupados_miles)} mil` : 'N/D'}
- Fuerza de trabajo: ${trendSummaries?.empleoINE?.fuerza_trabajo_miles ? `${Math.round(trendSummaries.empleoINE.fuerza_trabajo_miles)} mil` : 'N/D'}
- Tasa participación laboral: ${m?.tasa_participacion_laboral ?? 'N/D'}%
- Informalidad laboral: ${m?.tasa_ocupacion_informal ?? 'N/D'}%
${trendSummaries?.empleoINE?.period ? `- Período dato empleo: ${formatPeriod(trendSummaries.empleoINE.period)}` : ''}

=== POBREZA E INGRESOS (CASEN 2024) ===
- Pobreza por ingresos: ${m?.pct_pobreza_ingresos ?? 'N/D'}% (nacional ~17,3%)
- Pobreza extrema: ${m?.pct_pobreza_extrema ?? 'N/D'}%
- Pobreza multidimensional: ${m?.pct_pobreza_multidimensional ?? 'N/D'}%
- Pobreza severa: ${m?.pct_pobreza_severa ?? 'N/D'}%
- Hogares RSH tramo 40%: ${m?.hogares_rsh_tramo40?.toLocaleString('es-CL') ?? 'N/D'} (${m?.pct_rsh_tramo40 ?? 'N/D'}%)

=== EDUCACIÓN (Censo 2024) ===
- Escolaridad promedio: ${m?.anios_escolaridad_promedio ?? 'N/D'} años
- Educación superior: ${m?.pct_educacion_superior ?? 'N/D'}%
- Alfabetismo: ${m?.tasa_alfabetismo ?? 'N/D'}%
- Matrícula escolar: ${m?.matricula_escolar_total?.toLocaleString('es-CL') ?? 'N/D'}
- Cobertura parvularia: ${m?.cobertura_parvularia_pct ?? 'N/D'}%

=== SALUD ===
- FONASA: ${m?.pct_fonasa ?? 'N/D'}%
- Hospitales: ${m?.hospitales_n ?? 'N/D'}
- Camas/1.000 hab: ${m?.camas_por_1000_hab ?? 'N/D'}
- Lista de espera: ${m?.lista_espera_n?.toLocaleString('es-CL') ?? 'N/D'}

=== VIVIENDA (Censo 2024) ===
- Déficit habitacional: ${m?.deficit_habitacional?.toLocaleString('es-CL') ?? 'N/D'}
- Hacinamiento: ${m?.pct_hacinamiento ?? 'N/D'}%
- Acceso agua pública: ${m?.pct_acceso_agua_publica ?? 'N/D'}%
- Jefatura femenina hogar: ${m?.pct_jefatura_mujer ?? 'N/D'}%

=== SEGURIDAD PÚBLICA ===
${leystopData ? `- LeyStop Carabineros (semana ${leystopData.semana ?? '?'}):
  Casos año a la fecha: ${leystopData.casos_anno_fecha?.toLocaleString('es-CL') ?? 'N/D'}
  Variación anual: ${leystopData.var_anno_fecha != null ? `${leystopData.var_anno_fecha > 0 ? '+' : ''}${leystopData.var_anno_fecha.toFixed(1)}%` : 'N/D'}
  Top delitos: ${[1, 2, 3, 4, 5].map(i => {
    const d = leystopData[`mayor_registro_${i}` as keyof LeystopMinuta] as string | null
    const p = leystopData[`pct_${i}` as keyof LeystopMinuta] as number | null
    return d ? `${d} (${p?.toFixed(0) ?? '?'}%)` : null
  }).filter(Boolean).join(', ')}` : '- Datos LeyStop no disponibles'}
- ENUSC: Hogares víctimas DMCS ${m?.pct_hogares_victimas_dmcs ?? 'N/D'}% | Inseguridad percibida ${m?.pct_percepcion_inseguridad ?? 'N/D'}%
- Tasa denuncias/100k: ${m?.tasa_denuncias_100k ?? 'N/D'} | Tasa delitos/100k: ${m?.tasa_delitos_100k ?? 'N/D'}
`.trim()

    const fichaRules = `
REGLAS OBLIGATORIAS:
1. Usa ÚNICAMENTE los datos proporcionados. NO inventes cifras, fechas, porcentajes ni nombres.
2. NO recomiendes acciones. NO uses "debe", "debería", "se recomienda".
3. NO atribuyas causas ni proyectes consecuencias.
4. NO uses adjetivos valorativos: "preocupante", "favorable", "estratégico", "alentador", "crítico".
5. Tono: formal, directo, informativo. Estilo de minuta técnica ministerial.
6. Cada cifra debe tener su fuente: (Censo 2024), (CASEN 2024), (BCCh), (INE-ENE), (LeyStop Carabineros).
7. Si falta información, omítela sin mencionar su ausencia.
8. Escribe en español de Chile.
9. Los párrafos deben ser densos en datos, no retóricos.
10. NO repitas cifras que ya aparecen en los bullets de datos (%, habitantes, km²). Los campos narrativos agregan CONTEXTO e IMPLICANCIAS, no repiten números.
11. Sé CONCISO. Cada campo tiene un límite estricto de oraciones. No lo excedas.
12. En los sub-items del PREGO, usa "En **tema**," al inicio para indicar negrita (con doble asterisco).`

    const fichaSchema = `{
  "introduccion": "MÁXIMO 2 oraciones. Ubicación geográfica y principal característica de la región.",
  "estructura_etaria": "MÁXIMO 2 oraciones. Implicancias del envejecimiento o juventud. NO repitas la edad promedio ni el % de 60+ (ya están en el bullet).",
  "composicion": "MÁXIMO 2 oraciones. Contexto territorial de pueblos originarios e inmigración. NO repitas los porcentajes (ya están en el bullet).",
  "pib_comentario": "MÁXIMO 2 oraciones. Evolución del PIB en los últimos años y tendencia.",
  "matriz_productiva": "MÁXIMO 2 oraciones. Vocación productiva y sectores estratégicos.",
  "mercado_laboral_nota": "MÁXIMO 2 oraciones. Contexto de la desocupación respecto al promedio nacional.",
  "ingresos_pobreza": "MÁXIMO 3 oraciones. Pobreza por ingresos, extrema y multidimensional con comparación nacional.",
  "educacion_nota": "MÁXIMO 2 oraciones. Escolaridad y contexto educativo.",
  "salud_nota": "MÁXIMO 2 oraciones. Cobertura y brechas de salud.",
  "vivienda_nota": "MÁXIMO 2 oraciones. Déficit habitacional y acceso a servicios.",
  "seguridad_nota": "MÁXIMO 2 oraciones. LeyStop casos año y delitos más frecuentes.",
  "prego_intro": "MÁXIMO 2 oraciones introduciendo el Plan Regional.",
  "prego_ejes": [
    {
      "numero": 1,
      "nombre": "Nombre del eje",
      "items": [
        { "letra": "a", "texto": "En **tema en negrita**, se ejecuta/implementa [acción concreta con cifras y plazos]. Máximo 2 oraciones por item." }
      ]
    }
  ]
}`

    // Build messages — include Plan Regional PDF if available
    const userContent: Anthropic.Messages.ContentBlockParam[] = [{
      type: 'text',
      text: `Genera el contenido narrativo para la MINUTA REGIONAL PARA LA AUTORIDAD de la Región de ${regionNombre} (${fecha}).

${dataContext}

Responde ÚNICAMENTE con un JSON válido (sin markdown, sin \`\`\`):
${fichaSchema}`,
    }]

    if (planPdfBase64) {
      userContent.unshift({
        type: 'document',
        source: { type: 'base64', media_type: 'application/pdf', data: planPdfBase64 },
        cache_control: { type: 'ephemeral' },
      } as unknown as Anthropic.Messages.ContentBlockParam)
    }

    try {
      // ── PASS 1: Generate draft ──
      const t0 = Date.now()
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: `Eres redactor técnico senior de la División de Coordinación Interministerial (DCI), Gobierno Interior y División de Estudios del Ministerio del Interior de Chile. Redactas la MINUTA REGIONAL PARA LA AUTORIDAD — documento que acompaña a la máxima autoridad en visitas regionales.

INSTRUCCIÓN CRÍTICA SOBRE EL PREGO:
- Si se adjunta un Plan Regional de Gobierno (PDF), DEBES extraer los ejes estratégicos con todos sus sub-items. El campo prego_ejes NO PUEDE quedar vacío si hay PDF adjunto.
- Si NO hay PDF adjunto, genera 3 ejes genéricos basados en los indicadores de la región (ej: si hay alta desocupación → eje de empleo; si hay pobreza alta → eje social; seguridad siempre es eje).
- prego_ejes SIEMPRE debe tener al menos 3 ejes con al menos 2 items cada uno.

${fichaRules}`,
        messages: [{ role: 'user', content: userContent }],
      })
      const text = response.content.find(b => b.type === 'text')?.text ?? ''
      const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
      const draft = JSON.parse(cleaned) as FichaRegionalContent
      const t1 = Date.now()
      console.log(`[minutaAI] Kit de Viaje DRAFT for ${regionNombre}: ${Object.keys(draft).length} fields, prego_ejes: ${draft.prego_ejes?.length ?? 0}, planPdf: ${!!planPdfBase64} (${t1 - t0}ms)`)

      // ── PASS 2: Review & rewrite ──
      // A second AI call reviews the draft against the source data and rewrites for quality.
      const reviewResponse = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        system: `Eres editor senior de minutas ministeriales. Recibes un borrador de MINUTA REGIONAL y los datos fuente originales. Tu trabajo es revisar y REESCRIBIR el borrador completo para máxima calidad.

CRITERIOS DE REVISIÓN:
1. CONCISIÓN: Cada campo debe respetar su límite de oraciones. Si excede, recorta sin perder datos clave.
2. NO REPETICIÓN: Si un párrafo repite cifras que ya aparecen en otro campo (ej: % edad ya está en el bullet de estructura etaria), elimina la repetición.
3. PRECISIÓN: Verifica que las cifras del borrador coincidan con los datos fuente. Si hay discrepancia, usa el dato fuente.
4. FORMATO: Los sub-items del PREGO deben comenzar con "En **tema en negrita**," (doble asterisco markdown).
5. TONO: Formal, seco, técnico. Cero adjetivos valorativos. Cero recomendaciones.
6. FUENTES: Cada cifra debe tener fuente entre paréntesis: (Censo 2024), (CASEN 2024), (BCCh), (INE-ENE), (LeyStop).
7. CLARIDAD: Si algo se puede mostrar más directo o claro, hazlo. Privilegia datos concretos sobre narrativa.
8. PREGO: NUNCA elimines ni vacíes prego_ejes. Si el borrador tiene ejes, mantenlos y mejóralos. Si están vacíos, genera al menos 3 ejes basados en los datos.

Responde ÚNICAMENTE con el JSON completo reescrito (misma estructura, sin markdown, sin \`\`\`).`,
        messages: [{
          role: 'user',
          content: `BORRADOR A REVISAR:
${JSON.stringify(draft, null, 2)}

DATOS FUENTE ORIGINALES:
${dataContext}

Revisa el borrador contra los datos fuente. Reescribe lo que sea necesario para maximizar concisión, precisión y claridad. Mantén la misma estructura JSON exacta.`,
        }],
      })
      const reviewText = reviewResponse.content.find(b => b.type === 'text')?.text ?? ''
      const reviewCleaned = reviewText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()

      let final: FichaRegionalContent
      try {
        final = JSON.parse(reviewCleaned) as FichaRegionalContent
        // Safety: if review lost PREGO ejes that draft had, restore them
        if ((!final.prego_ejes || final.prego_ejes.length === 0) && draft.prego_ejes?.length > 0) {
          console.warn(`[minutaAI] Review lost PREGO ejes for ${regionNombre}, restoring from draft`)
          final.prego_ejes = draft.prego_ejes
          final.prego_intro = final.prego_intro || draft.prego_intro
        }
        const t2 = Date.now()
        console.log(`[minutaAI] Kit de Viaje REVIEWED for ${regionNombre}: prego_ejes: ${final.prego_ejes?.length ?? 0} (${t2 - t1}ms review, ${t2 - t0}ms total)`)
      } catch {
        // If review JSON parsing fails, use the draft
        console.warn(`[minutaAI] Review parse failed for ${regionNombre}, using draft`)
        final = draft
      }

      return final
    } catch (err) {
      console.error(`[minutaAI] Failed to generate Kit de Viaje for ${regionNombre}:`, err)
      return null
    }
  }

  const context = buildContext(regionNombre, fecha, projects, metrics, seiaProjects, mopProjects, leystopData, seguimientos, semaforoTrends, nationalBenchmark, trendSummaries)
  const ejes = [...new Set(projects.map(p => p.eje))]

  console.log(`[minutaAI] context length: ${context.length} chars (~${Math.round(context.length / 4)} tokens)`)

  const AI_RULES = `
REGLAS OBLIGATORIAS:
1. Usa ÚNICAMENTE los datos proporcionados. NO inventes cifras, fechas, porcentajes ni nombres.
2. NO recomiendes acciones, decisiones ni políticas. NO uses "debe", "debería", "se recomienda".
3. NO atribuyas causas a un dato. NO proyectes consecuencias.
4. NO compares entre periodos de gobierno (2018-2022 vs 2022-2026).
5. NO uses adjetivos valorativos: "preocupante", "favorable", "estratégico", "alentador", "crítico", "robusto", "credibilidad".
6. NO digas que un dato "refleja" o "evidencia" algo más allá de lo que mide.
7. Tono: directo, seco, informativo. Estilo de minuta técnica. Cero literatura.
8. Cada cifra debe tener fuente entre paréntesis: (INE-ENE), (CASEN 2024), (BCCh), (LeyStop).
9. Si falta información, escribe con lo disponible sin fabricar datos.`

  const systemPrompt = `Eres redactor técnico de la División de Coordinación Interministerial (DCI) del Ministerio del Interior de Chile. Redacta contenido para una minuta ejecutiva de 2 páginas sobre la Región de ${regionNombre}. Tono formal institucional, español de Chile.
${AI_RULES}`

  const jsonSchema = `{
  "avances_relevantes": ["string (4-5 bullets, máx 120 chars c/u, con cifras concretas)"],
  "alertas": ["string (2-3 alertas críticas narrativas, máx 150 chars c/u)"],
  "contexto_region": "string (2-3 oraciones que sintetizan la situación regional actual)",
  "iniciativas_destacadas": ["string (3-4 iniciativas con su estado, máx 120 chars c/u)"],
  "tendencia_general": "string (1 oración que resume la dirección general: mejoras y deterioros clave)"
}`

  const userContent: Anthropic.MessageParam['content'] = []

  if (planPdfBase64) {
    userContent.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: planPdfBase64,
      },
      title: `Plan Regional de Gobierno — ${regionNombre}`,
    } as Anthropic.DocumentBlockParam)
  }

  userContent.push({
    type: 'text',
    text: `Datos actuales del panel de seguimiento (${fecha}):\n\n${context}\n\nGenera el contenido para el documento "Minuta Ejecutiva (2 páginas)"${planPdfBase64 ? ', integrando la información del Plan Regional adjunto con los datos del panel' : ''}. Responde ÚNICAMENTE con un JSON válido que siga el schema exacto a continuación (sin markdown, sin explicaciones, sin texto fuera del JSON):\n${jsonSchema}`,
  })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as MinutaEjecutivaContent
    console.log(`[minutaAI] ${tipo} content generated for ${regionNombre} (stop_reason: ${response.stop_reason})`)

    // ── QA check ──
    const qaResult = runQA(parsed)
    if (!qaResult.pass) {
      console.warn(`[minutaAI] QA failed for ${regionNombre} (${tipo}): ${qaResult.issues.join('; ')}`)
      // Strip offending fields rather than returning null
      if ('recomendaciones' in parsed) delete (parsed as Record<string, unknown>).recomendaciones
    }

    return parsed
  } catch (err) {
    console.error(`[minutaAI] Failed to generate ${tipo} content for ${regionNombre}:`, err)
    return null
  }
}

// ── QA System ────────────────────────────────────────────────────────────────

const BLACKLIST = [
  'preocupante', 'favorable', 'credibilidad', 'debe', 'debería',
  'estratégico', 'se juega', 'refleja un', 'evidencia un', 'alentador',
  'crítico', 'robusto', 'se recomienda', 'exigir', 'diferenciador',
]

/** Recursively extract all string values from an object */
function extractStrings(obj: unknown): string[] {
  if (typeof obj === 'string') return [obj]
  if (Array.isArray(obj)) return obj.flatMap(extractStrings)
  if (obj && typeof obj === 'object') return Object.values(obj).flatMap(extractStrings)
  return []
}

function runQA(content: unknown): { pass: boolean; issues: string[] } {
  const issues: string[] = []
  const allText = extractStrings(content)
  const fullText = allText.join(' ').toLowerCase()

  // 1. Blacklist check
  for (const word of BLACKLIST) {
    if (fullText.includes(word.toLowerCase())) {
      issues.push(`Blacklist: "${word}" encontrado`)
    }
  }

  // 2. Check for recommendation patterns
  const recPatterns = [/\bse\s+debe\b/i, /\bse\s+recomienda\b/i, /\bexigir\s+a\b/i, /\bes\s+necesario\s+que\b/i]
  for (const pat of recPatterns) {
    if (pat.test(fullText)) {
      issues.push(`Patrón de recomendación: ${pat.source}`)
    }
  }

  // 3. Currency format check (invalid patterns)
  const badCurrency = /USD\s+[\d.]+\.[\d.]+\.[\d.]+ MM/
  if (badCurrency.test(allText.join(' '))) {
    issues.push('Formato moneda inválido detectado')
  }

  return { pass: issues.length === 0, issues }
}

// ────────────────────────────────────────────────────────────────────────────
// Kit de Viaje (Fase A del rediseño Biobío-style)
// ────────────────────────────────────────────────────────────────────────────
//
// Estas funciones reemplazan progresivamente al path `tipo='ficha'` de
// `generateMinutaContent()`. Diferencias clave:
//
//   - Split en dos llamados AI: contexto (siempre) + PREGO (solo si hay PDF ok).
//     El path viejo tenía UN prompt gigante que, cuando faltaba PDF, fabricaba
//     ejes genéricos (lib/minutaAI.ts:494) — bug real que Diego marcó como
//     inaceptable. Con el split la pregunta simplemente no se hace y el
//     assembler pinta el disclaimer estático.
//
//   - Output tipado con `KitDeViajeAIContent` (definido en lib/kitDeViaje/types.ts).
//
//   - Guardarraíles de estilo centralizados en `lib/kitDeViaje/prompts.ts`.
//
// La integración desde route.ts vive en Fase A.3.

import type { KitDeViajeAIContent } from '@/lib/kitDeViaje/types'
import type { RegionEje } from '@/lib/types'
import {
  buildContextPrompt,
  type ContextPromptInput,
} from '@/lib/kitDeViaje/prompts'
import { AI_MAX_TOKENS_KIT_VIAJE, AI_MODEL_KIT_VIAJE } from '@/lib/kitDeViaje/constants'

/**
 * Extrae JSON del ContentBlock de Anthropic de forma robusta:
 *   1) Toma el text del primer block type='text'.
 *   2) Si viene envuelto en ``` (con o sin `json`), extrae el contenido.
 *   3) Recorta desde el primer `{` hasta el último `}` para tolerar preámbulo
 *      ("Aquí está el JSON:") o postámbulo ("Espero que sea útil.") que Claude
 *      a veces agrega aunque el prompt lo prohiba.
 *   4) JSON.parse.
 *
 * Si falla, logea el response text COMPLETO (primeros 800 chars) para
 * diagnóstico. Retorna null.
 */
function parseAiJson<T>(response: Anthropic.Messages.Message, label = 'unknown'): T | null {
  const text = response.content.find(b => b.type === 'text')?.text ?? ''
  if (!text) {
    console.error(`[minutaAI/kitViaje] empty response text for ${label}`)
    return null
  }

  let cleaned = text.trim()

  // (2) Fences ```json ... ``` o ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch) cleaned = fenceMatch[1].trim()

  // (3) Recortar preámbulo/postámbulo — quedarse solo con el objeto JSON.
  const firstBrace = cleaned.indexOf('{')
  const lastBrace  = cleaned.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }

  try {
    return JSON.parse(cleaned) as T
  } catch (err) {
    console.error(
      `[minutaAI/kitViaje] JSON parse failed for ${label}. Response text (first 800 chars):`,
      text.slice(0, 800),
      'Cleaned attempt (first 400):',
      cleaned.slice(0, 400),
      'Error:', err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

type ContextAiOutput = Pick<KitDeViajeAIContent, 'caracterizacion_parrafos' | 'indicadores_narrativa'>

/**
 * Error tipado para fallas de AI que requieren acción humana explícita
 * (top-up de créditos, API key rota). El route.ts lo captura y devuelve
 * 503 con mensaje claro, en vez de generar un PDF vacío-sospechoso.
 *
 * Cualquier otra falla (timeout, 5xx, parse error) sigue siendo un "soft
 * fail" — el AI devuelve null y el assembler pinta lo estructural.
 */
export class KitViajeAiHardError extends Error {
  public readonly code: 'no_credits' | 'auth'
  public readonly detail: string
  constructor(code: 'no_credits' | 'auth', userMessage: string, detail: string) {
    super(userMessage)
    this.name = 'KitViajeAiHardError'
    this.code = code
    this.detail = detail
  }
}

/**
 * Inspecciona un error de Anthropic. Si es "sin créditos" o "auth", devuelve
 * el objeto tipado; si no, retorna null y el caller degrada a soft-fail.
 */
function categorizeAnthropicError(err: unknown): KitViajeAiHardError | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { status?: number; message?: string; error?: { error?: { message?: string; type?: string } } }
  const status = e.status
  const detail = e.error?.error?.message ?? e.message ?? ''

  if (status === 400 && /credit balance is too low/i.test(detail)) {
    return new KitViajeAiHardError(
      'no_credits',
      'La cuenta de Anthropic no tiene créditos disponibles. El equipo debe hacer top-up en https://console.anthropic.com/settings/billing antes de regenerar el Kit de Viaje.',
      detail,
    )
  }
  if (status === 401 || status === 403) {
    return new KitViajeAiHardError(
      'auth',
      'La autenticación con Anthropic falló. Verificar la variable ANTHROPIC_API_KEY en Vercel.',
      detail,
    )
  }
  return null
}

/**
 * Sección I + II del Kit de Viaje. Siempre corre — el contexto socioeconómico
 * NO depende del PDF PREGO.
 */
export async function generateKitViajeContext(input: ContextPromptInput): Promise<ContextAiOutput | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const { system, user } = buildContextPrompt(input)

  const t0 = Date.now()
  try {
    const response = await client.messages.create({
      model: AI_MODEL_KIT_VIAJE,
      max_tokens: AI_MAX_TOKENS_KIT_VIAJE,
      system,
      messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
    })
    const parsed = parseAiJson<ContextAiOutput>(response, `context:${input.region.cod}`)
    if (!parsed) return null
    console.log(`[minutaAI/kitViaje] context for ${input.region.nombre} in ${Date.now() - t0}ms`)
    return parsed
  } catch (err) {
    const hard = categorizeAnthropicError(err)
    if (hard) throw hard
    console.error(`[minutaAI/kitViaje] context call failed for ${input.region.nombre}:`, err)
    return null
  }
}

/**
 * Envuelve solo el contexto (Secciones I + II) en un `KitDeViajeAIContent`.
 * La antigua llamada PREGO fue retirada — la "Contexto Regional" ya no incluye
 * Sección III. La justificación de ejes vive en la minuta "Avance PREGO" con
 * `generateJustificacionEjes()`.
 */
export async function generateKitViajeContent(params: {
  contextInput: ContextPromptInput
}): Promise<KitDeViajeAIContent | null> {
  const ctx = await generateKitViajeContext(params.contextInput)
  if (!ctx) return null
  return {
    caracterizacion_parrafos: ctx.caracterizacion_parrafos,
    indicadores_narrativa:    ctx.indicadores_narrativa,
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Avance PREGO — justificación de ejes (bloque "Del diagnóstico a la priorización")
// ────────────────────────────────────────────────────────────────────────────

/** Mapa {numero_eje: "razón corta por la que se eligió"} para MinutaEjecutiva. */
export type JustificacionEjesOutput = Record<string, string>

const JUSTIFICACION_EJES_SYSTEM = `
Sos un redactor técnico del Ministerio del Interior de Chile, División de
Coordinación Interministerial. Redactás el bloque "Del diagnóstico a la
priorización" de la minuta Avance PREGO — una línea corta por eje explicando
POR QUÉ se eligió ese eje en la región, extraída del PDF del Plan Regional.

Reglas de estilo:
- Castellano neutro chileno. Sin voseo rioplatense ("vos", "sabés", "tenés").
- Nunca "Ministerio del Interior y Seguridad Pública". Solo "Ministerio del
  Interior".
- Nunca "División de Coordinación Interregional". Es "Interministerial".
- Registro técnico-descriptivo. Sin adjetivos valorativos ("preocupante",
  "grave", "excelente"). Describí la razón, no opines.
- Sin recomendaciones ni exhortaciones.
- Sin emojis, sin markdown, sin viñetas — texto plano.

Reglas específicas:
- Una línea POR EJE, de entre 12 y 25 palabras, terminando en punto.
- La línea debe sintetizar el DIAGNÓSTICO que motivó incluir el eje en el Plan.
  No describas iniciativas ni compromisos: describí la razón estructural.
- Si el eje no aparece en el PDF con justificación clara, devolvé exactamente
  la cadena "Justificación pendiente." para ese número.

Devolvés SOLO un objeto JSON válido cuyas claves son los NÚMEROS de eje (como
strings) y los valores son las líneas de justificación. Sin texto adicional,
sin backticks, sin comentarios. Formato exacto:

{ "1": "...", "2": "...", "3": "..." }
`.trim()

export async function generateJustificacionEjes(params: {
  region: { cod: string; nombre: string }
  planPdfBase64: string
  ejes: RegionEje[]
}): Promise<JustificacionEjesOutput | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!params.planPdfBase64 || params.ejes.length === 0) return null

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const ejesResumen = [...params.ejes]
    .sort((a, b) => a.numero - b.numero)
    .map(e => ({ numero: e.numero, nombre: e.nombre }))

  const userText = `
Ejes de la Región ${params.region.nombre} (canónicos, autoritativos):

${JSON.stringify(ejesResumen, null, 2)}

Devolvé un objeto JSON con una línea de justificación por cada uno de estos
ejes (${ejesResumen.length} en total), extraída del PDF adjunto. Las claves
del objeto son los números (${ejesResumen.map(e => `"${e.numero}"`).join(', ')}).
`.trim()

  const documentBlock = {
    type: 'document' as const,
    source: {
      type: 'base64' as const,
      media_type: 'application/pdf' as const,
      data: params.planPdfBase64,
    },
    cache_control: { type: 'ephemeral' as const },
  }

  const t0 = Date.now()
  try {
    const response = await client.messages.create({
      model: AI_MODEL_KIT_VIAJE,
      max_tokens: AI_MAX_TOKENS_KIT_VIAJE,
      system: JUSTIFICACION_EJES_SYSTEM,
      messages: [{
        role: 'user',
        content: [
          documentBlock as unknown as Anthropic.Messages.ContentBlockParam,
          { type: 'text', text: userText },
        ],
      }],
    })
    const parsed = parseAiJson<JustificacionEjesOutput>(response, `justif_ejes:${params.region.cod}`)
    if (!parsed) return null
    console.log(`[minutaAI] justificación ejes ${params.region.nombre} en ${Date.now() - t0}ms (${Object.keys(parsed).length} ejes)`)
    return parsed
  } catch (err) {
    const hard = categorizeAnthropicError(err)
    if (hard) throw hard
    console.error(`[minutaAI] justif ejes fallo ${params.region.nombre}:`, err)
    return null
  }
}
