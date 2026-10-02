import { describe, it, expect } from 'vitest'
import {
  cierraRonda,
  claveOrganismo,
  emparejarOficios,
  contarDestinatarios,
  esOaecaConsultable,
  esRespuesta,
  esSolicitud,
  fechaDesdeTabla,
  habilesDeSolicitud,
  parsearDestinatarios,
  parsearDocumentos,
  pendientesDelExpediente,
  presentacionDe,
  sumarHabiles,
  type FilaDocumento,
  type SolicitudConDestinatarios,
} from '@/lib/seiaScraper'

/**
 * El scraper reemplaza un archivo que hoy baja una persona. Si se equivoca, el
 * comité reclama oficios que ya se respondieron o deja pasar los que no.
 *
 * Los casos de acá salieron de correrlo contra 14 expedientes reales y
 * comparar con los 638 oficios del Excel ya importado: NINGUNO es inventado.
 * Los dos que costaron descubrir —las filas sin enlace y los destinatarios que
 * no son organismos— están marcados.
 */

// Estructura real de `documentos.php`, recortada a lo que se parsea.
const fila = (celdas: string[], opts: { idDoc?: number } = {}) => {
  const doc = opts.idDoc
    ? `<a href='https://seia.sea.gob.cl/documentos/documento.php?idDocumento=${opts.idDoc}'>${celdas[3]}</a>`
    : celdas[3]
  const tds = celdas.map((c, i) => `<td>${i === 3 ? doc : c}</td>`).join('')
  return `<tr>${tds}</tr>`
}

const SEA = 'Servicio Evaluación Ambiental, X Región de Los Lagos'

describe('parsearDocumentos', () => {
  it('lee una fila con enlace', () => {
    const html = fila(['5', '20261010279', '2026-10-42-5', 'Oficio solicitud de evaluación DIA', SEA, '16 destinatarios', '30/03/2026 17:24:05', ''], { idDoc: 2168161981 })
    const [d] = parsearDocumentos(html)
    expect(d).toEqual<FilaDocumento>({
      n: 5,
      folio: '20261010279',
      tipo: 'Oficio solicitud de evaluación DIA',
      remitidoPor: SEA,
      destinadoA: null,
      destinatarios: 16,
      idDocumento: 2168161981,
      fecha: '2026-03-30',
    })
  })

  /**
   * EL GOTCHA. En «Parque Gramado» hay 11 respuestas en filas sin enlace al
   * documento. Filtrarlas —que es lo natural si uno busca «el documento»—
   * dejaba a 11 organismos pendientes para siempre.
   */
  it('lee también la fila SIN enlace al documento', () => {
    const html = fila(['15', '', '2026-10-42-15', 'Oficio pronunciamiento con observaciones a la DIA', 'DGA, Región de Los Lagos', SEA, '09/12/2025 10:00:00', ''])
    const [d] = parsearDocumentos(html)
    expect(d.idDocumento).toBeNull()
    expect(d.remitidoPor).toBe('DGA, Región de Los Lagos')
    expect(d.tipo).toBe('Oficio pronunciamiento con observaciones a la DIA')
  })

  it('distingue un destinatario único de un recuento', () => {
    const unico = parsearDocumentos(fila(['7', '', 'c', 'Solicitud de evaluación de DIA a municipalidad', SEA, 'Ilustre Municipalidad de Puerto Varas', '30/03/2026 17:25:02', '']))
    expect(unico[0].destinadoA).toBe('Ilustre Municipalidad de Puerto Varas')
    expect(unico[0].destinatarios).toBeNull()

    const varios = parsearDocumentos(fila(['5', '', 'c', 'Oficio solicitud de evaluación DIA', SEA, '16 destinatarios', '30/03/2026 17:24:05', '']))
    expect(varios[0].destinadoA).toBeNull()
    expect(varios[0].destinatarios).toBe(16)
  })

  it('descarta las filas de la tabla de cabecera del proyecto', () => {
    const cabecera = '<tr><td>Parque Gramado</td><td>DIA</td><td>Parque Gramado SPA</td></tr>'
    expect(parsearDocumentos(cabecera)).toEqual([])
  })

  it('descarta la fila sin fecha válida', () => {
    expect(parsearDocumentos(fila(['1', '', 'c', 'Algo', SEA, '', 'sin fecha', '']))).toEqual([])
  })

  it('decodifica las entidades HTML del tipo', () => {
    const html = fila(['1', '', 'c', 'Aclaraciones, rectificaciones y/o ampliaciones &amp; anexos', SEA, '', '01/01/2026 10:00:00', ''])
    expect(parsearDocumentos(html)[0].tipo).toContain('& anexos')
  })
})

describe('fechaDesdeTabla y contarDestinatarios', () => {
  it('convierte dd/mm/yyyy con hora a ISO', () => {
    expect(fechaDesdeTabla('24/03/2026 13:16:09')).toBe('2026-03-24')
  })
  it('devuelve null sin fecha', () => {
    expect(fechaDesdeTabla('')).toBeNull()
    expect(fechaDesdeTabla(null)).toBeNull()
  })
  it('cuenta «10 destinatarios» y no un nombre', () => {
    expect(contarDestinatarios('10 destinatarios')).toBe(10)
    expect(contarDestinatarios('1 destinatario')).toBe(1)
    expect(contarDestinatarios('Gobierno Regional, Región de Los Lagos')).toBeNull()
  })
})

describe('parsearDestinatarios', () => {
  const html = `
    <script>var x = 1;</script>
    <div>Solicitud de evaluación de Adenda</div>
    <h3>DESTINATARIOS</h3>
    <ul>
      <li>CONADI, Región de Los Lagos</li>
      <li>Consejo de Monumentos Nacionales</li>
      <li>DGA, Región de Los Lagos</li>
    </ul>
    <button>Cerrar</button>
    <div>pie de página que no va</div>`

  it('lee la lista y corta en «Cerrar»', () => {
    expect(parsearDestinatarios(html)).toEqual([
      'CONADI, Región de Los Lagos',
      'Consejo de Monumentos Nacionales',
      'DGA, Región de Los Lagos',
    ])
  })

  it('devuelve vacío si la página no trae la lista', () => {
    expect(parsearDestinatarios('<html><body>Error</body></html>')).toEqual([])
  })
})

describe('clasificación de documentos', () => {
  it('reconoce las solicitudes que abren plazo', () => {
    for (const t of [
      'Oficio solicitud de evaluación DIA',
      'Solicitud de evaluación de Adenda',
      'Solicitud de evaluación de EIA',
      'Solicitud de Evaluación de Adenda Complementaria',
      'Solicitud de evaluación de DIA a municipalidad',
      'Solicitud de evaluación de EIA a autoridad marítima',
    ]) expect(esSolicitud(t)).toBe(true)
  })

  // Recuerda un plazo que ya corre; no abre uno nuevo. El Excel tampoco lo
  // lista como tipo de oficio.
  it('NO cuenta el oficio que reitera', () => {
    expect(esSolicitud('Oficio Reitera Solicitud de Pronunciamiento')).toBe(false)
  })

  it('reconoce las tres formas de responder', () => {
    expect(esRespuesta('Oficio pronunciamiento conforme sobre DIA')).toBe(true)
    expect(esRespuesta('Oficio pronunciamiento con observaciones sobre adenda')).toBe(true)
    // La menos obvia: sin ella el SAG queda debiendo un oficio que no va a mandar.
    expect(esRespuesta('Oficio no participación en la evaluación')).toBe(true)
  })

  it('no confunde otros documentos con respuestas', () => {
    for (const t of ['Adenda', 'Acta de reunión', 'Notificación de documento', 'Carta titular']) {
      expect(esRespuesta(t)).toBe(false)
    }
  })

  it('reconoce lo que cierra una ronda', () => {
    expect(cierraRonda('Informe consolidado de solicitud de aclaraciones, rectificaciones y/o ampliaciones a la DIA (ICSARA)')).toBe(true)
    expect(cierraRonda('Informe consolidado complementario de solicitud de aclaraciones, rectificaciones o ampliaciones a la Adenda DIA')).toBe(true)
    expect(cierraRonda('Resolución de Calificación Ambiental')).toBe(true)
    expect(cierraRonda('Adenda')).toBe(false)
  })

  /**
   * El caso que el Excel delató: el scraper daba por pendientes 27 oficios de
   * 2023 y 2024, con plazos vencidos hacía uno y dos años. Los 5 expedientes
   * involucrados estaban cerrados con «Término Anticipado» — 5 de 5.
   */
  it('reconoce el cierre del expediente entero', () => {
    expect(cierraRonda('Resolución de Término Anticipado a la DIA')).toBe(true)
    expect(cierraRonda('Resolución de Término Anticipado al EIA')).toBe(true)
    expect(cierraRonda('Resolución que acoge el desistimiento')).toBe(true)
  })

  // La admisibilidad ABRE el expediente; confundirla con un cierre dejaría
  // todo proyecto vivo sin un solo oficio pendiente.
  it('no confunde la admisibilidad con un cierre', () => {
    expect(cierraRonda('Resolución de Admisibilidad')).toBe(false)
    expect(cierraRonda('Resolución Exenta')).toBe(false)
    expect(cierraRonda('Resolución de Extensión de la Suspensión de Plazo')).toBe(false)
    expect(cierraRonda('Resolución de ampliación de plazo')).toBe(false)
  })

  it('deduce la presentación del tipo', () => {
    expect(presentacionDe('Oficio solicitud de evaluación DIA')).toBe('DIA')
    expect(presentacionDe('Solicitud de evaluación de EIA')).toBe('EIA')
    expect(presentacionDe('Solicitud de evaluación de Adenda')).toBeNull()
  })
})

describe('esOaecaConsultable', () => {
  // Estos metían hasta 7 filas falsas en un solo expediente.
  it('descarta al propio SEA, que pregunta en vez de responder', () => {
    expect(esOaecaConsultable('Servicio Evaluación Ambiental, XV Región de Arica y Parinacota')).toBe(false)
    expect(esOaecaConsultable('Servicio de Evaluación Ambiental Dirección Ejecutiva')).toBe(false)
    expect(esOaecaConsultable('SEA')).toBe(false)
  })

  it('descarta las cuentas internas de evaluador', () => {
    expect(esOaecaConsultable('Evaluador SEREMI de Salud (01)')).toBe(false)
    expect(esOaecaConsultable('Evaluador Gobernación Marítima de Arica')).toBe(false)
  })

  it('deja pasar los organismos de verdad', () => {
    for (const n of [
      'DGA, Región de Los Lagos',
      'Consejo de Monumentos Nacionales',
      'Ilustre Municipalidad de Puerto Varas',
      'Servicio de Biodiversidad y Áreas Protegidas Los Lagos',
      'Subsecretaría de Pesca y Acuicultura',
    ]) expect(esOaecaConsultable(n)).toBe(true)
  })
})

describe('plazos', () => {
  // Los números salen de los 568 oficios ya importados, no del reglamento.
  it('usa los días observados por tipo y presentación', () => {
    expect(habilesDeSolicitud('Oficio solicitud de evaluación DIA', 'DIA')).toBe(16)
    expect(habilesDeSolicitud('Solicitud de evaluación de EIA', 'EIA')).toBe(31)
    expect(habilesDeSolicitud('Solicitud de evaluación de Adenda', 'DIA')).toBe(11)
    expect(habilesDeSolicitud('Solicitud de evaluación de Adenda', 'EIA')).toBe(16)
    expect(habilesDeSolicitud('Solicitud de Evaluación de Adenda Complementaria', 'DIA')).toBe(11)
  })

  // «Solicitud de evaluación de Adenda» es la misma cadena para 11 y para 16
  // días: sin la presentación del expediente se estimaría mal un tercio.
  it('la Adenda depende de la presentación, no del nombre', () => {
    expect(habilesDeSolicitud('Solicitud de evaluación de Adenda', 'DIA'))
      .not.toBe(habilesDeSolicitud('Solicitud de evaluación de Adenda', 'EIA'))
  })

  it('salta los fines de semana', () => {
    // 2026-09-16 es miércoles. 11 hábiles → 2026-10-01 (el plazo real de Gramado).
    expect(sumarHabiles('2026-09-16', 11)).toBe('2026-10-01')
  })

  it('un viernes más un hábil cae el lunes', () => {
    expect(sumarHabiles('2026-10-02', 1)).toBe('2026-10-05')
  })
})

// ── El cálculo completo ──────────────────────────────────────────────────────

describe('pendientesDelExpediente', () => {
  const doc = (over: Partial<FilaDocumento> & { n: number; tipo: string; fecha: string }): FilaDocumento => ({
    folio: null, remitidoPor: null, destinadoA: null, destinatarios: null, idDocumento: null, ...over,
  })

  const solicitud = (fecha: string, destinatarios: string[], tipo = 'Solicitud de evaluación de Adenda', n = 1): SolicitudConDestinatarios => ({
    fila: doc({ n, tipo, fecha, remitidoPor: SEA, destinatarios: destinatarios.length }),
    destinatarios,
  })

  const respuesta = (n: number, fecha: string, de: string, tipo = 'Oficio pronunciamiento conforme sobre adenda') =>
    doc({ n, tipo, fecha, remitidoPor: de, destinadoA: SEA })

  it('el que no respondió queda pendiente', () => {
    const s = solicitud('2026-09-16', ['DGA, Región de Los Lagos', 'CONADI, Región de Los Lagos'])
    const r = pendientesDelExpediente([s], [s.fila, respuesta(2, '2026-09-23', 'CONADI, Región de Los Lagos')], 'DIA')
    expect(r.map(p => p.oaeca)).toEqual(['DGA, Región de Los Lagos'])
    expect(r[0].fechaLimite).toBe('2026-10-01')
  })

  // La respuesta de la ronda anterior no sirve para la nueva.
  it('haber respondido ANTES de la solicitud no cuenta', () => {
    const s = solicitud('2026-09-16', ['DGA, Región de Los Lagos'])
    const docs = [s.fila, respuesta(2, '2026-04-20', 'DGA, Región de Los Lagos')]
    expect(pendientesDelExpediente([s], docs, 'DIA').map(p => p.oaeca)).toEqual(['DGA, Región de Los Lagos'])
  })

  it('responder el mismo día cierra el pendiente', () => {
    const s = solicitud('2026-09-16', ['DGA, Región de Los Lagos'])
    const docs = [s.fila, respuesta(2, '2026-09-16', 'DGA, Región de Los Lagos')]
    expect(pendientesDelExpediente([s], docs, 'DIA')).toEqual([])
  })

  it('compara organismos sin importar mayúsculas ni espacios', () => {
    const s = solicitud('2026-09-16', ['DGA,  Región de Los Lagos'])
    const docs = [s.fila, respuesta(2, '2026-09-20', 'dga, región de los lagos')]
    expect(pendientesDelExpediente([s], docs, 'DIA')).toEqual([])
  })

  /**
   * El caso que llevó de 9 a 7 en «Parque Gramado»: la ronda de la DIA dejó a
   * dos organismos sin responder, el ICSARA la cerró, y la Adenda abrió otra.
   * El Excel lista solo los de la Adenda.
   */
  it('el ICSARA cierra la ronda anterior', () => {
    const vieja = solicitud('2026-03-30', ['SEC, Región de Los Lagos'], 'Oficio solicitud de evaluación DIA', 5)
    const nueva = solicitud('2026-09-16', ['DGA, Región de Los Lagos'], 'Solicitud de evaluación de Adenda', 57)
    const icsara = doc({ n: 32, tipo: 'Informe consolidado de solicitud de aclaraciones, rectificaciones y/o ampliaciones a la DIA (ICSARA)', fecha: '2026-05-13', remitidoPor: SEA })
    const r = pendientesDelExpediente([vieja, nueva], [vieja.fila, nueva.fila, icsara], 'DIA')
    expect(r.map(p => p.oaeca)).toEqual(['DGA, Región de Los Lagos'])
  })

  it('sin cierre de ronda, lo viejo sigue pendiente', () => {
    const vieja = solicitud('2026-03-30', ['SEC, Región de Los Lagos'], 'Oficio solicitud de evaluación DIA', 5)
    expect(pendientesDelExpediente([vieja], [vieja.fila], 'DIA').map(p => p.oaeca))
      .toEqual(['SEC, Región de Los Lagos'])
  })

  // Las pide el mismo día por documentos distintos; las dos siguen vivas.
  it('convive con las rondas paralelas de municipalidad y gobierno regional', () => {
    const general = solicitud('2026-03-30', ['DGA, Región de Los Lagos'], 'Oficio solicitud de evaluación DIA', 5)
    const muni = solicitud('2026-03-30', ['Ilustre Municipalidad de Puerto Varas'], 'Solicitud de evaluación de DIA a municipalidad', 7)
    const r = pendientesDelExpediente([general, muni], [general.fila, muni.fila], 'DIA')
    expect(r.map(p => p.oaeca).sort()).toEqual(['DGA, Región de Los Lagos', 'Ilustre Municipalidad de Puerto Varas'])
  })

  it('gana la solicitud más reciente cuando un organismo está en dos', () => {
    const vieja = solicitud('2026-03-30', ['DGA, Región de Los Lagos'], 'Oficio solicitud de evaluación DIA', 5)
    const nueva = solicitud('2026-09-16', ['DGA, Región de Los Lagos'], 'Solicitud de evaluación de Adenda', 57)
    const r = pendientesDelExpediente([vieja, nueva], [vieja.fila, nueva.fila], 'DIA')
    expect(r).toHaveLength(1)
    expect(r[0].tipoOficio).toBe('Solicitud de evaluación de Adenda')
    expect(r[0].fechaOficio).toBe('2026-09-16')
  })

  it('filtra al SEA y a los evaluadores de la lista de destinatarios', () => {
    const s = solicitud('2026-09-16', [
      'DGA, Región de Los Lagos',
      'Servicio Evaluación Ambiental, X Región de Los Lagos',
      'Evaluador SEREMI de Salud (01)',
    ])
    expect(pendientesDelExpediente([s], [s.fila], 'DIA').map(p => p.oaeca)).toEqual(['DGA, Región de Los Lagos'])
  })

  it('ordena por el plazo más urgente', () => {
    const a = solicitud('2026-09-01', ['A, Región de Los Lagos'], 'Solicitud de evaluación de Adenda', 1)
    const b = solicitud('2026-09-16', ['B, Región de Los Lagos'], 'Solicitud de evaluación de Adenda', 2)
    const r = pendientesDelExpediente([a, b], [a.fila, b.fila], 'DIA')
    expect(r.map(p => p.oaeca)).toEqual(['A, Región de Los Lagos', 'B, Región de Los Lagos'])
  })

  it('un tipo sin regla de plazo entra igual, sin fecha límite', () => {
    const s = solicitud('2026-09-16', ['X, Región de Los Lagos'], 'Solicitud de evaluación de algo nuevo', 1)
    const [p] = pendientesDelExpediente([s], [s.fila], null)
    expect(p.fechaLimite).toBeNull()
  })
})

describe('claveOrganismo', () => {
  it('normaliza para comparar', () => {
    expect(claveOrganismo('  DGA,   Región de Los Lagos ')).toBe(claveOrganismo('dga, Región de los lagos'))
  })
  it('no junta dos regiones del mismo organismo', () => {
    expect(claveOrganismo('DGA, Región de Los Lagos')).not.toBe(claveOrganismo('DGA, Región de Los Ríos'))
  })
})

describe('emparejarOficios', () => {
  const v = (clave: string, id_documento: number | null) => ({ clave, id_documento })
  const g = (id: number, clave: string, id_documento: number | null, estado = 'pendiente') => ({ id, clave, id_documento, estado })

  it('dos filas del mismo organismo: actualiza la del documento vigente y cierra la otra (Desaladora La Serena)', () => {
    // 264 = oficio general (…158), 276 = oficio específico (…706); el SEIA lista el …706.
    const r = emparejarOficios([v('gob maritima', 706)], [g(264, 'gob maritima', 158), g(276, 'gob maritima', 706)])
    expect(r.pares.map(([, x]) => x.id)).toEqual([276])
    expect(r.sobrantes.map(x => x.id)).toEqual([264])
    expect(r.nuevos).toEqual([])
  })

  it('una sola fila con documento nuevo (Adenda): se reusa la fila', () => {
    const r = emparejarOficios([v('dga', 900)], [g(1, 'dga', 100)])
    expect(r.pares.map(([, x]) => x.id)).toEqual([1])
    expect(r.sobrantes).toEqual([])
  })

  it('organismo que ya no figura queda sobrante; uno nuevo se inserta; un resuelto no sobra', () => {
    const r = emparejarOficios([v('sag', 5)], [g(1, 'conaf', 5), g(2, 'seremi salud', 5, 'resuelto')])
    expect(r.nuevos.map(x => x.clave)).toEqual(['sag'])
    expect(r.sobrantes.map(x => x.id)).toEqual([1])
  })

  it('reabre un resuelto solo si no hay un pendiente del mismo organismo', () => {
    const r = emparejarOficios([v('dga', 9)], [g(1, 'dga', 7, 'resuelto'), g(2, 'dga', 8)])
    expect(r.pares.map(([, x]) => x.id)).toEqual([2])
  })

  it('nunca pasa una fila a un documento que ya tiene otra fila del organismo', () => {
    // El …706 está en una fila resuelta: se reabre esa, no se pisa la pendiente.
    const r = emparejarOficios([v('gob maritima', 706)], [g(264, 'gob maritima', 158), g(276, 'gob maritima', 706, 'resuelto')])
    expect(r.pares.map(([, x]) => x.id)).toEqual([276])
    expect(r.sobrantes.map(x => x.id)).toEqual([264])
  })
})
