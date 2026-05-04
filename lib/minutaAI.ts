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

export type CifraSubseccion = {
  titulo: string  // e.g. "Crecimiento económico"
  texto: string   // párrafo de 3-4 oraciones con datos concretos
}

export type EjeAvanceCompleto = {
  resumen: string   // 2-3 oraciones de estado general del eje
  logros: string[]  // 4-6 bullets específicos con cifras y avances concretos
}

export type MinutaCompletaContent = {
  resumen_ejecutivo: string                        // 2-3 oraciones de síntesis del estado general
  compromisos_plan: string[]                       // 5-7 compromisos/objetivos clave extraídos del Plan Regional PDF
  cifras: CifraSubseccion[]                        // 3-4 subsecciones temáticas con párrafos
  gps_narrativa: string                            // párrafo sobre inversión privada GPS
  avances_ejes: Record<string, EjeAvanceCompleto>  // un entry por eje presente en los datos
  alertas_criticas: string[]
  recomendaciones: string[]
  tendencias?: {
    titulo: string   // "Evolución de indicadores clave"
    texto: string    // 3-4 oraciones sintetizando tendencias
  }
  posicion_nacional?: string   // 2-3 oraciones posicionando región vs país
  cambios_periodo?: string[]   // 3-5 bullets de qué cambió en el último periodo
}

export type MinutaTipo = 'ejecutiva' | 'completo'

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
  unemployment: { current: number; previous: number; delta: number; months: number } | null
  crime: { avgRecent4w: number; avgPrevious4w: number | null; pctChange: number | null } | null
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
    `- ${p.nombre} (${p.ministerio}, avance ${p.pct_avance ?? 0}%${p.etapa_actual ? `, etapa: ${p.etapa_actual}` : ''})`
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

  const metricsStr = metrics ? `
Indicadores socioeconómicos:
- Población total: ${metrics.poblacion_total?.toLocaleString('es-CL') ?? 'N/D'} hab
- Tasa desocupación: ${metrics.tasa_desocupacion ?? 'N/D'}%
- Pobreza por ingresos: ${metrics.pct_pobreza_ingresos ?? 'N/D'}%
- Pobreza multidimensional: ${metrics.pct_pobreza_multidimensional ?? 'N/D'}%
- PIB regional: ${metrics.pib_regional ?? 'N/D'} MM$
- % PIB nacional: ${metrics.pct_pib_nacional ?? 'N/D'}%
- Variación actividad económica: ${metrics.variacion_interanual ?? 'N/D'}%
- Tasa participación laboral: ${metrics.tasa_participacion_laboral ?? 'N/D'}%
- Déficit habitacional: ${metrics.deficit_habitacional?.toLocaleString('es-CL') ?? 'N/D'}
- Hogares víctimas DMCS: ${metrics.pct_hogares_victimas_dmcs ?? 'N/D'}%
- Sectores productivos: ${metrics.sectores_productivos_principales ?? 'N/D'}
- Vocación regional: ${metrics.vocacion_regional ?? 'N/D'}
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
      parts.push(`- Desempleo: ${u.previous}% → ${u.current}% (${dir}, ${u.delta > 0 ? '+' : ''}${u.delta} pp en ${u.months} meses)`)
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
): Promise<MinutaEjecutivaContent | MinutaCompletaContent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const context = buildContext(regionNombre, fecha, projects, metrics, seiaProjects, mopProjects, leystopData, seguimientos, semaforoTrends, nationalBenchmark, trendSummaries)
  const ejes = [...new Set(projects.map(p => p.eje))]

  console.log(`[minutaAI] context length: ${context.length} chars (~${Math.round(context.length / 4)} tokens)`)

  const systemPrompt = tipo === 'ejecutiva'
    ? `Eres el experto en coordinación territorial de la Región de ${regionNombre} del Ministerio del Interior y Seguridad Pública de Chile. Redacta contenido para una minuta ejecutiva de visita oficial. Usa tono formal institucional, español de Chile. Sé preciso, conciso y útil para el tomador de decisión.

Utiliza los datos de seguimiento reciente y tendencias de semáforo para contextualizar alertas con hechos, fechas y actores concretos. Si hay datos de comparación nacional, posiciona la región respecto al promedio país.`
    : `Eres analista senior de la División de Coordinación Interregional del Ministerio del Interior y Seguridad Pública de Chile, experto en la Región de ${regionNombre}. Tu tarea es redactar el Informe de Avances del Plan Regional de Gobierno que el Presidente de la República llevará en su visita a la región.

Si se adjunta el Plan Regional de Gobierno como documento, léelo en su TOTALIDAD. Extrae los compromisos presidenciales, objetivos estratégicos, metas y ejes prioritarios más importantes definidos en ese plan. Usa esa información junto con los datos de seguimiento del panel para construir un informe sustancial que refleje fielmente los compromisos asumidos y su estado de avance.

INSTRUCCIONES ADICIONALES PARA ANÁLISIS ENRIQUECIDO:
- Utiliza la actividad reciente de seguimiento por iniciativa para contextualizar alertas y recomendaciones con hechos específicos, fechas y actores concretos. Prioriza información de seguimiento por sobre descripciones genéricas.
- Usa las tendencias de semáforo para distinguir deterioro reciente (que requiere acción urgente) de problemas crónicos (que requieren cambio de estrategia).
- Cuando haya datos de comparación nacional, posiciona explícitamente la región respecto al promedio país en los indicadores clave.
- Cuando haya tendencias de series de tiempo, describe la dirección y magnitud del cambio, no solo el valor actual.

Escribe párrafos sustanciales con datos concretos y cifras específicas. Tono formal e institucional, en español de Chile.`

  const jsonSchema = tipo === 'ejecutiva'
    ? `{
  "avances_relevantes": ["string (4-5 bullets, máx 120 chars c/u, con cifras concretas)"],
  "alertas": ["string (2-3 alertas críticas narrativas, máx 150 chars c/u)"],
  "contexto_region": "string (2-3 oraciones que sintetizan la situación regional actual)",
  "iniciativas_destacadas": ["string (3-4 iniciativas con su estado, máx 120 chars c/u)"],
  "tendencia_general": "string (1 oración que resume la dirección general: mejoras y deterioros clave)"
}`
    : `{
  "resumen_ejecutivo": "2-3 oraciones que sintetizan el estado actual de la región y el avance de su Plan Regional de Gobierno. Incluye la cifra de avance promedio y los elementos más destacados.",
  "compromisos_plan": [
    "Compromiso o objetivo estratégico clave extraído del Plan Regional de Gobierno (si se adjuntó el PDF). Debe ser específico y atribuible al plan. Incluir meta o indicador si está disponible.",
    "Compromiso 2 (total 5-7 compromisos, ordenados por relevancia o eje)"
  ],
  "cifras": [
    {
      "titulo": "Crecimiento económico",
      "texto": "Párrafo de 3-4 oraciones con datos concretos del PIB regional, variación de actividad económica, sectores líderes y comparación con la media nacional."
    },
    {
      "titulo": "Empleo y mercado laboral",
      "texto": "Párrafo de 3-4 oraciones con datos de desocupación, participación laboral, ocupación informal y tendencias recientes. Incluir comparación con media nacional y dirección de la tendencia."
    },
    {
      "titulo": "Pobreza y vulnerabilidad social",
      "texto": "Párrafo de 3-4 oraciones con cifras de pobreza por ingresos, pobreza multidimensional, RSH y déficit habitacional."
    },
    {
      "titulo": "Seguridad pública",
      "texto": "Párrafo de 3-4 oraciones con datos de tasa delictual LeyStop/Carabineros, variación respecto al año anterior, tendencia reciente de casos semanales, principales tipos de delito y actividad operativa policial (controles, fiscalizaciones, incautaciones). Complementar con indicadores CASEN de victimización y percepción de inseguridad si están disponibles."
    }
  ],
  "tendencias": {
    "titulo": "Evolución de indicadores clave",
    "texto": "Párrafo de 3-4 oraciones sintetizando las principales tendencias: dirección del desempleo, evolución de la actividad delictual, y posición de la región respecto al promedio nacional. Destacar mejoras y deterioros."
  },
  "posicion_nacional": "2-3 oraciones posicionando la región respecto al promedio país en indicadores clave (empleo, seguridad, etc.), mencionando las brechas más significativas.",
  "gps_narrativa": "Párrafo de 3-4 oraciones que introduce los proyectos de inversión privada y obras públicas en la región, destacando montos totales, sectores predominantes y relevancia para el desarrollo regional.",
  "avances_ejes": {
    ${ejes.map(e => `"${e}": {\n      "resumen": "2-3 oraciones sobre el estado general de este eje, sus logros más relevantes y los principales desafíos pendientes. Integrar información de seguimiento reciente si está disponible.",\n      "logros": ["Bullet específico con cifra concreta o hito alcanzado", "Bullet específico", "Bullet específico", "Bullet específico"]\n    }`).join(',\n    ')}
  },
  "alertas_criticas": ["Alerta narrativa con contexto específico basado en seguimiento y tendencia de semáforo (máx 180 chars)", "Alerta 2"],
  "cambios_periodo": ["Cambio relevante del periodo: qué iniciativa cambió de estado, qué hito se alcanzó o qué bloqueo surgió (máx 150 chars)", "Cambio 2", "Cambio 3"],
  "recomendaciones": ["Recomendación accionable y específica para el gobierno central (máx 180 chars)", "Recomendación 2", "Recomendación 3"]
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

  const tipoLabel = tipo === 'ejecutiva' ? 'Minuta Ejecutiva (2 páginas)' : 'Informe de Avances del Plan Regional de Gobierno'
  userContent.push({
    type: 'text',
    text: `Datos actuales del panel de seguimiento (${fecha}):\n\n${context}\n\nGenera el contenido para el documento "${tipoLabel}"${planPdfBase64 ? ', integrando la información del Plan Regional adjunto con los datos del panel' : ''}. Responde ÚNICAMENTE con un JSON válido que siga el schema exacto a continuación (sin markdown, sin explicaciones, sin texto fuera del JSON):\n${jsonSchema}`,
  })

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: tipo === 'completo' ? 8192 : 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = response.content.find(b => b.type === 'text')?.text ?? ''
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned) as MinutaEjecutivaContent | MinutaCompletaContent
    console.log(`[minutaAI] ${tipo} content generated for ${regionNombre} (stop_reason: ${response.stop_reason})`)
    return parsed
  } catch (err) {
    console.error(`[minutaAI] Failed to generate ${tipo} content for ${regionNombre}:`, err)
    return null
  }
}
