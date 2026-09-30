/**
 * POST /api/oficios-seia/revincular — vuelve a cruzar los oficios ya
 * importados contra la cartera, sin volver a subir ningún archivo.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 *
 * La importación es la foto de un instante: cruza el archivo contra la cartera
 * TAL COMO ESTABA al subirlo. Un proyecto que alguien suma después queda con
 * sus oficios huérfanos hasta la próxima subida, y ahí el vínculo pasa a
 * depender de un trámite que no tiene nada que ver con él.
 *
 * Pasó de verdad: la primera importación corrió a las 21:19:09 y un proyecto
 * de Los Lagos se cargó a las 21:20:59. Sus siete oficios estaban en la base,
 * el proyecto también, y no se veían juntos por 110 segundos.
 *
 * Es idempotente y solo suma: nunca desvincula ni reasigna un oficio que ya
 * tiene proyecto. Lo puede correr un cron, un botón o nadie.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import {
  planificarVinculacion,
  type OficioSinProyecto,
  type ProyectoCartera,
} from '@/lib/oficiosSeia'

export const maxDuration = 60

/** Mismo criterio que la importación: es nacional, cruza las 16 regiones. */
export async function POST() {
  const profile = await requireAuth()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return NextResponse.json(
      { error: 'Revincular recorre las 16 regiones: solo admin o editor.' },
      { status: 403 },
    )
  }

  const db = getSupabaseAdmin()

  const { data: carteraRows, error: carteraErr } = await db
    .from('comite_economico_proyecto')
    .select('id, region_cod, origen_sistema, origen_id, seia_expediente_id')
    .or('origen_sistema.eq.seia,seia_expediente_id.not.is.null')

  if (carteraErr) {
    // El caso frecuente es que falte la mig 119: decirlo, en vez de un 500
    // genérico que obliga a leer los logs del servidor.
    const falta119 = /seia_expediente_id/.test(carteraErr.message ?? '')
    return NextResponse.json(
      {
        error: falta119
          ? 'Falta correr la migración 119 (seia_expediente_id) en Supabase.'
          : 'No se pudo leer la cartera',
        detalle: carteraErr.message,
      },
      { status: falta119 ? 409 : 500 },
    )
  }

  // Solo los huérfanos. Traer los ya vinculados sería traer de más y abrir la
  // puerta a reasignarlos, que es justo lo que no se quiere.
  const { data: huerfanos, error: oficiosErr } = await db
    .from('sesion_oficios_tratados')
    .select('id, id_expediente, region_cod')
    .eq('automatico', true)
    .is('proyecto_privado_id', null)
    .not('id_expediente', 'is', null)
    .limit(5000)

  if (oficiosErr) {
    return NextResponse.json(
      { error: 'No se pudieron leer los oficios', detalle: oficiosErr.message },
      { status: 500 },
    )
  }

  const plan = planificarVinculacion(
    (huerfanos ?? []) as OficioSinProyecto[],
    (carteraRows ?? []) as ProyectoCartera[],
  )

  // Se agrupa por destino en vez de escribir fila por fila: un oficio se
  // dirige hasta a 22 organismos, así que un solo proyecto puede arrastrar
  // decenas de filas con el MISMO update. Uno por fila eran ~470 requests
  // contra el maxDuration de esta ruta.
  const porDestino = new Map<string, { patch: Record<string, unknown>; ids: number[] }>()
  for (const v of plan.vincular) {
    const k = `${v.proyecto_privado_id}|${v.region_cod ?? ''}`
    const acc = porDestino.get(k)
    if (acc) { acc.ids.push(v.id); continue }
    porDestino.set(k, {
      patch: v.region_cod
        ? { proyecto_privado_id: v.proyecto_privado_id, region_cod: v.region_cod }
        : { proyecto_privado_id: v.proyecto_privado_id },
      ids: [v.id],
    })
  }

  for (const { patch, ids } of porDestino.values()) {
    const { error } = await db
      .from('sesion_oficios_tratados')
      .update(patch)
      .in('id', ids)
      .eq('automatico', true)
      .is('proyecto_privado_id', null)   // cinturón: no pisar uno ya asignado
    if (error) {
      console.error('[oficios-seia] revincular falló en', ids, error)
      return NextResponse.json(
        { error: 'La revinculación falló a mitad de camino. Volvé a correrla: no deshace lo hecho.', detalle: error.message },
        { status: 500 },
      )
    }
  }

  console.log(
    `[oficios-seia] ${profile.email} revinculó ${plan.vincular.length} oficios ` +
    `(${plan.ambiguos.length} ambiguos, ${(huerfanos ?? []).length} huérfanos revisados)`,
  )

  return NextResponse.json({
    ok: true,
    revisados: (huerfanos ?? []).length,
    vinculados: plan.vincular.length,
    mudados: plan.vincular.filter(v => v.region_cod).length,
    ambiguos: plan.ambiguos.length,
    sin_proyecto: (huerfanos ?? []).length - plan.vincular.length,
  })
}
