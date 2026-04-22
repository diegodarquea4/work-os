import Anthropic from '@anthropic-ai/sdk'
import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, SeiaProject, MopProject } from '@/lib/types'

// ── Types ────────────────────────────────────────────────────────────────────

export type MinutaEjecutivaContent = {
  avances_relevantes: string[]      // 4-5 bullets de logros recientes
  alertas: string[]                 // 2-3 alertas narrativas
  contexto_region: string           // 2-3 oraciones de síntesis
  iniciativas_destacadas: string[]  // 3-4 iniciativas con estado
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
}

export type MinutaTipo = 'ejecutiva' | 'completo'

// ── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  regionNombre: string,
  fecha: string,
  projects: Iniciativa[],
  metrics: RegionMetrics | null,
  seiaProjects?: SeiaProject[] | null,
  mopProjects?: MopProject[] | null,
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
): Promise<MinutaEjecutivaContent | MinutaCompletaContent | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const client = new Anthropic({ apiKey })
  const context = buildContext(regionNombre, fecha, projects, metrics, seiaProjects, mopProjects)
  const ejes = [...new Set(projects.map(p => p.eje))]

  const systemPrompt = tipo === 'ejecutiva'
    ? `Eres el experto en coordinación territorial de la Región de ${regionNombre} del Ministerio del Interior y Seguridad Pública de Chile. Redacta contenido para una minuta ejecutiva de visita oficial. Usa tono formal institucional, español de Chile. Sé preciso, conciso y útil para el tomador de decisión.`
    : `Eres analista senior de la División de Coordinación Interregional del Ministerio del Interior y Seguridad Pública de Chile, experto en la Región de ${regionNombre}. Tu tarea es redactar el Informe de Avances del Plan Regional de Gobierno que el Presidente de la República llevará en su visita a la región.

Si se adjunta el Plan Regional de Gobierno como documento, léelo en su TOTALIDAD. Extrae los compromisos presidenciales, objetivos estratégicos, metas y ejes prioritarios más importantes definidos en ese plan. Usa esa información junto con los datos de seguimiento del panel para construir un informe sustancial que refleje fielmente los compromisos asumidos y su estado de avance.

Escribe párrafos sustanciales con datos concretos y cifras específicas. Tono formal e institucional, en español de Chile.`

  const jsonSchema = tipo === 'ejecutiva'
    ? `{
  "avances_relevantes": ["string (4-5 bullets, máx 120 chars c/u, con cifras concretas)"],
  "alertas": ["string (2-3 alertas críticas narrativas, máx 150 chars c/u)"],
  "contexto_region": "string (2-3 oraciones que sintetizan la situación regional actual)",
  "iniciativas_destacadas": ["string (3-4 iniciativas con su estado, máx 120 chars c/u)"]
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
      "texto": "Párrafo de 3-4 oraciones con datos de desocupación, participación laboral, ocupación informal y tendencias recientes."
    },
    {
      "titulo": "Pobreza y vulnerabilidad social",
      "texto": "Párrafo de 3-4 oraciones con cifras de pobreza por ingresos, pobreza multidimensional, RSH y déficit habitacional."
    },
    {
      "titulo": "Seguridad pública",
      "texto": "Párrafo de 3-4 oraciones con datos de victimización DMCS, percepción de inseguridad y tendencias en denuncias."
    }
  ],
  "gps_narrativa": "Párrafo de 3-4 oraciones que introduce los proyectos de inversión privada y obras públicas en la región, destacando montos totales, sectores predominantes y relevancia para el desarrollo regional.",
  "avances_ejes": {
    ${ejes.map(e => `"${e}": {\n      "resumen": "2-3 oraciones sobre el estado general de este eje, sus logros más relevantes y los principales desafíos pendientes.",\n      "logros": ["Bullet específico con cifra concreta o hito alcanzado", "Bullet específico", "Bullet específico", "Bullet específico"]\n    }`).join(',\n    ')}
  },
  "alertas_criticas": ["Alerta narrativa con contexto específico (máx 180 chars)", "Alerta 2"],
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
