/**
 * GET /api/oficios-seia/tablero — los datos del tablero «Seguimiento de la
 * inversión en el SEIA» (Métricas → Comité Económico Regional), para
 * CUALQUIER usuario con sesión.
 *
 * ── Por qué una ruta y no el cliente del navegador ─────────────────────────
 *
 * Manuel, 2026-10-01: el tablero lo ven todos y de todas las regiones, porque
 * lo que muestra es información pública (los oficios son del SEIA). Pero las
 * tablas de donde sale tienen RLS por región —oficios y sesiones solo para
 * quien opera ese comité— y abrir esas políticas SELECT dejaría ver TODO lo
 * demás que guardan (notas de sesión, actas, la cartera completa). Esta ruta
 * lee con service role y entrega solo las columnas que el tablero dibuja.
 *
 * Solo lectura. Nada de lo que devuelve se escribe de vuelta.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { diaChile } from '@/lib/fechaChile'

export const dynamic = 'force-dynamic'

const PAGINA = 1000

const COLUMNAS_OFICIO = 'id, id_expediente, nombre_proyecto, ministerio, oaeca_sea, oaeca_nombre, tipo_oficio, fecha_limite, fecha_oficio, url_oficio, url_proyecto, region_cod, proyecto_privado_id, estado, estado_updated_at, importado_at'
const COLUMNAS_CARTERA = 'id, region_cod, created_at, nombre, priorizado, inversion_monto, inversion_moneda, mano_obra_directa, mano_obra_indirecta, seia_expediente_id, origen_id'
const COLUMNAS_SEIA = 'id, region_id, nombre, titular, tipo, comuna_nombre, via_ingreso, inversion, fecha_presentacion, url_ficha'

type Respuesta = { data: unknown[] | null; error: { message: string } | null }

/** Trae todas las filas de a 1.000 (el tope de PostgREST). */
async function todas(armar: (desde: number, hasta: number) => PromiseLike<Respuesta>): Promise<unknown[]> {
  const out: unknown[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await armar(desde, desde + PAGINA - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < PAGINA) return out
  }
}

export async function GET() {
  const profile = await requireAuth()
  if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const db = getSupabaseAdmin()
  try {
    const [oficios, sesiones, cartera, enCalificacion, corridasRes] = await Promise.all([
      todas((a, b) => db.from('sesion_oficios_tratados').select(COLUMNAS_OFICIO)
        .eq('automatico', true).order('id').range(a, b)),
      // Solo las sesiones TERMINADAS (Manuel, 2026-10-01): una abierta o en
      // borrador no es un comité que haya sesionado todavía.
      todas((a, b) => db.from('eje_sesiones').select('region_cod, fecha')
        .eq('instancia', 'inversion').eq('estado', 'cerrada').not('fecha', 'is', null).order('id').range(a, b)),
      todas((a, b) => db.from('comite_economico_proyecto').select(COLUMNAS_CARTERA).order('nombre').range(a, b)),
      todas((a, b) => db.from('v2_proyectos_inversion').select(COLUMNAS_SEIA)
        .eq('sistema_origen', 'seia').eq('estado', 'En Calificación').order('id').range(a, b)),
      // Las corridas COMPLETAS del scraper: la nacional y la de cada región.
      db.from('sync_status').select('name, last_run_at').like('name', 'oficios-seia-scrape%').eq('last_status', 'ok'),
    ])

    // Día (Chile) de la última corrida completa: '*' = nacional, o el código de
    // la región. Es la fecha de una región que no tiene oficios pendientes: sin
    // esto no tenía ninguna, y el botón la ofrecía para siempre.
    const corridas: Record<string, string> = {}
    for (const c of (corridasRes.data ?? []) as { name: string; last_run_at: string | null }[]) {
      if (!c.last_run_at) continue
      corridas[c.name.includes(':') ? c.name.split(':')[1] : '*'] = diaChile(new Date(c.last_run_at))
    }

    // La ficha del SEIA de lo que el tablero nombra y no está en calificación:
    // proyectos de la cartera ya aprobados, o con oficios recién resueltos.
    const conocidos = new Set((enCalificacion as { id: string }[]).map(p => p.id))
    const faltan = [...new Set([
      ...(oficios as { id_expediente: number | null }[]).map(o => o.id_expediente != null ? `seia_${o.id_expediente}` : null),
      ...(cartera as { seia_expediente_id: number | null; origen_id: string | null }[]).map(c =>
        c.seia_expediente_id != null ? `seia_${c.seia_expediente_id}` : c.origen_id?.startsWith('seia_') ? c.origen_id : null),
    ])].filter((id): id is string => id != null && !conocidos.has(id))
    const otrasFichas: unknown[] = []
    for (let i = 0; i < faltan.length; i += 100) {
      const { data, error } = await db.from('v2_proyectos_inversion').select(COLUMNAS_SEIA).in('id', faltan.slice(i, i + 100))
      if (error) throw new Error(error.message)
      otrasFichas.push(...(data ?? []))
    }

    return NextResponse.json(
      { hoy: diaChile(), oficios, sesiones, cartera, enCalificacion, otrasFichas, corridas },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    console.error('[oficios-seia/tablero]', err)
    return NextResponse.json({ error: 'No se pudieron leer los datos del tablero', detalle: (err as Error).message }, { status: 500 })
  }
}
