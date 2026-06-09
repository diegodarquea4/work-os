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

// ── Enums permitidos (espejo del template) ────────────────────────────────────

export const VALID_EJE_GOBIERNO   = ['Economía', 'Social', 'Seguridad'] as const
export const VALID_PRIORIDAD      = ['Alta', 'Media', 'Baja'] as const
export const VALID_RAT            = ['No Requiere', 'No Ingresado', 'En Tramitación', 'FI', 'IN', 'OT', 'RE', 'RS', 'AD'] as const
export const VALID_ETAPA          = ['Preinversión', 'Prefactibilidad', 'Diseño', 'Ejecución', 'Terminado'] as const
export const VALID_ESTADO_TERMINO = ['Inaugurado/Terminado/Presentado', 'Término Diseño', 'Inicio Obras/Programa', 'Término Obras/Programa', 'Término Etapa Preinversional', 'Adjudicación de Licitación', 'Otro'] as const
export const VALID_PROXIMO_HITO   = ['Otro', 'Obtención RS', 'Obtención Financiamiento', 'Presentación Core', 'Publicación Bases Licitación', 'Adjudicación Licitación', 'Término Diseño/Preinversión', 'Primera Piedra', 'Inicio Obras/Programa', 'Inicio Obras', 'Término Obras/Programa', 'Término Obras', 'Inauguración', 'Finalizado'] as const
export const VALID_FUENTE         = ['FNDR', 'Mixto', 'Sectorial', 'Privado', 'FONDEMA', 'PEDZE'] as const
export const VALID_SEMAFORO       = ['verde', 'ambar', 'rojo', 'gris'] as const

// ── Tipos de salida ──────────────────────────────────────────────────────────

export type ParsedRow = {
  n:            number            // # existente (update) o nuevo asignado (insert)
  nombre:       string
  region:       string
  patch:        Record<string, unknown>   // campos a actualizar (vacíos saltados)
  errors:       string[]
  isNew:        boolean
  insertData?:  Record<string, unknown>   // payload completo para INSERT
}

export type ParseResult = {
  rows:         ParsedRow[]
  fileErrors:   string[]
  sheetName:    string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
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
  if (raw.length < 3) {
    return {
      rows: [],
      fileErrors: ['El archivo no tiene filas de datos. Agrega datos a partir de la fila 3.'],
      sheetName,
    }
  }

  const headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim())
  const dataRows = raw.slice(2) as unknown[][]
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
      rowErrors.push(`Eje "${raw}" inválido — formato esperado: "Eje N: Nombre"`)
      return null
    }
    const map = ejeByNumPerRegion.get(regionCod)
    const found = map?.get(parsed.numero)
    if (!found) {
      rowErrors.push(
        `Eje ${parsed.numero} no existe en el catálogo de ${regionNombre}. ` +
        `Pídele a admin agregarlo desde "Gestionar ejes" antes de re-subir.`
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
      if (!(VALID_EJE_GOBIERNO as readonly string[]).includes(ejeGobierno)) rowErrors.push(`eje gobierno "${ejeGobierno}" inválido`)
      else target.eje_gobierno = ejeGobierno
    }
    const prioridad = col(row, 'Prioridad')
    if (prioridad) {
      if (!(VALID_PRIORIDAD as readonly string[]).includes(prioridad)) rowErrors.push(`prioridad "${prioridad}" inválida`)
      else target.prioridad = prioridad
    }
    const etapa = col(row, 'Etapa Actual')
    if (etapa) {
      if (!(VALID_ETAPA as readonly string[]).includes(etapa)) rowErrors.push(`etapa "${etapa}" inválida`)
      else target.etapa_actual = etapa
    }
    const estadoTermino = col(row, 'Estado Término Gob.')
    if (estadoTermino) {
      if (!(VALID_ESTADO_TERMINO as readonly string[]).includes(estadoTermino)) rowErrors.push(`estado término "${estadoTermino}" inválido`)
      else target.estado_termino_gobierno = estadoTermino
    }
    const proximoHito = col(row, 'Próximo Hito')
    if (proximoHito) {
      if (!(VALID_PROXIMO_HITO as readonly string[]).includes(proximoHito)) rowErrors.push(`próximo hito "${proximoHito}" inválido`)
      else target.proximo_hito = proximoHito
    }
    const fuente = col(row, 'Fuente Financiamiento')
    if (fuente) {
      if (!(VALID_FUENTE as readonly string[]).includes(fuente)) rowErrors.push(`fuente "${fuente}" inválida`)
      else target.fuente_financiamiento = fuente
    }
    const rat = col(row, 'RAT')
    if (rat) {
      if (!(VALID_RAT as readonly string[]).includes(rat)) rowErrors.push(`RAT "${rat}" inválido`)
      else target.rat = rat
    }
    const inversionStr = col(row, 'Inversión ($MM)')
    if (inversionStr !== undefined && inversionStr !== '') {
      const num = Number(String(inversionStr).replace(',', '.'))
      if (isNaN(num)) rowErrors.push(`inversión "${inversionStr}" inválida`)
      else target.inversion_mm = num
    }
    // ── Campos operativos (semáforo, % avance, en foco) ─────────────────────
    const semaforo = col(row, 'Semáforo')
    if (semaforo) {
      const norm = semaforo.toLowerCase()
      if (!(VALID_SEMAFORO as readonly string[]).includes(norm)) {
        rowErrors.push(`semáforo "${semaforo}" inválido (esperado: verde, ambar, rojo, gris)`)
      } else {
        target.estado_semaforo = norm
      }
    }
    const pctStr = col(row, '% Avance')
    if (pctStr !== undefined && pctStr !== '') {
      const n = parseInt(String(pctStr).replace(',', '.'), 10)
      if (isNaN(n) || n < 0 || n > 100) {
        rowErrors.push(`% avance "${pctStr}" inválido (esperado entero 0–100)`)
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
        rowErrors.push(`en foco "${focoStr}" inválido (esperado: Sí / No)`)
      }
    }
    const fechaRaw = col(row, 'Fecha Próximo Hito')
    if (fechaRaw !== undefined && fechaRaw !== '') {
      // Aceptamos DD-MM-AAAA (canónico), DD/MM/AAAA (formato fecha corta común
      // en Excel en español) y DD-M-AAAA / DD/M/AAAA (con un solo dígito en mes
      // o día). El reader ya convierte Date/serial a DD-MM-AAAA río arriba.
      const dm = fechaRaw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/)
      if (!dm) {
        rowErrors.push(`fecha "${fechaRaw}" inválida — usar DD-MM-AAAA o DD/MM/AAAA (ej: 31-12-2027)`)
      } else {
        const dd = dm[1].padStart(2, '0')
        const mm = dm[2].padStart(2, '0')
        const yyyy = dm[3]
        const day = parseInt(dd, 10)
        const mon = parseInt(mm, 10)
        if (mon < 1 || mon > 12 || day < 1 || day > 31) {
          rowErrors.push(`fecha "${fechaRaw}" tiene día o mes fuera de rango`)
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
    function normalizeMultiValueString(raw: string): string {
      return Array.from(new Set(
        raw.split(/\s*[;·]\s*/).map(s => s.trim()).filter(Boolean)
      )).join(';')
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
      const normalized = multiValueCols.has(dbCol) && val !== ''
        ? normalizeMultiValueString(val)
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

  for (const row of dataRows) {
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

      if (!regionNombre)            rowErrors.push('Región requerida')
      const regionObj = findRegion(regionNombre)
      if (regionNombre && !regionObj) rowErrors.push(`Región "${regionNombre}" no reconocida`)
      if (!nombre)                  rowErrors.push('Nombre requerido')
      if (!eje)                     rowErrors.push('Eje requerido')
      if (!ministerio)              rowErrors.push('Ministerio requerido')

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
      }
      parseOptionalFields(row, insertData, rowErrors, /* isUpdate */ false)
      rows.push({
        n:          newN,
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
      fileErrors.push(`Fila con # inválido "${nStr}" — omitida`)
      continue
    }

    const project = existingProjects.find(p => p.n === n)
    if (!project) {
      fileErrors.push(`#${nStr}: no existe en el sistema — si es nueva, deja la columna # vacía`)
      continue
    }

    const rowErrors: string[] = []
    const regionInput = col(row, 'Región')
    if (regionInput && normalize(regionInput) !== normalize(project.region)) {
      rowErrors.push(
        `El # ${nStr} corresponde a la región ${project.region}, no a "${regionInput}". ` +
        `Para crear nuevas iniciativas de ${regionInput}, deja la columna # vacía.`
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
