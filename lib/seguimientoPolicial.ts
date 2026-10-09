/**
 * Seguimiento de las métricas del Comité Policial: lo que cada región reporta
 * por institución en sus sesiones cerradas, sesión a sesión. Puro, testeado en
 * `__tests__/seguimientoPolicial.test.ts`; lo dibuja
 * `components/metricas/SeguimientoPolicial.tsx`.
 *
 * ── Qué se compara entre regiones ───────────────────────────────────────────
 *
 * Las métricas ESTÁNDAR (catálogo nacional, mig 079). Una métrica regional
 * cuenta como estándar si está vinculada (`estandar_id`) o si se llama igual
 * que una del catálogo en la misma institución: Valparaíso, la región que más
 * reporta, cargó las 24 con el nombre del catálogo y sin vínculo (medido el
 * 2026-10-08: 96 valores vinculados, 158 más solo por nombre). Lo demás son
 * métricas PROPIAS de la región y se ven solo en su vista.
 */

export type MetricaEstandar = { id: number; institucion: string; nombre: string; unidad: string | null; orden: number }
export type MetricaRegional = {
  id: number; region_cod: string; institucion: string; nombre: string; unidad: string | null
  tipo: string; estandar_id: number | null
}
export type SesionCerrada = { id: number; region_cod: string; fecha: string }
export type ValorReportado = { sesion_id: number; metrica_id: number; valor_num: number | null }

/** [fecha de la sesión (YYYY-MM-DD), valor reportado]. */
export type Punto = [string, number]
export type MetricaPropia = { clave: string; institucion: string; nombre: string; unidad: string | null; pts: Punto[] }

export type SeriesPolicial = {
  /** serie[region][id de la métrica estándar] = puntos en orden de fecha. */
  serie: Record<string, Record<number, Punto[]>>
  /** Las métricas que son solo de la región, con sus puntos. */
  propias: Record<string, MetricaPropia[]>
}

/** Orden en que se leen las instituciones; las que no están acá van después. */
export const INSTITUCIONES = ['carabineros', 'pdi', 'gendarmeria', 'armada']

const NOMBRE_INSTITUCION: Record<string, string> = {
  carabineros: 'Carabineros', pdi: 'PDI', gendarmeria: 'Gendarmería', armada: 'Armada',
}
export function nombreInstitucion(clave: string): string {
  return NOMBRE_INSTITUCION[clave] ?? (clave.charAt(0).toUpperCase() + clave.slice(1).replace(/_/g, ' '))
}

/** Nombres del catálogo que no caben en el encabezado de una columna. */
const CORTOS: Record<string, string> = {
  'Detenidos durante la última semana': 'Detenidos',
  'Total de controles de identidad': 'Controles de identidad',
  'Total de controles vehiculares': 'Controles vehiculares',
  'Armas de fuego decomisadas': 'Armas de fuego',
  'Homicidios (año a la fecha) vs 2025': 'Homicidios (año)',
  'Variación de DMCS': 'Variación DMCS',
  'Total controles migratorios': 'Controles migratorios',
  'Ingresos al sistema carcelario (semana)': 'Ingresos',
  'Población extranjera recluida': 'Extranjeros recluidos',
  'Incautación de celulares': 'Celulares',
  'Incautación de armas cortopunzantes': 'Armas cortopunzantes',
  'Patrullajes (semana)': 'Patrullajes',
}
export const nombreCorto = (nombre: string) => CORTOS[nombre] ?? nombre

/** Para comparar nombres: sin tildes, mayúsculas ni signos. */
export function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Ordena por fecha; si una región cerró dos sesiones el mismo día, queda el último valor. */
function porFecha(pts: Punto[]): Punto[] {
  const m = new Map<string, number>()
  for (const [f, v] of [...pts].sort((a, b) => a[0].localeCompare(b[0]))) m.set(f, v)
  return [...m.entries()]
}

/**
 * Arma las series desde las filas crudas. Solo entran valores numéricos de las
 * sesiones que se pasan (el llamador ya dejó solo las cerradas).
 */
export function armarSeries(
  estandar: MetricaEstandar[], metricas: MetricaRegional[], sesiones: SesionCerrada[], valores: ValorReportado[],
): SeriesPolicial {
  const porId = new Map(estandar.map(e => [e.id, e]))
  const porNombre = new Map(estandar.map(e => [`${e.institucion}|${normalizarNombre(e.nombre)}`, e]))
  const metrica = new Map(metricas.map(m => [m.id, m]))
  const sesion = new Map(sesiones.map(s => [s.id, s]))
  const estandarDe = (m: MetricaRegional) =>
    (m.estandar_id != null ? porId.get(m.estandar_id) : undefined)
    ?? porNombre.get(`${m.institucion}|${normalizarNombre(m.nombre)}`)

  const serie: SeriesPolicial['serie'] = {}
  const propias: Record<string, Map<number, MetricaPropia>> = {}
  for (const v of valores) {
    const s = sesion.get(v.sesion_id), m = metrica.get(v.metrica_id)
    if (!s || !m || v.valor_num == null) continue
    const e = estandarDe(m)
    if (e) {
      ((serie[s.region_cod] ??= {})[e.id] ??= []).push([s.fecha, Number(v.valor_num)])
    } else {
      const mapa = (propias[s.region_cod] ??= new Map())
      const p = mapa.get(m.id) ?? { clave: `p${m.id}`, institucion: m.institucion, nombre: m.nombre, unidad: m.unidad, pts: [] }
      p.pts.push([s.fecha, Number(v.valor_num)])
      mapa.set(m.id, p)
    }
  }
  for (const r of Object.values(serie)) for (const k of Object.keys(r)) r[+k] = porFecha(r[+k])
  return {
    serie,
    propias: Object.fromEntries(Object.entries(propias).map(([r, m]) => [r, [...m.values()].map(p => ({ ...p, pts: porFecha(p.pts) }))])),
  }
}

export const ultimoPunto = (pts: Punto[]): Punto | null => pts.length ? pts[pts.length - 1] : null

/** El último reporte contra el anterior. `pct` es null si el anterior fue 0. */
export function diferencia(pts: Punto[]): { abs: number; pct: number | null } | null {
  if (pts.length < 2) return null
  const a = pts[pts.length - 2][1], b = pts[pts.length - 1][1]
  return { abs: b - a, pct: a ? ((b - a) / Math.abs(a)) * 100 : null }
}

/**
 * Marcas redondas para un eje: 0, 250, 500… y no 0, 231, 462… Devuelve desde
 * la marca bajo `min` hasta la marca sobre `max`, así el primer y el último
 * valor del arreglo son los extremos del eje.
 */
export function marcasDelEje(min: number, max: number, cuantas = 5): number[] {
  if (min === max) max = min + 1
  const bruto = (max - min) / cuantas
  const magnitud = 10 ** Math.floor(Math.log10(bruto))
  const f = bruto / magnitud
  const paso = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * magnitud
  const out: number[] = []
  for (let v = Math.floor(min / paso) * paso; v <= Math.ceil(max / paso) * paso + paso / 2; v += paso) out.push(+v.toFixed(8))
  return out
}

/** Días entre dos fechas YYYY-MM-DD. */
export function diasEntreFechas(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5)
}

/** Días sin sesionar a partir de los cuales una región se marca en rojo. */
export const DIAS_SIN_SESIONAR = 15

export type ResumenRegion = {
  region: string
  sesiones: number
  ultimoComite: string | null
  /** Días desde el último comité; null si nunca cerró una sesión. */
  dias: number | null
  /** Métricas estándar con al menos un reporte. */
  estandar: number
  propias: number
}

export function resumirRegion(region: string, sesiones: SesionCerrada[], series: SeriesPolicial, hoy: string): ResumenRegion {
  const suyas = sesiones.filter(s => s.region_cod === region)
  const ultimoComite = suyas.map(s => s.fecha).sort().pop() ?? null
  return {
    region,
    sesiones: suyas.length,
    ultimoComite,
    dias: ultimoComite ? diasEntreFechas(ultimoComite, hoy) : null,
    estandar: Object.values(series.serie[region] ?? {}).filter(p => p.length).length,
    propias: (series.propias[region] ?? []).length,
  }
}
