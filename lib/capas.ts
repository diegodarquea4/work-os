import type { Capa } from '@/lib/projects'

/**
 * Selector de capas por vista (Diego, 2026-09-15).
 *
 * La Capa III es el 73% de la cartera (5.182 de 7.091) y entierra el avance
 * de lo que sí tiene seguimiento continuo (Capa I: 415). Cada vista principal
 * —Mapa, Iniciativas, Tablero, Mi Región— lleva su propio selector: tres
 * chips I · II · III que se marcan y desmarcan, y lo que está en negro es lo
 * que se muestra (Diego prefirió esto a un control de 5 estados: "se verá
 * más profesional"). Lo elegido rige TODO en esa vista: listas, pines,
 * conteos, semáforos y % de avance. Regla: "el avance mide lo mismo que se
 * ve" — ningún número se calcula sobre un universo distinto del que está en
 * pantalla.
 *
 * La selección es un array ORDENADO y NO VACÍO de capas (`toggleCapa` nunca
 * apaga la última: una vista sin capa no muestra nada y no tiene sentido).
 * Módulo puro: sin React, sin zod (el schema vive en lib/schemas e importa
 * `CAPAS_ORDEN` de acá). `capasDe` devuelve Sets cacheados por selección a
 * propósito: se usan como deps de memos y una identidad nueva por render
 * re-dispararía los pines y las stats comunales del Mapa.
 */

export const CAPAS_ORDEN = ['l', 'll', 'lll'] as const

/** Capas activas, en el orden canónico I → II → III, nunca vacío. */
export type CapaSel = ReadonlyArray<Capa>

export const CAPA_OPCIONES: ReadonlyArray<{ key: Capa; corto: string; largo: string }> = [
  { key: 'l',   corto: 'I',   largo: 'Capa I — las prioridades' },
  { key: 'll',  corto: 'II',  largo: 'Capa II' },
  { key: 'lll', corto: 'III', largo: 'Capa III — cartera regular' },
]

export type VistaConCapas = 'mapa' | 'iniciativas' | 'tablero' | 'mi-region'

// Default por vista. Las cuatro parten solo con la Capa I marcada (Diego,
// 2026-09-15: "es para empezar a ver el avance de lo que es considerado
// capa I"). Cambiar acá.
export const CAPA_SEL_DEFAULT: Record<VistaConCapas, CapaSel> = {
  mapa:         ['l'],
  iniciativas:  ['l'],
  tablero:      ['l'],
  'mi-region':  ['l'],
}

export const CAPA_SEL_TODAS: CapaSel = [...CAPAS_ORDEN]

const ROMANO: Record<Capa, string> = { l: 'I', ll: 'II', lll: 'III' }

/** Orden canónico + sin duplicados. Devuelve [] si no queda nada válido. */
function normalizar(capas: Iterable<unknown>): Capa[] {
  const set = new Set<Capa>()
  for (const c of capas) if ((CAPAS_ORDEN as readonly string[]).includes(c as string)) set.add(c as Capa)
  return CAPAS_ORDEN.filter(c => set.has(c))
}

/** Llave estable de una selección ("l,ll") — para persistir y para cachear. */
export function serializeCapaSel(sel: CapaSel): string {
  return normalizar(sel).join(',')
}

const SETS = new Map<string, ReadonlySet<Capa>>()

/** Set de capas activas. Misma referencia para la misma selección. */
export function capasDe(sel: CapaSel): ReadonlySet<Capa> {
  const k = serializeCapaSel(sel)
  let s = SETS.get(k)
  if (!s) { s = new Set<Capa>(normalizar(sel)); SETS.set(k, s) }
  return s
}

export function esTodas(sel: CapaSel): boolean {
  return normalizar(sel).length === CAPAS_ORDEN.length
}

export function enCapas(sel: CapaSel, capa: Capa): boolean {
  return capasDe(sel).has(capa)
}

/**
 * Marca/desmarca una capa. NUNCA deja la selección vacía: apagar la última
 * devuelve la misma selección (el chip lo explica en su title).
 */
export function toggleCapa(sel: CapaSel, capa: Capa): CapaSel {
  const actual = normalizar(sel)
  if (actual.includes(capa)) {
    return actual.length === 1 ? actual : actual.filter(c => c !== capa)
  }
  return normalizar([...actual, capa])
}

/**
 * Filtra una lista por la selección. Con las tres marcadas devuelve LA MISMA
 * referencia, para que los memos aguas abajo no se recalculen sin cambio real.
 */
export function filtrarPorCapas<T extends { capa: Capa }>(list: T[], sel: CapaSel): T[] {
  if (esTodas(sel)) return list
  const set = capasDe(sel)
  return list.filter(p => set.has(p.capa))
}

/**
 * Valida lo que venga de localStorage ("l,ll"), de un body (array) o basura.
 * Vacío o inválido → null (el llamador decide el default).
 */
export function parseCapaSel(raw: unknown): CapaSel | null {
  let items: unknown[]
  if (typeof raw === 'string') items = raw.split(',').map(s => s.trim())
  else if (Array.isArray(raw)) items = raw
  else return null
  const capas = normalizar(items)
  return capas.length > 0 ? capas : null
}

/**
 * Rótulo para captions y encabezados de PDF: "Capa I", "Capa I y II",
 * "Capa I, II y III" (con las tres se prefiere no mostrar nada — ver
 * `capaSelCaption`).
 */
export function capaSelLabel(sel: CapaSel): string {
  const r = normalizar(sel).map(c => ROMANO[c])
  if (r.length === 0) return 'Sin capas'
  if (r.length === 1) return `Capa ${r[0]}`
  return `Capa ${r.slice(0, -1).join(', ')} y ${r[r.length - 1]}`
}

/** Caption para la UI/PDF: null cuando están las tres (no hay qué aclarar). */
export function capaSelCaption(sel: CapaSel): string | null {
  return esTodas(sel) ? null : capaSelLabel(sel)
}
