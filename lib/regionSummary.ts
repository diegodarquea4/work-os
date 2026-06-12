/**
 * Helpers puros para resumir el estado de una región.
 *
 * Reusables entre VistaRegional (dashboard completo) y los componentes nuevos
 * del Mapa (MapaSummarySidebar para el default sin región, RegionPreviewPanel
 * para el preview al click). Antes vivía inline en VistaRegional.tsx; al
 * extraerlo evitamos duplicación cuando el Mapa empezó a necesitar la misma
 * lógica para mostrar alertas top-3 y "último hito" por región.
 *
 * Todas las funciones son puras (sin side effects, sin React, sin Supabase).
 * Datos crudos in, primitivos / arrays out.
 */

import type { Iniciativa } from './projects'

// ── Tiempo ────────────────────────────────────────────────────────────────────

/**
 * Días enteros desde un timestamp ISO hasta hoy. null si la entrada es
 * null/undefined. Útil para "hace 4 días" sobre el último seguimiento.
 */
export function diasSinActividad(lastIso: string | null | undefined): number | null {
  if (!lastIso) return null
  return Math.floor((Date.now() - new Date(lastIso).getTime()) / (1000 * 60 * 60 * 24))
}

/**
 * Días hasta una fecha (YYYY-MM-DD). Negativo si la fecha ya pasó. null si
 * la entrada es null/undefined. Usamos timezone local para que "hoy" coincida
 * con la percepción del usuario.
 */
export function diasHastaHito(fechaStr: string | null | undefined): number | null {
  if (!fechaStr) return null
  const hoy = new Date().toLocaleDateString('en-CA')  // YYYY-MM-DD local
  const diff = new Date(fechaStr).getTime() - new Date(hoy).getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// ── Filtros por región ────────────────────────────────────────────────────────

/** Iniciativas de una región específica. */
export function iniciativasDeRegion(cod: string, projects: Iniciativa[]): Iniciativa[] {
  return projects.filter(p => p.cod === cod)
}

// ── Alertas por región ────────────────────────────────────────────────────────

/** Iniciativas con semáforo rojo en la región. */
export function iniciativasEnRojo(cod: string, projects: Iniciativa[]): Iniciativa[] {
  return projects.filter(p => p.cod === cod && p.estado_semaforo === 'rojo')
}

/**
 * Iniciativas con hito próximo (≤ `umbralDias` o vencido), ordenadas por
 * urgencia ascendente (más urgentes primero). Default 7 días — match con
 * la convención de VistaRegional.
 */
export function iniciativasConHitoCritico(
  cod: string,
  projects: Iniciativa[],
  umbralDias = 7,
): Iniciativa[] {
  return projects
    .filter(p => {
      if (p.cod !== cod) return false
      const dias = diasHastaHito(p.fecha_proximo_hito)
      return dias !== null && dias <= umbralDias
    })
    .sort((a, b) =>
      (diasHastaHito(a.fecha_proximo_hito) ?? 999) -
      (diasHastaHito(b.fecha_proximo_hito) ?? 999),
    )
}

/**
 * Iniciativas sin actividad por más de `umbralDias` (default 15). Iniciativas
 * sin actividad registrada (null) cuentan como críticas — el ausente es la
 * señal más fuerte de abandono.
 */
export function iniciativasSinActividad(
  cod: string,
  projects: Iniciativa[],
  actividad: Record<number, string | null>,
  umbralDias = 15,
): Iniciativa[] {
  return projects.filter(p => {
    if (p.cod !== cod) return false
    const dias = diasSinActividad(actividad[p.n])
    return dias === null || dias > umbralDias
  })
}

/**
 * Conteo agregado de alertas críticas por región. Suma de las tres categorías
 * (rojo + hito próximo + sin actividad) — sin deduplicar, porque una misma
 * iniciativa en rojo y sin actividad cuenta como 2 alertas distintas (refleja
 * el peso real del problema).
 */
export function criticalAlertCountFor(
  cod: string,
  projects: Iniciativa[],
  actividad: Record<number, string | null>,
): number {
  return (
    iniciativasEnRojo(cod, projects).length +
    iniciativasConHitoCritico(cod, projects).length +
    iniciativasSinActividad(cod, projects, actividad).length
  )
}

// ── Última señal de vida ──────────────────────────────────────────────────────

/**
 * Días desde la actividad más reciente entre todas las iniciativas de la región.
 * null si NINGUNA iniciativa tiene actividad registrada. Es la "última señal
 * de vida" — el sidebar la muestra como "Último hito: hace N días" porque
 * desde el punto de vista del usuario es lo mismo (el seguimiento marca cuándo
 * se reportó avance).
 */
export function diasDesdeUltimaActividad(
  cod: string,
  projects: Iniciativa[],
  actividad: Record<number, string | null>,
): number | null {
  let masReciente: number | null = null
  for (const p of projects) {
    if (p.cod !== cod) continue
    const ts = actividad[p.n]
    if (!ts) continue
    const t = new Date(ts).getTime()
    if (masReciente === null || t > masReciente) masReciente = t
  }
  if (masReciente === null) return null
  return Math.floor((Date.now() - masReciente) / (1000 * 60 * 60 * 24))
}

/**
 * Última iniciativa con actividad en la región, junto con los días desde el
 * timestamp. Útil para el footer del preview ("Hace 4 días — Vivienda Alto
 * Hospicio"): da cara al "última señal de vida" en vez de solo un número.
 * null si NINGUNA iniciativa de la región tiene actividad registrada.
 */
export function ultimaActividadConIniciativa(
  cod: string,
  projects: Iniciativa[],
  actividad: Record<number, string | null>,
): { iniciativa: Iniciativa; dias: number } | null {
  let masReciente: { iniciativa: Iniciativa; ts: number } | null = null
  for (const p of projects) {
    if (p.cod !== cod) continue
    const ts = actividad[p.n]
    if (!ts) continue
    const t = new Date(ts).getTime()
    if (masReciente === null || t > masReciente.ts) {
      masReciente = { iniciativa: p, ts: t }
    }
  }
  if (!masReciente) return null
  return {
    iniciativa: masReciente.iniciativa,
    dias: Math.floor((Date.now() - masReciente.ts) / (1000 * 60 * 60 * 24)),
  }
}

// ── Breakdown por eje ─────────────────────────────────────────────────────────

export type EjeBreakdown = {
  ejeId:  number
  numero: number
  nombre: string
  total:  number
  avgPct: number
  verde:  number
  ambar:  number
  rojo:   number
  invSum: number
}

/**
 * Breakdown por eje del catálogo `region_ejes` para una región. Iteramos
 * SOBRE el catálogo (no los strings libres) y agregamos las iniciativas
 * matcheadas por `eje_id`. Iniciativas sin eje_id quedan fuera del breakdown.
 *
 * Misma lógica que vivía en VistaRegional:334-365 — extraída para que el
 * preview del Mapa pueda reusarla sin duplicar.
 */
export function ejeBreakdownFor(
  cod: string,
  projects: Iniciativa[],
  regionEjes: Array<{ id: number; numero: number; nombre: string }>,
): EjeBreakdown[] {
  const regionProjects = projects.filter(p => p.cod === cod)
  return regionEjes.map(re => {
    const matching = regionProjects.filter(p => p.eje_id === re.id)
    const total = matching.length
    if (total === 0) {
      return {
        ejeId: re.id, numero: re.numero, nombre: re.nombre,
        total: 0, avgPct: 0, verde: 0, ambar: 0, rojo: 0, invSum: 0,
      }
    }
    const pctSum = matching.reduce((s, p) => s + (p.pct_avance ?? 0), 0)
    const verde  = matching.filter(p => p.estado_semaforo === 'verde').length
    const ambar  = matching.filter(p => p.estado_semaforo === 'ambar').length
    const rojo   = matching.filter(p => p.estado_semaforo === 'rojo').length
    const invSum = matching.reduce((s, p) => s + (p.inversion_mm ?? 0), 0)
    return {
      ejeId: re.id, numero: re.numero, nombre: re.nombre,
      total, avgPct: Math.round(pctSum / total),
      verde, ambar, rojo, invSum,
    }
  })
}

/**
 * Top N ejes por % de avance ASCENDENTE (los que requieren más atención).
 * Filtra ejes con total === 0 (sin iniciativas asignadas — irrelevantes).
 * Usado en el preview del Mapa para mostrar los 3 ejes más rezagados sin
 * abrumar al usuario con el catálogo completo.
 */
export function topEjesPorAtencion(
  breakdown: EjeBreakdown[],
  n = 3,
): EjeBreakdown[] {
  return breakdown
    .filter(e => e.total > 0)
    .sort((a, b) => a.avgPct - b.avgPct)
    .slice(0, n)
}
