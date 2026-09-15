import type { Capa } from '@/lib/projects'

/**
 * Selector de capas por vista (Diego, 2026-09-15).
 *
 * La Capa III es el 73% de la cartera (5.182 de 7.091) y entierra el avance
 * de lo que sí tiene seguimiento continuo (Capa I: 415). Cada vista principal
 * —Mapa, Iniciativas, Tablero, Mi Región— lleva su propio selector de 5
 * estados, y lo que se elige rige TODO en esa vista: listas, pines, conteos,
 * semáforos y % de avance. Regla: "el avance mide lo mismo que se ve" — ningún
 * número se calcula sobre un universo distinto del que está en pantalla.
 *
 * Módulo puro: sin React, sin zod (el schema vive en lib/schemas, que importa
 * `CAPA_SEL_VALUES` de acá). Los Sets de `capasDe` son constantes de módulo a
 * propósito: se usan como deps de memos y una identidad nueva por render
 * re-dispararía los pines y las stats comunales del Mapa.
 */

export type CapaSel = 'l' | 'll' | 'lll' | 'l+ll' | 'todas'

export const CAPA_SEL_VALUES = ['l', 'll', 'lll', 'l+ll', 'todas'] as const

export const CAPA_SEL_OPCIONES: ReadonlyArray<{ key: CapaSel; corto: string; largo: string }> = [
  { key: 'l',     corto: 'I',     largo: 'Capa I' },
  { key: 'll',    corto: 'II',    largo: 'Capa II' },
  { key: 'lll',   corto: 'III',   largo: 'Capa III' },
  { key: 'l+ll',  corto: 'I+II',  largo: 'Capa I y II' },
  { key: 'todas', corto: 'Todas', largo: 'Todas las capas' },
]

export type VistaConCapas = 'mapa' | 'iniciativas' | 'tablero' | 'mi-region'

// Default por vista. Las cuatro parten en Capa I (Diego, 2026-09-15: "es para
// empezar a ver el avance de lo que es considerado capa I"). Cambiar acá.
export const CAPA_SEL_DEFAULT: Record<VistaConCapas, CapaSel> = {
  mapa:         'l',
  iniciativas:  'l',
  tablero:      'l',
  'mi-region':  'l',
}

const SETS: Record<CapaSel, ReadonlySet<Capa>> = {
  l:       new Set<Capa>(['l']),
  ll:      new Set<Capa>(['ll']),
  lll:     new Set<Capa>(['lll']),
  'l+ll':  new Set<Capa>(['l', 'll']),
  todas:   new Set<Capa>(['l', 'll', 'lll']),
}

/** Set de capas que abarca la selección. Misma referencia por selección. */
export function capasDe(sel: CapaSel): ReadonlySet<Capa> {
  return SETS[sel]
}

export function enCapas(sel: CapaSel, capa: Capa): boolean {
  return SETS[sel].has(capa)
}

/**
 * Filtra una lista por la selección. Con `'todas'` devuelve LA MISMA
 * referencia, para que los memos aguas abajo no se recalculen sin cambio real.
 */
export function filtrarPorCapas<T extends { capa: Capa }>(list: T[], sel: CapaSel): T[] {
  if (sel === 'todas') return list
  const set = SETS[sel]
  return list.filter(p => set.has(p.capa))
}

/** Valida lo que venga de localStorage / body. Basura → null. */
export function parseCapaSel(raw: unknown): CapaSel | null {
  return typeof raw === 'string' && (CAPA_SEL_VALUES as readonly string[]).includes(raw)
    ? (raw as CapaSel)
    : null
}

/** Rótulo largo ("Capa I y II") para captions y encabezados de PDF. */
export function capaSelLabel(sel: CapaSel): string {
  return CAPA_SEL_OPCIONES.find(o => o.key === sel)?.largo ?? sel
}
