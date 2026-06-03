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

export const TEMPLATE_COLS = [
  { key: '#',                       label: '#',                       desc: '⚠ SOLO para actualizar existentes. DEJAR VACÍO para crear nueva iniciativa — NO uses numeración propia',                                                                                                                  wch: 6  },
  { key: 'region',                  label: 'Región',                  desc: 'Nombre de la región (ej: Arica y Parinacota, Metropolitana, Los Ríos). Obligatorio si # está vacío',                                                                                                                  wch: 22 },
  { key: 'nombre',                  label: 'Nombre Iniciativa',       desc: 'Nombre completo de la iniciativa territorial',                                                                                                                                                                          wch: 52 },
  { key: 'eje',                     label: 'Eje',                     desc: 'Eje estratégico regional — texto libre, definido por cada región (ej: "Eje 1: Infraestructura y Conectividad")',                                                                                                       wch: 44 },
  { key: 'eje_gobierno',            label: 'Eje Gobierno',            desc: 'Valores: Economía | Social | Seguridad  (varía por región — definir con la Delegación)',                                                                                                                              wch: 16 },
  { key: 'ministerio',              label: 'Ministerio',              desc: 'Ministerio responsable de la iniciativa',                                                                                                                                                                                wch: 28 },
  { key: 'comuna',                  label: 'Comuna',                  desc: 'Texto libre — dejar vacío si abarca toda la región',                                                                                                                                                                    wch: 20 },
  { key: 'etapa_actual',            label: 'Etapa Actual',            desc: 'Valores: Preinversión | Diseño | Ejecución | Terminado',                                                                                                                                                                wch: 20 },
  { key: 'estado_termino_gobierno', label: 'Estado Término Gob.',     desc: 'Inaugurado/Terminado/Presentado | Término Diseño | Inicio Obras/Programa | Término Obras/Programa | Término Etapa Preinversional | Adjudicación de Licitación | Otro',                                                wch: 40 },
  { key: 'proximo_hito',            label: 'Próximo Hito',            desc: 'Otro | Obtención RS | Obtención Financiamiento | Presentación Core | Publicación Bases Licitación | Adjudicación Licitación | Término Diseño/Preinversión | Primera Piedra | Inicio Obras/Programa | Inicio Obras | Término Obras/Programa | Término Obras | Inauguración | Finalizado', wch: 42 },
  { key: 'fecha_proximo_hito',      label: 'Fecha Próximo Hito',      desc: 'Formato DD-MM-AAAA  (ej: 31-12-2027)  — puede estar vacío',                                                                                                                                                            wch: 22 },
  { key: 'prioridad',               label: 'Prioridad',               desc: 'Valores: Alta | Media | Baja',                                                                                                                                                                                          wch: 14 },
  { key: 'fuente_financiamiento',   label: 'Fuente Financiamiento',   desc: 'Valores: FNDR | Mixto | Sectorial | Privado | FONDEMA | PEDZE — puede estar vacío',                                                                                                                                    wch: 24 },
  { key: 'codigo_bip',              label: 'Código BIP',              desc: 'Código numérico del BIP — puede estar vacío si no aplica',                                                                                                                                                              wch: 16 },
  { key: 'rat',                     label: 'RAT',                     desc: 'Valores: No Requiere | No Ingresado | En Tramitación | FI | IN | OT | RE | RS | AD',                                                                                                                                  wch: 20 },
  { key: 'codigo_iniciativa',       label: 'Código Iniciativa',       desc: 'Código interno DCI — puede estar vacío',                                                                                                                                                                                wch: 22 },
  { key: 'inversion_mm',            label: 'Inversión ($MM)',         desc: 'Número en millones de pesos, puede tener decimales  (ej: 1500  o  1500.5) — puede estar vacío',                                                                                                                        wch: 18 },
  { key: 'origen',                  label: 'Origen',                  desc: 'Texto libre — fuente u origen de la iniciativa (ej: Plan Regional, GORE, Delegación) — puede estar vacío',                                                                                                              wch: 24 },
  { key: 'descripcion',             label: 'Descripción',             desc: 'Texto libre — descripción detallada de la iniciativa — puede estar vacío',                                                                                                                                              wch: 54 },
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
  ['5. El semáforo, el avance % y el responsable se gestionan desde el panel — no van en este archivo.', '', '', ''],
  ['6. Sube el archivo completado desde el botón "Importar" en el Dashboard. Si sos delegación regional, usá "Proponer actualización" en Mi Región.', '', '', ''],
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
  ['Eje', 'No', 'Texto libre — definido por cada región', 'Eje estratégico regional. Cada región define sus propios ejes.'],
  ['Eje Gobierno', 'No', 'Economía | Social | Seguridad', 'Eje presidencial. Varía por región — definir con la Delegación. No se auto-deduce del Eje Regional.'],
  ['Ministerio', 'Sí', 'Texto libre', 'Ministerio responsable de la ejecución.'],
  ['Comuna', 'No', 'Texto libre', 'Comuna de ejecución. Dejar vacío si abarca toda la región.'],
  ['Etapa Actual', 'No', 'Preinversión | Diseño | Ejecución | Terminado', 'Etapa en que se encuentra actualmente la iniciativa.'],
  ['Estado Término Gob.', 'No', 'Inaugurado/Terminado/Presentado · Término Diseño · Inicio Obras/Programa · Término Obras/Programa · Término Etapa Preinversional · Adjudicación de Licitación · Otro', 'Estado esperado al término del gobierno.'],
  ['Próximo Hito', 'No', 'Otro · Obtención RS · Obtención Financiamiento · Presentación Core · Publicación Bases Licitación · Adjudicación Licitación · Término Diseño/Preinversión · Primera Piedra · Inicio Obras/Programa · Término Obras/Programa · Inauguración · Finalizado', 'Próximo hito concreto esperado.'],
  ['Fecha Próximo Hito', 'No', 'DD-MM-AAAA  (ej: 31-12-2027)', 'Fecha estimada del próximo hito.'],
  ['Prioridad', 'No', 'Alta | Media | Baja', 'Nivel de prioridad de la iniciativa.'],
  ['Fuente Financiamiento', 'No', 'FNDR · Mixto · Sectorial · Privado · FONDEMA · PEDZE', 'Fuente de financiamiento. PEDZE = Plan Especial Zonas Extremas.'],
  ['Código BIP', 'No', 'Código numérico', 'Código del BIP/MIDESO. Dejar vacío si no aplica.'],
  ['RAT', 'No', 'No Requiere · No Ingresado · En Tramitación · FI · IN · OT · RE · RS', 'RS = Recomendación Satisfactoria; FI = Factibilidad Inicial; IN = Ingresado.'],
  ['Código Iniciativa', 'No', 'Texto libre', 'Código interno del Plan Regional de Gobierno. Puede estar vacío.'],
  ['Inversión ($MM)', 'No', 'Número  (ej: 1500  o  1500.5)', 'Monto en millones de pesos. Puede estar vacío.'],
  ['Descripción', 'No', 'Texto libre', 'Descripción detallada de la iniciativa.'],
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
