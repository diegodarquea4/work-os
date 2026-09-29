/**
 * Lógica pura de la CONSOLA de sesión de los comités (Policial,
 * Infraestructura y Económico): qué muestra el riel izquierdo, en qué orden se
 * recorre la reunión, y qué resume / avisa la pantalla de cierre.
 *
 * Nada de acá toca la red ni React: recibe el estado que `SesionModal` ya
 * carga y devuelve datos para pintar. Por eso se puede probar en vitest sin UI
 * (`__tests__/consolaSesion.test.ts`).
 *
 * Regla de oro (decisión de Diego, 2026-09-08): el cambio a pantalla completa
 * es VISUAL. La numeración de las zonas es la misma que veía el usuario en el
 * modal (1 · 2 · 3 · 4), y el cierre NO agrega bloqueos — solo avisos. Por eso
 * cada comité conserva SU orden: el Económico abre por Integrantes y los otros
 * dos por Compromisos anteriores, tal como venían.
 */

import { tieneValorComite, MESA_EMPLEO_HABILITADA } from './helpers'
import type {
  ComiteMetrica, SesionAsistencia, SesionComiteValor, SesionCompromiso, SesionOficioTratado,
} from '@/lib/types'

export type InstanciaConsola = 'eje' | 'infraestructura' | 'economico'

// ── Zonas y riel ─────────────────────────────────────────────────────────────

export type ZonaKey =
  | 'anteriores' | 'asistencia' | 'reporte' | 'comentarios' | 'iniciativas' | 'nuevos'
  /** Solo Económico: Seguimiento de la inversión (▸ proyectos, oficios, mesa empleo). */
  | 'seguimiento'

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
  // Solo Económico: los dos sub-ítems de «Seguimiento de la inversión».
  // Los oficios se parten en anteriores (los que se verifican, con estado) y
  // nuevos (recién levantados, siempre pendientes por definición).
  proyectos?: number
  oficios?: { anteriores: Pick<SesionOficioTratado, 'estado'>[]; nuevos: number }
  /**
   * Solo Económico: si esta sesión digitó los dos datos de Mesa Empleo (el
   * avance de la meta y el corte de subsidios). Son dos números que se anotan
   * en la reunión, así que la zona está lista cuando ambos existen.
   */
  mesaEmpleo?: { metaDigitada: boolean; subsidiosDigitados: boolean }
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
 * Oficios del Económico. Lo único con criterio de "queda algo por hacer" son
 * los ANTERIORES sin revisar — mismo criterio que los compromisos anteriores.
 * Los nuevos nacen pendientes por definición (son el oficio que se va a
 * despachar), así que suman actividad pero nunca impiden el ✓.
 */
function estadoOficios(anteriores: Pick<SesionOficioTratado, 'estado'>[], nuevos: number): EstadoRail {
  if (anteriores.length === 0 && nuevos === 0) return 'vacio'
  if (anteriores.length > 0 && anteriores.every(o => o.estado !== 'pendiente')) return 'listo'
  return anteriores.some(o => o.estado === 'resuelto') || nuevos > 0 ? 'con-actividad' : 'vacio'
}

/**
 * Zona madre del Económico. ✓ solo cuando hay algo tratado Y no quedan oficios
 * anteriores sin revisar; los proyectos no tienen criterio de completitud, así
 * que por sí solos nunca dan el ✓.
 */
function estadoSeguimiento(proyectos: number, oficiosTotal: number, oficiosPendientes: number): EstadoRail {
  if (proyectos === 0 && oficiosTotal === 0) return 'vacio'
  return oficiosPendientes === 0 ? 'listo' : 'con-actividad'
}

/**
 * Ítems del riel para la instancia. La numeración es la que el usuario ya
 * conocía en el modal — NO se renumera al insertar «Comentarios», y cada
 * comité conserva su propio orden de apertura.
 *
 *   eje:             1 Anteriores · 2 Asistencia · 3 Reporte (▸ instituciones) · (ícono) Comentarios · 4 Nuevos
 *   infraestructura: 1 Anteriores · 2 Asistencia · 3 Iniciativas · 4 Nuevos
 *   economico:       1 Integrantes · 2 Anteriores · 3 Seguimiento (▸ proyectos, oficios, meta mesa empleo) · 4 Nuevos
 */
export function railParaSesion(e: EntradaConsola): RailItem[] {
  // El Económico entra por Integrantes y deja los compromisos anteriores en 2;
  // el Policial verifica primero. Es el orden que cada comité ya tenía en su
  // modal. Infraestructura se pasó al orden del Económico (Manuel, sept 2026):
  // primero se toma asistencia —es lo que abre la sesión de verdad— y recién
  // después se revisa lo comprometido la vez anterior.
  const esEconomico = e.instancia === 'economico'
  const asistenciaPrimero = esEconomico || e.instancia === 'infraestructura'

  const itemAnteriores: RailItem = {
    key: 'anteriores', numero: asistenciaPrimero ? 2 : 1, label: 'Compromisos anteriores',
    badge: String(e.compAnteriores.length),
    estado: estadoAnteriores(e.compAnteriores),
  }
  const itemAsistencia: RailItem = {
    key: 'asistencia', numero: asistenciaPrimero ? 1 : 2, label: esEconomico ? 'Integrantes' : 'Asistencia',
    badge: `${e.asistencia.presentes}/${e.asistencia.total}`,
    estado: e.asistencia.presentes > 0 ? 'con-actividad' : 'vacio',
  }

  const items: RailItem[] = asistenciaPrimero
    ? [itemAsistencia, itemAnteriores]
    : [itemAnteriores, itemAsistencia]

  if (e.instancia === 'economico') {
    const proyectos = e.proyectos ?? 0
    const oficiosAnteriores = e.oficios?.anteriores ?? []
    const oficiosNuevos = e.oficios?.nuevos ?? 0
    const oficiosTotal = oficiosAnteriores.length + oficiosNuevos
    const oficiosPendientes = oficiosAnteriores.filter(o => o.estado === 'pendiente').length

    const me = e.mesaEmpleo
    const digitadosMesa = (me?.metaDigitada ? 1 : 0) + (me?.subsidiosDigitados ? 1 : 0)

    items.push({
      key: 'seguimiento', numero: 3, label: 'Seguimiento de la inversión',
      // Cuántas cosas hay sobre la mesa (proyectos + oficios), mismo criterio
      // que el badge de «Iniciativas contempladas» en Infraestructura. La meta
      // de empleo no suma acá: son dos casilleros que se llenan, no ítems que
      // se agreguen a una agenda.
      badge: String(proyectos + oficiosTotal),
      estado: estadoSeguimiento(proyectos, oficiosTotal, oficiosPendientes),
      subitems: [
        {
          key: 'proyectos', label: 'Proyectos tratados', badge: String(proyectos),
          // Sin criterio de completitud: agregar proyectos es abrir la agenda,
          // no terminarla. Solo distingue vacío de con-actividad.
          estado: proyectos > 0 ? 'con-actividad' : 'vacio',
        },
        {
          key: 'oficios', label: 'Oficios', badge: String(oficiosTotal),
          estado: estadoOficios(oficiosAnteriores, oficiosNuevos),
        },
        // Mesa Empleo entra al riel solo si está habilitada: la card que la
        // renderiza está gateada por la misma constante (SesionModalInversion),
        // así que con el flag apagado este subítem quedaba en el riel llevando
        // a un panel en blanco — y `vecinos()` camina el riel, o sea que
        // "Siguiente" desde Oficios también caía ahí.
        ...(MESA_EMPLEO_HABILITADA ? [{
          key: 'mesa_empleo', label: 'Meta mesa empleo', badge: `${digitadosMesa}/2`,
          // Dos números que se anotan en la reunión: lista con ambos.
          estado: (digitadosMesa === 2 ? 'listo' : digitadosMesa > 0 ? 'con-actividad' : 'vacio') as RailSubitem['estado'],
        }] : []),
      ],
    })
  } else if (e.instancia === 'eje') {
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

/**
 * La llave con que se recuerda una sección visitada. Lleva el sub-ítem porque
 * en el Económico los sub-ítems SON las secciones: «Proyectos tratados» y
 * «Oficios» son dos partes distintas de la reunión, no dos vistas de una.
 */
export function claveZona(ref: ZonaRef): string {
  return `${ref.zona}|${ref.inst ?? ''}`
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
  /** Solo Policial. */
  instituciones: { key: string; label: string; conDato: number; total: number }[]
  /** Solo Infraestructura. */
  iniciativas: number
  /** Solo Económico. */
  proyectos: number
  /** Solo Económico: `pendientes` cuenta anteriores sin resolver. */
  oficios: { total: number; pendientes: number }
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
    proyectos: e.instancia === 'economico' ? (e.proyectos ?? 0) : 0,
    oficios: e.instancia === 'economico'
      ? {
          total: (e.oficios?.anteriores.length ?? 0) + (e.oficios?.nuevos ?? 0),
          pendientes: (e.oficios?.anteriores ?? []).filter(o => o.estado === 'pendiente').length,
        }
      : { total: 0, pendientes: 0 },
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
  } else if (instancia === 'economico') {
    if (r.proyectos === 0) avisos.push('Sin proyectos tratados en profundidad')
    if (r.oficios.pendientes > 0) {
      avisos.push(`${r.oficios.pendientes} ${plural(r.oficios.pendientes, 'oficio sigue pendiente', 'oficios siguen pendientes')}`)
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

// ── Bloqueos del cierre ──────────────────────────────────────────────────────

/**
 * Algo que impide cerrar la sesión, con dónde se arregla.
 *
 * Distinto de `avisosCierreComite`, que solo advierte. Un aviso dice «esto
 * quedó así»; un bloqueo dice «esto no se puede dar por terminado». La
 * diferencia importa: un acta que sella una reunión sin asistencia, o que deja
 * oficios vencidos sin nadie a cargo, documenta que no pasó nada.
 */
export type BloqueoCierre = {
  texto: string
  /** A qué zona mandar para resolverlo. `null` = no hay una sola. */
  ir: ZonaRef | null
}

export type EntradaBloqueos = {
  instancia: InstanciaConsola
  asistencia: { presentes: number; total: number }
  /** Organismos con oficios VENCIDOS y sin compromiso de seguimiento abierto. */
  organismosSinSeguimiento: string[]
  /** Secciones del recorrido que todavía no se abrieron en esta sesión. */
  faltanVisitar: { ref: ZonaRef; label: string }[]
}

/**
 * Qué impide cerrar.
 *
 * ── Por qué solo el Económico ──────────────────────────────────────────────
 *
 * Los tres bloqueos salen de cómo trabaja este comité y de datos que solo él
 * tiene. Policial, Infraestructura y Gabinete siguen cerrando como siempre: no
 * es una decisión sobre ellos, y cambiarles el cierre de rebote sería tomarla
 * sin que nadie la haya pedido.
 *
 * ── Por qué los vencidos y no todo lo pendiente ────────────────────────────
 *
 * Un oficio que todavía no vence es aviso: se mira para que no llegue vencido
 * a la próxima. Exigir un responsable para algo que nadie incumplió todavía
 * convierte el bloqueo en trámite, y un trámite se completa sin leerlo. Los
 * vencidos son los que ya tienen a alguien fallando el plazo.
 */
export function bloqueosCierreComite(e: EntradaBloqueos): BloqueoCierre[] {
  if (e.instancia !== 'economico') return []

  const bloqueos: BloqueoCierre[] = []

  if (e.asistencia.presentes === 0) {
    bloqueos.push({
      texto: 'Nadie quedó registrado como presente',
      ir: { zona: 'asistencia' },
    })
  }

  const n = e.organismosSinSeguimiento.length
  if (n > 0) {
    // Se nombran hasta tres: la lista completa de quince no se lee, y el
    // número sin ningún nombre no dice por dónde empezar.
    const muestra = e.organismosSinSeguimiento.slice(0, 3).join(', ')
    const resto = n > 3 ? ` y ${n - 3} más` : ''
    bloqueos.push({
      texto: n === 1
        ? `${muestra} tiene oficios vencidos y nadie a cargo del seguimiento`
        : `${n} organismos con oficios vencidos y nadie a cargo: ${muestra}${resto}`,
      ir: { zona: 'nuevos' },
    })
  }

  if (e.faltanVisitar.length > 0) {
    const labels = e.faltanVisitar.slice(0, 3).map(f => f.label).join(', ')
    const resto = e.faltanVisitar.length > 3 ? ` y ${e.faltanVisitar.length - 3} más` : ''
    bloqueos.push({
      texto: `Falta pasar por ${labels}${resto}`,
      ir: e.faltanVisitar[0].ref,
    })
  }

  return bloqueos
}
