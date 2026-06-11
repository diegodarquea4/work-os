/**
 * PDF de carteras por ministerio — para reuniones con SEREMI.
 *
 * Devuelve un único PDF con: portada + una sección por ministerio (con page
 * break entre ellas). Cada ficha de iniciativa es compacta (≈3 por página)
 * para una reunión que recorre la cartera completa. Cada ficha incluye los
 * últimos 3 seguimientos registrados y un recuadro vacío para apuntar
 * acuerdos durante la reunión.
 *
 * Body:
 *   { region: Region, soloEnFoco: boolean, fecha: string }
 *
 * Auth: requireAuth() (mismo patrón que /api/minuta).
 *
 * Multi-ministerio: iniciativas con "Min. A · Min. B" aparecen en ambas
 * secciones — coherente con la vista del Kanban.
 */

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { Seguimiento } from '@/lib/types'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { splitMinisterios } from '@/lib/config'
import { carteraPdfSchema } from '@/lib/schemas'
import CarteraPdf, { type MinisterioGroup } from '@/components/CarteraPdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400 }) }

  const parse = carteraPdfSchema.safeParse(rawBody)
  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: 'Solicitud inválida', detalle: parse.error.issues }),
      { status: 400 },
    )
  }
  // El schema valida cod + soloEnFoco + fecha. El resto del objeto region
  // viene del cliente (nombre, capital, zona) y lo casteamos a Region porque
  // el PDF lo necesita completo. El passthrough() del schema lo deja pasar.
  const body = parse.data as typeof parse.data & { region: Region }

  // Restricción regional: regional/viewer solo pueden generar PDFs de regiones asignadas
  const isRestricted = authProfile.role === 'regional' ||
    (authProfile.role === 'viewer' && authProfile.region_cods.length > 0)
  if (isRestricted && !authProfile.region_cods.includes(body.region.cod)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const sb = getSupabaseAdmin()

  // 1. Cargar iniciativas de la región
  const { data: rawIniciativas, error: iniErr } = await sb
    .from('prioridades_territoriales')
    .select('*')
    .eq('cod', body.region.cod)
    .order('n', { ascending: true })

  if (iniErr) {
    return new Response(JSON.stringify({ error: `DB: ${iniErr.message}` }), { status: 500 })
  }

  const iniciativas = (rawIniciativas ?? []) as Iniciativa[]

  // 2. Filtrar por flag en_foco si corresponde
  const filtradas = body.soloEnFoco
    ? iniciativas.filter(p => p.en_foco === true)
    : iniciativas

  if (filtradas.length === 0) {
    const msg = body.soloEnFoco
      ? 'Sin iniciativas en foco para esta región. Marcá iniciativas con la bandera antes de descargar.'
      : 'Sin iniciativas para esta región.'
    return new Response(JSON.stringify({ error: msg }), { status: 400 })
  }

  // 3. Una sola query para todos los seguimientos (evita N+1)
  const ids = filtradas.map(p => p.n)
  const { data: rawSegs } = await sb
    .from('seguimientos')
    .select('id, prioridad_id, fecha, tipo, descripcion, autor, estado, created_at')
    .in('prioridad_id', ids)
    .order('created_at', { ascending: false })

  // Agrupar últimos 3 por iniciativa
  const seguimientosByN: Record<number, Seguimiento[]> = {}
  for (const s of (rawSegs ?? []) as Seguimiento[]) {
    const arr = seguimientosByN[s.prioridad_id] ?? (seguimientosByN[s.prioridad_id] = [])
    if (arr.length < 3) arr.push(s)
  }

  // 4. Agrupar por ministerio. Multi-ministerio → presencia en cada grupo.
  const groupMap = new Map<string, Iniciativa[]>()
  for (const p of filtradas) {
    const ministerios = splitMinisterios(p.ministerio)
    const keys = ministerios.length > 0 ? ministerios : ['Sin ministerio']
    for (const m of keys) {
      const arr = groupMap.get(m) ?? []
      arr.push(p)
      groupMap.set(m, arr)
    }
  }

  // Ordenar: ministerios alfabético; iniciativas dentro de cada uno por nombre
  const groups: MinisterioGroup[] = Array.from(groupMap.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'es'))
    .map(([nombre, list]) => ({
      nombre,
      iniciativas: list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }))

  // 5. Render — mismo escape de tipos que /api/minuta usa para sortear el
  // mismatch entre los props custom del componente y DocumentProps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(CarteraPdf as any, {
    region:           body.region,
    fecha:            body.fecha,
    soloEnFoco:       body.soloEnFoco,
    groups,
    seguimientosByN,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)

  const filename = `cartera-${body.region.cod}-${body.soloEnFoco ? 'foco' : 'completa'}-${new Date().toISOString().slice(0, 10)}.pdf`

  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
