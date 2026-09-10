import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseImportWorkbook } from '@/lib/importParser'
import type { Iniciativa } from '@/lib/projects'

/**
 * Import Excel — columnas Latitud / Longitud (mig 104). Dolor: que una sola de
 * las dos no entre a medias, que la coma decimal chilena se acepte, que las
 * coordenadas invertidas (el error clásico al copiar de Google Maps) se
 * rechacen con pista, y que un UPDATE con ambas vacías no toque la ubicación.
 */

function buildWorkbook(headers: string[], dataRows: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Carga')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const existing = [{
  id: 1, n: 1, region: 'Metropolitana', cod: 'RM', nombre: 'Iniciativa Uno', codigo_iniciativa: 'RM-01-001',
}] as unknown as Iniciativa[]

const HEADERS = ['#', 'Región', 'Nombre Iniciativa', 'Eje', 'Ministerio', 'Latitud', 'Longitud']

function parseUpdateRow(cells: Partial<Record<string, string | number>>) {
  const row = HEADERS.map(h => cells[h] ?? '')
  return parseImportWorkbook(buildWorkbook(HEADERS, [row]), existing, new Map())
}

describe('parseImportWorkbook — Latitud / Longitud', () => {
  it('ambas con punto decimal → patch con ubicación', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Latitud': '-33.4489', 'Longitud': '-70.6693' })
    expect(rows[0].errors).toEqual([])
    expect(rows[0].patch.ubicacion_lat).toBe(-33.4489)
    expect(rows[0].patch.ubicacion_lng).toBe(-70.6693)
  })

  it('coma decimal (formato chileno) y celdas numéricas de Excel', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Latitud': '-33,4489', 'Longitud': '-70,6693' })
    expect(rows[0].errors).toEqual([])
    expect(rows[0].patch.ubicacion_lat).toBe(-33.4489)
    const num = parseUpdateRow({ '#': '1', 'Latitud': -39.8142, 'Longitud': -73.2459 })
    expect(num.rows[0].errors).toEqual([])
    expect(num.rows[0].patch.ubicacion_lng).toBe(-73.2459)
  })

  it('solo una de las dos → error de fila, sin patch de ubicación', () => {
    const { rows } = parseUpdateRow({ '#': '1', 'Latitud': '-33.4489' })
    expect(rows[0].errors.some(e => /van juntas/i.test(e))).toBe(true)
    expect(rows[0].patch.ubicacion_lat).toBeUndefined()
  })

  it('invertidas → error con pista; texto no numérico → error', () => {
    const inv = parseUpdateRow({ '#': '1', 'Latitud': '-70.6693', 'Longitud': '-33.4489' })
    expect(inv.rows[0].errors.some(e => /invertidas/i.test(e))).toBe(true)
    const txt = parseUpdateRow({ '#': '1', 'Latitud': 'Santiago', 'Longitud': '-70.6693' })
    expect(txt.rows[0].errors.some(e => /decimales/i.test(e))).toBe(true)
  })

  it('UPDATE con ambas vacías → no toca la ubicación', () => {
    const { rows } = parseUpdateRow({ '#': '1' })
    expect(rows[0].errors).toEqual([])
    expect('ubicacion_lat' in rows[0].patch).toBe(false)
  })
})
