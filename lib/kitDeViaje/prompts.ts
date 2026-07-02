/**
 * Prompts para el redactor del Kit de Viaje ("Contexto Regional").
 *
 * `buildContextPrompt` toma `region_metrics` + `fichaExtra` + `trendSummaries`
 * y devuelve narrativa para Sección I (caracterización) y Sección II
 * (indicadores). No usa el PDF PREGO — el contexto socioeconómico es
 * independiente del Plan Regional. La justificación de ejes se genera en la
 * minuta "Avance PREGO" con otro prompt (ver `generateJustificacionEjes` en
 * `lib/minutaAI.ts`).
 */

import type { RegionMetrics } from '@/lib/types'
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
