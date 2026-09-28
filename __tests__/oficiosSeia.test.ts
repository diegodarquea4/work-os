import { describe, it, expect } from 'vitest'
import {
  DIAS_VENTANA_PROXIMA_SESION,
  diasHasta,
  esParaLaProximaSesion,
  estaAtrasado,
  fechaDesdeSerial,
  idDocumentoDesdeUrl,
  idExpediente,
  idExpedienteDesdeUrl,
  indiceCartera,
  parsearPendientes,
  planificarEscritura,
  regionCodDesdeSeia,
  type FilaPendiente,
  type FilaRegistro,
  type OficioGuardado,
  type OficioImportado,
  type ProyectoCartera,
} from '@/lib/oficiosSeia'

/**
 * Los oficios pendientes del SEIA llegan por un archivo que baja una persona.
 * Nada de esto lo valida un servidor: si el parseo se equivoca, el error entra
 * a la base como si fuera dato bueno. Los casos de acá son los que de verdad
 * salieron mal al probar contra el archivo real, no una cobertura inventada.
 */

// ── Fechas ───────────────────────────────────────────────────────────────────

describe('fechaDesdeSerial', () => {
  // Valores tomados del archivo real (fila 1 de la hoja «Pendientes»).
  it('convierte los seriales del archivo', () => {
    expect(fechaDesdeSerial(44798)).toBe('2022-08-25')
    expect(fechaDesdeSerial(44819)).toBe('2022-09-15')
    expect(fechaDesdeSerial(46293)).toBe('2026-09-28')
  })

  // Excel cuenta desde el 1899-12-31 y además arrastra un 29 de febrero de
  // 1900 que nunca existió, así que la época efectiva es el 30.
  it('acierta el ancla de la época de Excel', () => {
    expect(fechaDesdeSerial(1)).toBe('1899-12-31')
  })

  // Construido en UTC a propósito: con hora local, en Chile cada serial caería
  // al día anterior y toda fecha límite quedaría corrida un día.
  it('no se corre de día por el huso horario', () => {
    expect(fechaDesdeSerial(45000)).toBe('2023-03-15')
  })

  it('tolera lo que no es fecha', () => {
    expect(fechaDesdeSerial(null)).toBeNull()
    expect(fechaDesdeSerial(undefined)).toBeNull()
    expect(fechaDesdeSerial(0)).toBeNull()
    expect(fechaDesdeSerial(-5)).toBeNull()
    expect(fechaDesdeSerial(NaN)).toBeNull()
  })
})

describe('diasHasta', () => {
  it('cuenta hacia adelante y hacia atrás', () => {
    expect(diasHasta('2026-10-05', '2026-09-28')).toBe(7)
    expect(diasHasta('2026-09-28', '2026-09-28')).toBe(0)
    expect(diasHasta('2026-09-20', '2026-09-28')).toBe(-8)
  })

  // Un cambio de hora en el medio no puede mover la cuenta: las fechas son
  // días puros y se comparan en UTC.
  it('no se descuadra cruzando el cambio de hora chileno', () => {
    expect(diasHasta('2026-09-10', '2026-09-01')).toBe(9)
  })
})

// ── Región ───────────────────────────────────────────────────────────────────

describe('regionCodDesdeSeia', () => {
  // Estas tres son el bug que apareció al correr el parseo contra el archivo
  // real: comparando por igualdad se perdían 195 de 638 oficios EN SILENCIO,
  // porque el SEIA usa el nombre largo y el panel el corto.
  it('resuelve las tres que el nombre largo rompía', () => {
    expect(regionCodDesdeSeia('Región Metropolitana de Santiago')).toBe('RM')
    expect(regionCodDesdeSeia("Región del Libertador General Bernardo O'Higgins")).toBe('VI')
    expect(regionCodDesdeSeia('Región de Magallanes y de la Antártica Chilena')).toBe('XII')
  })

  it('resuelve las 16 regiones como las escribe el SEIA', () => {
    const esperado: Record<string, string> = {
      'Región de Arica y Parinacota': 'XV',
      'Región de Tarapacá': 'I',
      'Región de Antofagasta': 'II',
      'Región de Atacama': 'III',
      'Región de Coquimbo': 'IV',
      'Región de Valparaíso': 'V',
      'Región Metropolitana de Santiago': 'RM',
      "Región del Libertador General Bernardo O'Higgins": 'VI',
      'Región del Maule': 'VII',
      'Región de Ñuble': 'XVI',
      'Región del Biobío': 'VIII',
      'Región de La Araucanía': 'IX',
      'Región de Los Ríos': 'XIV',
      'Región de Los Lagos': 'X',
      'Región de Aysén del General Carlos Ibáñez del Campo': 'XI',
      'Región de Magallanes y de la Antártica Chilena': 'XII',
    }
    for (const [nombre, cod] of Object.entries(esperado)) {
      expect(regionCodDesdeSeia(nombre), nombre).toBe(cod)
    }
  })

  // Lo que el SEIA pone donde va la región pero NO es una región. Un oficio así
  // solo consigue región si su proyecto está en alguna cartera.
  it('devuelve null para lo que no es una región', () => {
    expect(regionCodDesdeSeia('Interregional')).toBeNull()
    expect(regionCodDesdeSeia('Nacional')).toBeNull()
    expect(regionCodDesdeSeia('Municipio')).toBeNull()
    expect(regionCodDesdeSeia('Gobernación Marítima')).toBeNull()
    expect(regionCodDesdeSeia(null)).toBeNull()
    expect(regionCodDesdeSeia('')).toBeNull()
  })

  it('no se cuelga de tildes ni de mayúsculas', () => {
    expect(regionCodDesdeSeia('REGION DE TARAPACA')).toBe('I')
    expect(regionCodDesdeSeia('  región del biobio  ')).toBe('VIII')
  })
})

// ── Llaves ───────────────────────────────────────────────────────────────────

describe('llaves del archivo', () => {
  it('saca el idDocumento del enlace al oficio', () => {
    expect(idDocumentoDesdeUrl('https://seia.sea.gob.cl/documentos/documento.php?idDocumento=2156826640'))
      .toBe(2156826640)
    expect(idDocumentoDesdeUrl('https://seia.sea.gob.cl/documentos/documento.php')).toBeNull()
    expect(idDocumentoDesdeUrl(null)).toBeNull()
  })

  it('saca el expediente de una URL de ficha', () => {
    expect(idExpedienteDesdeUrl('https://seia.sea.gob.cl/expediente/expediente.php?id_expediente=2156785500&modo=ficha'))
      .toBe(2156785500)
    expect(idExpedienteDesdeUrl('cualquier cosa')).toBeNull()
  })

  it('normaliza el ID de expediente venga número o texto', () => {
    expect(idExpediente(2156785500)).toBe(2156785500)
    expect(idExpediente('2156785500')).toBe(2156785500)
    expect(idExpediente('')).toBeNull()
    expect(idExpediente(null)).toBeNull()
  })
})

// ── El cruce con la cartera ──────────────────────────────────────────────────

const proy = (over: Partial<ProyectoCartera> & { id: number }): ProyectoCartera => ({
  region_cod: 'X',
  origen_sistema: 'seia',
  origen_id: 'seia_2156785500',
  ...over,
})

describe('indiceCartera', () => {
  // El detalle que habría dado cero coincidencias sin un error: la cartera
  // hereda el id del catálogo v2 (`seia_${EXPEDIENTE_ID}`) y el archivo trae el
  // número pelado.
  it('entiende el prefijo con que la cartera guarda el expediente', () => {
    const idx = indiceCartera([proy({ id: 7 })])
    expect(idx.get(2156785500)?.map(p => p.id)).toEqual([7])
  })

  it('ignora los proyectos que no vienen del SEIA', () => {
    const idx = indiceCartera([
      proy({ id: 1, origen_sistema: 'mop', origen_id: 'mop_999' }),
      proy({ id: 2, origen_sistema: null, origen_id: null }),
      proy({ id: 3, origen_sistema: 'seia', origen_id: '2156785500' }), // sin prefijo
    ])
    expect(idx.size).toBe(0)
  })

  // Un proyecto interregional puede estar en la cartera de dos regiones, y las
  // dos lo tratan en su sesión.
  it('junta los proyectos de dos regiones bajo el mismo expediente', () => {
    const idx = indiceCartera([
      proy({ id: 1, region_cod: 'X' }),
      proy({ id: 2, region_cod: 'XIV' }),
    ])
    expect(idx.get(2156785500)?.map(p => p.region_cod)).toEqual(['X', 'XIV'])
  })
})

// ── Parseo ───────────────────────────────────────────────────────────────────

const fila = (over: Partial<FilaPendiente> = {}): FilaPendiente => ({
  'Ministerio': 'GORE',
  'OAECCA': 'Gobierno Regional',
  'OAECCA (SEA)': 'Gobierno Regional, Región de Tarapacá',
  'Nombre del proyecto': 'Parque Fotovoltaico Oxum del Tamarugal',
  'Tipo de presentación': 'DIA',
  'Región': 'Tarapacá',
  'Inversión': '326.484',
  'Tipo de oficio': 'Solicitud de evaluación de DIA a gobierno regional',
  'Fecha del oficio': 44798,
  'Fecha límite de respuesta': 44819,
  'Estado de plazo': 'Atrasado',
  'Emisor': 'Servicio Evaluación Ambiental, I Región de Tarapaca',
  'ID expediente': 2156785500,
  'Enlace al proyecto': 'https://seia.sea.gob.cl/expediente/expediente.php?id_expediente=2156785500&modo=ficha',
  'Enlace al oficio': 'https://seia.sea.gob.cl/documentos/documento.php?idDocumento=2156826640',
  ...over,
})

const registro: FilaRegistro[] = [{
  'WEB': 'https://seia.sea.gob.cl/expediente/expediente.php?id_expediente=2156785500&modo=ficha',
  'Región': 'Región de Tarapacá',
}]

describe('parsearPendientes', () => {
  it('cuelga el oficio del proyecto de la cartera y le da SU región', () => {
    // El proyecto está en la cartera de Los Lagos aunque el SEIA lo ubique en
    // Tarapacá: manda el proyecto, que es lo que el comité sigue.
    const r = parsearPendientes([fila()], registro, [proy({ id: 7, region_cod: 'X' })])
    expect(r.oficios).toHaveLength(1)
    expect(r.oficios[0].region_cod).toBe('X')
    expect(r.oficios[0].proyecto_privado_id).toBe(7)
    expect(r.sinAsignar).toBe(0)
    // La región cruda se guarda igual, para poder auditar el mapeo después.
    expect(r.oficios[0].region_seia).toBe('Región de Tarapacá')
  })

  it('sin proyecto en la cartera entra igual, con la región del SEIA', () => {
    const r = parsearPendientes([fila()], registro, [])
    expect(r.oficios).toHaveLength(1)
    expect(r.oficios[0].region_cod).toBe('I')
    expect(r.oficios[0].proyecto_privado_id).toBeNull()
    expect(r.sinAsignar).toBe(1)
  })

  // Es lo que hace visible la bandeja: sin región la fila sería invisible,
  // porque la RLS lee por `current_user_can(..., region_cod)`.
  it('la región del proyecto sale del Registro, no de la columna del oficio', () => {
    // La columna «Región» de la hoja Pendientes es la jurisdicción del
    // organismo —por eso ahí aparecen «Nacional» y «Municipio»—, no la del
    // proyecto. Acá dicen cosas distintas y tiene que ganar el Registro.
    const r = parsearPendientes(
      [fila({ 'Región': 'Nacional' })],
      [{ ...registro[0], 'Región': 'Región de Los Lagos' }],
      [],
    )
    expect(r.oficios[0].region_cod).toBe('X')
  })

  it('el mismo oficio entra una vez por cada región que sigue el proyecto', () => {
    const r = parsearPendientes([fila()], registro, [
      proy({ id: 1, region_cod: 'X' }),
      proy({ id: 2, region_cod: 'XIV' }),
    ])
    expect(r.oficios.map(o => o.region_cod)).toEqual(['X', 'XIV'])
    expect(r.oficios.map(o => o.proyecto_privado_id)).toEqual([1, 2])
    // Misma llave natural en las dos: por eso el índice único lleva la región.
    expect(new Set(r.oficios.map(o => o.id_documento)).size).toBe(1)
  })

  it('descarta el interregional que nadie sumó, y dice por qué', () => {
    const r = parsearPendientes(
      [fila()],
      [{ ...registro[0], 'Región': 'Interregional' }],
      [],
    )
    expect(r.oficios).toHaveLength(0)
    expect(r.descartadas).toHaveLength(1)
    expect(r.descartadas[0].motivo).toContain('Interregional')
    expect(r.descartadas[0].fila).toBe(2) // encabezado + 1, como lo ve Excel
  })

  // Sin idDocumento no hay llave natural y reimportar duplicaría la fila, así
  // que es preferible perderla y reportarla.
  it('descarta la fila sin idDocumento o sin expediente', () => {
    const r = parsearPendientes(
      [fila({ 'Enlace al oficio': null }), fila({ 'ID expediente': null })],
      registro,
      [],
    )
    expect(r.oficios).toHaveLength(0)
    expect(r.descartadas.map(d => d.motivo)).toEqual([
      'sin idDocumento en el enlace al oficio',
      'sin ID de expediente',
    ])
  })

  it('convierte las fechas del archivo', () => {
    const r = parsearPendientes([fila()], registro, [])
    expect(r.oficios[0].fecha_oficio).toBe('2022-08-25')
    expect(r.oficios[0].fecha_limite).toBe('2022-09-15')
  })
})

// ── Reconciliación ───────────────────────────────────────────────────────────

const imp = (over: Partial<OficioImportado> = {}): OficioImportado => ({
  id_documento: 100,
  id_expediente: 900,
  region_cod: 'X',
  proyecto_privado_id: null,
  nombre_proyecto: 'Proyecto',
  ministerio: null, oaeca_nombre: 'CONAF', oaeca_sea: 'CONAF, Región de Los Lagos',
  tipo_oficio: null, tipo_presentacion: null,
  fecha_oficio: null, fecha_limite: null,
  emisor: null, url_proyecto: null, url_oficio: null, region_seia: null,
  ...over,
})

const guard = (over: Partial<OficioGuardado> & { id: number }): OficioGuardado => ({
  id_documento: 100,
  oaeca_sea: 'CONAF, Región de Los Lagos',
  oaeca_nombre: 'CONAF',
  region_cod: 'X',
  estado: 'pendiente',
  proyecto_privado_id: null,
  ...over,
})

describe('planificarEscritura', () => {
  it('lo que no estaba es nuevo', () => {
    const p = planificarEscritura([imp()], [])
    expect(p.nuevos).toHaveLength(1)
    expect(p.actualizar).toHaveLength(0)
    expect(p.resolver).toHaveLength(0)
  })

  // La idempotencia que hace que reimportar el mismo archivo no duplique nada.
  it('reimportar lo mismo no escribe nada', () => {
    const p = planificarEscritura([imp()], [guard({ id: 1 })])
    expect(p.nuevos).toHaveLength(0)
    expect(p.actualizar).toHaveLength(0)
    expect(p.resolver).toHaveLength(0)
  })

  // El retro-vínculo: el proyecto entró a la cartera entre una importación y
  // la siguiente, así que el oficio deja de estar «sin asignar» solo.
  it('engancha el oficio cuando su proyecto entra a la cartera', () => {
    const p = planificarEscritura([imp({ proyecto_privado_id: 7 })], [guard({ id: 1 })])
    expect(p.actualizar).toEqual([{ id: 1, cambios: { proyecto_privado_id: 7 } }])
  })

  // «Pendientes» es la lista completa de lo que falta: si un oficio dejó de
  // venir, se respondió.
  it('lo que ya no viene en el archivo se da por resuelto', () => {
    const p = planificarEscritura([], [guard({ id: 1 })])
    expect(p.resolver).toEqual([1])
  })

  it('no vuelve a resolver lo que ya estaba resuelto', () => {
    const p = planificarEscritura([], [guard({ id: 1, estado: 'resuelto' })])
    expect(p.resolver).toHaveLength(0)
  })

  // ── La llave es documento + ORGANISMO, no el documento ───────────────────
  // Un oficio del SEA se dirige a varios organismos a la vez y el expediente
  // guarda UN solo documento con todos en su «Distribución:». En el archivo
  // real son 638 oficios sobre 114 documentos, uno de ellos con 22
  // destinatarios. Tomar el documento como llave hacía que la importación
  // muriera con «duplicate key» en la primera tanda.
  it('dos organismos del mismo documento son dos oficios', () => {
    const p = planificarEscritura(
      [
        imp({ oaeca_sea: 'Ilustre Municipalidad de Arica' }),
        imp({ oaeca_sea: 'SEREMI de Salud, Región de Arica y Parinacota' }),
      ],
      [],
    )
    expect(p.nuevos).toHaveLength(2)
  })

  it('reconoce cada organismo por separado contra lo guardado', () => {
    const p = planificarEscritura(
      [imp({ oaeca_sea: 'CONAF' }), imp({ oaeca_sea: 'SAG' })],
      [guard({ id: 1, oaeca_sea: 'CONAF' })],
    )
    expect(p.nuevos.map(o => o.oaeca_sea)).toEqual(['SAG'])
    expect(p.resolver).toHaveLength(0)
  })

  // Uno responde y el otro no: solo se cierra el que dejó de venir.
  it('resuelve al organismo que respondió y deja al que no', () => {
    const p = planificarEscritura(
      [imp({ oaeca_sea: 'CONAF' })],
      [guard({ id: 1, oaeca_sea: 'CONAF' }), guard({ id: 2, oaeca_sea: 'SAG' })],
    )
    expect(p.resolver).toEqual([2])
  })

  // Se compara sin distinguir mayúsculas ni espacios: el archivo no es
  // perfectamente consistente y una diferencia de forma no puede duplicar.
  it('no duplica por mayúsculas o espacios en el nombre del organismo', () => {
    const p = planificarEscritura(
      [imp({ oaeca_sea: '  conaf, región de los lagos  ' })],
      [guard({ id: 1, oaeca_sea: 'CONAF, Región de Los Lagos' })],
    )
    expect(p.nuevos).toHaveLength(0)
  })

  // El mismo documento en dos regiones son dos oficios distintos: que una
  // región lo resuelva no puede tocar el de la otra.
  it('las dos regiones de un mismo documento se reconcilian por separado', () => {
    const p = planificarEscritura(
      [imp({ region_cod: 'X' })],
      [guard({ id: 1, region_cod: 'X' }), guard({ id: 2, region_cod: 'XIV' })],
    )
    expect(p.resolver).toEqual([2])
    expect(p.nuevos).toHaveLength(0)
  })

  it('ignora lo guardado sin llave natural', () => {
    const p = planificarEscritura([], [guard({ id: 1, id_documento: null })])
    expect(p.resolver).toHaveLength(0)
  })
})

// ── La lista de la próxima sesión ────────────────────────────────────────────

describe('esParaLaProximaSesion', () => {
  const hoy = '2026-09-28'

  // La ventana cubre el hueco COMPLETO entre sesiones. El comité sesiona cada
  // 15 días: con 14, un oficio que vence al día 15 no se ve hoy y en la
  // reunión siguiente ya está venciendo ese mismo día.
  it('cubre el intervalo entre sesiones', () => {
    expect(DIAS_VENTANA_PROXIMA_SESION).toBe(15)
    expect(esParaLaProximaSesion({ fecha_limite: '2026-10-13' }, hoy)).toBe(true)  // día 15
    expect(esParaLaProximaSesion({ fecha_limite: '2026-10-14' }, hoy)).toBe(false) // día 16
  })

  it('los atrasados van siempre, por viejos que sean', () => {
    expect(esParaLaProximaSesion({ fecha_limite: '2022-09-15' }, hoy)).toBe(true)
    expect(esParaLaProximaSesion({ fecha_limite: hoy }, hoy)).toBe(true)
  })

  it('un oficio sin plazo no entra a la lista', () => {
    expect(esParaLaProximaSesion({ fecha_limite: null }, hoy)).toBe(false)
    expect(estaAtrasado({ fecha_limite: null }, hoy)).toBe(false)
  })

  it('atrasado es haber pasado la fecha, no llegar a ella', () => {
    expect(estaAtrasado({ fecha_limite: '2026-09-27' }, hoy)).toBe(true)
    expect(estaAtrasado({ fecha_limite: hoy }, hoy)).toBe(false)
  })

  it('la ventana se puede mover sin tocar el resto', () => {
    expect(esParaLaProximaSesion({ fecha_limite: '2026-10-05' }, hoy, 7)).toBe(true)
    expect(esParaLaProximaSesion({ fecha_limite: '2026-10-06' }, hoy, 7)).toBe(false)
  })
})
