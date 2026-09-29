import { REGIONS } from '@/lib/regions'

/**
 * Los oficios pendientes del SEIA: parseo del archivo, cruce contra la cartera
 * y reconciliación con lo que ya está guardado.
 *
 * Todo lo de acá es PURO — recibe filas y devuelve filas. La ruta se encarga
 * de leer el .xlsx y de escribir; lo que decide qué entra, con qué región y
 * qué se da por resuelto vive acá para poder probarlo contra el archivo real
 * sin tocar la base (`__tests__/oficiosSeia.test.ts`).
 *
 * ── De dónde sale cada cosa ────────────────────────────────────────────────
 *
 * El archivo (seia-abierto.cl → Proyectos en calificación → Detalle oficios
 * pendientes) trae cinco hojas. Nos importan dos:
 *
 *   · «Pendientes» — los oficios sin responder. Es la VERDAD del estado: si un
 *     oficio está, está pendiente; si dejó de estar, se respondió. No hace
 *     falta cruzarlo con nada para saberlo.
 *   · «Registro» — los proyectos en calificación, y es la única hoja que trae
 *     la región REAL del proyecto. La columna «Región» de «Pendientes» NO es
 *     esa: es la jurisdicción del organismo que debe responder, por eso ahí
 *     aparecen «Nacional», «Municipio» y «Gobernación Marítima».
 *
 * La hoja «Recibidos» no se usa para el estado —es solo de la última semana, y
 * un oficio respondido ya salió de «Pendientes»— pero sirve para contar en la
 * sesión qué llegó desde la reunión anterior.
 */

// ── Lo que trae el archivo ───────────────────────────────────────────────────

/** Una fila de la hoja «Pendientes», con los nombres de columna tal cual. */
export type FilaPendiente = {
  'Ministerio': string | null
  'OAECCA': string | null
  'OAECCA (SEA)': string | null
  'Nombre del proyecto': string | null
  'Tipo de presentación': string | null
  'Región': string | null
  'Inversión': number | string | null
  'Tipo de oficio': string | null
  'Fecha del oficio': number | null
  'Fecha límite de respuesta': number | null
  'Estado de plazo': string | null
  'Emisor': string | null
  'ID expediente': number | string | null
  'Enlace al proyecto': string | null
  'Enlace al oficio': string | null
}

/** Una fila de la hoja «Registro» — de acá sale la región del proyecto. */
export type FilaRegistro = {
  'WEB': string | null
  'Región': string | null
}

/** Un proyecto de la cartera, con lo mínimo para cruzarlo. */
export type ProyectoCartera = {
  id: number
  region_cod: string
  origen_sistema: string | null
  origen_id: string | null
  /**
   * Expediente cargado a mano desde la ficha (mig 119). Es el camino para los
   * proyectos que NO se importaron del catálogo —la mayoría de la cartera— y
   * que por eso no tienen `origen_id` por donde unirlos a sus oficios.
   */
  seia_expediente_id: number | null
}

// ── Constantes de negocio ────────────────────────────────────────────────────

/**
 * Cuántos días hacia adelante mira la lista «para la próxima sesión».
 *
 * El comité sesiona cada 15 días, así que la ventana tiene que cubrir el hueco
 * COMPLETO entre una sesión y la siguiente: con 14, un oficio que vence al día
 * 15 no se ve hoy y en la próxima reunión ya está venciendo ese mismo día.
 * Con 15 se ve con una sesión de anticipación, que es el punto.
 */
export const DIAS_VENTANA_PROXIMA_SESION = 15

/** Prefijo con que la cartera guarda el expediente, heredado del catálogo v2
 *  (`seia_${EXPEDIENTE_ID}` en el sync). Cruzar sin él da cero y sin error. */
const PREFIJO_ORIGEN_SEIA = 'seia_'

// ── Fechas ───────────────────────────────────────────────────────────────────

/**
 * Serial de Excel → 'YYYY-MM-DD'.
 *
 * Excel cuenta días desde el 1899-12-31 con un día fantasma (el 29 de febrero
 * de 1900, que no existió), así que la época efectiva es 1899-12-30. Se arma
 * en UTC a propósito: con hora local, un serial cae al día anterior en
 * cualquier huso al oeste de Greenwich — Chile incluido.
 */
export function fechaDesdeSerial(serial: number | null | undefined): string | null {
  if (serial == null || !Number.isFinite(serial) || serial <= 0) return null
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

/** Días calendario entre dos fechas ISO. Negativo = la primera ya pasó. */
export function diasHasta(fechaISO: string, hoyISO: string): number {
  const a = Date.parse(`${fechaISO}T00:00:00Z`)
  const b = Date.parse(`${hoyISO}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((a - b) / 86_400_000)
}

// ── Región ───────────────────────────────────────────────────────────────────

/**
 * Nombre de región del SEIA → `region_cod` del panel.
 *
 * El SEIA escribe «Región de Los Lagos» y «Región del Biobío»; el panel tiene
 * sus propios nombres. Se compara normalizado —sin tildes, sin «región de/del»
 * y sin mayúsculas— porque las dos listas se escribieron por separado y no
 * coinciden carácter a carácter.
 *
 * Devuelve `null` para «Interregional», «Nacional», «Municipio» y demás: esos
 * no son regiones y su oficio necesita que el proyecto le dé una.
 */
export function regionCodDesdeSeia(nombre: string | null | undefined): string | null {
  const n = normalizarRegion(nombre)
  if (!n) return null

  // Contención y no igualdad: el SEIA usa el nombre largo y oficial mientras
  // el panel usa el corto, y la diferencia es grande en tres regiones —
  // «Región Metropolitana de Santiago» contra «Metropolitana», «Región del
  // Libertador General Bernardo O'Higgins» contra «O'Higgins», «Región de
  // Magallanes y de la Antártica Chilena» contra «Magallanes y Antártica».
  // Comparando por igualdad se perdían 195 de 638 oficios en silencio.
  const calzan = REGIONS.filter(r => {
    const p = normalizarRegion(r.nombre)
    return p.length > 0 && n.includes(p)
  })

  // Ninguna de las 16 está contenida en otra, así que dos coincidencias
  // significan que el nombre de entrada es raro. Fail-closed: se descarta y se
  // reporta, en vez de asignarle una región cualquiera a un oficio.
  return calzan.length === 1 ? calzan[0].cod : null
}

function normalizarRegion(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\bregion\b/g, '')
    .replace(/\b(de|del|la|los|las|el)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/** El id de expediente que trae el archivo, como número. */
export function idExpediente(v: number | string | null | undefined): number | null {
  if (v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\D/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** El `idDocumento` escondido en «Enlace al oficio». Es la llave natural del
 *  oficio: lo que hace que reimportar el mismo archivo no duplique. */
export function idDocumentoDesdeUrl(url: string | null | undefined): number | null {
  const m = /idDocumento=(\d+)/.exec(String(url ?? ''))
  return m ? Number(m[1]) : null
}

/** El expediente escondido en una URL de ficha (columna «WEB» del Registro). */
export function idExpedienteDesdeUrl(url: string | null | undefined): number | null {
  const m = /id_expediente=(\d+)/.exec(String(url ?? ''))
  return m ? Number(m[1]) : null
}

// ── El cruce con la cartera ──────────────────────────────────────────────────

/**
 * Índice expediente → proyectos de la cartera que lo siguen.
 *
 * Es una LISTA y no un proyecto porque el mismo expediente puede estar en la
 * cartera de dos regiones (un proyecto interregional que las dos sumaron). En
 * ese caso el oficio entra una vez por región: las dos lo tratan en su sesión.
 */
export function indiceCartera(proyectos: ProyectoCartera[]): Map<number, ProyectoCartera[]> {
  const idx = new Map<number, ProyectoCartera[]>()
  for (const p of proyectos) {
    const exp = expedienteDeProyecto(p)
    if (exp == null) continue
    const acc = idx.get(exp) ?? []
    acc.push(p)
    idx.set(exp, acc)
  }
  return idx
}

/**
 * El expediente de un proyecto de la cartera, por cualquiera de los dos
 * caminos. El manual gana: si alguien lo cargó a mano en la ficha, esa es la
 * afirmación más reciente y más deliberada sobre qué expediente es este
 * proyecto.
 *
 * `origen_id` solo sirve cuando el proyecto se importó del catálogo, y lo
 * guarda con el prefijo que hereda de v2_proyectos_inversion
 * (`seia_${EXPEDIENTE_ID}`). Cruzarlo sin quitar el prefijo da cero
 * coincidencias y ningún error.
 */
export function expedienteDeProyecto(p: ProyectoCartera): number | null {
  if (p.seia_expediente_id != null && Number.isFinite(p.seia_expediente_id)) {
    return p.seia_expediente_id
  }
  if (p.origen_sistema !== 'seia' || !p.origen_id) return null
  if (!p.origen_id.startsWith(PREFIJO_ORIGEN_SEIA)) return null
  const exp = Number(p.origen_id.slice(PREFIJO_ORIGEN_SEIA.length))
  return Number.isFinite(exp) ? exp : null
}

/**
 * El expediente que alguien pega en la ficha: acepta el número pelado o
 * cualquiera de las URLs del SEIA, que es lo que de verdad se copia del
 * navegador. `null` si no se reconoce nada.
 */
export function parsearExpedientePegado(texto: string | null | undefined): number | null {
  const t = (texto ?? '').trim()
  if (!t) return null
  const deUrl = /id_expediente=(\d+)/.exec(t)
  if (deUrl) return Number(deUrl[1])
  if (/^\d{6,}$/.test(t)) return Number(t)
  return null
}

// ── El resultado del parseo ──────────────────────────────────────────────────

/** Un oficio listo para escribir, ya resuelto su proyecto y su región. */
export type OficioImportado = {
  id_documento: number
  id_expediente: number
  region_cod: string
  /** Proyecto de la cartera al que cuelga. `null` = todavía sin asignar. */
  proyecto_privado_id: number | null
  nombre_proyecto: string | null
  ministerio: string | null
  oaeca_nombre: string | null
  oaeca_sea: string | null
  tipo_oficio: string | null
  tipo_presentacion: string | null
  fecha_oficio: string | null
  fecha_limite: string | null
  emisor: string | null
  url_proyecto: string | null
  url_oficio: string | null
  region_seia: string | null
}

export type ResultadoParseo = {
  oficios: OficioImportado[]
  /** Filas que no se pudieron usar, con el motivo. Van al resumen de la
   *  importación: una fila descartada en silencio es un dato perdido. */
  descartadas: { fila: number; motivo: string; proyecto: string | null }[]
  /** Cuántos quedaron sin proyecto de la cartera (la bandeja «sin asignar»). */
  sinAsignar: number
}

/**
 * Convierte la hoja «Pendientes» en oficios listos para escribir.
 *
 * El orden en que se resuelve la región es lo que define el módulo:
 *
 *   1. Si el expediente está en una cartera → la región es la del PROYECTO,
 *      y el oficio queda vinculado. Si está en dos, salen dos oficios.
 *   2. Si no → la región es la que declara el SEIA para ese proyecto (hoja
 *      «Registro»), a modo provisorio, y el oficio queda «sin asignar».
 *   3. Si tampoco hay —proyecto «Interregional» o «Nacional» que nadie sumó—
 *      la fila se descarta y se reporta: no hay a qué región mostrársela.
 */
export function parsearPendientes(
  pendientes: FilaPendiente[],
  registro: FilaRegistro[],
  cartera: ProyectoCartera[],
): ResultadoParseo {
  const idx = indiceCartera(cartera)

  // Región declarada por el SEIA, por expediente. Sale del «Registro» y no de
  // la columna «Región» de «Pendientes», que es la del organismo.
  const regionDelRegistro = new Map<number, string>()
  for (const r of registro) {
    const exp = idExpedienteDesdeUrl(r['WEB'])
    if (exp != null && r['Región']) regionDelRegistro.set(exp, r['Región'])
  }

  const oficios: OficioImportado[] = []
  const descartadas: ResultadoParseo['descartadas'] = []
  let sinAsignar = 0

  pendientes.forEach((f, i) => {
    const fila = i + 2 // +1 por el encabezado, +1 porque Excel cuenta desde 1
    const proyecto = f['Nombre del proyecto'] ?? null

    const exp = idExpediente(f['ID expediente'])
    if (exp == null) {
      descartadas.push({ fila, motivo: 'sin ID de expediente', proyecto })
      return
    }
    const doc = idDocumentoDesdeUrl(f['Enlace al oficio'])
    if (doc == null) {
      // Sin idDocumento no hay llave natural: reimportar duplicaría la fila.
      descartadas.push({ fila, motivo: 'sin idDocumento en el enlace al oficio', proyecto })
      return
    }

    const regionSeia = regionDelRegistro.get(exp) ?? f['Región'] ?? null
    const base = {
      id_documento: doc,
      id_expediente: exp,
      nombre_proyecto: proyecto,
      ministerio: f['Ministerio'] ?? null,
      oaeca_nombre: f['OAECCA'] ?? null,
      oaeca_sea: f['OAECCA (SEA)'] ?? null,
      tipo_oficio: f['Tipo de oficio'] ?? null,
      tipo_presentacion: f['Tipo de presentación'] ?? null,
      fecha_oficio: fechaDesdeSerial(f['Fecha del oficio']),
      fecha_limite: fechaDesdeSerial(f['Fecha límite de respuesta']),
      emisor: f['Emisor'] ?? null,
      url_proyecto: f['Enlace al proyecto'] ?? null,
      url_oficio: f['Enlace al oficio'] ?? null,
      region_seia: regionSeia,
    }

    const enCartera = idx.get(exp) ?? []
    if (enCartera.length > 0) {
      for (const p of enCartera) {
        oficios.push({ ...base, region_cod: p.region_cod, proyecto_privado_id: p.id })
      }
      return
    }

    const cod = regionCodDesdeSeia(regionSeia)
    if (cod == null) {
      descartadas.push({
        fila,
        motivo: `sin región: el proyecto es «${regionSeia ?? 'sin dato'}» y no está en ninguna cartera`,
        proyecto,
      })
      return
    }
    oficios.push({ ...base, region_cod: cod, proyecto_privado_id: null })
    sinAsignar++
  })

  return { oficios, descartadas, sinAsignar }
}

// ── Reconciliación con lo ya guardado ────────────────────────────────────────

/** Lo mínimo que hace falta saber de un oficio ya guardado. */
export type OficioGuardado = {
  id: number
  id_documento: number | null
  /** Con jurisdicción. Es parte de la llave, no un adorno: ver `clave`. */
  oaeca_sea: string | null
  oaeca_nombre: string | null
  region_cod: string
  estado: 'pendiente' | 'resuelto'
  proyecto_privado_id: number | null
}

export type PlanEscritura = {
  /** Oficios que no existían. */
  nuevos: OficioImportado[]
  /** Existían y cambió algo — típicamente que ya encontró su proyecto. */
  actualizar: { id: number; cambios: Partial<OficioImportado> }[]
  /** Estaban pendientes y ya no vienen en el archivo: se respondieron. */
  resolver: number[]
}

/**
 * Qué escribir, comparando el archivo contra lo guardado.
 *
 * La regla del estado sale de la naturaleza del archivo: es la lista de
 * PENDIENTES. Un oficio que estaba y ya no viene fue respondido, así que se
 * marca resuelto solo — no hay que cruzarlo con la hoja «Recibidos», que
 * además solo cubre la última semana.
 *
 * Solo se tocan los oficios `automatico`: los que el comité levantó a mano en
 * una sesión no dependen de este archivo y se resuelven en la reunión. Esa
 * separación la garantiza el llamador, que filtra antes de pasar `guardados`.
 *
 * Lo que NO se pisa nunca es el estado que puso una persona: si alguien marcó
 * un oficio como resuelto en la sesión y el SEIA todavía lo lista pendiente,
 * gana la persona. Mismo criterio que la reconciliación de la cartera
 * (mig 109), y por la misma razón: el dato de la fuente puede ir atrasado.
 */
export function planificarEscritura(
  delArchivo: OficioImportado[],
  guardados: OficioGuardado[],
): PlanEscritura {
  // La llave NO es el documento. Un oficio del SEA se dirige a VARIOS
  // organismos a la vez y el expediente guarda un solo documento con todos en
  // su «Distribución:»: en el archivo real son 638 oficios sobre 114
  // documentos, uno de ellos con 22 destinatarios. Lo que hace pendiente a un
  // oficio es que UN organismo no respondió, así que la llave lleva el
  // organismo — y con su jurisdicción («CONAF, Región de Coquimbo»), porque
  // con el nombre corto dos filas del archivo real colisionan.
  const clave = (regionCod: string, doc: number, oaeca: string | null) =>
    `${regionCod}|${doc}|${(oaeca ?? '').trim().toLocaleLowerCase('es')}`

  const oaecaDe = (o: { oaeca_sea: string | null; oaeca_nombre: string | null }) =>
    o.oaeca_sea ?? o.oaeca_nombre

  const porClave = new Map<string, OficioGuardado>()
  for (const g of guardados) {
    if (g.id_documento == null) continue
    porClave.set(clave(g.region_cod, g.id_documento, oaecaDe(g)), g)
  }

  const nuevos: OficioImportado[] = []
  const actualizar: PlanEscritura['actualizar'] = []
  const vistos = new Set<string>()

  for (const o of delArchivo) {
    const k = clave(o.region_cod, o.id_documento, oaecaDe(o))
    vistos.add(k)
    const g = porClave.get(k)
    if (!g) { nuevos.push(o); continue }

    const cambios: Partial<OficioImportado> = {}
    // El caso que importa: el expediente entró a una cartera desde la última
    // importación, así que el oficio deja de estar «sin asignar».
    if (o.proyecto_privado_id != null && g.proyecto_privado_id == null) {
      cambios.proyecto_privado_id = o.proyecto_privado_id
    }
    if (Object.keys(cambios).length > 0) actualizar.push({ id: g.id, cambios })
  }

  const resolver = guardados
    .filter(g => g.estado === 'pendiente'
      && g.id_documento != null
      && !vistos.has(clave(g.region_cod, g.id_documento, oaecaDe(g))))
    .map(g => g.id)

  return { nuevos, actualizar, resolver }
}

// ── La lista de la próxima sesión ────────────────────────────────────────────

export type OficioConPlazo = { fecha_limite: string | null }

/**
 * ¿Este oficio hay que tratarlo en la próxima sesión?
 *
 * Son dos grupos: los que ya están atrasados, y los que vencen antes de la
 * sesión siguiente. Si se dejaran solo los atrasados, cada reunión llegaría
 * tarde a todo; si la ventana fuera más corta que el intervalo entre sesiones,
 * quedaría una franja que no se ve en ninguna de las dos.
 */
export function esParaLaProximaSesion(
  o: OficioConPlazo,
  hoyISO: string,
  dias = DIAS_VENTANA_PROXIMA_SESION,
): boolean {
  if (!o.fecha_limite) return false
  const d = diasHasta(o.fecha_limite, hoyISO)
  return d <= dias
}

export function estaAtrasado(o: OficioConPlazo, hoyISO: string): boolean {
  return o.fecha_limite != null && diasHasta(o.fecha_limite, hoyISO) < 0
}

// ── Revincular lo ya guardado contra la cartera ──────────────────────────────

/** Lo mínimo de un oficio guardado para volver a cruzarlo con la cartera. */
export type OficioSinProyecto = {
  id: number
  id_expediente: number | null
  region_cod: string
}

export type Vinculacion = {
  id: number
  proyecto_privado_id: number
  /** Solo cuando el oficio se muda: el proyecto manda sobre la región del SEIA. */
  region_cod?: string
}

export type PlanVinculacion = {
  vincular: Vinculacion[]
  /** El expediente está en la cartera de varias regiones y ninguna es la del
   *  oficio: una fila sola no puede ir a las dos. Lo resuelve la importación,
   *  que sí escribe una fila por región. Se reporta para no perderlo. */
  ambiguos: { id: number; id_expediente: number; regiones: string[] }[]
}

/**
 * Qué oficios ya guardados encuentran ahora su proyecto en la cartera.
 *
 * Existe porque la importación es la foto de UN instante: un proyecto que se
 * suma a la cartera después queda con sus oficios huérfanos hasta la próxima
 * subida de archivo. Pasó al día siguiente de la primera importación —un
 * proyecto cargado 110 segundos tarde— y obligar a rebajar el Excel para
 * arreglarlo es atar el vínculo a un trámite que no tiene nada que ver.
 *
 * Solo mira oficios SIN proyecto: nunca reasigna uno ya vinculado. Si alguien
 * lo corrigió a mano, esa decisión gana.
 *
 * La región del proyecto manda sobre la que declara el SEIA (misma regla que
 * `parsearPendientes`): un oficio «sin asignar» se guardó provisoriamente en
 * la región del SEIA, y al aparecer el proyecto se muda a la suya.
 */
export function planificarVinculacion(
  huerfanos: OficioSinProyecto[],
  cartera: ProyectoCartera[],
): PlanVinculacion {
  const idx = indiceCartera(cartera)
  const vincular: Vinculacion[] = []
  const ambiguos: PlanVinculacion['ambiguos'] = []

  for (const o of huerfanos) {
    if (o.id_expediente == null) continue
    const candidatos = idx.get(o.id_expediente) ?? []
    if (candidatos.length === 0) continue

    // Si alguno es de la región donde el oficio ya está, ese: no hay mudanza.
    const mismaRegion = candidatos.find(p => p.region_cod === o.region_cod)
    if (mismaRegion) {
      vincular.push({ id: o.id, proyecto_privado_id: mismaRegion.id })
      continue
    }

    if (candidatos.length > 1) {
      ambiguos.push({
        id: o.id,
        id_expediente: o.id_expediente,
        regiones: [...new Set(candidatos.map(p => p.region_cod))],
      })
      continue
    }

    vincular.push({
      id: o.id,
      proyecto_privado_id: candidatos[0].id,
      region_cod: candidatos[0].region_cod,
    })
  }

  return { vincular, ambiguos }
}
