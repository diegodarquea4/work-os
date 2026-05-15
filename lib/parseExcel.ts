/**
 * Excel download and parsing utilities for sync routes.
 *
 * Uses the `xlsx` library (already in package.json) to parse .xlsx/.xls files
 * downloaded from Chilean government portals (DEIS, MINEDUC, SUBTEL, DIPRES, etc.).
 */

import * as XLSX from 'xlsx'
import { matchRegionName } from './regionNameMatcher'

/**
 * Download an Excel file from a URL and return as ArrayBuffer.
 * Handles redirects and timeouts common on government portals.
 */
export async function fetchExcel(url: string, timeoutMs = 30_000): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; WorkOS-DCI/2.0)',
      'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, */*',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`)
  return res.arrayBuffer()
}

/**
 * Parse an ArrayBuffer as an Excel workbook.
 */
export function parseWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'array' })
}

/**
 * Extract regional values from a sheet.
 *
 * Looks for a column containing region names and a column with numeric values.
 * Returns a Map of INE region_id → value.
 *
 * @param sheet - XLSX worksheet
 * @param regionColIdx - 0-based column index containing region names
 * @param valueColIdx - 0-based column index containing the value
 * @param startRow - 0-based row to start scanning (skip headers)
 */
export function extractRegionalValues(
  sheet: XLSX.WorkSheet,
  regionColIdx: number,
  valueColIdx: number,
  startRow = 1,
): Map<number, number> {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const result = new Map<number, number>()

  for (let row = startRow; row <= range.e.r; row++) {
    const regionCell = sheet[XLSX.utils.encode_cell({ r: row, c: regionColIdx })]
    const valueCell = sheet[XLSX.utils.encode_cell({ r: row, c: valueColIdx })]

    if (!regionCell || !valueCell) continue

    const regionName = String(regionCell.v ?? '').trim()
    if (!regionName) continue

    const regionId = matchRegionName(regionName)
    if (regionId === null) continue

    const value = typeof valueCell.v === 'number' ? valueCell.v : parseFloat(String(valueCell.v).replace(',', '.'))
    if (isNaN(value)) continue

    result.set(regionId, value)
  }

  return result
}

/**
 * Convert a sheet to JSON array, useful for complex parsing.
 */
export function sheetToJson(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[]
}

/**
 * Find column index by header name (case-insensitive, partial match).
 */
export function findColumn(sheet: XLSX.WorkSheet, headerRow: number, search: string): number {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1')
  const searchLower = search.toLowerCase()

  for (let col = range.s.c; col <= range.e.c; col++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c: col })]
    if (cell && String(cell.v ?? '').toLowerCase().includes(searchLower)) {
      return col
    }
  }
  return -1
}
