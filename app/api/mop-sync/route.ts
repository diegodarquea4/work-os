/**
 * MOP (Ministerio de Obras Públicas) project sync route
 *
 * Scrapes MOP project search HTML (no JSON API), fetches detail pages in batches,
 * and upserts into mop_projects. Iterates all 16 regions, one POST per region.
 *
 * Auth:
 *   GET  — Vercel Cron (header: x-vercel-cron: 1)
 *   POST — Manual / CI (header: Authorization: Bearer <CRON_SECRET>)
 *
 * MOP site: https://proyectos.mop.gob.cl
 *   - Region codes match INE_CODE exactly (1-16)
 *   - HTML encoded in ISO-8859-1
 *   - Pagination via `whichpage` param in the GET links after initial POST
 */

import { NextRequest } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { REGIONS, INE_CODE } from '@/lib/regions'

export const dynamic = 'force-dynamic'
export const runtime  = 'nodejs'
export const maxDuration = 300

const MOP_BASE   = 'https://proyectos.mop.gob.cl'
const PAGE_SIZE  = 500
const BATCH_SIZE = 5   // concurrent detail page fetches

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch URL as ISO-8859-1 text */
async function fetchLatin1(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const buf  = await res.arrayBuffer()
  return new TextDecoder('iso-8859-1').decode(buf)
}

/** Parse Chilean number string (dots as thousands sep) to integer */
function parseChileanInt(s: string): number | null {
  const clean = s.replace(/\./g, '').replace(/,\d+$/, '').trim()
  const n = parseInt(clean, 10)
  return isNaN(n) ? null : n
}

/** Strip HTML tags and decode common entities */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim()
}

// ── List page parser ──────────────────────────────────────────────────────────

type ListRow = { cod_p: string; bip: string; nombre: string; servicio: string; programa: string }

function parseListHtml(html: string): { rows: ListRow[]; nextHrefs: string[] } {
  const rows: ListRow[] = []

  // Match each data row
  const rowRe = /class="datos_reporte"[^>]*>([\s\S]*?)<\/tr>/g
  let m: RegExpExecArray | null

  while ((m = rowRe.exec(html)) !== null) {
    const row = m[1]

    // cod_p from href
    const codMatch = /cod_p=(\d+)/.exec(row)
    if (!codMatch) continue

    // Extract all cell contents (strip tags)
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => stripHtml(c[1]))
    if (cells.length < 5) continue

    // Nombre is in the link text
    const nombreMatch = /href="proyecto\.asp\?cod_p=\d+"[^>]*>([\s\S]*?)<\/a>/.exec(row)
    const nombre = nombreMatch ? stripHtml(nombreMatch[1]) : cells[2]

    rows.push({
      cod_p:    codMatch[1],
      bip:      cells[3] || '',
      nombre:   nombre,
      servicio: cells[1],
      programa: cells[4],
    })
  }

  // Extract pagination hrefs for pages beyond the first
  const hrefRe = /href='(\/Default\.asp\?whichpage=\d+[^']+)'/g
  const seen = new Set<string>()
  const nextHrefs: string[] = []

  while ((m = hrefRe.exec(html)) !== null) {
    const href = m[1]
    if (!seen.has(href)) {
      seen.add(href)
      nextHrefs.push(MOP_BASE + href)
    }
  }

  return { rows, nextHrefs }
}

// ── Detail page parser ────────────────────────────────────────────────────────

type DetailFields = {
  etapa:           string | null
  financiamiento:  string | null
  inversion_miles: number | null
  provincias:      string | null
  comunas:         string | null
  planes:          string | null
  descripcion:     string | null
}

function parseDetailHtml(html: string): DetailFields {
  // Extract key-value pairs from cabecera_01 / cabecera_02 cells
  const fields: Record<string, string> = {}
  const kvRe = /<td[^>]*class="cabecera_01"[^>]*>\s*([^<:]+?)\s*:?\s*<\/td>\s*<td[^>]*class="cabecera_02"[^>]*>([\s\S]*?)<\/td>/g
  let m: RegExpExecArray | null

  while ((m = kvRe.exec(html)) !== null) {
    const key = m[1].trim()
    const val = stripHtml(m[2])
    if (val) fields[key] = val
  }

  // Total investment — "Total General : 55.812.822"
  const invMatch = /Total General\s*:\s*([\d.,]+)/.exec(html)
  const inversion_miles = invMatch ? parseChileanInt(invMatch[1]) : null

  // Description (first <p> in the Descripción section)
  const descMatch = /Descripci[oó]n<\/td>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(html)
  const descripcion = descMatch ? stripHtml(descMatch[1]) || null : null

  return {
    etapa:           fields['Etapa Vigente de Proyecto'] ?? null,
    financiamiento:  fields['Financiamiento']            ?? null,
    inversion_miles,
    provincias:      fields['Provincia(s)']              ?? null,
    comunas:         fields['Comuna(s)']                 ?? null,
    planes:          fields['Plan(es)']                  ?? null,
    descripcion,
  }
}

// ── Core sync ─────────────────────────────────────────────────────────────────

type UpsertRow = {
  cod_p:           string
  bip:             string | null
  region_id:       number
  nombre:          string
  servicio:        string | null
  programa:        string | null
  etapa:           string | null
  financiamiento:  string | null
  inversion_miles: number | null
  provincias:      string | null
  comunas:         string | null
  planes:          string | null
  descripcion:     string | null
  synced_at:       string
}

async function runSync() {
  const supabase      = getSupabaseAdmin()
  let   totalUpserted = 0
  const errors: string[]   = []
  const now    = new Date().toISOString()

  for (const region of REGIONS) {
    const regionId = INE_CODE[region.cod]
    if (regionId === undefined) {
      errors.push(`No INE_CODE for ${region.cod}`)
      continue
    }

    try {
      // ── 1. Fetch page 1 via POST ──
      const formBody = new URLSearchParams({
        region:       String(regionId),
        servicios:    '*',
        planes:       '',
        codigo:       '',
        txt_palabras: '',
        buscar:       'true',
        pagesize:     String(PAGE_SIZE),
        whichpage:    '1',
      })

      const html1 = await fetchLatin1(`${MOP_BASE}/Default.asp?buscar=true`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    formBody.toString(),
      })

      const { rows: page1Rows, nextHrefs } = parseListHtml(html1)
      const allListRows = [...page1Rows]

      // ── 2. Fetch additional pages if any ──
      for (const href of nextHrefs) {
        try {
          const pageHtml = await fetchLatin1(href)
          const { rows } = parseListHtml(pageHtml)
          if (rows.length === 0) break
          allListRows.push(...rows)
        } catch (e) {
          errors.push(`${region.cod} page ${href}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      if (allListRows.length === 0) continue

      // ── 3. Fetch detail pages in batches ──
      const upsertRows: UpsertRow[] = []

      for (let i = 0; i < allListRows.length; i += BATCH_SIZE) {
        const batch = allListRows.slice(i, i + BATCH_SIZE)

        const details = await Promise.all(
          batch.map(async ({ cod_p, bip, nombre, servicio, programa }) => {
            try {
              const detailHtml = await fetchLatin1(`${MOP_BASE}/proyecto.asp?cod_p=${cod_p}`)
              const detail = parseDetailHtml(detailHtml)
              return {
                cod_p,
                bip:             bip || null,
                region_id:       regionId,
                nombre,
                servicio:        servicio || null,
                programa:        programa || null,
                ...detail,
                synced_at:       now,
              } satisfies UpsertRow
            } catch (e) {
              errors.push(`${region.cod} cod_p=${cod_p}: ${e instanceof Error ? e.message : String(e)}`)
              return null
            }
          })
        )

        upsertRows.push(...(details.filter(Boolean) as UpsertRow[]))

        // Small pause between batches to be polite
        if (i + BATCH_SIZE < allListRows.length) {
          await new Promise(r => setTimeout(r, 100))
        }
      }

      // ── 4. Upsert batch ──
      if (upsertRows.length > 0) {
        const { error: dbErr } = await supabase
          .from('mop_projects')
          .upsert(upsertRows, { onConflict: 'cod_p' })

        if (dbErr) {
          errors.push(`${region.cod} upsert: ${dbErr.message}`)
        } else {
          totalUpserted += upsertRows.length
        }
      }
    } catch (e) {
      errors.push(`${region.cod}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (totalUpserted === 0 && errors.length > 0) {
    return Response.json({ ok: false, errors })
  }

  return Response.json({
    ok:        true,
    synced_at: now,
    upserted:  totalUpserted,
    regions:   REGIONS.length,
    errors:    errors.length > 0 ? errors : undefined,
  })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get('x-vercel-cron') !== '1') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}

export async function POST(request: NextRequest) {
  const auth   = request.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runSync()
}
