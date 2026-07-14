/**
 * Prompts para el redactor del Kit de Viaje ("Contexto Regional").
 *
 * `buildContextPrompt` recibe las líneas de datos crudos YA CALCULADAS por
 * `buildRawDataLines()` (ver `lib/kitDeViaje/assembler.ts`) — la misma fuente
 * que usa el fallback determinístico cuando el AI no corre. El redactor solo
 * transforma esas líneas en prosa agrupada en 5 bullets (Sección I) + 6
 * bullets (Sección II) — no recalcula porcentajes, no compara contra
 * "nacional", no interpreta JSON anidado. Esto evita que la IA invente o
 * descuadre cifras que ya están correctas en las líneas.
 *
 * "Organización político-administrativa" (Sección I), los sectores del PIB y
 * la tabla de "Mercado laboral" (Sección II) NO se piden acá — son 100%
 * determinísticos, el assembler los arma directo desde los datos.
 *
 * No usa el PDF PREGO — el contexto socioeconómico es independiente del
 * Plan Regional. El resumen de Sección III se genera con otro prompt
 * (`generatePregoResumen` en `lib/minutaAI.ts`), igual que la justificación
 * de ejes de "Avance PREGO" (`generateJustificacionEjes`).
 */

import type { Bullet } from './types'
import type { RawDataLines } from './assembler'

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
- Sin emojis, sin markdown, sin viñetas — texto plano, prosa corrida.
`.trim()

const REGLA_FUENTE_UNICA = `
REGLA CRÍTICA — fuente única de datos:
Cada bloque de líneas abajo YA TRAE el valor final, correcto y formateado —
incluidas comparaciones contra el promedio nacional donde corresponde. Tu
único trabajo es convertir esas líneas en prosa fluida, agrupadas en el
bullet correspondiente.
- NO recalcules porcentajes, promedios ni variaciones.
- NO corrijas, redondees ni "mejores" ningún valor.
- NO inventes cifras que no estén en las líneas.
- NO menciones un dato si su línea no está en el input (significa que no
  hay valor disponible para esa región).
- Cada oración que incluya un número debe poder rastrearse a una línea
  específica de las que te paso.
- Excepción puntual (única permitida): en "estructura_etaria" podés agregar
  UNA frase final interpretando si el índice de envejecimiento es alto o bajo
  y qué implica (ej: envejecimiento poblacional vs. población joven) — es una
  lectura del número, no una cifra nueva.
`.trim()

/** "Label: value (nota)" por línea — mismo formato que usa el fallback determinístico. */
function fmtLineas(lines: Bullet[]): string {
  if (lines.length === 0) return '(sin datos disponibles)'
  return lines.map(b => `- ${b.label}: ${b.value}${b.nota ? ` (${b.nota})` : ''}`).join('\n')
}

// ── (1) Contexto socioeconómico — Secciones I y II ─────────────────────────

export interface ContextPromptInput {
  region: { cod: string; nombre: string }
  raw: RawDataLines
}

export interface ContextPromptOutput {
  system: string
  user: string
}

/**
 * Devuelve system + user prompts para la llamada de contexto. El caller usa
 * respuesta.content[0].text como JSON con las claves:
 *   { caracterizacion: {...4 campos}, indicadores: {...6 campos} }
 */
export function buildContextPrompt(input: ContextPromptInput): ContextPromptOutput {
  const { region, raw } = input

  const system = `
Sos un redactor técnico del Ministerio del Interior de Chile, División de
Coordinación Interministerial. Redactás la Sección I ("Caracterización
general de la región") y la Sección II ("Indicadores socioeconómicos clave")
del documento "Contexto Regional" — que la autoridad lee antes de una visita
regional. Tono técnico-descriptivo, sin marketing.

${REGLAS_ESTILO}

${REGLA_FUENTE_UNICA}

Devolvés SOLO un objeto JSON válido con exactamente esta forma (sin texto
adicional, sin backticks, sin comentarios). Cada valor es un string de prosa
(1-3 oraciones); si el bloque de líneas correspondiente viene vacío, devolvé
string vacío para ese campo:

{
  "caracterizacion": {
    "localizacion_superficie": "", // usa el bloque LOCALIZACION_Y_SUPERFICIE
    "poblacion": "",               // usa el bloque POBLACION
    "estructura_etaria": "",       // usa el bloque ESTRUCTURA_ETARIA (+ 1 frase de interpretación, ver regla)
    "composicion": ""              // usa el bloque COMPOSICION
  },
  "indicadores": {
    "pib_regional": "",       // usa el bloque PIB_REGIONAL — incluí qué sector(es) explican más el crecimiento o la caída.
                               // OJO: el monto del PIB total y de cada sector vienen en pesos NOMINALES (marcados
                               // "(nominal)" en la línea) — no los confundas ni los llames "reales". El crecimiento
                               // anual, el ranking y el % del PIB nacional SÍ son en términos reales (volumen
                               // encadenado) — no digas que el crecimiento es "nominal".
    "ingresos_pobreza": "",   // usa el bloque INGRESOS_Y_POBREZA
    "educacion": "",          // usa el bloque EDUCACION
    "salud": "",              // usa el bloque SALUD
    "vivienda": "",           // usa el bloque VIVIENDA
    "seguridad_publica": ""   // usa el bloque SEGURIDAD_PUBLICA
  }
}
`.trim()

  const user = `
Líneas de datos ya calculadas para la Región ${region.nombre} (código ${region.cod}):

=== LOCALIZACION_Y_SUPERFICIE ===
${fmtLineas(raw.localizacion)}

=== POBLACION ===
${fmtLineas(raw.poblacion)}

=== ESTRUCTURA_ETARIA ===
${fmtLineas(raw.estructuraEtaria)}

=== COMPOSICION ===
${fmtLineas(raw.composicion)}

=== PIB_REGIONAL ===
${fmtLineas(raw.pibRegional)}

=== INGRESOS_Y_POBREZA ===
${fmtLineas(raw.ingresosPobreza)}

=== EDUCACION ===
${fmtLineas(raw.educacion)}

=== SALUD ===
${fmtLineas(raw.salud)}

=== VIVIENDA ===
${fmtLineas(raw.vivienda)}

=== SEGURIDAD_PUBLICA ===
${fmtLineas(raw.seguridad)}

Redactá el JSON pedido usando ÚNICAMENTE estas líneas. No agregues campos
fuera del schema.
`.trim()

  return { system, user }
}
