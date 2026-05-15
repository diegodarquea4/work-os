/**
 * SUBTEL (Subsecretaría de Telecomunicaciones) sync route
 *
 * Downloads Excel files with fixed and mobile internet connection data
 * by region from subtel.gob.cl and upserts into v2_indicadores_valores.
 *
 * Fills: CON_INT_FIJO, CON_INT_MOVIL
 *
 * Source: https://www.subtel.gob.cl/estudios-y-estadisticas/internet/
 * Files update semestral (June, December).
 *
 * Auth:
 *   GET  — Vercel Cron (x-vercel-cron: 1)
 *   POST — Manual (Authorization: Bearer <CRON_SECRET>)
 */

import { NextRequest } from 'next/server'
import { isAuthorizedSync, upsertV2WithLog } from '@/lib/syncHelper'
import { fetchExcel, parseWorkbook, findColumn, extractRegionalValues } from '@/lib/parseExcel'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// These URLs update semestral. When SUBTEL publishes a new version,
// update the URL in v2_indicadores_pipeline.fuente_endpoint or here.
const URLS = {
  fijo:  'https://www.subtel.gob.cl/wp-content/uploads/2026/03/1_SERIES_CONEXIONES_INTERNET_FIJA_DIC25.xlsx',
  movil: 'https://www.subtel.gob.cl/wp-content/uploads/2026/03/2_SERIES_CONEXIONES_INTERNET_MOVIL_DIC25.xlsx',
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

export async function POST(request: NextRequest) {
  if (!isAuthorizedSync(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return runSync()
}

async function runSync() {
  const errors: string[] = []
  const v2Rows: { codigo_indicador: string; region_id: number; valor: number; periodo: string; calidad: string; cargado_por: string }[] = []

  // Process each file
  for (const [tipo, url] of Object.entries(URLS)) {
    const codigo = tipo === 'fijo' ? 'CON_INT_FIJO' : 'CON_INT_MOVIL'

    try {
      const buffer = await fetchExcel(url)
      const wb = parseWorkbook(buffer)

      // SUBTEL files typically have a sheet with regional data
      // Try to find a sheet with "Region" or "Regional" in the name
      const sheetName = wb.SheetNames.find(s =>
        s.toLowerCase().includes('region') || s.toLowerCase().includes('serie')
      ) ?? wb.SheetNames[0]

      const sheet = wb.Sheets[sheetName]
      if (!sheet) {
        errors.push(`${tipo}: no sheet found`)
        continue
      }

      // Find region and value columns
      const regionCol = findColumn(sheet, 0, 'region')
      if (regionCol === -1) {
        // Try "Región" with accent
        const regionCol2 = findColumn(sheet, 0, 'regi')
        if (regionCol2 === -1) {
          errors.push(`${tipo}: no region column found in sheet ${sheetName}`)
          continue
        }
      }

      // Find the latest period column (rightmost numeric column)
      const values = extractRegionalValues(
        sheet,
        regionCol === -1 ? findColumn(sheet, 0, 'regi') : regionCol,
        -1, // Will be determined below
        1,
      )

      // If extractRegionalValues didn't work with auto-detect,
      // fall back to sheet_to_json approach
      if (values.size === 0) {
        const json = await import('xlsx').then(XLSX => XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[])

        for (const row of json) {
          // Find region name in first string column
          const regionEntry = Object.entries(row).find(([, v]) => typeof v === 'string' && v.length > 3)
          if (!regionEntry) continue

          const { matchRegionName } = await import('@/lib/regionNameMatcher')
          const regionId = matchRegionName(regionEntry[1] as string)
          if (regionId === null || regionId === 0) continue

          // Find the latest numeric value (last column with a number)
          const numericEntries = Object.entries(row)
            .filter(([, v]) => typeof v === 'number')
            .reverse()

          if (numericEntries.length === 0) continue

          // Use the last numeric column as the latest value
          const [periodKey, value] = numericEntries[0]

          v2Rows.push({
            codigo_indicador: codigo,
            region_id: regionId,
            valor: value as number,
            periodo: extractPeriodFromKey(periodKey),
            calidad: 'verificado',
            cargado_por: 'subtel-sync',
          })
        }
      }

      console.log(`[subtel-sync] ${tipo}: parsed ${v2Rows.filter(r => r.codigo_indicador === codigo).length} regional values`)
    } catch (err) {
      errors.push(`${tipo}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Upsert to v2
  const { upserted, error: v2Error } = await upsertV2WithLog(v2Rows, 'subtel-sync')
  if (v2Error) errors.push(`v2 upsert: ${v2Error}`)

  return Response.json({
    ok: errors.length === 0,
    synced_at: new Date().toISOString(),
    upserted,
    errors: errors.length > 0 ? errors : undefined,
  })
}

/** Try to extract a date from a column header like "dic-25", "2025-12", "Dec 2025" */
function extractPeriodFromKey(key: string): string {
  // Try "dic-25" or "jun-25" format
  const monthMap: Record<string, string> = {
    ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06',
    jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12',
  }

  const m = key.match(/^(\w{3})-(\d{2})$/i)
  if (m) {
    const month = monthMap[m[1].toLowerCase()]
    const year = parseInt(m[2]) + 2000
    if (month) return `${year}-${month}-01`
  }

  // Try ISO format
  if (/^\d{4}-\d{2}/.test(key)) return key.slice(0, 10).padEnd(10, '-01')

  // Default to today
  return new Date().toISOString().slice(0, 10)
}
