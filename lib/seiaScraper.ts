/**
 * Los oficios pendientes de un expediente, leídos del SEIA público.
 *
 * Reemplaza al Excel de seia-abierto.cl, que está detrás de un login y lo baja
 * una persona. Todo lo de acá es PURO: recibe el HTML que ya se bajó y
 * devuelve filas. Quién hace los fetch y en qué orden vive en la ruta.
 *
 * ── De dónde sale cada cosa ────────────────────────────────────────────────
 *
 *   expediente/documentos.php?id_expediente=N
 *       La tabla de TODOS los documentos del expediente, con su tipo, quién lo
 *       remitió y a quién va dirigido. Es la fuente de todo.
 *
 *   documentos/verDestinatarios.php?id_documento=N
 *       Cuando un documento va a varios, la tabla dice «10 destinatarios» y la
 *       lista está acá. Los nombres salen con su jurisdicción («DGA, Región de
 *       Los Lagos»), IDÉNTICOS a la columna «OAECCA (SEA)» del Excel.
 *
 * Los dos son públicos: no hay login, cookie ni token en ninguno.
 *
 * ── Cómo se decide qué está pendiente ──────────────────────────────────────
 *
 * Por ORGANISMO, no por documento: para cada uno se busca la solicitud más
 * reciente que lo incluye, y se mira si respondió DESPUÉS de esa fecha. Si no,
 * está pendiente.
 *
 * Mirar solo el último documento de solicitud no alcanza: un expediente tiene
 * rondas paralelas —la DIA se pide por un oficio, y a la municipalidad y al
 * gobierno regional por otros dos el mismo día— y rondas sucesivas, porque
 * después viene la Adenda. Por organismo las dos cosas se resuelven solas: al
 * llegar la Adenda, su solicitud pasa a ser la más reciente y lo que respondió
 * sobre la DIA deja de contar.
 *
 * ── GOTCHA que costó descubrir ─────────────────────────────────────────────
 *
 * MUCHAS respuestas están en filas SIN enlace al documento: de los 39
 * documentos de «Parque Gramado» con enlace, faltaban 11 respuestas que sí
 * están en la tabla pero sin `idDocumento`. Filtrar por el enlace —que es lo
 * natural cuando se quiere «el documento»— las habría dado por no existentes y
 * esos 11 organismos aparecerían pendientes para siempre.
 *
 * La FILA es la fuente. El enlace es opcional.
 */

// ── Lo que trae la tabla ─────────────────────────────────────────────────────

export type FilaDocumento = {
  /** Número de orden dentro del expediente. */
  n: number
  folio: string | null
  /** El tipo, tal cual: «Solicitud de evaluación de Adenda». */
  tipo: string
  /** Quién lo envió. En una respuesta, ES el organismo que responde. */
  remitidoPor: string | null
  /** A quién va, cuando va a uno solo. `null` si son varios. */
  destinadoA: string | null
  /** Cuántos, cuando la celda dice «10 destinatarios». `null` si va a uno. */
  destinatarios: number | null
  /** Solo si la fila tiene enlace. Muchas no lo tienen — ver el GOTCHA. */
  idDocumento: number | null
  /** ISO, de la columna de fecha (que viene dd/mm/yyyy hh:mm:ss). */
  fecha: string | null
}

const RE_FILA = /<tr[\s\S]*?<\/tr>/gi
const RE_CELDA = /<td[\s\S]*?<\/td>/gi

function texto(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** `24/03/2026 13:16:09` → `2026-03-24`. `null` si no calza. */
export function fechaDesdeTabla(celda: string | null | undefined): string | null {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(celda ?? '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** `10 destinatarios` → 10. `null` cuando la celda nombra a uno solo. */
export function contarDestinatarios(celda: string | null | undefined): number | null {
  const m = /^(\d+)\s+destinatarios?$/i.exec((celda ?? '').trim())
  return m ? Number(m[1]) : null
}

/**
 * Las filas de documentos de `documentos.php`.
 *
 * No se apoya en clases ni en el orden de las tablas de la página, que cambian
 * con cada rediseño: toma toda fila con al menos 7 celdas cuya primera sea un
 * número y cuya columna de fecha tenga forma de fecha. Es tosco a propósito —
 * un selector fino se rompe en silencio y devuelve cero filas, que es
 * indistinguible de «este expediente no tiene documentos».
 */
export function parsearDocumentos(html: string): FilaDocumento[] {
  const out: FilaDocumento[] = []

  for (const fila of html.matchAll(RE_FILA)) {
    const celdas = [...fila[0].matchAll(RE_CELDA)].map(c => texto(c[0]))
    if (celdas.length < 7) continue

    const n = Number(celdas[0])
    if (!Number.isInteger(n) || n <= 0) continue

    const fecha = fechaDesdeTabla(celdas[6])
    if (!fecha) continue

    const tipo = celdas[3]
    if (!tipo) continue

    const idDoc = /idDocumento=(\d+)/.exec(fila[0])
    const destino = celdas[5] || null

    out.push({
      n,
      folio: celdas[1] || null,
      tipo,
      remitidoPor: celdas[4] || null,
      destinadoA: contarDestinatarios(destino) == null ? destino : null,
      destinatarios: contarDestinatarios(destino),
      idDocumento: idDoc ? Number(idDoc[1]) : null,
      fecha,
    })
  }

  return out
}

/**
 * Los nombres de `verDestinatarios.php`, que salen como una lista suelta
 * después del rótulo DESTINATARIOS y antes del botón «Cerrar».
 */
export function parsearDestinatarios(html: string): string[] {
  const i = html.search(/DESTINATARIOS/i)
  if (i < 0) return []

  const trozo = html.slice(i)
  const lineas = trozo
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '\n')
    .split('\n')
    .map(l => texto(l))
    .filter(Boolean)

  const out: string[] = []
  for (const l of lineas.slice(1)) {
    if (/^cerrar$/i.test(l)) break
    // Los nombres de organismo siempre tienen varias palabras; lo corto es
    // chrome de la página que se coló.
    if (l.length < 4) continue
    out.push(l)
  }
  return [...new Set(out)]
}

// ── Qué documento es qué ─────────────────────────────────────────────────────

/**
 * Los tipos que ABREN un plazo, con sus días hábiles.
 *
 * Las cadenas son las del SEIA y coinciden exactamente con la columna «Tipo de
 * oficio» del Excel — se verificó contra los 568 oficios ya importados. Eso
 * importa: el scraper y el Excel tienen que poder convivir sin duplicar.
 *
 * Los días salen de esos mismos 568 (fecha del oficio → fecha límite, contando
 * solo fines de semana), no del reglamento: es el plazo legal MÁS UNO, porque
 * el SEA empieza a contar en el segundo hábil. Distribución observada:
 *
 *   DIA y sus variantes        16 hábiles (247 de 253)
 *   Adenda de DIA              11 hábiles ( 73 de 102)
 *   Adenda de EIA              16 hábiles ( 42 de  42)
 *   EIA y sus variantes        31 hábiles ( 51 de  67)
 *
 * La minoría se explica por feriados dentro de la ventana, que el SEA sí
 * descuenta y acá no se modelan. Por eso lo que se calcula es un ESTIMADO y va
 * marcado como tal: cuando llega el Excel, manda el Excel.
 */
export const DIAS_POR_TIPO: { tipo: RegExp; presentacion: 'DIA' | 'EIA' | null; habiles: number }[] = [
  // Adenda primero: su nombre también contiene «Adenda» y hay que ganarle a
  // las reglas genéricas de DIA/EIA.
  { tipo: /adenda/i, presentacion: 'DIA', habiles: 11 },
  { tipo: /adenda/i, presentacion: 'EIA', habiles: 16 },
  { tipo: /\bEIA\b/,  presentacion: null, habiles: 31 },
  { tipo: /\bDIA\b/,  presentacion: null, habiles: 16 },
]

/** ¿Este documento le pide a alguien que se pronuncie? */
export function esSolicitud(tipo: string): boolean {
  // «Oficio Reitera Solicitud de Pronunciamiento» NO entra: recuerda un plazo
  // que ya corre, no abre uno nuevo. Se comprobó contra el Excel, que tampoco
  // lo lista como tipo de oficio.
  if (/reitera/i.test(tipo)) return false
  return /^(oficio )?solicitud de evaluaci[óo]n/i.test(tipo.trim())
}

/**
 * ¿Este documento CIERRA el pendiente de quien lo remite?
 *
 * Son tres familias, y las tres cuentan: pronunciarse conforme, pronunciarse
 * con observaciones, y declarar que no participa en la evaluación. Dejar fuera
 * la tercera —que es la menos obvia— haría que el SAG apareciera debiendo un
 * oficio que nunca va a mandar.
 */
export function esRespuesta(tipo: string): boolean {
  return /^oficio (pronunciamiento|no participaci[óo]n)/i.test(tipo.trim())
}

/**
 * ¿Este documento CIERRA la ronda de consulta que venía corriendo?
 *
 * Cuando el SEA consolida lo recibido en el ICSARA y se lo manda al titular,
 * la ronda terminó: el que no alcanzó a pronunciarse ya no va a hacerlo, y
 * quedaría pendiente para siempre. La RCA cierra el expediente entero por la
 * misma razón.
 *
 * Esto NO es un detalle de estilo, es la diferencia entre 7 y 9. En «Parque
 * Gramado» la ronda de la DIA (30/03) dejó sin responder a la Municipalidad de
 * Puerto Varas y a la SEC; el ICSARA de mayo cerró esa ronda y la Adenda de
 * septiembre abrió otra. El Excel del SEIA lista 7 —solo los de la Adenda—, y
 * sin este corte el panel mostraría esos 2 de más, atrasados por medio año y
 * sin que nadie pueda hacer nada al respecto.
 */
export function cierraRonda(tipo: string): boolean {
  return /informe consolidado/i.test(tipo) || cierraExpediente(tipo)
}

/**
 * Cierra el EXPEDIENTE entero, no una ronda: después de esto no hay Adenda que
 * reabra nada y el oficio no se va a responder nunca.
 *
 * Sale de `cierraRonda` porque la diferencia decide el MOTIVO con que se cierra
 * un oficio (mig 122) y por lo tanto si su atraso cuenta o no. Un informe
 * consolidado cierra la ronda y el organismo puede haber respondido; una RCA o
 * un término anticipado matan el proyecto, y cobrarle ese atraso al organismo es
 * falso — no había a quién responderle.
 *
 * El «Término Anticipado» no es un caso de borde: de los 27 oficios que el
 * scraper inventó en la primera corrida contra el Excel, los 5 expedientes
 * involucrados estaban cerrados así, con plazos vencidos hacía uno y dos años.
 * Era 5 de 5.
 */
export function cierraExpediente(tipo: string): boolean {
  return /t[ée]rmino anticipado/i.test(tipo)
    || /desistimiento/i.test(tipo)
    || /resoluci[óo]n de calificaci[óo]n ambiental/i.test(tipo)
}

/** DIA o EIA, deducido del tipo del documento de solicitud. */
export function presentacionDe(tipo: string): 'DIA' | 'EIA' | null {
  if (/\bEIA\b/.test(tipo)) return 'EIA'
  if (/\bDIA\b/.test(tipo)) return 'DIA'
  return null
}

/**
 * Los días hábiles de plazo de una solicitud.
 *
 * `presentacion` se pasa aparte porque el tipo no siempre la dice: «Solicitud
 * de evaluación de Adenda» es la misma cadena para una Adenda de DIA (11 días)
 * y una de EIA (16), y sin la presentación del expediente se estimaría mal más
 * de un tercio de las veces.
 */
export function habilesDeSolicitud(tipo: string, presentacion: 'DIA' | 'EIA' | null): number | null {
  for (const r of DIAS_POR_TIPO) {
    if (!r.tipo.test(tipo)) continue
    if (r.presentacion && r.presentacion !== presentacion) continue
    return r.habiles
  }
  return null
}

/**
 * `desdeISO` más `habiles` días hábiles, contando SOLO de lunes a viernes.
 *
 * Los feriados no se descuentan a propósito: no hay una lista confiable en el
 * código y meter una equivocada empeora el resultado —se probó, y con un
 * calendario inventado la coincidencia contra el Excel cayó de 500/638 a 0—.
 * El resultado es un estimado y se marca como tal.
 */
export function sumarHabiles(desdeISO: string, habiles: number): string {
  const d = new Date(`${desdeISO}T12:00:00Z`)
  let restan = habiles
  while (restan > 0) {
    d.setUTCDate(d.getUTCDate() + 1)
    const dia = d.getUTCDay()
    if (dia !== 0 && dia !== 6) restan--
  }
  return d.toISOString().slice(0, 10)
}

// ── Lo que queda pendiente ───────────────────────────────────────────────────

export type OficioPendiente = {
  /** Con jurisdicción, tal como lo escribe el SEIA. */
  oaeca: string
  /** El documento que le abrió el plazo. */
  idDocumento: number | null
  tipoOficio: string
  fechaOficio: string
  /** Calculado, no publicado por el SEIA: siempre estimado. */
  fechaLimite: string | null
  n: number
}

export type SolicitudConDestinatarios = {
  fila: FilaDocumento
  /** Los de `verDestinatarios.php`, o el único de la columna «Destinado A». */
  destinatarios: string[]
}

/**
 * ¿Este destinatario es un organismo al que se le pide pronunciamiento?
 *
 * La lista de `verDestinatarios.php` no es solo de OAECAs: lleva también al
 * propio SEA —que es quien pregunta, no quien responde— y a las cuentas
 * internas con que el Servicio reparte el expediente entre sus evaluadores
 * («Evaluador SEREMI de Salud (01)», «Evaluador Subsecretaría de Pesca (02)»).
 *
 * Sin este filtro aparecían como organismos atrasados que nadie puede
 * perseguir porque no existen: en la muestra contra el Excel eran la causa de
 * 6 de cada 10 diferencias, y en un expediente metía 7 filas falsas de golpe.
 */
export function esOaecaConsultable(nombre: string): boolean {
  const n = nombre.trim()
  if (n.length < 4) return false
  if (/^evaluador\b/i.test(n)) return false
  if (/^servicio (de )?evaluaci[óo]n ambiental/i.test(n)) return false
  if (/^SEA$/i.test(n)) return false
  return true
}

/** Normaliza para comparar organismos entre documentos. */
export function claveOrganismo(nombre: string | null | undefined): string {
  return (nombre ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
}

/**
 * Qué organismos siguen debiendo respuesta en este expediente.
 *
 * Por organismo: su solicitud más reciente contra su respuesta más reciente.
 * Si respondió después de que se la pidieron, está al día; si no, debe.
 */
export function pendientesDelExpediente(
  solicitudes: SolicitudConDestinatarios[],
  documentos: FilaDocumento[],
  presentacion: 'DIA' | 'EIA' | null,
): OficioPendiente[] {
  // El corte: nada anterior al último cierre de ronda sigue vivo.
  let corte: string | null = null
  for (const d of documentos) {
    if (!cierraRonda(d.tipo) || !d.fecha) continue
    if (!corte || d.fecha > corte) corte = d.fecha
  }

  // Última solicitud por organismo.
  const ultimaSolicitud = new Map<string, { fila: FilaDocumento; nombre: string }>()
  for (const s of solicitudes) {
    if (corte && s.fila.fecha && s.fila.fecha < corte) continue
    for (const nombre of s.destinatarios) {
      if (!esOaecaConsultable(nombre)) continue
      const k = claveOrganismo(nombre)
      if (!k) continue
      const previa = ultimaSolicitud.get(k)
      if (!previa || (s.fila.fecha ?? '') > (previa.fila.fecha ?? '')) {
        ultimaSolicitud.set(k, { fila: s.fila, nombre })
      }
    }
  }

  // Última respuesta por organismo. Sale de `remitidoPor`, que en una
  // respuesta ES quien responde — y se lee de TODAS las filas, tengan enlace
  // o no (ver el GOTCHA de arriba).
  const ultimaRespuesta = new Map<string, string>()
  for (const d of documentos) {
    if (!esRespuesta(d.tipo) || !d.remitidoPor || !d.fecha) continue
    const k = claveOrganismo(d.remitidoPor)
    const previa = ultimaRespuesta.get(k)
    if (!previa || d.fecha > previa) ultimaRespuesta.set(k, d.fecha)
  }

  const out: OficioPendiente[] = []
  for (const [k, { fila, nombre }] of ultimaSolicitud) {
    const respondio = ultimaRespuesta.get(k)
    // Igual o posterior: una respuesta del MISMO día cierra el pendiente. La
    // tabla da fecha sin hora útil para comparar, y dar por pendiente a quien
    // contestó a las seis de la tarde sería peor error que el contrario.
    if (respondio && fila.fecha && respondio >= fila.fecha) continue

    const habiles = habilesDeSolicitud(fila.tipo, presentacion)
    out.push({
      oaeca: nombre,
      idDocumento: fila.idDocumento,
      tipoOficio: fila.tipo,
      fechaOficio: fila.fecha!,
      fechaLimite: habiles != null && fila.fecha ? sumarHabiles(fila.fecha, habiles) : null,
      n: fila.n,
    })
  }

  return out.sort((a, b) => (a.fechaLimite ?? '9999').localeCompare(b.fechaLimite ?? '9999'))
}

/**
 * Empareja lo que el SEIA lista HOY en un expediente con lo guardado de ese
 * expediente. Cada guardado se usa a lo sumo una vez; dentro del mismo
 * organismo gana primero el del MISMO documento, y si no hay, el primer
 * pendiente.
 *
 * Por qué el documento primero: la llave única (mig 118/121) incluye
 * `id_documento`. Si un organismo tiene dos filas —un oficio general y uno
 * específico, como la Gobernación Marítima en la Desaladora de La Serena— y se
 * tomaba «la primera» para pasarla al documento de la otra, el UPDATE chocaba
 * con la llave: no se actualizaba ninguna y la fecha del tablero quedaba
 * pegada (2026-10-02).
 *
 * `sobrantes` son los pendientes que no se emparejaron: o su organismo ya no
 * figura, o es un duplicado del mismo organismo que el SEIA ya no lista. En
 * los dos casos dejaron de estar pendientes.
 */
export function emparejarOficios<
  V extends { id_documento: number | null; clave: string },
  G extends { id: number; estado: string; id_documento: number | null; clave: string },
>(vivos: V[], guardados: G[]): { nuevos: V[]; pares: [V, G][]; sobrantes: G[] } {
  const porClave = new Map<string, G[]>()
  for (const g of guardados) porClave.set(g.clave, [...(porClave.get(g.clave) ?? []), g])
  // Dentro de cada organismo, los pendientes adelante: reabrir uno resuelto
  // solo si no queda otro.
  for (const lista of porClave.values()) lista.sort((a, b) => Number(b.estado === 'pendiente') - Number(a.estado === 'pendiente'))

  const usados = new Set<number>()
  const nuevos: V[] = []
  const pares: [V, G][] = []
  // Primero los que calzan por documento, para que ninguno le quite su fila a otro.
  const pendientesDeFila: V[] = []
  for (const v of vivos) {
    const g = v.id_documento == null ? undefined
      : (porClave.get(v.clave) ?? []).find(c => !usados.has(c.id) && c.id_documento === v.id_documento)
    if (g) { usados.add(g.id); pares.push([v, g]) } else pendientesDeFila.push(v)
  }
  for (const v of pendientesDeFila) {
    const cands = (porClave.get(v.clave) ?? []).filter(c => !usados.has(c.id))
    // Pasar una fila a un documento que ya tiene OTRA fila del organismo choca
    // con la llave; esas quedan fuera.
    const g = cands.find(c => !cands.some(o => o !== c && v.id_documento != null && o.id_documento === v.id_documento))
    if (g) { usados.add(g.id); pares.push([v, g]) } else nuevos.push(v)
  }
  const sobrantes = guardados.filter(g => g.estado === 'pendiente' && !usados.has(g.id))
  return { nuevos, pares, sobrantes }
}
