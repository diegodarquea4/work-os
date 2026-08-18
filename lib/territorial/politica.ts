/**
 * Clasificación política y helpers de color del modo «Autoridades».
 *
 * Portado VERBATIM del Panel Territorial SUBDERE (index.html de Francisca Barros):
 * `ESPECTRO_PARTIDOS`, `normPartido`, `ladoDePartido`, `ladoDeDelegado`, `COLOR_HEX`,
 * `LADO_LABEL`, `lightenColor`, `nivelAclaradoPorPct`, `titleCase`, `normComunaKey`,
 * `EXCEPCION_PERIODO_1RO`. NO cambiar la lógica: la fidelidad con el PTS es requisito.
 */

import type { Lado } from './types'

/**
 * Mapa partido → bloque. Copiado íntegro del PTS (~80 entradas). Las llaves están
 * normalizadas con `normPartido` (mayúsculas, sin tildes). NO reordenar ni editar.
 */
export const ESPECTRO_PARTIDOS: Record<string, Lado> = {
  INDEPENDIENTES: 'IND', IND: 'IND', 'INDEPENDIENTES-LISTA XU': 'IND',
  'UNION DEMOCRATA INDEPENDIENTE': 'DER', UDI: 'DER', 'INDEPENDIENTES-LISTA K': 'IND',
  'INDEPENDIENTES-LISTA XX': 'IND', 'FEDERACION REGIONALISTA VERDE SOCIAL': 'IZQ', FRVS: 'IZQ',
  'PARTIDO POR LA DEMOCRACIA': 'IZQ', PPD: 'IZQ', 'INDEPENDIENTES-LISTA M': 'IND',
  'PARTIDO RADICAL DE CHILE': 'IZQ', PR: 'IZQ', 'RENOVACION NACIONAL': 'DER', RN: 'DER',
  'PARTIDO SOCIALISTA DE CHILE': 'IZQ', PS: 'IZQ', 'PARTIDO COMUNISTA DE CHILE': 'IZQ', PC: 'IZQ',
  'PARTIDO HUMANISTA': 'IZQ', PH: 'IZQ', 'CONVERGENCIA SOCIAL': 'IZQ', CS: 'IZQ',
  'REVOLUCION DEMOCRATICA': 'IZQ', RD: 'IZQ', 'PARTIDO PROGRESISTA DE CHILE': 'IZQ', PRO: 'IZQ',
  'EVOLUCION POLITICA': 'DER', EVOPOLI: 'DER', 'INDEPENDIENTES-LISTA XS': 'IND', IGUALDAD: 'IZQ',
  INDEPENDIENTE: 'IND', 'PARTIDO NACIONAL LIBERTARIO': 'DER', PNL: 'DER',
  'PARTIDO DE LA GENTE': 'IND', 'PARTIDO REPUBLICANO DE CHILE': 'DER', REP: 'DER',
  'FRENTE AMPLIO': 'IZQ', FA: 'IZQ', 'PARTIDO LIBERAL DE CHILE': 'IZQ', PL: 'IZQ',
  AMPLITUD: 'DER', 'CENTRO UNIDO': 'IND', CIUDADANOS: 'DER', COMUNES: 'IZQ',
  'DEMOCRACIA REGIONAL PATAGONICA': 'IND', 'PARTIDO ACCION HUMANISTA': 'IZQ',
  'PARTIDO CONSERVADOR CRISTIANO': 'DER', 'PARTIDO DEMOCRATA CRISTIANO': 'IZQ',
  'PARTIDO DEMOCRATAS CHILE': 'DER', 'PARTIDO NACIONAL CIUDADANO': 'IND',
  'PARTIDO REGIONALISTA INDEPENDIENTE DEMOCRATA': 'DER', 'PARTIDO SOCIAL CRISTIANO': 'DER',
  'INDEPENDIENTES LISTA C': 'IND', 'INDEPENDIENTES LISTA H': 'IND', 'INDEPENDIENTES LISTA I': 'IND',
  'INDEPENDIENTES LISTA J': 'IND', 'MAS REGION': 'IND', 'MOVIMIENTO AMARILLOS POR CHILE': 'DER',
  'MOVIMIENTO AMPLIO SOCIAL': 'IZQ', 'NUEVO TIEMPO': 'IND', PAIS: 'IND',
  'PARTIDO ALIANZA VERDE POPULAR': 'IZQ', 'PARTIDO DE TRABAJADORES REVOLUCIONARIOS': 'IZQ',
  'PARTIDO ECOLOGISTA VERDE': 'IZQ', 'PARTIDO IGUALDAD': 'IZQ',
  'PARTIDO IZQUIERDA CIUDADANA DE CHILE': 'IZQ', 'PARTIDO PROGRESISTA': 'IZQ',
  'PARTIDO RADICAL SOCIALDEMOCRATA': 'IZQ', 'PARTIDO REGIONALISTA DE LOS INDEPENDIENTES': 'IND',
  'PARTIDO REGIONALISTA INDEPENDIENTE': 'IND', PODER: 'IND', POPULAR: 'IZQ',
  TODOS: 'IND', 'UNION PATRIOTICA': 'DER',
}

export const COLOR_HEX = { IZQ: '#C0392B', DER: '#1F5FA8', IND: '#8A8A82', NULL: '#E7E4DC' } as const

export const LADO_LABEL: Record<Lado, string> = {
  IZQ: 'Izquierda', DER: 'Derecha', IND: 'Independiente',
}

/** Orden de desempate para la mayoría de bloque (región/distrito): IZQ, DER, IND. */
export const LADO_ORDEN: Lado[] = ['IZQ', 'DER', 'IND']

/** Normaliza el nombre de un partido: mayúsculas, sin tildes, espacios colapsados. */
export function normPartido(s: string | null | undefined): string {
  return (s || '').trim().toUpperCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ').trim()
}

/** Bloque político de un partido. Fallback: prefijo "INDEPENDIENTE ..." → lado del sufijo. */
export function ladoDePartido(partido: string | null | undefined): Lado | null {
  const k = normPartido(partido)
  if (ESPECTRO_PARTIDOS[k]) return ESPECTRO_PARTIDOS[k]
  if (k.startsWith('INDEPENDIENTE ')) {
    const k2 = k.slice('INDEPENDIENTE '.length)
    if (ESPECTRO_PARTIDOS[k2]) return ESPECTRO_PARTIDOS[k2]
  }
  return null
}

/** Bloque de un delegado: el texto puede venir compuesto ("FRVS / Ind.", "Ind. (pro-FA)"). */
export function ladoDeDelegado(partidoTexto: string | null | undefined): Lado | null {
  if (!partidoTexto) return null
  const primerTramo = partidoTexto.split('/')[0].split('(')[0].trim()
  return ladoDePartido(primerTramo)
}

/** Normaliza nombre de comuna/persona para usar como llave (sin tildes, mayúsculas). */
export function normComunaKey(nombre: string | null | undefined): string {
  return (nombre || '').toUpperCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

/** Aclara un color hacia el blanco. amount 0-1. */
export function lightenColor(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  r = Math.round(r + (255 - r) * amount)
  g = Math.round(g + (255 - g) * amount)
  b = Math.round(b + (255 - b) * amount)
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/**
 * Convierte el % de votos del gobernador en la comuna a un nivel de aclarado
 * (0 = color pleno, cerca de 1 = casi blanco). 10% o menos → casi sin color;
 * 70% o más → color pleno. `pct == null` → 0 (color pleno, no adivinamos).
 */
export function nivelAclaradoPorPct(pct: number | null | undefined): number {
  const MIN_PCT = 10, MAX_PCT = 70, MAX_ACLARADO = 0.85
  if (pct == null) return 0
  const pctClamp = Math.max(MIN_PCT, Math.min(MAX_PCT, pct))
  const fraccion = (pctClamp - MIN_PCT) / (MAX_PCT - MIN_PCT)
  return MAX_ACLARADO * (1 - fraccion)
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return s || ''
  return s.toLowerCase().split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/**
 * Comunas donde reelecto=true + puede_repostular=true NO implica 2do período,
 * porque un tramo anterior de reemplazo (designación del concejo) no contó como
 * período completo. Confirmado con fuente para Algarrobo y Putre.
 */
export const EXCEPCION_PERIODO_1RO = new Set(['ALGARROBO', 'PUTRE'])

// ── Reconciliación de llaves work-os (numérico) ↔ PTS (string zero-padded) ──

/** CUT numérico de work-os (1402) → llave del PTS ('01402'). */
export function cutKey(cut: number | string): string {
  return String(cut).padStart(5, '0')
}

/** Código de región numérico de work-os (1, 13) → llave del PTS ('01', '13'). */
export function regionKey(cod: number | string): string {
  return String(cod).padStart(2, '0')
}

/** Color hex → bloque (para revertir un fill a su lado; NULL si no matchea). */
export function ladoDeColor(color: string): keyof typeof COLOR_HEX {
  return (Object.keys(COLOR_HEX) as (keyof typeof COLOR_HEX)[]).find((k) => COLOR_HEX[k] === color) || 'NULL'
}
