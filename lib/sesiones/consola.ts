/**
 * Lógica pura de la CONSOLA de sesión de los comités (Policial e
 * Infraestructura): qué muestra el riel izquierdo, en qué orden se recorre la
 * reunión, y qué resume / avisa la pantalla de cierre.
 *
 * Nada de acá toca la red ni React: recibe el estado que `SesionModal` ya
 * carga y devuelve datos para pintar. Por eso se puede probar en vitest sin UI
 * (`__tests__/consolaSesion.test.ts`).
 *
 * Regla de oro (decisión de Diego, 2026-09-08): el cambio a pantalla completa
 * es VISUAL. La numeración de las zonas es la misma que veía el usuario en el
 * modal (1 · 2 · 3 · 4), y el cierre NO agrega bloqueos — solo avisos.
 */

import { tieneValorComite } from './helpers'
import type { ComiteMetrica, SesionAsistencia, SesionComiteValor, SesionCompromiso } from '@/lib/types'

export type InstanciaConsola = 'eje' | 'infraestructura'

// ── Zonas y riel ─────────────────────────────────────────────────────────────

export type ZonaKey = 'anteriores' | 'asistencia' | 'reporte' | 'comentarios' | 'iniciativas' | 'nuevos'

/** Dónde está parado el usuario. `inst` solo tiene sentido con zona='reporte'. */
export type ZonaRef = { zona: ZonaKey; inst?: string }

/**
 * Señal del riel, calcada del gabinete: ✓ verde si la zona quedó completa,
 * punto violeta si tiene algo registrado, nada si está vacía.
 */
export type EstadoRail = 'listo' | 'con-actividad' | 'vacio'

export type RailSubitem = { key: string; label: string; badge?: string; estado: EstadoRail }

export type RailItem = {
  key: ZonaKey
  /** Número visible (1..4). `null` en los ítems que hoy no llevan número. */
  numero: number | null
  icono?: 'comentarios'
  label: string
  badge?: string
  estado: EstadoRail
  /** Solo 'reporte': una entrada por institución de la región, en su orden. */
  subitems?: RailSubitem[]
}

/** Botones de estado de un compromiso anterior (sala y cierre los comparten). */
export const ESTADO_COMPROMISO = {
  pendiente: { label: 'Pendiente', on: 'bg-gray-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  en_curso:  { label: 'En curso',  on: 'bg-blue-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  cumplido:  { label: 'Cumplido',  on: 'bg-green-600 text-white',  off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
} as const

/**
 * Lo que el riel y el cierre necesitan saber de la sesión. Son `Pick`s a
 * propósito: la consola pasa sus arreglos completos y los tests arman
 * objetos mínimos.
 */
export type EntradaConsola = {
  instancia: InstanciaConsola
  compAnteriores: Pick<SesionCompromiso, 'estado'>[]
  asistencia: { presentes: number; total: number }
  compNuevos: Pick<SesionCompromiso, 'escalado_a_gabinete'>[]
  // Solo Policial ('eje')
  instituciones?: { key: string; label: string }[]
  catalogo?: Pick<ComiteMetrica, 'id' | 'institucion' | 'activo'>[]
  valores?: SesionComiteValor[]
  comentarios?: string | null
  // Solo Infraestructura
  iniciativas?: number
}

/**
 * Presentes / total de la zona de asistencia. Misma cuenta que hacía el modal:
 * presentes = filas marcadas (nómina o invitado); total = nómina activa +
 * invitados agregados a esta sesión.
 */
export function resumenAsistencia(
  nomina: { id: number }[],
  asistencia: Pick<SesionAsistencia, 'nomina_id' | 'presente'>[],
): { presentes: number; total: number } {
  const invitados = asistencia.filter(a => a.nomina_id === null).length
  const presentes = asistencia.filter(a => a.presente).length
  return { presentes, total: nomina.length + invitados }
}

function estadoPorConteo(conDato: number, total: number): EstadoRail {
  if (total > 0 && conDato === total) return 'listo'
  return conDato > 0 ? 'con-actividad' : 'vacio'
}

/** Métricas activas de una institución y cuántas tienen algún dato esta sesión. */
function conteoInstitucion(
  key: string,
  catalogo: Pick<ComiteMetrica, 'id' | 'institucion' | 'activo'>[],
  porMetrica: Map<number, SesionComiteValor>,
): { conDato: number; total: number } {
  const activas = catalogo.filter(m => m.institucion === key && m.activo)
  const conDato = activas.filter(m => tieneValorComite(porMetrica.get(m.id) ?? null)).length
  return { conDato, total: activas.length }
}

function estadoAnteriores(comps: Pick<SesionCompromiso, 'estado'>[]): EstadoRail {
  if (comps.length === 0) return 'vacio'
  // Todos revisados (ninguno sigue en "pendiente") = zona lista.
  if (comps.every(c => c.estado !== 'pendiente')) return 'listo'
  return comps.some(c => c.estado === 'cumplido' || c.estado === 'en_curso') ? 'con-actividad' : 'vacio'
}

/**
 * Ítems del riel para la instancia. La numeración es la que el usuario ya
 * conocía en el modal — NO se renumera al insertar «Comentarios».
 *
 *   eje:             1 Anteriores · 2 Asistencia · 3 Reporte (▸ instituciones) · (ícono) Comentarios · 4 Nuevos
 *   infraestructura: 1 Anteriores · 2 Asistencia · 3 Iniciativas · 4 Nuevos
 */
export function railParaSesion(e: EntradaConsola): RailItem[] {
  const items: RailItem[] = [
    {
      key: 'anteriores', numero: 1, label: 'Compromisos anteriores',
      badge: String(e.compAnteriores.length),
      estado: estadoAnteriores(e.compAnteriores),
    },
    {
      key: 'asistencia', numero: 2, label: 'Asistencia',
      badge: `${e.asistencia.presentes}/${e.asistencia.total}`,
      estado: e.asistencia.presentes > 0 ? 'con-actividad' : 'vacio',
    },
  ]

  if (e.instancia === 'eje') {
    const catalogo = e.catalogo ?? []
    const porMetrica = new Map((e.valores ?? []).map(v => [v.metrica_id, v]))
    const conteos = (e.instituciones ?? []).map(inst => ({ inst, ...conteoInstitucion(inst.key, catalogo, porMetrica) }))
    const subitems: RailSubitem[] = conteos.map(c => ({
      key: c.inst.key, label: c.inst.label, badge: `${c.conDato}/${c.total}`, estado: estadoPorConteo(c.conDato, c.total),
    }))
    const conDato = conteos.reduce((n, c) => n + c.conDato, 0)
    const total   = conteos.reduce((n, c) => n + c.total, 0)
    // Una institución sin métricas (0/0) no puede impedir el ✓ del reporte.
    const conMetricas = conteos.filter(c => c.total > 0)
    items.push({
      key: 'reporte', numero: 3, label: 'Reporte por institución',
      badge: `${conDato}/${total}`,
      estado: conMetricas.length > 0 && conMetricas.every(c => c.conDato === c.total)
        ? 'listo'
        : conDato > 0 ? 'con-actividad' : 'vacio',
      subitems,
    })
    items.push({
      key: 'comentarios', numero: null, icono: 'comentarios', label: 'Comentarios de la reunión',
      estado: e.comentarios?.trim() ? 'con-actividad' : 'vacio',
    })
  } else {
    const n = e.iniciativas ?? 0
    items.push({
      key: 'iniciativas', numero: 3, label: 'Iniciativas contempladas',
      badge: String(n),
      estado: n > 0 ? 'con-actividad' : 'vacio',
    })
  }

  items.push({
    key: 'nuevos', numero: 4, label: 'Compromisos nuevos',
    badge: String(e.compNuevos.length),
    estado: e.compNuevos.length > 0 ? 'con-actividad' : 'vacio',
  })

  return items
}

export function mismaZona(a: ZonaRef, b: ZonaRef): boolean {
  return a.zona === b.zona && (a.inst ?? null) === (b.inst ?? null)
}

/**
 * El recorrido de la reunión, aplanado: donde hay sub-ítems se entra a cada
 * institución (no al padre). Es lo que siguen los botones ← Anterior /
 * Siguiente → al pie de cada zona.
 */
export function ordenRecorrido(items: RailItem[]): ZonaRef[] {
  return items.flatMap(it =>
    it.subitems && it.subitems.length > 0
      ? it.subitems.map(s => ({ zona: it.key, inst: s.key }))
      : [{ zona: it.key }],
  )
}

/**
 * Vecinos de la zona actual en el recorrido. Si `actual` es el padre de una
 * zona con sub-ítems (p. ej. {zona:'reporte'} sin institución), se toma como
 * su primer sub-ítem.
 */
export function vecinos(items: RailItem[], actual: ZonaRef): { anterior: ZonaRef | null; siguiente: ZonaRef | null } {
  const orden = ordenRecorrido(items)
  let idx = orden.findIndex(r => mismaZona(r, actual))
  if (idx === -1) idx = orden.findIndex(r => r.zona === actual.zona)
  if (idx === -1) return { anterior: null, siguiente: null }
  return {
    anterior:  idx > 0 ? orden[idx - 1] : null,
    siguiente: idx < orden.length - 1 ? orden[idx + 1] : null,
  }
}

/** Texto para los botones de navegación: «Asistencia», «Reporte · PDI». */
export function etiquetaZona(items: RailItem[], ref: ZonaRef): string {
  const it = items.find(i => i.key === ref.zona)
  if (!it) return ''
  const sub = ref.inst ? it.subitems?.find(s => s.key === ref.inst) : undefined
  return sub ? `${it.label.split(' ')[0]} · ${sub.label}` : it.label
}

// ── Cierre ───────────────────────────────────────────────────────────────────

export type ResumenCierreComite = {
  anteriores: { total: number; cumplidos: number; enCurso: number; pendientes: number }
  /** Vacío en infraestructura. */
  instituciones: { key: string; label: string; conDato: number; total: number }[]
  /** 0 en el Policial. */
  iniciativas: number
  nuevos: { total: number; escalados: number }
  asistencia: { presentes: number; total: number }
}

/** Los números que revisa la pantalla de cierre. Solo cuenta; no decide nada. */
export function resumenCierreComite(e: EntradaConsola): ResumenCierreComite {
  const porMetrica = new Map((e.valores ?? []).map(v => [v.metrica_id, v]))
  return {
    anteriores: {
      total:      e.compAnteriores.length,
      cumplidos:  e.compAnteriores.filter(c => c.estado === 'cumplido').length,
      enCurso:    e.compAnteriores.filter(c => c.estado === 'en_curso').length,
      pendientes: e.compAnteriores.filter(c => c.estado === 'pendiente').length,
    },
    instituciones: e.instancia === 'eje'
      ? (e.instituciones ?? []).map(inst => ({ key: inst.key, label: inst.label, ...conteoInstitucion(inst.key, e.catalogo ?? [], porMetrica) }))
      : [],
    iniciativas: e.instancia === 'infraestructura' ? (e.iniciativas ?? 0) : 0,
    nuevos: {
      total:     e.compNuevos.length,
      escalados: e.compNuevos.filter(c => c.escalado_a_gabinete).length,
    },
    asistencia: e.asistencia,
  }
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

/**
 * Avisos ámbar del cierre. SOLO texto: esta función no bloquea nada, y el
 * módulo no exporta ningún «puedeGenerar». Si alguien quiere cerrar con el
 * reporte vacío, puede — igual que hoy.
 */
export function avisosCierreComite(r: ResumenCierreComite, instancia: InstanciaConsola): string[] {
  const avisos: string[] = []

  if (instancia === 'eje') {
    const conMetricas = r.instituciones.filter(i => i.total > 0)
    const vacias = conMetricas.filter(i => i.conDato === 0)
    if (conMetricas.length > 0 && vacias.length === conMetricas.length) {
      avisos.push('No se registró ningún dato en el reporte por institución')
    } else {
      for (const i of vacias) avisos.push(`${i.label} sin datos esta semana`)
    }
  } else if (r.iniciativas === 0) {
    avisos.push('Sin iniciativas en la agenda')
  }

  const abiertos = r.anteriores.pendientes + r.anteriores.enCurso
  if (abiertos > 0) {
    avisos.push(`${abiertos} ${plural(abiertos, 'compromiso anterior sigue pendiente', 'compromisos anteriores siguen pendientes')}`)
  }

  if (r.asistencia.presentes === 0) avisos.push('Sin asistencia registrada')

  return avisos
}
