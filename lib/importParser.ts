/**
 * Parser del Excel de carga masiva de iniciativas.
 *
 * Funciona tanto en browser (con file.arrayBuffer()) como en server
 * (con un Buffer de Storage), gracias a `xlsx` que es isomórfico.
 *
 * Usado por:
 *   - components/NationalDashboard.tsx → flow de "import directo" (admin/editor).
 *   - app/api/proposals/[id]/approve/route.ts → flow de "aprobar propuesta".
 *
 * Decisión de diseño clave: skip-si-vacío para UPDATE.
 *   Si en un UPDATE el delegado deja una celda en blanco, el campo correspondiente
 *   NO se incluye en el patch (no pisa el valor existente). En INSERT sí se manda
 *   null porque la fila es nueva y no hay valor previo que cuidar.
 *   Antes de este cambio, vacío→null borraba datos por accidente.
 */

import * as XLSX from 'xlsx'
import { REGIONS } from './regions'
import type { Iniciativa } from './projects'
import type { RegionEje } from './types'
import { parseEjeString, composeEjeLabel } from './ejes'
import { TEMPLATE_COLS } from './templateExcel'
import { canonizeMinisterio } from './ministeriosCanon'

// ── Enums permitidos (espejo del template) ────────────────────────────────────

export const VALID_EJE_GOBIERNO   = ['Economía', 'Social', 'Seguridad'] as const
export const VALID_PRIORIDAD      = ['Alta', 'Media', 'Baja'] as const
export const VALID_RAT            = ['No Requiere', 'No Ingresado', 'En Tramitación', 'FI', 'IN', 'OT', 'RE', 'RS', 'AD', 'CF'] as const
export const VALID_ETAPA          = ['Preinversión', 'Prefactibilidad', 'Diseño', 'Ejecución', 'Terminado'] as const
export const VALID_ESTADO_TERMINO = ['Inaugurado/Terminado/Presentado', 'Término Diseño', 'Inicio Obras/Programa', 'Término Obras/Programa', 'Término Etapa Preinversional', 'Adjudicación de Licitación', 'Otro'] as const
export const VALID_PROXIMO_HITO   = ['Otro', 'Obtención RS', 'Obtención Financiamiento', 'Presentación Core', 'Publicación Bases Licitación', 'Adjudicación Licitación', 'Término Diseño/Preinversión', 'Primera Piedra', 'Inicio Obras/Programa', 'Inicio Obras', 'Término Obras/Programa', 'Término Obras', 'Inauguración', 'Finalizado'] as const
export const VALID_FUENTE         = ['FNDR', 'Mixto', 'Sectorial', 'Privado', 'FONDEMA', 'PEDZE'] as const
export const VALID_SEMAFORO       = ['verde', 'ambar', 'rojo', 'gris'] as const
export const VALID_CAPA           = ['l', 'll', 'lll'] as const

// ── Tipos de salida ──────────────────────────────────────────────────────────

export type ParsedRow = {
  n:            number            // # existente (update) o nuevo asignado (insert)
  excelRow:     number           // # de fila en el Excel (1-based) — ancla para el usuario
  nombre:       string
  region:       string
  patch:        Record<string, unknown>   // campos a actualizar (vacíos saltados)
  errors:       string[]
  isNew:        boolean
  insertData?:  Record<string, unknown>   // payload completo para INSERT
}

/**
 * Ancla de una fila para mostrarle al usuario DÓNDE está el error, en términos
 * que reconoce: el número de fila de su Excel y, si existe, el nombre de la
 * iniciativa. Evita el "#412" interno (un número que el sistema le inventa a las
 * filas nuevas y que el usuario no tiene en su planilla).
 */
export function rowErrorLabel(row: Pick<ParsedRow, 'excelRow' | 'nombre'>): string {
  const name = row.nombre?.trim()
  return name ? `Fila ${row.excelRow} · «${name}»` : `Fila ${row.excelRow}`
}

/** Aplana los errores de un conjunto de filas con su ancla, listos para el modal. */
export function flattenRowErrors(rows: ParsedRow[]): string[] {
  return rows.flatMap(r => r.errors.map(e => `${rowErrorLabel(r)}: ${e}`))
}

export type ParseResult = {
  rows:         ParsedRow[]
  fileErrors:   string[]
  sheetName:    string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Normalizaci\u00f3n para matching de enums: como `normalize` pero adem\u00e1s colapsa los
 * espacios alrededor de "/" (ej: "Inicio Obras / Programa" \u2192 "inicio obras/programa"),
 * porque varias opciones can\u00f3nicas usan "/" como separador interno.
 */
function normalizeEnum(s: string): string {
  return normalize(s).replace(/\s*\/\s*/g, '/')
}

/**
 * Match tolerante de un valor contra una lista de opciones can\u00f3nicas: ignora
 * tildes, may\u00fasculas y espacios de m\u00e1s. Devuelve la opci\u00f3n CAN\u00d3NICA (la que se
 * persiste) si hay match, o `undefined` si el valor no corresponde a ninguna.
 *
 * Esto elimina la fricci\u00f3n de "una tilde mal puesta o una may\u00fascula": el
 * delegado escribe "ejecucion" o "ALTA" y se guarda "Ejecuci\u00f3n" / "Alta". Solo
 * falla si el valor realmente no es una de las opciones.
 */
function matchEnum(input: string, options: readonly string[]): string | undefined {
  const n = normalizeEnum(input)
  return options.find(o => normalizeEnum(o) === n)
}

/** Mensaje uniforme para un valor que no calza con ninguna opci\u00f3n del cat\u00e1logo. */
function opcionInvalida(columna: string, valor: string, opciones: readonly string[]): string {
  return `${columna} \u00ab${valor}\u00bb: no es una opci\u00f3n v\u00e1lida. Usa: ${opciones.join(' \u00b7 ')}.`
}

/**
 * Convierte un Date a "DD-MM-AAAA" — formato canónico del template. Acepta
 * Date inválido como string vacío (defensa, no debería pasar).
 */
function dateToDDMMYYYY(d: Date): string {
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

/**
 * Convierte un número de serie Excel (días desde 1900-01-00) a "DD-MM-AAAA".
 * Usa el helper de xlsx que maneja el bug histórico de Lotus 1-2-3 (que trata
 * 1900 como año bisiesto y agrega 1 día de offset bajo el serial 60).
 */
function excelSerialToDDMMYYYY(n: number): string {
  const d = XLSX.SSF.parse_date_code(n)
  if (!d) return ''
  return `${String(d.d).padStart(2, '0')}-${String(d.m).padStart(2, '0')}-${d.y}`
}

function makeColReader(headers: string[]) {
  return (row: unknown[], label: string): string | undefined => {
    const idx = headers.indexOf(label)
    if (idx < 0) return undefined
    const val = row[idx]
    if (val === null || val === undefined) return ''
    // Excel devuelve Date cuando la celda tiene tipo fecha y XLSX.read se
    // invoca con cellDates: true. Convertimos al formato canónico DD-MM-AAAA
    // para que el parser de fechas (más abajo) lo lea sin saber su origen.
    if (val instanceof Date) return dateToDDMMYYYY(val)
    // Si la celda tiene tipo Number pero formato fecha en Excel y no se activó
    // cellDates (caso edge), llega como serial number. Convertimos también.
    // Heurística: serial date típica entre 1 (1900-01-01) y 73415 (2099-12-31).
    if (typeof val === 'number' && val > 0 && val < 100000 && Number.isFinite(val)) {
      // Solo convertimos si el campo es de fecha; para campos numéricos como
      // "Inversión ($MM)" devolvemos el número como string. Heurística simple:
      // si el header contiene "Fecha" lo tratamos como fecha.
      if (label.toLowerCase().includes('fecha')) {
        const formatted = excelSerialToDDMMYYYY(val)
        if (formatted) return formatted
      }
    }
    return String(val).trim()
  }
}

// ── Parser principal ─────────────────────────────────────────────────────────

/**
 * Parsea un buffer .xlsx y devuelve filas estructuradas listas para enviar al
 * endpoint /api/import.
 *
 * @param buffer            ArrayBuffer (browser) o Buffer/Uint8Array (server)
 * @param existingProjects  iniciativas actuales (necesario para validar #
 *                          existentes y validar región del UPDATE).
 * @param regionEjesByCod   catálogo formal de ejes por región (migración 015).
 *                          Cada string `Eje` del Excel se valida contra esto:
 *                          si el número no existe en el catálogo de su región,
 *                          la fila falla con error claro.
 */
export function parseImportWorkbook(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  existingProjects: Iniciativa[],
  regionEjesByCod: Map<string, RegionEje[]>,
): ParseResult {
  const fileErrors: string[] = []

  // xlsx.read acepta ArrayBuffer (type: 'array') o Buffer (type: 'buffer').
  const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && buffer instanceof ArrayBuffer
  // cellDates: true → celdas con formato fecha en Excel llegan como Date object,
  // no como número de serie. El reader las convierte a DD-MM-AAAA para que el
  // resto del parser no tenga que distinguir el origen.
  const wb = XLSX.read(
    isArrayBuffer ? new Uint8Array(buffer as ArrayBuffer) : (buffer as Uint8Array | Buffer),
    { type: 'array', cellDates: true },
  )
  const sheetName = wb.SheetNames.find(n => n === 'Carga') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][]
  if (raw.length < 2) {
    return {
      rows: [],
      fileErrors: ['El archivo no tiene filas de datos. Agrega datos a partir de la fila 3.'],
      sheetName,
    }
  }

  const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim())

  // Detección de la fila guía (descripciones de campos). El template canónico
  // tiene headers en fila 1 y descripciones en fila 2 — el delegado debería
  // agregar data desde fila 3. Pero si borra accidentalmente la fila 2, la
  // primera iniciativa termina en raw[1] y un `slice(2)` rígido la descarta
  // sin avisar. Detectamos contra `TEMPLATE_COLS.desc` (autocorrige si cambian
  // las descripciones) y como sentinel adicional: el `#` canónico arranca con
  // `⚠`, un caracter que data real nunca va a contener.
  function isGuideRow(row: unknown[] | undefined): boolean {
    if (!row) return false
    const hashIdx = headers.indexOf('#')
    if (hashIdx >= 0) {
      const hashCell = String(row[hashIdx] ?? '').trim()
      if (hashCell.startsWith('⚠')) return true
    }
    let matches = 0
    for (let i = 0; i < headers.length; i++) {
      const cell = String(row[i] ?? '').trim()
      if (!cell) continue
      const colDef = TEMPLATE_COLS.find(c => c.label === headers[i])
      if (colDef && cell === colDef.desc.trim()) matches++
      if (matches >= 3) return true
    }
    return false
  }
  const dataStart = isGuideRow(raw[1] as unknown[] | undefined) ? 2 : 1
  const dataRows = raw.slice(dataStart) as unknown[][]
  const col = makeColReader(headers)

  // Catálogo de regiones normalizado para matching tolerante a acentos.
  const normalizedRegions = REGIONS.map(r => ({ ...r, norm: normalize(r.nombre) }))
  function findRegion(input: string) {
    return normalizedRegions.find(r => r.norm === normalize(input))
  }

  // Catálogo formal de ejes por región (migración 015). Lookup directo por
  // (region_cod, numero) — reemplaza la lógica anterior de reverse-engineer
  // a partir del prefijo del `codigo_iniciativa`. Ahora el número canónico
  // vive en `region_ejes.numero` y no se infiere de strings.
  const ejeByNumPerRegion = new Map<string, Map<number, RegionEje>>()
  for (const [cod, ejes] of regionEjesByCod) {
    const m = new Map<number, RegionEje>()
    for (const e of ejes) m.set(e.numero, e)
    ejeByNumPerRegion.set(cod, m)
  }

  /**
   * Resuelve el string "Eje N: Nombre" contra el catálogo de su región.
   * Retorna `{ ejeId, numero, label }` si match, o `null` con error
   * agregado a `rowErrors`.
   *
   * `label` es el composeEjeLabel canónico del catálogo — el delegado puede
   * haber typeado el nombre con un typo, pero lo que se persiste es el
   * canónico que define DCI.
   */
  function resolveEje(
    raw: string,
    regionCod: string,
    regionNombre: string,
    rowErrors: string[],
  ): { ejeId: number; numero: number; label: string } | null {
    const parsed = parseEjeString(raw)
    if (!parsed) {
      rowErrors.push(`Eje «${raw}»: formato inválido. Debe ser «Eje N: Nombre» (ej: «Eje 3: Seguridad»).`)
      return null
    }
    const map = ejeByNumPerRegion.get(regionCod)
    const found = map?.get(parsed.numero)
    if (!found) {
      rowErrors.push(
        `Eje ${parsed.numero}: no está en el catálogo de ${regionNombre}. ` +
        `Pídele a un admin que lo agregue en «Gestionar ejes» antes de re-subir.`
      )
      return null
    }
    return {
      ejeId: found.id,
      numero: found.numero,
      label: composeEjeLabel(found.numero, found.nombre),
    }
  }
  const batchCodes: string[] = []
  const maxExistingN = existingProjects.length > 0 ? Math.max(...existingProjects.map(p => p.n)) : 0
  let newNOffset = 0

  /**
   * Llena `target` con los campos opcionales de la fila.
   *
   * En UPDATE (isUpdate=true): si el delegado dejó una celda en blanco se SALTA
   * (no se incluye en el patch → no pisa el valor previo).
   *
   * En INSERT (isUpdate=false): se permite null para campos vacíos (es una fila
   * nueva, no hay valor previo que cuidar).
   *
   * Los enums + fecha + número ya tenían el comportamiento correcto antes del
   * fix (solo asignan si el valor es válido y no vacío). El bug estaba en el
   * loop de campos libres al final.
   */
  function parseOptionalFields(
    row: unknown[],
    target: Record<string, unknown>,
    rowErrors: string[],
    isUpdate: boolean,
  ) {
    const ejeGobierno = col(row, 'Eje Gobierno')
    if (ejeGobierno) {
      const m = matchEnum(ejeGobierno, VALID_EJE_GOBIERNO)
      if (!m) rowErrors.push(opcionInvalida('Eje Gobierno', ejeGobierno, VALID_EJE_GOBIERNO))
      else target.eje_gobierno = m
    }
    const prioridad = col(row, 'Prioridad')
    if (prioridad) {
      const m = matchEnum(prioridad, VALID_PRIORIDAD)
      if (!m) rowErrors.push(opcionInvalida('Prioridad', prioridad, VALID_PRIORIDAD))
      else target.prioridad = m
    }
    const etapa = col(row, 'Etapa Actual')
    if (etapa) {
      const m = matchEnum(etapa, VALID_ETAPA)
      if (!m) rowErrors.push(opcionInvalida('Etapa Actual', etapa, VALID_ETAPA))
      else target.etapa_actual = m
    }
    const estadoTermino = col(row, 'Estado Término Gob.')
    if (estadoTermino) {
      const m = matchEnum(estadoTermino, VALID_ESTADO_TERMINO)
      if (!m) rowErrors.push(opcionInvalida('Estado Término Gob.', estadoTermino, VALID_ESTADO_TERMINO))
      else target.estado_termino_gobierno = m
    }
    const proximoHito = col(row, 'Próximo Hito')
    if (proximoHito) {
      const m = matchEnum(proximoHito, VALID_PROXIMO_HITO)
      if (!m) rowErrors.push(opcionInvalida('Próximo Hito', proximoHito, VALID_PROXIMO_HITO))
      else target.proximo_hito = m
    }
    const fuente = col(row, 'Fuente Financiamiento')
    if (fuente) {
      const m = matchEnum(fuente, VALID_FUENTE)
      if (!m) rowErrors.push(opcionInvalida('Fuente Financiamiento', fuente, VALID_FUENTE))
      else target.fuente_financiamiento = m
    }
    const rat = col(row, 'RAT')
    if (rat) {
      const m = matchEnum(rat, VALID_RAT)
      if (!m) rowErrors.push(opcionInvalida('RAT', rat, VALID_RAT))
      else target.rat = m
    }
    const inversionStr = col(row, 'Inversión ($MM)')
    if (inversionStr !== undefined && inversionStr !== '') {
      const num = Number(String(inversionStr).replace(',', '.'))
      if (isNaN(num)) rowErrors.push(`Inversión ($MM) «${inversionStr}»: debe ser un número (ej: 1250 o 1250,5).`)
      else target.inversion_mm = num
    }
    // ── Campos operativos (semáforo, % avance, en foco) ─────────────────────
    const semaforo = col(row, 'Semáforo')
    if (semaforo) {
      const m = matchEnum(semaforo, VALID_SEMAFORO)
      if (!m) rowErrors.push(opcionInvalida('Semáforo', semaforo, VALID_SEMAFORO))
      else target.estado_semaforo = m
    }
    const pctStr = col(row, '% Avance')
    if (pctStr !== undefined && pctStr !== '') {
      const n = parseInt(String(pctStr).replace(',', '.'), 10)
      if (isNaN(n) || n < 0 || n > 100) {
        rowErrors.push(`% Avance «${pctStr}»: debe ser un número entero de 0 a 100.`)
      } else {
        target.pct_avance = n
      }
    }
    const focoStr = col(row, 'En Foco')
    if (focoStr) {
      const norm = focoStr.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
      if (['si', 's', 'true', '1', 'yes', 'y'].includes(norm)) {
        target.en_foco = true
      } else if (['no', 'n', 'false', '0'].includes(norm)) {
        target.en_foco = false
      } else {
        rowErrors.push(`En Foco «${focoStr}»: no se entiende. Usa Sí o No.`)
      }
    }
    // Capa de importancia (migración 024). Solo admin/editor puede aplicarla
    // — si una región la propone vía Excel, queda en la propuesta y el admin
    // decide. Si el flow es import directo regional, el trigger 023 rechaza
    // la fila con SQLSTATE 42501 (mensaje del trigger explica la whitelist).
    const capaStr = col(row, 'Capa')
    if (capaStr) {
      const m = matchEnum(capaStr, VALID_CAPA)
      if (!m) rowErrors.push(opcionInvalida('Capa', capaStr, VALID_CAPA))
      else target.capa = m
    }
    const fechaRaw = col(row, 'Fecha Próximo Hito')
    if (fechaRaw !== undefined && fechaRaw !== '') {
      // Aceptamos DD-MM-AAAA (canónico), DD/MM/AAAA (formato fecha corta común
      // en Excel en español) y DD-M-AAAA / DD/M/AAAA (con un solo dígito en mes
      // o día). El reader ya convierte Date/serial a DD-MM-AAAA río arriba.
      const dm = fechaRaw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
      if (!dm) {
        rowErrors.push(`Fecha Próximo Hito «${fechaRaw}»: formato inválido. Usa DD-MM-AAAA (ej: 31-12-2027).`)
      } else {
        const dd = dm[1].padStart(2, '0')
        const mm = dm[2].padStart(2, '0')
        const yyyy = dm[3]
        const day = parseInt(dd, 10)
        const mon = parseInt(mm, 10)
        if (mon < 1 || mon > 12 || day < 1 || day > 31) {
          rowErrors.push(`Fecha Próximo Hito «${fechaRaw}»: el día o el mes están fuera de rango.`)
        } else {
          target.fecha_proximo_hito = `${yyyy}-${mm}-${dd}`
        }
      }
    }

    // Etiquetas (tags) — multi-valor separados por PUNTO Y COMA. Decisión:
    // los tags pueden contener comas dentro de su propio texto (ej. "Salud,
    // bienestar"), así que la coma no sirve como separador. Trim, filtra
    // vacíos, dedup case-sensitive. Misma política skip-si-vacío en UPDATE:
    // celda en blanco NO borra los tags previos. Para borrar todos, admin
    // edita la ficha. Sin validación contra catálogo — el control queda en
    // la aprobación de la propuesta (migración 016).
    const tagsRaw = col(row, 'Etiquetas')
    if (tagsRaw !== undefined && tagsRaw !== '') {
      const arr = Array.from(new Set(
        String(tagsRaw).split(';').map(t => t.trim()).filter(Boolean)
      ))
      target.tags = arr
    } else if (!isUpdate) {
      // INSERT con celda vacía: default explícito al array vacío.
      target.tags = []
    }

    // Campos libres (texto). Acá vivía el bug original.
    // Nota 1: `codigo_iniciativa` se omite a propósito — es generado por el
    // sistema en INSERT y no es editable por Excel. Archivos viejos que
    // traigan esa columna son ignorados silenciosamente.
    // Nota 2: `Eje` también se trata aparte — requiere validación contra el
    // catálogo `region_ejes` y se setea junto con `eje_id`. Se hace fuera
    // de este loop para las dos ramas (INSERT y UPDATE).
    // Helper para campos multi-valor (ministerio, comuna): split por punto
    // y coma (canónico nuevo) o por · (back-compat con ministerios viejos),
    // trim, filtra vacíos, dedup case-sensitive, y reune con `;`. Si el
    // usuario escribió un solo valor sin separador, el resultado es ese
    // mismo valor — la función es idempotente para single-value.
    //
    // `mapToken` opcional: se aplica a cada token después del split y antes
    // del dedup. Lo usamos para canonizar Ministerio (MINVU → Ministerio de
    // Vivienda y Urbanismo, etc.). Para comuna pasamos identity.
    function normalizeMultiValueString(raw: string, mapToken?: (s: string) => string): string {
      const tokens = raw.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean)
      const mapped = mapToken ? tokens.map(mapToken) : tokens
      return Array.from(new Set(mapped)).join(';')
    }
    // Heurística para detectar multi-ministerio mal separado. La fragmentación
    // histórica del catálogo (2382 filas con " y ", 311 con ",") existe porque
    // el delegado escribe "Ministerio X y Ministerio Y" como un solo string.
    // Si la celda menciona "Ministerio" 2 veces o más y no usa ; / ·, casi
    // seguro intentó separar varios — exigir el separador canónico.
    // Mensaje claro para que el delegado entienda y corrija. Edge case "Ministerio
    // de Economía, Fomento y Turismo" tiene solo 1 "Ministerio" → no dispara.
    function detectMinisterioMalSeparado(raw: string): string | null {
      if (!raw || raw.includes(';') || raw.includes('·')) return null
      const matches = raw.match(/\bministerio\b/gi)
      if (!matches || matches.length < 2) return null
      return `Ministerio «${raw}»: parece traer varios ministerios juntos. Sepáralos con «;» (punto y coma), ej: «Ministerio de Vivienda y Urbanismo;Ministerio de Obras Públicas». No uses « y » ni «,».`
    }
    const multiValueCols = new Set(['ministerio', 'comuna'])
    for (const [label, dbCol] of [
      ['Nombre Iniciativa', 'nombre'],
      ['Ministerio', 'ministerio'],
      ['Código BIP', 'codigo_bip'],
      ['Origen', 'origen'],
      ['Descripción', 'descripcion'],
      ['Comuna', 'comuna'],
    ] as [string, string][]) {
      const val = col(row, label)
      if (val === undefined) continue
      if (dbCol === 'ministerio' && val !== '') {
        const err = detectMinisterioMalSeparado(val)
        if (err) {
          rowErrors.push(err)
          continue
        }
      }
      const normalized = multiValueCols.has(dbCol) && val !== ''
        ? normalizeMultiValueString(val, dbCol === 'ministerio' ? canonizeMinisterio : undefined)
        : val
      if (isUpdate) {
        // skip-si-vacío en UPDATE: no se incluye en el patch.
        if (normalized !== '') target[dbCol] = normalized
      } else {
        // INSERT: mantiene comportamiento previo (vacío → null).
        target[dbCol] = normalized === '' ? null : normalized
      }
    }
  }

  const rows: ParsedRow[] = []

  for (let j = 0; j < dataRows.length; j++) {
    const row = dataRows[j]
    // # de fila tal como la ve el usuario en Excel (1-based): raw[0] es la fila 1
    // de encabezados, así que la fila de datos j corresponde a la fila
    // dataStart + j + 1 de la planilla.
    const excelRow = dataStart + j + 1
    // Saltamos filas completamente vacías (común al final de archivos Excel).
    if (row.every(cell => String(cell ?? '').trim() === '')) continue

    const nStr = col(row, '#')

    // ── INSERT (sin #) ───────────────────────────────────────────────────────
    if (!nStr) {
      const regionNombre = col(row, 'Región') ?? ''
      const eje          = col(row, 'Eje') ?? ''
      const nombre       = col(row, 'Nombre Iniciativa') ?? ''
      const ministerio   = col(row, 'Ministerio') ?? ''
      const rowErrors: string[] = []

      if (!regionNombre)            rowErrors.push('Falta la Región (columna obligatoria).')
      const regionObj = findRegion(regionNombre)
      if (regionNombre && !regionObj) rowErrors.push(
        `Región «${regionNombre}»: no coincide con ninguna de las 16. Escribe el nombre corto del catálogo (ej: «Metropolitana», no «Región Metropolitana»).`
      )
      if (!nombre)                  rowErrors.push('Falta el Nombre de la iniciativa (columna obligatoria).')
      if (!eje)                     rowErrors.push('Falta el Eje (columna obligatoria).')
      if (!ministerio)              rowErrors.push('Falta el Ministerio (columna obligatoria).')

      // Validación + resolución del eje contra el catálogo.
      let codigoIniciativa: string | null = null
      let ejeId: number | null = null
      let canonicalEje = eje
      if (regionObj && eje) {
        const resolved = resolveEje(eje, regionObj.cod, regionObj.nombre, rowErrors)
        if (resolved) {
          ejeId = resolved.ejeId
          canonicalEje = resolved.label
          // codigo_iniciativa: prefijo derivado directo del catálogo (numero
          // canónico) — no más reverse-engineer del string.
          const ejePfx = `${regionObj.shortCod}-${String(resolved.numero).padStart(2, '0')}`
          const seqs = [
            ...existingProjects
              .filter(p => p.region === regionNombre && p.codigo_iniciativa?.startsWith(ejePfx + '-'))
              .map(p => parseInt(p.codigo_iniciativa!.split('-')[2] ?? '0', 10)),
            ...batchCodes
              .filter(c => c.startsWith(ejePfx + '-'))
              .map(c => parseInt(c.split('-')[2] ?? '0', 10)),
          ].filter(v => !isNaN(v))
          const seq = seqs.length > 0 ? Math.max(...seqs) + 1 : 1
          codigoIniciativa = `${ejePfx}-${String(seq).padStart(3, '0')}`
          batchCodes.push(codigoIniciativa)
        }
      }

      newNOffset++
      const newN = maxExistingN + newNOffset

      const insertData: Record<string, unknown> = {
        n:                 newN,
        region:            regionNombre,
        cod:               regionObj?.cod     ?? '',
        capital:           regionObj?.capital ?? '',
        zona:              regionObj?.zona    ?? '',
        eje:               canonicalEje,
        eje_id:            ejeId,
        nombre,
        ministerio,
        prioridad:         'Media',
        estado_semaforo:   'gris',
        pct_avance:        0,
        codigo_iniciativa: codigoIniciativa,
        // Default de la migración 024 — se sobreescribe si parseOptionalFields
        // encuentra una capa válida en la columna correspondiente.
        capa:              'lll',
      }
      parseOptionalFields(row, insertData, rowErrors, /* isUpdate */ false)
      rows.push({
        n:          newN,
        excelRow,
        nombre,
        region:     regionNombre,
        patch:      {},
        errors:     rowErrors,
        isNew:      true,
        insertData,
      })
      continue
    }

    // ── UPDATE (con #) ───────────────────────────────────────────────────────
    const n = Number(nStr)
    if (isNaN(n) || n <= 0) {
      fileErrors.push(`Fila ${excelRow}: el # «${nStr}» no es un número válido — fila omitida.`)
      continue
    }

    const project = existingProjects.find(p => p.n === n)
    if (!project) {
      fileErrors.push(`Fila ${excelRow}: la iniciativa #${nStr} no existe en el sistema. Si es nueva, deja la columna # vacía.`)
      continue
    }

    const rowErrors: string[] = []
    const regionInput = col(row, 'Región')
    if (regionInput && normalize(regionInput) !== normalize(project.region)) {
      rowErrors.push(
        `La iniciativa #${nStr} es de la región ${project.region}, no de «${regionInput}». ` +
        `Para crear una iniciativa nueva de «${regionInput}», deja la columna # vacía.`
      )
    }

    const patch: Record<string, unknown> = {}
    parseOptionalFields(row, patch, rowErrors, /* isUpdate */ true)

    // Eje en UPDATE: skip-si-vacío. Si viene relleno, validar contra catálogo
    // de la región de la iniciativa (no la del Excel — la real en BD).
    const ejeUpdate = col(row, 'Eje')
    if (ejeUpdate !== undefined && ejeUpdate !== '') {
      const resolved = resolveEje(ejeUpdate, project.cod, project.region, rowErrors)
      if (resolved) {
        patch.eje    = resolved.label
        patch.eje_id = resolved.ejeId
      }
    }

    rows.push({
      n,
      excelRow,
      nombre: project.nombre,
      region: project.region,
      patch,
      errors: rowErrors,
      isNew:  false,
    })
  }

  return { rows, fileErrors, sheetName }
}

// ── Helpers para el endpoint (cliente o servidor) ────────────────────────────

/** Reagrupa los resultados del parser en payloads para POST /api/import. */
export function buildImportPayload(rows: ParsedRow[]): {
  updates: Array<{ n: number; patch: Record<string, unknown> }>
  inserts: Array<Record<string, unknown>>
} {
  const valid   = rows.filter(r => r.errors.length === 0)
  const updates = valid
    .filter(r => !r.isNew && Object.keys(r.patch).length > 0)
    .map(r => ({ n: r.n, patch: r.patch }))
  const inserts = valid
    .filter(r => r.isNew && r.insertData)
    .map(r => r.insertData!)
  return { updates, inserts }
}
