/**
 * Calendarización de las sesiones de los comités (mig 123). Puro, testeado en
 * `__tests__/calendarioSesiones.test.ts`.
 *
 * Una sesión vive así: programada → abierta (borrador) → realizada (cerrada).
 * «No realizada» no se guarda: es una programada cuya fecha pasó sin abrirse,
 * y se deriva acá contra el día de hoy en Chile. Una anulada no se muestra.
 */

export type EstadoGuardado = 'programada' | 'borrador' | 'cerrada' | 'anulada'
export type EstadoAgenda = 'programada' | 'abierta' | 'realizada' | 'noRealizada' | 'anulada'
export type TipoAgenda = 'ordinaria' | 'extraordinaria' | 'registrada'

export type SesionAgenda = {
  id: number
  region_cod: string
  instancia: string
  eje_id: number | null
  fecha: string
  lugar: string | null
  estado: EstadoGuardado
  /** null = anterior a la calendarización. */
  agenda: TipoAgenda | null
  fecha_original: string | null
  motivo_cambio: string | null
  acta_path: string | null
}

export const COLUMNAS_AGENDA = 'id, region_cod, instancia, eje_id, fecha, lugar, estado, agenda, fecha_original, motivo_cambio, acta_path'

export const ETIQUETA_ESTADO: Record<EstadoAgenda, string> = {
  programada: 'Programada',
  abierta: 'Abierta',
  realizada: 'Realizada',
  noRealizada: 'No realizada',
  anulada: 'Anulada',
}

export function estadoAgenda(s: Pick<SesionAgenda, 'estado' | 'fecha'>, hoy: string): EstadoAgenda {
  switch (s.estado) {
    case 'cerrada': return 'realizada'
    case 'borrador': return 'abierta'
    case 'anulada': return 'anulada'
    default: return s.fecha < hoy ? 'noRealizada' : 'programada'
  }
}

// ── Fechas (YYYY-MM-DD, a mediodía UTC para no cruzar de día) ────────────────

const aFecha = (s: string) => new Date(s + 'T12:00:00Z')
const aTexto = (d: Date) => d.toISOString().slice(0, 10)
export const sumarDias = (s: string, n: number) => { const d = aFecha(s); d.setUTCDate(d.getUTCDate() + n); return aTexto(d) }
export const diaSemana = (s: string) => aFecha(s).getUTCDay()
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 864e5)

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic']
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «lun 13-oct». */
export const fechaCorta = (s: string) => `${DIAS_CORTOS[diaSemana(s)]} ${+s.slice(8)}-${MESES_CORTOS[+s.slice(5, 7) - 1]}`
/** «lunes 13 de octubre». */
export const fechaLarga = (s: string) => `${DIAS[diaSemana(s)]} ${+s.slice(8)} de ${MESES[+s.slice(5, 7) - 1]}`

/**
 * Feriados nacionales de Chile. Solo sacan fechas de la propuesta de una serie
 * recurrente (se pueden volver a marcar), así que uno que falte no rompe nada.
 * Hay que sumar los de cada año.
 */
export const FERIADOS: Record<string, string> = {
  '2026-10-12': 'Encuentro de Dos Mundos', '2026-10-31': 'Iglesias Evangélicas', '2026-11-01': 'Todos los Santos',
  '2026-12-08': 'Inmaculada Concepción', '2026-12-25': 'Navidad',
  '2027-01-01': 'Año Nuevo', '2027-03-26': 'Viernes Santo', '2027-03-27': 'Sábado Santo', '2027-05-01': 'Día del Trabajo',
  '2027-05-21': 'Glorias Navales', '2027-07-16': 'Virgen del Carmen', '2027-08-15': 'Asunción de la Virgen',
  '2027-09-18': 'Independencia', '2027-09-19': 'Glorias del Ejército', '2027-11-01': 'Todos los Santos',
  '2027-12-08': 'Inmaculada Concepción', '2027-12-25': 'Navidad',
}

// ── Recurrencia ─────────────────────────────────────────────────────────────

export type Frecuencia = 'semanal' | 'quincenal' | 'mensual'

/** Qué semana del mes es la fecha: 1..4, o 'ultima' si es el quinto. */
function semanaDelMes(s: string): number | 'ultima' {
  const n = Math.ceil(+s.slice(8) / 7)
  return n >= 5 ? 'ultima' : n
}

/** El n-ésimo `dow` del mes (n = 1..4 o 'ultima'). */
function enesimoDelMes(anio: number, mes: number, n: number | 'ultima', dow: number): string {
  if (n === 'ultima') {
    const d = new Date(Date.UTC(anio, mes + 1, 0, 12))
    while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() - 1)
    return aTexto(d)
  }
  const d = new Date(Date.UTC(anio, mes, 1, 12))
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCDate(d.getUTCDate() + 7 * (n - 1))
  return aTexto(d)
}

/**
 * Las fechas de una serie desde `desde` (incluida) hasta `hasta`. Mensual =
 * el mismo «n-ésimo día de la semana» que `desde` (2º lunes, último viernes…),
 * que es como se acuerdan los comités; «el 13 de cada mes» caería en fin de
 * semana la mitad de las veces.
 */
export function fechasRecurrentes(desde: string, hasta: string, frecuencia: Frecuencia, tope = 60): string[] {
  if (!desde || !hasta || hasta < desde) return []
  const out: string[] = []
  if (frecuencia === 'mensual') {
    const n = semanaDelMes(desde), dow = diaSemana(desde)
    let anio = +desde.slice(0, 4), mes = +desde.slice(5, 7) - 1
    for (let i = 0; i < tope; i++) {
      const f = enesimoDelMes(anio, mes, n, dow)
      if (f > hasta) break
      if (f >= desde) out.push(f)
      if (++mes > 11) { mes = 0; anio++ }
    }
    return out
  }
  const paso = frecuencia === 'semanal' ? 7 : 14
  for (let f = desde; f <= hasta && out.length < tope; f = sumarDias(f, paso)) out.push(f)
  return out
}

const ORDINAL = ['', '1er', '2º', '3er', '4º']
export function describirFrecuencia(desde: string, frecuencia: Frecuencia): string {
  const dia = DIAS[diaSemana(desde)]
  if (frecuencia === 'semanal') return `Cada semana, los ${dia}`
  if (frecuencia === 'quincenal') return `Cada 2 semanas, los ${dia}`
  const n = semanaDelMes(desde)
  return `Cada mes, el ${n === 'ultima' ? 'último' : ORDINAL[n]} ${dia}`
}

// ── Medición ────────────────────────────────────────────────────────────────

export type Medicion = {
  /** Abiertas o cerradas con fecha en el rango. */
  iniciadas: number
  /** Cerradas con fecha en el rango. */
  terminadas: number
  /** Ordinarias con fecha ya pasada (sin anuladas): la base del cumplimiento. */
  programadasVencidas: number
  realizadasATiempo: number
  /** realizadasATiempo / programadasVencidas; null si no hay base. */
  cumplimiento: number | null
  abiertas: number
  noRealizadas: number
}

/**
 * Cumplimiento = de las ordinarias cuya fecha ya pasó, cuántas se cerraron.
 * Extraordinarias, registradas después y lo anterior al calendario cuentan
 * como iniciadas y terminadas, pero no entran al cumplimiento: no estaban
 * comprometidas.
 */
export function medirCalendario(
  sesiones: Pick<SesionAgenda, 'estado' | 'fecha' | 'agenda'>[],
  hoy: string,
  rango?: { desde: string; hasta: string },
): Medicion {
  const enRango = (f: string) => !rango || (f >= rango.desde && f <= rango.hasta)
  let iniciadas = 0, terminadas = 0, base = 0, hechas = 0, abiertas = 0, noRealizadas = 0
  for (const s of sesiones) {
    if (!enRango(s.fecha)) continue
    const e = estadoAgenda(s, hoy)
    if (e === 'abierta' || e === 'realizada') iniciadas++
    if (e === 'realizada') terminadas++
    if (e === 'abierta') abiertas++
    if (e === 'noRealizada') noRealizadas++
    if (s.agenda === 'ordinaria' && e !== 'anulada' && s.fecha < hoy) {
      base++
      if (e === 'realizada') hechas++
    }
  }
  return {
    iniciadas, terminadas, programadasVencidas: base, realizadasATiempo: hechas,
    cumplimiento: base ? hechas / base : null, abiertas, noRealizadas,
  }
}

/** Máximo de sesiones abiertas a la vez por comité (mig 123, trigger). */
export const MAX_ABIERTAS = 2
