/**
 * POST /api/comite-infraestructura/cartera — suma o saca una iniciativa de la
 * cartera del Comité de Infraestructura, moviendo la etiqueta del comité en
 * `prioridades_territoriales.tags`.
 *
 * ¿Por qué una ruta y no un update desde el navegador, como el resto del panel?
 * Porque `tags` es columna DEFINICIONAL en `prioridades_check_update()`: solo
 * admin y editor la pueden mover. La delegación que lleva el comité no puede
 * armar su propia cartera — por eso hoy hay una sola iniciativa etiquetada en
 * producción. La alternativa era abrir `tags` en el trigger, que es tocar la
 * autorización de `prioridades_territoriales`; esta ruta consigue lo mismo
 * acotado a una etiqueta y sin migración.
 *
 * El service role se salta la RLS Y el trigger (mig 028: `auth.uid() IS NULL →
 * RETURN NEW`), así que TODA la autorización vive acá. El orden importa:
 *
 *   1. sesión válida                    → 401
 *   2. la fila existe                   → 404   (región y ministerio salen de
 *                                                la FILA, nunca del cliente)
 *   3. capacidad en la región de la fila → 403
 *   4. si es SEREMI, su ministerio       → 403   ← sin esto, un SEREMI puede
 *                                                etiquetar una iniciativa que
 *                                                no tiene permitido ni leer
 *   5. el módulo está habilitado ahí     → 409
 *   6. la etiqueta está en la lista blanca → 400
 *
 * Las reglas 3-4 y el armado del arreglo viven puros en lib/comiteInfraestructura.ts
 * y están testeados en __tests__/comiteInfraestructura.test.ts.
 */

import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { comiteInfraCarteraPostSchema } from '@/lib/schemas'
import {
  aplicarEtiqueta,
  etiquetaCanonica,
  etiquetasGestionables,
  puedeMoverEtiquetaCartera,
} from '@/lib/comiteInfraestructura'

export async function POST(request: Request) {
  // ── 1. Sesión ──────────────────────────────────────────────────────────────
  const profile = await requireAuth()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = comiteInfraCarteraPostSchema.safeParse(raw)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Solicitud inválida', detalle: parse.error.issues },
      { status: 400 },
    )
  }
  const { prioridadId, accion, tag: tagPedido } = parse.data

  const db = getSupabaseAdmin()

  // ── 2. La fila manda ───────────────────────────────────────────────────────
  // Región y ministerio se leen de la iniciativa, no del body: si vinieran del
  // cliente, cualquiera podría declarar una región donde sí tiene la capacidad
  // y escribir en otra.
  const { data: ini, error: readErr } = await db
    .from('prioridades_territoriales')
    .select('id, n, cod, nombre, ministerio, tags')
    .eq('id', prioridadId)
    .maybeSingle()

  if (readErr) {
    console.error('[comite-infra.cartera] lectura falló:', readErr)
    return NextResponse.json({ error: 'No se pudo leer la iniciativa' }, { status: 500 })
  }
  if (!ini) {
    return NextResponse.json({ error: 'La iniciativa no existe' }, { status: 404 })
  }

  // ── 3. Capacidad en la región DE LA FILA ───────────────────────────────────
  if (!(await requireCan(profile, 'comite.infraestructura.operar', ini.cod))) {
    return NextResponse.json(
      { error: 'No tienes permiso para operar el Comité de Infraestructura en esta región' },
      { status: 403 },
    )
  }

  // ── 4. Corte por ministerio (solo SEREMI) ──────────────────────────────────
  // La RLS haría esto sola si la consulta viniera del navegador; acá no corre.
  if (!puedeMoverEtiquetaCartera(profile.role, profile.ministerio, ini.ministerio)) {
    return NextResponse.json(
      { error: 'Solo puedes sumar o sacar iniciativas de tu propio ministerio' },
      { status: 403 },
    )
  }

  // ── 5. Config de la región: habilitación + lista blanca ────────────────────
  const { data: cfg, error: cfgErr } = await db
    .from('region_config')
    .select('infraestructura_habilitado, infraestructura_tag, infraestructura_megaproyectos')
    .eq('region_cod', ini.cod)
    .maybeSingle()

  if (cfgErr) {
    console.error('[comite-infra.cartera] region_config falló:', cfgErr)
    return NextResponse.json({ error: 'No se pudo leer la configuración de la región' }, { status: 500 })
  }
  if (!cfg?.infraestructura_habilitado) {
    return NextResponse.json(
      { error: 'El Comité de Infraestructura no está habilitado en esta región' },
      { status: 409 },
    )
  }

  // ── 6. La etiqueta pedida tiene que estar en la lista blanca ───────────────
  const gestionables = etiquetasGestionables(
    cfg.infraestructura_tag,
    cfg.infraestructura_megaproyectos,
  )
  const canonica = etiquetaCanonica(tagPedido ?? cfg.infraestructura_tag, gestionables)
  if (!canonica) {
    return NextResponse.json(
      { error: 'Esa etiqueta no pertenece al Comité de Infraestructura de esta región' },
      { status: 400 },
    )
  }

  // ── 7. Escribir ────────────────────────────────────────────────────────────
  const tagsActuales = (ini.tags ?? []) as string[]
  const tagsNuevos = aplicarEtiqueta(tagsActuales, canonica, accion)

  // Misma referencia = no había nada que cambiar. Se evita el UPDATE.
  if (tagsNuevos === tagsActuales) {
    return NextResponse.json({ ok: true, tags: tagsActuales, noop: true })
  }

  const { data: upd, error: updErr } = await db
    .from('prioridades_territoriales')
    .update({ tags: tagsNuevos })
    .eq('id', prioridadId)          // por `id`, nunca por `n` (no es UNIQUE)
    .select('id, tags')

  if (updErr) {
    console.error('[comite-infra.cartera] update falló:', updErr)
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }
  // Cero filas con service role significa que el `id` se evaporó entre la
  // lectura y la escritura. No debería pasar, pero si pasa el cliente tiene que
  // enterarse en vez de creer que guardó (el mismo error que motivó dbWrite).
  if (!upd || upd.length === 0) {
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }

  console.log(
    `[comite-infra.cartera] ${profile.email} ${accion} "${canonica}" ` +
    `en #${ini.n} (id ${ini.id}, ${ini.cod}) — ${ini.nombre}`,
  )

  return NextResponse.json({ ok: true, tags: (upd[0].tags ?? []) as string[] })
}
