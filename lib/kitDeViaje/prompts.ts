/**
 * Prompts para el redactor del Kit de Viaje.
 *
 * Se dividen en DOS llamados AI, no uno:
 *
 *   1. `buildContextPrompt` — siempre corre. Toma `region_metrics` + `fichaExtra` +
 *      `trendSummaries` y devuelve narrativa para Sección I (caracterización) y
 *      Sección II (indicadores). No usa el PDF PREGO en absoluto — el context
 *      socioeconómico ES independiente del PDF plan-regional.
 *
 *   2. `buildPregoPrompt` — corre solo si `planPdfState === 'ok'`. Recibe el PDF
 *      como document input + JSON estructurado de iniciativas agrupadas por eje.
 *      Devuelve narrativa del eje (desde el PDF) + progreso cualitativo (desde
 *      las iniciativas). Cuando el PDF no está disponible, el assembler pinta el
 *      disclaimer estático (constants) — no se llama al AI.
 *
 * Esta separación evita el failure mode del prompt actual de `minutaAI.ts:494`:
 * "Si NO hay PDF adjunto, genera 3 ejes genéricos basados en los indicadores"
 * — fabrica narrativa PREGO cuando no hay fuente. Al separar, la pregunta a AI
 * simplemente no se hace y el usuario ve el disclaimer explícito.
 */

import type { Iniciativa } from '@/lib/projects'
import type { RegionMetrics, RegionEje } from '@/lib/types'
import type { FichaExtraData, TrendSummaries } from '@/lib/minutaAI'

// ── Guardarraíles compartidos ──────────────────────────────────────────────

const REGLAS_ESTILO = `
Reglas de estilo (obligatorias en cada respuesta):
- Castellano neutro chileno. NO uses formas rioplatenses ("vos", "sabés",
  "tenés", "querés") — usa "usted" o formas impersonales.
- Nunca escribas "Ministerio del Interior y Seguridad Pública". El nombre
  canónico es "Ministerio del Interior" (sin sufijo).
- Nunca escribas "División de Coordinación Interregional". Es "División de
  Coordinación Interministerial".
- Registro técnico-ministerial neutro. Sin adjetivos valorativos: prohibido
  "excelente", "extraordinario", "preocupante", "exitoso", "grave", "positivo",
  "negativo", "crítico", "alarmante". Describí estado, no opines.
- Sin recomendaciones ni exhortaciones. Nada de "se sugiere", "es deseable",
  "debiera priorizarse". Describí lo que el dato muestra.
- Números en formato es-CL: separador de miles con punto, decimal con coma
  (ej: 37.068 km², 12,4%).
- Sin emojis, sin markdown, sin viñetas — texto plano.
- No inventes cifras. Si un dato no está en el input, NO lo menciones.
`.trim()

// ── (1) Contexto socioeconómico — Secciones I y II ─────────────────────────

export interface ContextPromptInput {
  region: { cod: string; nombre: string }
  metrics: RegionMetrics | null
  fichaExtra: FichaExtraData | null
  trendSummaries: TrendSummaries | null
}

export interface ContextPromptOutput {
  system: string
  user: string
}

/**
 * Devuelve system + user prompts para la llamada de contexto. El caller usa
 * respuesta.content[0].text como JSON con las claves:
 *   { caracterizacion_parrafos: string[], indicadores_narrativa: {...} }
 */
export function buildContextPrompt(input: ContextPromptInput): ContextPromptOutput {
  const { region, metrics, fichaExtra, trendSummaries } = input

  const system = `
Sos un redactor técnico del Ministerio del Interior de Chile, División de
Coordinación Interministerial. Redactás secciones ejecutivas del "Kit de
Viaje" — documento institucional que la autoridad lee antes de una visita
regional. Tono técnico-descriptivo, sin marketing.

${REGLAS_ESTILO}

Devolvés SOLO un objeto JSON válido con exactamente esta forma (sin texto
adicional, sin backticks, sin comentarios):

{
  "caracterizacion_parrafos": [
    // 2 a 3 párrafos de 3-5 oraciones cada uno describiendo la región:
    // ubicación relativa en Chile, características demográficas y sociales
    // salientes, y composición cultural (pueblos originarios, migración,
    // ruralidad). Cada párrafo es un string. No repitas los números de los
    // bullets — usalos como base pero enriquecé con contexto.
  ],
  "indicadores_narrativa": {
    "pib_comentario": "",       // 2-3 oraciones sobre PIB regional
    "matriz_productiva": "",    // 2-3 oraciones sobre sectores productivos
    "ingresos_pobreza": "",     // 2-3 oraciones sobre CASEN 2024
    "educacion_nota": "",       // 2 oraciones sobre escolaridad/cobertura
    "salud_nota": "",           // 2 oraciones sobre FONASA/camas/lista espera
    "vivienda_nota": "",        // 2 oraciones sobre déficit/hacinamiento
    "seguridad_nota": "",       // 2 oraciones sobre victimización/percepción
    "tendencia_general": ""     // 1 línea sintética. Opcional (string vacío ok).
  }
}

Cualquier campo cuya data no esté en el input se devuelve como string vacío.
NO inventes cifras faltantes.
`.trim()

  const dataDump = {
    region,
    region_metrics: metrics ?? null,
    ficha_extra: fichaExtra ?? null,
    trend_summaries: trendSummaries ?? null,
  }

  const user = `
Datos crudos del panel para la Región ${region.nombre} (código ${region.cod}):

${JSON.stringify(dataDump, null, 2)}

Redactá el JSON pedido usando estos datos. Recordá: si un valor es null o
undefined, no lo menciones. No agregues campos fuera del schema.
`.trim()

  return { system, user }
}

// ── (2) PREGO — Sección III ────────────────────────────────────────────────

export interface PregoPromptInput {
  region: { cod: string; nombre: string }
  fecha: string
  /** Base64 del PDF plan-regional. Caller garantiza state === 'ok'. */
  planPdfBase64: string
  regionEjes: RegionEje[]
  projects: Iniciativa[]
}

export interface PregoPromptOutput {
  system: string
  /** Bloque de texto que va al primer content block del user message. */
  userTextBlock: string
  /**
   * Bloque de documento (PDF) para el user message. Formato Anthropic:
   *   { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
   * Devuelto como objeto listo para spreadear en el array de content.
   */
  documentBlock: {
    type: 'document'
    source: { type: 'base64'; media_type: 'application/pdf'; data: string }
    cache_control?: { type: 'ephemeral' }
  }
}

/**
 * Devuelve system prompt + user text + document block para la llamada PREGO.
 * El caller debe usar la SDK Anthropic con content:
 *   [documentBlock, { type: 'text', text: userTextBlock }]
 *
 * Salida esperada del AI (JSON):
 *   { intro: string, ejes: [{numero, nombre, narrativa, progreso_cualitativo}] }
 */
export function buildPregoPrompt(input: PregoPromptInput): PregoPromptOutput {
  const { region, fecha, planPdfBase64, regionEjes, projects } = input

  // Agrupar iniciativas por eje_id, tomar solo campos que la IA necesita.
  const porEjeId = new Map<number, Iniciativa[]>()
  for (const p of projects) {
    if (p.eje_id == null) continue
    const arr = porEjeId.get(p.eje_id) ?? []
    arr.push(p)
    porEjeId.set(p.eje_id, arr)
  }

  const ejesCanonicos = [...regionEjes]
    .sort((a, b) => a.numero - b.numero)
    .map(cat => ({
      numero: cat.numero,
      nombre: cat.nombre,
      iniciativas: (porEjeId.get(cat.id) ?? []).slice(0, 30).map(p => ({
        nombre: p.nombre,
        ministerio: p.ministerio,
        estado_semaforo: p.estado_semaforo,
        pct_avance: p.pct_avance,
        etapa: p.etapa_actual,
        proximo_hito: p.proximo_hito,
        prioritaria_prego: (p.tags ?? []).includes('Prioritaria PREGO'),
      })),
    }))

  const system = `
Sos un redactor técnico del Ministerio del Interior de Chile, División de
Coordinación Interministerial. Redactás la Sección III (Plan Regional de
Gobierno) del "Kit de Viaje" para la Región ${region.nombre}, fecha
${fecha}.

Tenés DOS fuentes:
  1. El PDF del PREGO regional adjunto (documento). De ahí sacás la
     narrativa cualitativa de cada eje: qué es, qué contiene, qué compromete.
  2. El JSON estructurado más abajo, con las iniciativas cargadas en el panel
     agrupadas por eje. De ahí sacás el "progreso cualitativo": referís
     cuántas iniciativas hay, distribución de semáforo, hitos próximos.

${REGLAS_ESTILO}

Reglas específicas de esta sección:
- Los ejes canónicos son los que te doy en el array "ejes". Devolvé EXACTAMENTE
  esos, mismo numero y mismo nombre. Si el PDF menciona un eje que no está
  en la lista canónica, IGNORALO. Si un eje canónico no aparece explícitamente
  en el PDF, devolvé narrativa mínima ("Sin desarrollo específico en el
  documento del PREGO") y concentrate en el progreso cualitativo.
- "narrativa" (por eje): 3-5 oraciones extraídas del PDF. No copies texto
  literal — sintetizá con vocabulario propio.
- "progreso_cualitativo" (por eje): 2-3 oraciones referenciando las
  iniciativas del panel. Podés decir "de las N iniciativas asociadas, X
  presentan avance sostenido; Y están detenidas" — pero NUNCA inventes
  porcentajes. Si más del 95% del eje está en semáforo gris o pct_avance=0,
  decí explícitamente "El panel aún no registra avances cargados para estas
  iniciativas".
- "intro" (top-level): 2-3 oraciones marco sobre el PREGO en su conjunto,
  extraídas del PDF. Sin listar los ejes.

Devolvés SOLO un objeto JSON válido con exactamente esta forma (sin texto
adicional, sin backticks, sin comentarios):

{
  "intro": "",
  "ejes": [
    { "numero": 1, "nombre": "...", "narrativa": "...", "progreso_cualitativo": "..." }
  ]
}
`.trim()

  const userTextBlock = `
Ejes canónicos del panel (autoritativos — usá estos, no los que aparezcan en el PDF):

${JSON.stringify(ejesCanonicos, null, 2)}

Redactá el JSON del schema anterior. El array "ejes" debe tener exactamente
${ejesCanonicos.length} elementos, en el mismo orden por numero. No agregues
ni omitas ejes.
`.trim()

  return {
    system,
    userTextBlock,
    documentBlock: {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: planPdfBase64,
      },
      cache_control: { type: 'ephemeral' },
    },
  }
}
