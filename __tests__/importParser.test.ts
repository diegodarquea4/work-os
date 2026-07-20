import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseImportWorkbook, rowErrorLabel, flattenRowErrors } from '@/lib/importParser'
import { classifyError, summarizeImportErrors } from '@/lib/importErrors'
import type { Iniciativa } from '@/lib/projects'

// ── Fixtures ────────────────────────────────────────────────────────────────

/** Construye un .xlsx en memoria con los headers dados y filas de datos. */
function buildWorkbook(headers: string[], dataRows: (string | number)[][]): ArrayBuffer {
  const aoa = [headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Carga')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

// Una iniciativa existente (#1) para probar el flujo UPDATE (evita exigir región/eje).
const existing = [{
  id: 1, n: 1, region: 'Metropolitana', cod: 'RM', nombre: 'Iniciativa Uno',
  codigo_iniciativa: 'RM-01-001',
}] as unknown as Iniciativa[]

const HEADERS = ['#', 'Región', 'Nombre Iniciativa', 'Eje', 'Ministerio', 'Prioridad', 'Etapa Actual', 'Semáforo']

function parseUpdateRow(cells: Partial<Record<string, string>>) {
  const row = HEADERS.map(h => cells[h] ?? '')
  const buf = buildWorkbook(HEADERS, [row])
  return parseImportWorkbook(buf, existing, new Map())
}

// ── Matching tolerante de enums (la fricción que reportó Diego) ───────────────

describe('parseImportWorkbook — tolerancia a tildes/mayúsculas en enums', () => {
  it('acepta un valor con mayúscula distinta y lo guarda canónico', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Prioridad': 'alta' })
    expect(rows[0].errors).toEqual([])
    expect(rows[0].patch.prioridad).toBe('Alta')
  })

  it('acepta un valor sin tilde y lo guarda con tilde (canónico)', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Etapa Actual': 'ejecucion' })
    expect(rows[0].errors).toEqual([])
    expect(rows[0].patch.etapa_actual).toBe('Ejecución')
  })

  it('acepta semáforo en mayúsculas y lo normaliza', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Semáforo': 'VERDE' })
    expect(rows[0].errors).toEqual([])
    expect(rows[0].patch.estado_semaforo).toBe('verde')
  })

  it('un valor que de verdad no existe falla con un mensaje que lista las opciones', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Prioridad': 'Urgente' })
    expect(rows[0].errors).toHaveLength(1)
    expect(rows[0].errors[0]).toContain('Prioridad «Urgente»')
    expect(rows[0].errors[0]).toContain('Alta · Media · Baja')
  })
})

// ── Ancla de fila legible ─────────────────────────────────────────────────────

describe('rowErrorLabel — ancla que el usuario reconoce', () => {
  it('usa el número de fila de Excel y el nombre', () => {
    expect(rowErrorLabel({ excelRow: 8, nombre: 'Escuela Los Álamos' }))
      .toBe('Fila 8 · «Escuela Los Álamos»')
  })

  it('omite el nombre cuando la fila nueva aún no lo tiene', () => {
    expect(rowErrorLabel({ excelRow: 8, nombre: '' })).toBe('Fila 8')
  })

  it('flattenRowErrors ancla cada error a su fila', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Prioridad': 'Urgente' })
    const flat = flattenRowErrors(rows)
    // Fila de datos = fila 2 del Excel (header en fila 1, sin fila-guía).
    expect(flat[0]).toBe('Fila 2 · «Iniciativa Uno»: Prioridad «Urgente»: no es una opción válida. Usa: Alta · Media · Baja.')
  })
})

// ── Contrato parser ↔ classifier (lo que se rompe en silencio si divergen) ────

describe('classifyError — familias de los mensajes nuevos', () => {
  const cases: [string, string][] = [
    ['Fila 2 · «X»: Falta el Nombre de la iniciativa (columna obligatoria).', 'dato-requerido'],
    ['Fila 2: Falta la Región (columna obligatoria).', 'dato-requerido'],
    ['Fila 3 · «X»: Región «Region Metropolitana»: no coincide con ninguna de las 16.', 'region-invalida'],
    ['Fila 4 · «X»: La iniciativa #7 es de la región Biobío, no de «Maule».', 'region-mismatch'],
    ['Fila 5 · «X»: Eje «foo»: formato inválido. Debe ser «Eje N: Nombre».', 'eje-invalido'],
    ['Fila 6 · «X»: Eje 9: no está en el catálogo de Tarapacá.', 'eje-invalido'],
    ['Fila 7 · «X»: Prioridad «Urgente»: no es una opción válida. Usa: Alta · Media · Baja.', 'valor-invalido'],
    ['Fila 8 · «X»: En Foco «quizás»: no se entiende. Usa Sí o No.', 'valor-invalido'],
    ['Fila 9 · «X»: % Avance «abc»: debe ser un número entero de 0 a 100.', 'formato'],
    ['Fila 10 · «X»: Fecha Próximo Hito «31/13/2027»: el día o el mes están fuera de rango.', 'formato'],
  ]
  it.each(cases)('clasifica «%s» como %s', (raw, family) => {
    expect(classifyError(raw).family).toBe(family)
  })

  it('extrae el número de fila del ancla nueva', () => {
    expect(classifyError('Fila 12 · «Camino»: Falta el Eje (columna obligatoria).').fila).toBe(12)
  })
})

// ── Banner dominante sigue detectando la columna faltante ─────────────────────

describe('summarizeImportErrors — banner de columna faltante', () => {
  it('detecta el patrón dominante «Falta el Nombre» y arma banner', () => {
    const errors = Array.from({ length: 10 }, (_, i) =>
      `Fila ${i + 2} · «X»: Falta el Nombre de la iniciativa (columna obligatoria).`)
    const summary = summarizeImportErrors(errors)
    expect(summary.banner).not.toBeNull()
    expect(summary.banner!.title).toContain('Nombre Iniciativa')
  })
})
