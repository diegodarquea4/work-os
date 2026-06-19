/**
 * Generador del template Excel para carga masiva de iniciativas.
 *
 * Browser-only — usa XLSX.writeFile que abre el dialog de descarga del browser.
 * El servidor reutiliza `TEMPLATE_COLS` desde aquí para validar headers contra
 * el archivo que sube el usuario.
 *
 * Extraído de NationalDashboard.tsx para que tanto el flow "import directo"
 * como el flow "propuesta + aprobación" descarguen exactamente el mismo
 * archivo de partida (single source of truth).
 */

import * as XLSX from 'xlsx'
import type { Iniciativa } from './projects'
import type { RegionEje } from './types'
import { composeEjeLabel } from './ejes'

export const TEMPLATE_COLS = [
  { key: '#',                       label: '#',                       desc: '⚠ SOLO para actualizar existentes. DEJAR VACÍO para crear nueva iniciativa — NO uses numeración propia',                                                                                                                  wch: 6  },
  { key: 'region',                  label: 'Región',                  desc: 'Nombre de la región (ej: Arica y Parinacota, Metropolitana, Los Ríos). Obligatorio si # está vacío',                                                                                                                  wch: 22 },
  { key: 'nombre',                  label: 'Nombre Iniciativa',       desc: 'Nombre completo de la iniciativa territorial',                                                                                                                                                                          wch: 52 },
  { key: 'eje',                     label: 'Eje',                     desc: 'Eje estratégico regional — formato "Eje N: Nombre" (ej: "Eje 1: Infraestructura"). Debe coincidir con el catálogo de la región — ver hoja "Ejes válidos". Si necesitas un eje nuevo, pídele a admin DCI agregarlo desde "Gestionar ejes".', wch: 44 },
  { key: 'eje_gobierno',            label: 'Eje Gobierno',            desc: 'Valores: Economía | Social | Seguridad  (varía por región — definir con la Delegación)',                                                                                                                              wch: 16 },
  { key: 'ministerio',              label: 'Ministerio',              desc: 'Ministerio responsable. Multi-ministerio: separar con PUNTO Y COMA. Ej: MINVU;MOP. Acepta también el separador antiguo · por compatibilidad.',                                                                       wch: 32 },
  { key: 'comuna',                  label: 'Comuna',                  desc: 'Texto libre. Multi-comuna: separar con PUNTO Y COMA. Ej: Antofagasta;Calama. Dejar vacío si abarca toda la región.',                                                                                                wch: 24 },
  { key: 'etapa_actual',            label: 'Etapa Actual',            desc: 'Valores: Preinversión | Prefactibilidad | Diseño | Ejecución | Terminado',                                                                                                                                              wch: 22 },
  { key: 'estado_termino_gobierno', label: 'Estado Término Gob.',     desc: 'Inaugurado/Terminado/Presentado | Término Diseño | Inicio Obras/Programa | Término Obras/Programa | Término Etapa Preinversional | Adjudicación de Licitación | Otro',                                                wch: 40 },
  { key: 'proximo_hito',            label: 'Próximo Hito',            desc: 'Otro | Obtención RS | Obtención Financiamiento | Presentación Core | Publicación Bases Licitación | Adjudicación Licitación | Término Diseño/Preinversión | Primera Piedra | Inicio Obras/Programa | Inicio Obras | Término Obras/Programa | Término Obras | Inauguración | Finalizado', wch: 42 },
  { key: 'fecha_proximo_hito',      label: 'Fecha Próximo Hito',      desc: 'Formato DD-MM-AAAA o DD/MM/AAAA (ej: 31-12-2027 o 31/12/2027). También acepta el formato Fecha corta de Excel. Puede estar vacío.',                                                                                                                                                            wch: 28 },
  { key: 'prioridad',               label: 'Prioridad',               desc: 'Valores: Alta | Media | Baja',                                                                                                                                                                                          wch: 14 },
  { key: 'fuente_financiamiento',   label: 'Fuente Financiamiento',   desc: 'Valores: FNDR | Mixto | Sectorial | Privado | FONDEMA | PEDZE — puede estar vacío',                                                                                                                                    wch: 24 },
  { key: 'codigo_bip',              label: 'Código BIP',              desc: 'Código numérico del BIP — puede estar vacío si no aplica',                                                                                                                                                              wch: 16 },
  { key: 'rat',                     label: 'RAT',                     desc: 'Valores: No Requiere | No Ingresado | En Tramitación | FI | IN | OT | RE | RS | AD | CF',                                                                                                                             wch: 20 },
  { key: 'estado_semaforo',         label: 'Semáforo',                desc: 'Valores: verde | ambar | rojo | gris  — puede estar vacío',                                                                                                                                                            wch: 12 },
  { key: 'pct_avance',              label: '% Avance',                desc: 'Número entero 0–100 — puede estar vacío',                                                                                                                                                                              wch: 12 },
  { key: 'en_foco',                 label: 'En Foco',                 desc: 'Valores: Sí | No  — puede estar vacío',                                                                                                                                                                                wch: 10 },
  { key: 'capa',                    label: 'Capa',                    desc: 'Nivel de importancia: l (las prioridades) | ll (más importante) | lll (menos importante, default). Solo admin/editor puede modificar — propuestas regionales con capa quedan pendientes de aprobación.',                wch: 14 },
  { key: 'inversion_mm',            label: 'Inversión ($MM)',         desc: 'Número en millones de pesos, puede tener decimales  (ej: 1500  o  1500.5) — puede estar vacío',                                                                                                                        wch: 18 },
  { key: 'origen',                  label: 'Origen',                  desc: 'Texto libre — fuente u origen de la iniciativa (ej: Plan Regional, GORE, Delegación) — puede estar vacío',                                                                                                              wch: 24 },
  { key: 'descripcion',             label: 'Descripción',             desc: 'Texto libre — descripción detallada de la iniciativa — puede estar vacío',                                                                                                                                              wch: 54 },
  { key: 'tags',                    label: 'Etiquetas',               desc: 'Libres, separadas por PUNTO Y COMA (;). Ej: Costa;Urgente;Salud, bienestar. Usar ; permite tags con coma dentro. Puede estar vacío. Para BORRAR todas las etiquetas, pídele a admin DCI editar la ficha — celda vacía aquí no borra.', wch: 32 },
] as const

const INSTRUCTIONS_AOA: (string | number)[][] = [
  ['GUÍA DE LLENADO — Plan Regional de Gobierno · Importación de Iniciativas Territoriales', '', '', ''],
  ['División de Coordinación Interministerial  ·  Ministerio del Interior', '', '', ''],
  ['', '', '', ''],
  ['CÓMO USAR ESTE ARCHIVO', '', '', ''],
  ['1. Trabaja SOLO en la hoja "Carga". No mover ni renombrar esa hoja.', '', '', ''],
  ['2. La fila 2 (descripción de campos) NO se importa — es solo guía.', '', '', ''],
  ['3. Agrega los datos a partir de la fila 3.', '', '', ''],
  ['4. Para ACTUALIZAR una iniciativa existente: deja la celda en blanco si NO quieres tocar ese campo. (no se borra el valor previo).', '', '', ''],
  ['5. El responsable, los seguimientos y los documentos se gestionan desde el panel — no van en este archivo.', '', '', ''],
  ['6. Sube el archivo completado desde el botón "Importar" en el Dashboard. Si eres delegación regional, usa "Proponer actualización" en Mi Región.', '', '', ''],
  ['', '', '', ''],
  ['NUEVAS INICIATIVAS vs. ACTUALIZACIONES', '', '', ''],
  ['— Para CREAR una iniciativa nueva: deja la columna # vacía. Llena Región, Nombre Iniciativa, Eje y Ministerio.', '', '', ''],
  ['— Para ACTUALIZAR una existente: pon su # en la primera columna. Llena solo los campos que quieres cambiar; los que dejes vacíos quedan sin tocar.', '', '', ''],
  ['— El código de iniciativa (ej: AY-01-001) se genera automáticamente al crear. No es necesario llenarlo.', '', '', ''],
  ['', '', '', ''],
  ['CAMPO', 'OBLIGATORIO', 'VALORES PERMITIDOS', 'DESCRIPCIÓN'],
  ['#', 'Solo para actualizar', 'Número entero', 'Número de la iniciativa existente. DEJAR VACÍO para crear una nueva.'],
  ['Región', 'Sí (si # está vacío)', 'Texto libre', 'Nombre de la región (ej: Arica y Parinacota, Metropolitana, Los Ríos).'],
  ['Nombre Iniciativa', 'Sí', 'Texto libre', 'Nombre completo de la iniciativa territorial.'],
  ['Eje', 'Sí (si # está vacío)', 'Formato: "Eje N: Nombre" (ver hoja "Ejes válidos")', 'Eje estratégico de la región. Cada región tiene su catálogo formal. Si el eje que necesitas no existe ahí, pídele a admin DCI agregarlo desde "Gestionar ejes".'],
  ['Eje Gobierno', 'No', 'Economía | Social | Seguridad', 'Eje presidencial. Varía por región — definir con la Delegación. No se auto-deduce del Eje Regional.'],
  ['Ministerio', 'Sí', 'Texto libre — multi separados por ;', 'Ministerio responsable de la ejecución. Para multi-ministerio, separá con punto y coma (ej: MINVU;MOP).'],
  ['Comuna', 'No', 'Texto libre — multi separadas por ;', 'Comuna de ejecución. Para multi-comuna, separá con punto y coma (ej: Antofagasta;Calama). Dejar vacío si abarca toda la región.'],
  ['Etapa Actual', 'No', 'Preinversión | Prefactibilidad | Diseño | Ejecución | Terminado', 'Etapa en que se encuentra actualmente la iniciativa.'],
  ['Estado Término Gob.', 'No', 'Inaugurado/Terminado/Presentado · Término Diseño · Inicio Obras/Programa · Término Obras/Programa · Término Etapa Preinversional · Adjudicación de Licitación · Otro', 'Estado esperado al término del gobierno.'],
  ['Próximo Hito', 'No', 'Otro · Obtención RS · Obtención Financiamiento · Presentación Core · Publicación Bases Licitación · Adjudicación Licitación · Término Diseño/Preinversión · Primera Piedra · Inicio Obras/Programa · Término Obras/Programa · Inauguración · Finalizado', 'Próximo hito concreto esperado.'],
  ['Fecha Próximo Hito', 'No', 'DD-MM-AAAA  (ej: 31-12-2027)', 'Fecha estimada del próximo hito.'],
  ['Prioridad', 'No', 'Alta | Media | Baja', 'Nivel de prioridad de la iniciativa.'],
  ['Fuente Financiamiento', 'No', 'FNDR · Mixto · Sectorial · Privado · FONDEMA · PEDZE', 'Fuente de financiamiento. PEDZE = Plan Especial Zonas Extremas.'],
  ['Código BIP', 'No', 'Código numérico', 'Código del BIP/MIDESO. Dejar vacío si no aplica.'],
  ['RAT', 'No', 'No Requiere · No Ingresado · En Tramitación · FI · IN · OT · RE · RS', 'RS = Recomendación Satisfactoria; FI = Factibilidad Inicial; IN = Ingresado.'],
  ['Semáforo', 'No', 'verde · ambar · rojo · gris', 'Estado actual de la iniciativa (operativo). Por defecto "gris" = sin evaluar.'],
  ['% Avance', 'No', 'Número entero 0–100', 'Porcentaje de avance de la iniciativa.'],
  ['En Foco', 'No', 'Sí · No', 'Marca de seguimiento prioritario.'],
  ['Capa', 'No', 'l · ll · lll', 'Nivel de importancia. l = las prioridades · ll = más importante · lll = menos importante (default). Solo admin/editor edita; si una región propone capa, queda como propuesta pendiente.'],
  ['Inversión ($MM)', 'No', 'Número  (ej: 1500  o  1500.5)', 'Monto en millones de pesos. Puede estar vacío.'],
  ['Descripción', 'No', 'Texto libre', 'Descripción detallada de la iniciativa.'],
  ['Etiquetas', 'No', 'Libres, separadas por PUNTO Y COMA — ej: Costa;Urgente;Salud, bienestar', 'Tags multi-valor para agrupar iniciativas como te plazca. Una iniciativa puede tener N etiquetas. El separador es punto y coma (;) — esto permite que un tag individual lleve coma dentro (ej: "Salud, bienestar"). Sin catálogo cerrado: el control queda en la aprobación de la propuesta. Celda vacía NO borra los tags previos.'],
]

/** Arma el workbook del template con las dos hojas (Carga + Instrucciones). */
export function buildTemplateWorkbook(): XLSX.WorkBook {
  const headerRow = TEMPLATE_COLS.map(c => c.label)
  const descRow   = TEMPLATE_COLS.map(c => c.desc)
  const ws = XLSX.utils.aoa_to_sheet([headerRow, descRow])
  ws['!cols']   = TEMPLATE_COLS.map(c => ({ wch: c.wch }))
  ws['!freeze'] = { xSplit: 2, ySplit: 2 }

  const wsInstr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS_AOA)
  wsInstr['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 80 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Carga')
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')
  return wb
}

/** Browser: descarga el template directamente al disco. */
export function downloadTemplate(filename = 'template-prioridades.xlsx') {
  const wb = buildTemplateWorkbook()
  XLSX.writeFile(wb, filename)
}

// ── Pre-llenado: Excel con iniciativas actuales ─────────────────────────────

/**
 * Convierte una fecha BD `YYYY-MM-DD` al formato `DD-MM-AAAA` que espera el
 * parser (importParser.ts valida ese patrón estricto). Si la BD trae
 * timestamp con hora, igual hace match porque el regex es ancla al inicio.
 */
function formatDateForExcel(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}

/**
 * Mapeo Iniciativa → fila Excel ordenada según TEMPLATE_COLS. Devuelve
 * strings y números crudos — sin formato `$` ni `MM` — para que el parser
 * los lea sin transformación adicional.
 *
 * Si `ejeByIdMap` está disponible, la columna Eje se rellena con el label
 * canónico compuesto desde el catálogo (Eje N: Nombre). Si no, se cae al
 * string crudo de `p.eje`.
 */
function rowFromIniciativa(p: Iniciativa, ejeByIdMap?: Map<number, RegionEje>): (string | number)[] {
  return TEMPLATE_COLS.map(c => {
    switch (c.key) {
      case '#':                       return p.n
      case 'region':                  return p.region ?? ''
      case 'nombre':                  return p.nombre ?? ''
      case 'eje': {
        // Preferir el label canónico del catálogo (estable, sin typos).
        if (p.eje_id != null && ejeByIdMap) {
          const re = ejeByIdMap.get(p.eje_id)
          if (re) return composeEjeLabel(re.numero, re.nombre)
        }
        return p.eje ?? ''
      }
      case 'eje_gobierno':            return p.eje_gobierno ?? ''
      case 'ministerio':              return p.ministerio ?? ''
      case 'comuna':                  return p.comuna ?? ''
      case 'etapa_actual':            return p.etapa_actual ?? ''
      case 'estado_termino_gobierno': return p.estado_termino_gobierno ?? ''
      case 'proximo_hito':            return p.proximo_hito ?? ''
      case 'fecha_proximo_hito':      return formatDateForExcel(p.fecha_proximo_hito)
      case 'prioridad':               return p.prioridad ?? ''
      case 'fuente_financiamiento':   return p.fuente_financiamiento ?? ''
      case 'codigo_bip':              return p.codigo_bip ?? ''
      case 'rat':                     return p.rat ?? ''
      case 'estado_semaforo':         return p.estado_semaforo ?? ''
      case 'pct_avance':              return typeof p.pct_avance === 'number' ? p.pct_avance : ''
      case 'en_foco':                 return p.en_foco ? 'Sí' : 'No'
      case 'capa':                    return p.capa ?? 'lll'
      case 'inversion_mm':            return p.inversion_mm ?? ''
      case 'origen':                  return p.origen ?? ''
      case 'descripcion':             return p.descripcion ?? ''
      case 'tags':                    return Array.isArray(p.tags) ? p.tags.join(';') : ''
    }
  })
}

/**
 * Arma el workbook pre-llenado con la situación actual de las iniciativas
 * de una región. Mismo formato que el template (hoja "Carga" con header en
 * fila 1, descripciones en fila 2, datos desde la fila 3) — el parser no
 * requiere cambios.
 *
 * El delegado modifica las celdas que quiera; las que deje intactas se
 * envían igual y se aplican como "set value = current value" (operación
 * idempotente). Para crear iniciativas nuevas, agrega filas al final con
 * la columna `#` vacía — el parser ya distingue UPDATE vs INSERT.
 *
 * Si `regionEjes` se provee, agregamos una hoja "Ejes válidos" con el
 * catálogo de la región — el delegado sabe qué strings copiar literalmente
 * en la columna Eje. Sin esa hoja, queda solo la descripción guía.
 */
export function buildPrefilledWorkbook(
  iniciativas: Iniciativa[],
  regionEjes?: RegionEje[],
): XLSX.WorkBook {
  const headerRow = TEMPLATE_COLS.map(c => c.label)
  const descRow   = TEMPLATE_COLS.map(c => c.desc)
  // Mapa eje_id → RegionEje para canonical label en la columna Eje.
  const ejeByIdMap = new Map<number, RegionEje>()
  for (const re of (regionEjes ?? [])) ejeByIdMap.set(re.id, re)
  const dataRows  = iniciativas.map(p => rowFromIniciativa(p, ejeByIdMap))

  const ws = XLSX.utils.aoa_to_sheet([headerRow, descRow, ...dataRows])
  ws['!cols']   = TEMPLATE_COLS.map(c => ({ wch: c.wch }))
  ws['!freeze'] = { xSplit: 2, ySplit: 2 }

  const wsInstr = XLSX.utils.aoa_to_sheet(INSTRUCTIONS_AOA)
  wsInstr['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 80 }, { wch: 60 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Carga')
  XLSX.utils.book_append_sheet(wb, wsInstr, 'Instrucciones')

  // Hoja "Ejes válidos" — referencia visible para el delegado regional.
  // Listamos cada eje con su label canónico para copy-paste exacto. Si el
  // catálogo viene vacío, omitimos la hoja para no confundir.
  //
  // Multi-región (export del Dashboard): cuando el array trae ejes de más
  // de una región, agregamos columna "Región" al frente y ordenamos por
  // (region_cod, numero) para que sea legible quién es cuál. Single región
  // (uso histórico de Mi Región) mantiene el formato original sin columna.
  if (regionEjes && regionEjes.length > 0) {
    const uniqueRegions = new Set(regionEjes.map(e => e.region_cod))
    const isMulti = uniqueRegions.size > 1
    const sorted = [...regionEjes].sort((a, b) => {
      if (a.region_cod !== b.region_cod) return a.region_cod.localeCompare(b.region_cod)
      return a.numero - b.numero
    })
    const ejesAoA: (string | number)[][] = isMulti
      ? [
          ['EJES VÁLIDOS POR REGIÓN', '', '', ''],
          ['Copia el "Etiqueta" tal cual en la columna "Eje" de la hoja Carga.', '', '', ''],
          ['Si necesitas un eje nuevo, pídele a admin DCI agregarlo desde "Gestionar ejes" — no inventes uno acá.', '', '', ''],
          ['', '', '', ''],
          ['Región', 'Número', 'Nombre', 'Etiqueta'],
          ...sorted.map(re => [re.region_cod, re.numero, re.nombre, composeEjeLabel(re.numero, re.nombre)]),
        ]
      : [
          ['EJES VÁLIDOS DE LA REGIÓN', '', ''],
          ['Copia el "Etiqueta" tal cual en la columna "Eje" de la hoja Carga.', '', ''],
          ['Si necesitas un eje nuevo, pídele a admin DCI agregarlo desde "Gestionar ejes" — no inventes uno acá.', '', ''],
          ['', '', ''],
          ['Número', 'Nombre', 'Etiqueta'],
          ...sorted.map(re => [re.numero, re.nombre, composeEjeLabel(re.numero, re.nombre)]),
        ]
    const wsEjes = XLSX.utils.aoa_to_sheet(ejesAoA)
    wsEjes['!cols'] = isMulti
      ? [{ wch: 10 }, { wch: 10 }, { wch: 44 }, { wch: 56 }]
      : [{ wch: 10 }, { wch: 44 }, { wch: 56 }]
    XLSX.utils.book_append_sheet(wb, wsEjes, 'Ejes válidos')
  }
  return wb
}

/** Slugify para filename: quita acentos, lower, reemplaza no-alfanumérico por `-`. */
function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Browser: descarga el Excel pre-llenado con las iniciativas de la región. */
export function downloadPrefilled(
  regionName: string,
  iniciativas: Iniciativa[],
  regionEjes?: RegionEje[],
) {
  const wb = buildPrefilledWorkbook(iniciativas, regionEjes)
  const slug = slugify(regionName) || 'region'
  const fecha = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `iniciativas-${slug}-${fecha}.xlsx`)
}
