import type { Iniciativa } from '@/lib/projects'
import { comunasDeRegion } from '@/lib/comunas'

/**
 * Conteos del nivel comunal del Mapa, derivados client-side de las
 * iniciativas ya cargadas (comuna_cods + inversion_mm) — sin endpoint nuevo.
 *
 * Regla de producto (spec drill-down): una iniciativa multi-comuna cuenta
 * COMPLETA en cada una de sus comunas, monto incluido — sin prorrateo. La
 * suma de las comunas puede superar el total regional; el total correcto es
 * el del nivel región.
 *
 * Buckets (safety-net: NINGUNA iniciativa desaparece del nivel comunal):
 * - "Alcance regional": alcance_regional con texto de comuna no vacío
 *   ("Regional", "Varias", provincias...).
 * - "Sin comuna": alcance_regional con texto vacío, O iniciativas sin ningún
 *   CUT de la región en comuna_cods (cubre residuales y CUT foráneos de las
 *   filas cross-región pendientes de revisión).
 */

export type ComunaStatsRow = { cut: number; nombre: string; n: number; mm: number }

export type ComunaStats = {
  /** Comunas con iniciativas (n>0), orden: n desc, luego MM$ desc, luego nombre. */
  rows: ComunaStatsRow[]
  /** Todas las comunas de la región (incluidas n=0) — tooltips de polígonos. */
  statsByCut: ReadonlyMap<number, { n: number; mm: number }>
  alcanceRegional: { n: number; mm: number }
  sinComuna: { n: number; mm: number }
}

export function computeComunaStats(iniciativas: Iniciativa[], regionCod: string): ComunaStats {
  const catalogo = comunasDeRegion(regionCod)
  const cutsRegion = new Set(catalogo.map(c => c.cut))

  const acc = new Map<number, { n: number; mm: number }>()
  for (const c of catalogo) acc.set(c.cut, { n: 0, mm: 0 })
  const alcanceRegional = { n: 0, mm: 0 }
  const sinComuna = { n: 0, mm: 0 }

  for (const p of iniciativas) {
    if (p.cod !== regionCod) continue
    const mm = p.inversion_mm ?? 0

    if (p.alcance_regional) {
      const bucket = (p.comuna ?? '').trim() !== '' ? alcanceRegional : sinComuna
      bucket.n += 1
      bucket.mm += mm
      continue
    }

    const propios = p.comuna_cods.filter(cut => cutsRegion.has(cut))
    if (propios.length === 0) {
      sinComuna.n += 1
      sinComuna.mm += mm
      continue
    }
    for (const cut of propios) {
      const s = acc.get(cut)!
      s.n += 1
      s.mm += mm
    }
  }

  const nombrePor = new Map(catalogo.map(c => [c.cut, c.nombre]))
  const rows = Array.from(acc.entries())
    .filter(([, s]) => s.n > 0)
    .map(([cut, s]) => ({ cut, nombre: nombrePor.get(cut)!, n: s.n, mm: s.mm }))
    .sort((a, b) => b.n - a.n || b.mm - a.mm || a.nombre.localeCompare(b.nombre, 'es'))

  return { rows, statsByCut: acc, alcanceRegional, sinComuna }
}

/** Formato de inversión de la maqueta: "MM$ 542.235" (miles con punto es-CL). */
export function fmtMM(v: number): string {
  return `MM$ ${Math.round(v).toLocaleString('es-CL')}`
}
