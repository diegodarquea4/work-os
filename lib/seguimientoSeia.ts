/**
 * Seguimiento de la inversión en el SEIA — la lógica del tablero de Métricas
 * (módulo «Comité Económico Regional»). Puro y sin red: lo testea
 * `__tests__/seguimientoSeia.test.ts` y lo consume
 * `components/metricas/SeguimientoInversionSeia.tsx`.
 *
 * ── El foco es el atraso ───────────────────────────────────────────────────
 *
 * Que un pronunciamiento esté pendiente no tiene nada de malo: es el trámite
 * normal. Lo grave es que se venza. Por eso un oficio entra al tablero solo si
 * está VENCIDO o PENDIENTE —le faltan a lo más 15 días—; los que tienen más
 * holgura todavía no son tema y quedan fuera.
 *
 * ── Fuera del análisis: más de un año de atraso ────────────────────────────
 *
 * Un oficio con más de un año vencido casi siempre es un expediente detenido,
 * no un organismo que no contesta (el caso que lo motivó: un oficio de 2022 al
 * GORE de Tarapacá que, solo, subía el atraso promedio de la región a 400
 * días). Se excluye de TODO —conteos, promedios, gestionados—, no solo del
 * promedio: si contara en un lado y no en otro, las columnas no cuadrarían
 * entre sí.
 */

import { REGIONS } from './regions'

// ── Constantes ───────────────────────────────────────────────────────────────

/** Días que le pueden faltar a un oficio para contar como «pendiente». */
export const DIAS_PENDIENTE = 15
/** Más atraso que esto y el oficio sale del análisis. */
export const ATRASO_MAXIMO_DIAS = 365
/** Sin sesión en este plazo, la región cuenta como «sin sesionar». */
export const DIAS_SIN_SESIONAR = 15

export const COD_REGIONES = REGIONS.map(r => r.cod)

/** Filas de la matriz nacional: Nacional, las 16 de norte a sur, Interregional. */
export type FilaMatriz = string // 'NAC' | 'INTER' | código de región
export const FILAS_MATRIZ: FilaMatriz[] = ['NAC', ...COD_REGIONES, 'INTER']

export function nombreFila(f: FilaMatriz): string {
  if (f === 'NAC') return 'Nacional'
  if (f === 'INTER') return 'Interregional'
  return REGIONS.find(r => r.cod === f)?.nombre ?? f
}

/**
 * Columnas de la matriz: la clave es el `ministerio` tal como lo guarda el
 * scraper; `corto` va en el encabezado y `largo` en los títulos.
 */
export const MINISTERIOS: { clave: string; corto: string; largo: string }[] = [
  { clave: 'Agricultura',          corto: 'Agricultura',       largo: 'Agricultura' },
  { clave: 'Bienes',               corto: 'BN',                largo: 'Bienes Nacionales' },
  { clave: 'Culturas',             corto: 'Culturas',          largo: 'Culturas' },
  { clave: 'Defensa',              corto: 'Defensa',           largo: 'Defensa' },
  { clave: 'Desarrollo Social',    corto: 'Desarrollo Social', largo: 'Desarrollo Social' },
  { clave: 'Economía',             corto: 'Economía',          largo: 'Economía' },
  { clave: 'Energía',              corto: 'Energía',           largo: 'Energía' },
  { clave: 'GORE',                 corto: 'GORE',              largo: 'Gobierno Regional' },
  { clave: 'Independientes',       corto: 'Independiente',     largo: 'Independientes' },
  { clave: 'Medio Ambiente',       corto: 'MA',                largo: 'Medio Ambiente' },
  { clave: 'Minería',              corto: 'Minería',           largo: 'Minería' },
  { clave: 'MOP',                  corto: 'MOP',               largo: 'Obras Públicas' },
  { clave: 'Salud',                corto: 'Salud',             largo: 'Salud' },
  { clave: 'Transportes',          corto: 'TyT',               largo: 'Transportes y Telecomunicaciones' },
  { clave: 'Vivienda y Urbanismo', corto: 'Vivienda',          largo: 'Vivienda y Urbanismo' },
]
const POR_CLAVE = new Map(MINISTERIOS.map(m => [m.clave, m]))
export const ministerioCorto = (k: string) => POR_CLAVE.get(k)?.corto ?? k
export const ministerioLargo = (k: string) => POR_CLAVE.get(k)?.largo ?? k

// ── Fechas (días calendario, ISO 'YYYY-MM-DD') ───────────────────────────────

const T = (s: string) => Date.parse(`${s}T12:00:00Z`)
/** `b − a` en días. Positivo si `b` es posterior. */
export const diasEntre = (a: string, b: string) => Math.round((T(b) - T(a)) / 86_400_000)
export const sumarDias = (s: string, n: number) => new Date(T(s) + n * 86_400_000).toISOString().slice(0, 10)

// ── A qué fila de la matriz va cada organismo ────────────────────────────────

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Palabras que delatan la región en el nombre del organismo (sin tildes). */
const CLAVES_REGION: [string, string[]][] = [
  ['XV', ['arica']], ['I', ['tarapaca']], ['II', ['antofagasta']], ['III', ['atacama']],
  ['IV', ['coquimbo']], ['V', ['valparaiso']], ['RM', ['metropolitana', ', rm']], ['VI', ['higgins']],
  ['VII', ['maule']], ['XVI', ['nuble']], ['VIII', ['biobio', 'bio bio', 'bio-bio']], ['IX', ['araucania']],
  ['XIV', ['los rios']], ['X', ['los lagos']], ['XI', ['aysen', 'aisen']], ['XII', ['magallanes']],
]

/**
 * La fila de un organismo:
 *  - un municipio va a la región de su proyecto (y su columna es Independiente);
 *  - uno zonal —cubre varias regiones— es «Interregional»;
 *  - uno que nombra una región va a esa región;
 *  - uno regional que no la nombra («Secretaría Regional Ministerial de
 *    Minería»), a la región del proyecto;
 *  - el resto es nivel central: «Nacional».
 *
 * El municipio va primero porque «Ilustre Municipalidad de Arica» nombra una
 * región sin ser de esa región por eso — es de la suya.
 */
export function filaDeOrganismo(organismo: string, regionProyecto: string): FilaMatriz {
  const n = normalizar(organismo)
  if (/municipalidad/.test(n)) return regionProyecto
  if (/zona (central|centro|sur|norte|austral)|subdireccion nacional/.test(n)) return 'INTER'
  for (const [cod, claves] of CLAVES_REGION) if (claves.some(k => n.includes(k))) return cod
  if (/regional|seremi|secretaria regional/.test(n)) return regionProyecto
  return 'NAC'
}

// ── Oficios ──────────────────────────────────────────────────────────────────

/** Lo que trae la base (`sesion_oficios_tratados`, automáticos). */
export type OficioFila = {
  id: number
  id_expediente: number | null
  nombre_proyecto: string | null
  ministerio: string | null
  oaeca_sea: string | null
  oaeca_nombre: string | null
  tipo_oficio: string | null
  fecha_limite: string | null
  fecha_oficio: string | null
  url_oficio: string | null
  url_proyecto: string | null
  region_cod: string
  proyecto_privado_id: number | null
  estado: 'pendiente' | 'resuelto'
  estado_updated_at: string | null
  importado_at: string | null
}

/** `v` vencido · `p` pendiente (faltan ≤ 15 días) · null fuera del tablero. */
export type EstadoTablero = 'v' | 'p' | null

/**
 * Cómo está un oficio en la fecha `en`. `resueltoEl` es el día en que dejó de
 * estar pendiente, o null si sigue pendiente.
 */
export function estadoEn(fechaLimite: string | null, resueltoEl: string | null, en: string): { estado: EstadoTablero; dias: number; excluido: boolean } {
  if (!fechaLimite) return { estado: null, dias: 0, excluido: false }
  const dias = diasEntre(fechaLimite, en) // > 0: días de atraso
  if (resueltoEl && resueltoEl <= en) return { estado: null, dias, excluido: false }
  if (dias > ATRASO_MAXIMO_DIAS) return { estado: null, dias, excluido: true }
  if (dias > 0) return { estado: 'v', dias, excluido: false }
  return { estado: -dias <= DIAS_PENDIENTE ? 'p' : null, dias, excluido: false }
}

export type Oficio = {
  id: number
  expediente: string
  proyecto: string
  urlProyecto: string | null
  enCartera: boolean
  organismo: string
  ministerio: string
  tipo: string | null
  fechaLimite: string
  fechaOficio: string | null
  urlOficio: string | null
  region: string
  fila: FilaMatriz
  /** Día (Chile) en que se resolvió, o null si sigue pendiente. */
  resueltoEl: string | null
  /** Estado de hoy. */
  estado: EstadoTablero
  /** Días de atraso hoy (negativo = faltan). */
  dias: number
}

/** `diaDe` convierte un timestamp a día chileno; se inyecta para testear. */
export function prepararOficios(filas: OficioFila[], hoy: string, diaDe: (iso: string) => string): Oficio[] {
  return filas.filter(f => f.fecha_limite).map(f => {
    const resueltoEl = f.estado === 'resuelto' ? (f.estado_updated_at ? diaDe(f.estado_updated_at) : hoy) : null
    const e = estadoEn(f.fecha_limite, resueltoEl, hoy)
    const organismo = f.oaeca_sea ?? f.oaeca_nombre ?? '—'
    return {
      id: f.id,
      expediente: String(f.id_expediente ?? `sin-exp-${f.id}`),
      proyecto: f.nombre_proyecto ?? 'Proyecto sin nombre',
      urlProyecto: f.url_proyecto,
      enCartera: f.proyecto_privado_id != null,
      organismo,
      ministerio: f.ministerio ?? 'Sin ministerio',
      tipo: f.tipo_oficio,
      fechaLimite: f.fecha_limite!,
      fechaOficio: f.fecha_oficio,
      urlOficio: f.url_oficio,
      region: f.region_cod,
      fila: filaDeOrganismo(organismo, f.region_cod),
      resueltoEl,
      estado: e.estado,
      dias: e.dias,
    }
  })
}

export type ModoTablero = 'ambos' | 'v' | 'p'
export const pasaModo = (o: { estado: EstadoTablero }, modo: ModoTablero) =>
  o.estado != null && (modo === 'ambos' || o.estado === modo)

// ── Matriz nacional ──────────────────────────────────────────────────────────

export type Cuenta = { v: number; p: number }
export type Matriz = {
  celdas: Map<string, Cuenta>   // `${fila}|${ministerio}`
  porFila: Map<string, Cuenta>
  porMinisterio: Map<string, Cuenta>
  total: Cuenta
}
export const claveCelda = (fila: string, ministerio: string) => `${fila}|${ministerio}`

export function armarMatriz(oficios: Oficio[]): Matriz {
  const celdas = new Map<string, Cuenta>(), porFila = new Map<string, Cuenta>(), porMinisterio = new Map<string, Cuenta>()
  const total: Cuenta = { v: 0, p: 0 }
  const sumar = (m: Map<string, Cuenta>, k: string, e: 'v' | 'p') => {
    const c = m.get(k) ?? { v: 0, p: 0 }; c[e]++; m.set(k, c)
  }
  for (const o of oficios) {
    if (!o.estado) continue
    sumar(celdas, claveCelda(o.fila, o.ministerio), o.estado)
    sumar(porFila, o.fila, o.estado)
    sumar(porMinisterio, o.ministerio, o.estado)
    total[o.estado]++
  }
  return { celdas, porFila, porMinisterio, total }
}

// ── Agrupar por proyecto → organismo (el detalle, igual que en la sesión) ────

export type GrupoProyecto = {
  expediente: string
  proyecto: string
  urlProyecto: string | null
  enCartera: boolean
  region: string
  vencidos: number
  pendientes: number
  organismos: { nombre: string; ministerio: string; oficios: Oficio[] }[]
}

export function agruparPorProyecto(oficios: Oficio[]): GrupoProyecto[] {
  const grupos = new Map<string, GrupoProyecto>()
  const urgencia = new Map<string, number>()
  for (const o of oficios) {
    const g = grupos.get(o.expediente) ?? {
      expediente: o.expediente, proyecto: o.proyecto, urlProyecto: o.urlProyecto, enCartera: false,
      region: o.region, vencidos: 0, pendientes: 0, organismos: [],
    }
    if (o.enCartera) g.enCartera = true
    if (o.estado === 'v') g.vencidos++; else g.pendientes++
    urgencia.set(o.expediente, Math.max(urgencia.get(o.expediente) ?? -Infinity, o.dias))
    let org = g.organismos.find(x => x.nombre === o.organismo)
    if (!org) { org = { nombre: o.organismo, ministerio: o.ministerio, oficios: [] }; g.organismos.push(org) }
    org.oficios.push(o)
    grupos.set(o.expediente, g)
  }
  const masAtrasado = (os: Oficio[]) => Math.max(...os.map(o => o.dias))
  return [...grupos.values()]
    // Primero los que tienen algo vencido; dentro, el más urgente arriba.
    .sort((a, b) => Number(b.vencidos > 0) - Number(a.vencidos > 0) || urgencia.get(b.expediente)! - urgencia.get(a.expediente)!)
    .map(g => ({
      ...g,
      organismos: g.organismos
        .map(org => ({ ...org, oficios: [...org.oficios].sort((a, b) => b.dias - a.dias) }))
        .sort((a, b) => masAtrasado(b.oficios) - masAtrasado(a.oficios)),
    }))
}

// ── Comparativa regional ─────────────────────────────────────────────────────

export type Sesion = { region: string; fecha: string }
export type CarteraAlta = { region: string; creado: string }

export type MedicionRegion = {
  sesiones: number
  ultimoComite: string | null
  cartera: number
  /** null = la región no tiene oficios que medir (ningún proyecto vinculado al SEIA). */
  gestionados: number | null
  vencidos: number | null
  pendientes: number | null
  pctVencidos: number | null
  atrasoPromedio: number | null
}

/**
 * Cómo estaba una región en la fecha `en`. Con `en` = hoy es el estado
 * actual; con una fecha pasada, la reconstrucción que alimenta el evolutivo.
 *
 * Gestionados son todos los oficios que el tablero siguió hasta esa fecha,
 * incluidos los ya respondidos, menos los que a esa fecha llevaban más de un
 * año vencidos.
 */
export function medirRegion(
  region: string, en: string,
  datos: { oficios: Oficio[]; sesiones: Sesion[]; cartera: CarteraAlta[]; conDatos: Set<string> },
): MedicionRegion {
  const ses = datos.sesiones.filter(s => s.region === region && s.fecha <= en).sort((a, b) => a.fecha.localeCompare(b.fecha))
  const base = {
    sesiones: ses.length,
    ultimoComite: ses.length ? ses[ses.length - 1].fecha : null,
    cartera: datos.cartera.filter(c => c.region === region && c.creado <= en).length,
  }
  if (!datos.conDatos.has(region)) {
    return { ...base, gestionados: null, vencidos: null, pendientes: null, pctVencidos: null, atrasoPromedio: null }
  }
  let gestionados = 0, vencidos = 0, pendientes = 0, suma = 0
  for (const o of datos.oficios) {
    if (o.region !== region) continue
    if (o.fechaOficio && o.fechaOficio > en) continue
    const e = estadoEn(o.fechaLimite, o.resueltoEl, en)
    if (e.excluido) continue
    gestionados++
    if (e.estado === 'v') { vencidos++; suma += e.dias }
    else if (e.estado === 'p') pendientes++
  }
  return {
    ...base, gestionados, vencidos, pendientes,
    pctVencidos: gestionados ? vencidos / gestionados : 0,
    atrasoPromedio: vencidos ? suma / vencidos : 0,
  }
}

/** Regiones sin sesión en los últimos 15 días (o que nunca sesionaron). */
export function regionesSinSesionar(mediciones: MedicionRegion[], hoy: string): number {
  return mediciones.filter(m => !m.ultimoComite || diasEntre(m.ultimoComite, hoy) > DIAS_SIN_SESIONAR).length
}

// ── Evolutivo ────────────────────────────────────────────────────────────────

/**
 * `n` fechas de corte repartidas parejo entre `desde` y `hasta`, ambas
 * incluidas. Con el rango por defecto (100 días, 6 fechas) caen cada 20 días,
 * que es el respaldo de la foto cuando una región no sesiona.
 */
export function fechasDeCorte(desde: string, hasta: string, n: number): string[] {
  const total = Math.max(0, diasEntre(desde, hasta))
  const k = Math.max(1, Math.min(n, total + 1))
  if (k === 1) return [hasta]
  const fechas = Array.from({ length: k }, (_, i) => sumarDias(desde, Math.round((total * i) / (k - 1))))
  return [...new Set(fechas)]
}

/**
 * Qué fecha representa a una región en cada corte: si sesionó en el tramo
 * que termina en ese corte, la última sesión del tramo; si no, el corte mismo.
 */
export function evaluacionDelCorte(sesionesRegion: Sesion[], cortes: string[], i: number): { en: string; esSesion: boolean } {
  const fin = cortes[i]
  const ini = i > 0 ? cortes[i - 1] : sumarDias(fin, -(cortes.length > 1 ? diasEntre(cortes[0], cortes[1]) : 20))
  const enTramo = sesionesRegion.filter(s => s.fecha > ini && s.fecha <= fin).map(s => s.fecha).sort()
  return enTramo.length ? { en: enTramo[enTramo.length - 1], esSesion: true } : { en: fin, esSesion: false }
}

// ── Sello de actualización ───────────────────────────────────────────────────

/**
 * La fecha de lo que se está mostrando es la de la región MENOS al día: si
 * Los Lagos se actualizó hoy y Ñuble hace dos días, lo que se ve está al día
 * solo hasta hace dos días. `actualizado` va por región, en día chileno; una
 * región sin entrada no tiene proyectos vinculados al SEIA y no cuenta.
 */
export function selloDeActualizacion(regiones: string[], actualizado: Record<string, string>, hoy: string) {
  const conFecha = regiones.filter(r => actualizado[r])
  const fechas = conFecha.map(r => actualizado[r]).sort()
  return {
    fecha: fechas[0] ?? null,
    sinDatos: regiones.filter(r => !actualizado[r]),
    /** Las que se pueden actualizar hoy (la ruta tiene candado diario). */
    atrasadas: conFecha.filter(r => actualizado[r] < hoy),
  }
}
