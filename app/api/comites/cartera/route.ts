/**
 * POST /api/comites/cartera — suma o saca una iniciativa de la cartera PÚBLICA
 * de un comité, moviendo su etiqueta en `prioridades_territoriales.tags`.
 *
 * Sirve a los dos comités que tienen cartera pública:
 *   · `infraestructura` (Nudos Críticos) — etiqueta de `region_config`, más
 *     sus megaproyectos curados. Exige el módulo habilitado en la región.
 *   · `economico` — etiqueta fija 'CER'. Sin megaproyectos y sin flag de
 *     habilitación: el Comité Económico no tiene uno (su tab existe fijo).
 *
 * ¿Por qué una ruta y no un update desde el navegador, como el resto del panel?
 * Porque `tags` es columna DEFINICIONAL en `prioridades_check_update()`: solo
 * admin y editor la pueden mover. Sin esto ni la delegación que lleva el comité
 * ni el SEREMI pueden armar su cartera — le tienen que pedir a un admin que
 * etiquete por ellos. La alternativa era abrir `tags` en el trigger, que es
 * tocar la autorización de `prioridades_territoriales`; esta ruta consigue lo
 * mismo acotado a una etiqueta y sin migración.
 *
 * El service role se salta la RLS Y el trigger (mig 028: `auth.uid() IS NULL →
 * RETURN NEW`), así que TODA la autorización vive acá. El orden importa:
 *
 *   1. sesión válida                     → 401
 *   2. la fila existe                    → 404  (región y ministerio salen de
 *                                                la FILA, nunca del cliente)
 *   3. capacidad del comité en esa región → 403
 *   4. el corte fino de cada comité       → 403  ← sin esto, alguien puede
 *                                                etiquetar una iniciativa que
 *                                                no tiene permitido ni leer
 *   5. módulo habilitado (solo infra)     → 409
 *   6. etiqueta en la lista blanca        → 400
 *
 * El paso 4 y el armado del arreglo viven puros en lib/comitesCartera.ts, con
 * sus tests en __tests__/comitesCartera.test.ts.
 */

import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { comitesCarteraPostSchema } from '@/lib/schemas'
import {
  TAG_ECONOMICO,
  aplicarEtiqueta,
  etiquetaCanonica,
  etiquetasGestionables,
  puedeGestionarCartera,
  type Comite,
} from '@/lib/comitesCartera'
import type { CapabilityKey } from '@/lib/permissions'

const CAPACIDAD: Record<Comite, CapabilityKey> = {
  economico:       'comite.economico.operar',
  infraestructura: 'comite.infraestructura.operar',
}

const NOMBRE: Record<Comite, string> = {
  economico:       'Comité Económico',
  infraestructura: 'Comité de Nudos Críticos',
}

export async function POST(request: Request) {
  // ── 1. Sesión ──────────────────────────────────────────────────────────────
  const profile = await requireAuth()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let raw: unknown
  try { raw = await request.json() }
  catch { return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 }) }

  const parse = comitesCarteraPostSchema.safeParse(raw)
  if (!parse.success) {
    return NextResponse.json(
      { error: 'Solicitud inválida', detalle: parse.error.issues },
      { status: 400 },
    )
  }
  const { comite, prioridadId, accion, tag: tagPedido } = parse.data
  const nombreComite = NOMBRE[comite]

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
    console.error('[comites.cartera] lectura falló:', readErr)
    return NextResponse.json({ error: 'No se pudo leer la iniciativa' }, { status: 500 })
  }
  if (!ini) {
    return NextResponse.json({ error: 'La iniciativa no existe' }, { status: 404 })
  }

  // ── 3. Capacidad del comité en la región DE LA FILA ────────────────────────
  if (!(await requireCan(profile, CAPACIDAD[comite], ini.cod))) {
    return NextResponse.json(
      { error: `No tienes permiso para operar el ${nombreComite} en esta región` },
      { status: 403 },
    )
  }

  // ── 4. Corte fino, distinto en cada comité ─────────────────────────────────
  // La RLS haría esto sola si la consulta viniera del navegador; acá no corre.
  if (!puedeGestionarCartera(comite, profile.role, profile.ministerio, ini.ministerio)) {
    return NextResponse.json(
      {
        error: comite === 'economico'
          ? 'Quién entra y quién sale de la cartera lo decide quien conduce el comité'
          : 'Solo puedes sumar o sacar iniciativas de tu propio ministerio',
      },
      { status: 403 },
    )
  }

  // ── 5 y 6. Etiqueta del comité y su lista blanca ───────────────────────────
  let gestionables: string[]

  if (comite === 'economico') {
    // Etiqueta fija, sin megaproyectos y sin flag de habilitación que chequear.
    gestionables = [TAG_ECONOMICO]
  } else {
    const { data: cfg, error: cfgErr } = await db
      .from('region_config')
      .select('infraestructura_habilitado, infraestructura_tag, infraestructura_megaproyectos')
      .eq('region_cod', ini.cod)
      .maybeSingle()

    if (cfgErr) {
      console.error('[comites.cartera] region_config falló:', cfgErr)
      return NextResponse.json({ error: 'No se pudo leer la configuración de la región' }, { status: 500 })
    }
    if (!cfg?.infraestructura_habilitado) {
      return NextResponse.json(
        { error: `El ${nombreComite} no está habilitado en esta región` },
        { status: 409 },
      )
    }
    gestionables = etiquetasGestionables(cfg.infraestructura_tag, cfg.infraestructura_megaproyectos)
  }

  const canonica = etiquetaCanonica(tagPedido ?? gestionables[0], gestionables)
  if (!canonica) {
    return NextResponse.json(
      { error: `Esa etiqueta no pertenece al ${nombreComite} de esta región` },
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
    console.error('[comites.cartera] update falló:', updErr)
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }
  // Cero filas con service role significa que el `id` se evaporó entre la
  // lectura y la escritura. No debería pasar, pero si pasa el cliente tiene que
  // enterarse en vez de creer que guardó (el mismo error que motivó dbWrite).
  if (!upd || upd.length === 0) {
    return NextResponse.json({ error: 'No se pudo guardar el cambio' }, { status: 500 })
  }

  console.log(
    `[comites.cartera] ${profile.email} ${accion} "${canonica}" (${comite}) ` +
    `en #${ini.n} (id ${ini.id}, ${ini.cod}) — ${ini.nombre}`,
  )

  return NextResponse.json({ ok: true, tags: (upd[0].tags ?? []) as string[] })
}
