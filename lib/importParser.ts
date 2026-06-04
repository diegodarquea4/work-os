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

// ── Enums permitidos (espejo del template) ────────────────────────────────────

export const VALID_EJE_GOBIERNO   = ['Economía', 'Social', 'Seguridad'] as const
export const VALID_PRIORIDAD      = ['Alta', 'Media', 'Baja'] as const
export const VALID_RAT            = ['No Requiere', 'No Ingresado', 'En Tramitación', 'FI', 'IN', 'OT', 'RE', 'RS', 'AD'] as const
export const VALID_ETAPA          = ['Preinversión', 'Diseño', 'Ejecución', 'Terminado'] as const
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

function makeColReader(headers: string[]) {
  return (row: string[], label: string): string | undefined => {
    const idx = headers.indexOf(label)
    if (idx < 0) return undefined
    return String(row[idx] ?? '').trim()
  }
}

// ── Parser principal ─────────────────────────────────────────────────────────

/**
 * Parsea un buffer .xlsx y devuelve filas estructuradas listas para enviar al
 * endpoint /api/import.
 *
 * @param buffer       ArrayBuffer (browser) o Buffer/Uint8Array (server)
 * @param existingProjects  iniciativas actuales (necesario para validar #
 *                          existentes y generar codigos secuenciales)
 */
export function parseImportWorkbook(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  existingProjects: Iniciativa[],
): ParseResult {
  const fileErrors: string[] = []

  // xlsx.read acepta ArrayBuffer (type: 'array') o Buffer (type: 'buffer').
  const isArrayBuffer = typeof ArrayBuffer !== 'undefined' && buffer instanceof ArrayBuffer
  const wb = XLSX.read(
    isArrayBuffer ? new Uint8Array(buffer as ArrayBuffer) : (buffer as Uint8Array | Buffer),
    { type: 'array' },
  )
  const sheetName = wb.SheetNames.find(n => n === 'Carga') ?? wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]

  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
  if (raw.length < 3) {
    return {
      rows: [],
      fileErrors: ['El archivo no tiene filas de datos. Agrega datos a partir de la fila 3.'],
      sheetName,
    }
  }

  const headers = raw[0] as string[]
  const dataRows = raw.slice(2)
  const col = makeColReader(headers)

  // Catálogo de regiones normalizado para matching tolerante a acentos.
  const normalizedRegions = REGIONS.map(r => ({ ...r, norm: normalize(r.nombre) }))
  function findRegion(input: string) {
    return normalizedRegions.find(r => r.norm === normalize(input))
  }

  // Map: region → eje → número de eje usado para codigo_iniciativa.
  // Lo armamos del catálogo existente para no romper la secuencia.
  const regionEjeNumMap = new Map<string, Map<string, number>>()
  for (const p of existingProjects) {
    if (!p.codigo_iniciativa) continue
    const m = p.codigo_iniciativa.match(/^[A-Z]+-(\d+)-\d+$/)
    if (!m) continue
    if (!regionEjeNumMap.has(p.region)) regionEjeNumMap.set(p.region, new Map())
    const em = regionEjeNumMap.get(p.region)!
    if (!em.has(p.eje)) em.set(p.eje, parseInt(m[1], 10))
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
    row: string[],
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
      const dm = fechaRaw.match(/^(\d{2})-(\d{2})-(\d{4})$/)
      if (!dm) rowErrors.push(`fecha "${fechaRaw}" inválida — usar DD-MM-AAAA`)
      else target.fecha_proximo_hito = `${dm[3]}-${dm[2]}-${dm[1]}`
    }

    // Campos libres (texto). Acá vivía el bug original.
    // Nota: `codigo_iniciativa` se omite a propósito — es generado por el
    // sistema en INSERT y no es editable por Excel. Archivos viejos que
    // traigan esa columna son ignorados silenciosamente.
    for (const [label, dbCol] of [
      ['Nombre Iniciativa', 'nombre'],
      ['Eje', 'eje'],
      ['Ministerio', 'ministerio'],
      ['Código BIP', 'codigo_bip'],
      ['Origen', 'origen'],
      ['Descripción', 'descripcion'],
      ['Comuna', 'comuna'],
    ] as [string, string][]) {
      const val = col(row, label)
      if (val === undefined) continue
      if (isUpdate) {
        // skip-si-vacío en UPDATE: no se incluye en el patch.
        if (val !== '') target[dbCol] = val
      } else {
        // INSERT: mantiene comportamiento previo (vacío → null).
        target[dbCol] = val === '' ? null : val
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

      let codigoIniciativa: string | null = null
      if (regionObj && eje) {
        if (!regionEjeNumMap.has(regionNombre)) regionEjeNumMap.set(regionNombre, new Map())
        const ejeMap = regionEjeNumMap.get(regionNombre)!
        let ejeNum: number
        if (ejeMap.has(eje)) {
          ejeNum = ejeMap.get(eje)!
        } else {
          const used = new Set(ejeMap.values())
          ejeNum = 1; while (used.has(ejeNum)) ejeNum++
          ejeMap.set(eje, ejeNum)
        }
        const ejePfx = `${regionObj.shortCod}-${String(ejeNum).padStart(2, '0')}`
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

      newNOffset++
      const newN = maxExistingN + newNOffset

      const insertData: Record<string, unknown> = {
        n:                 newN,
        region:            regionNombre,
        cod:               regionObj?.cod     ?? '',
        capital:           regionObj?.capital ?? '',
        zona:              regionObj?.zona    ?? '',
        eje,
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
