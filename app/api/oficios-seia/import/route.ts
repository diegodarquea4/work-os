/**
 * POST /api/oficios-seia/import — carga el archivo de oficios pendientes del
 * SEIA y lo vuelca a `sesion_oficios_tratados` con `automatico = true`.
 *
 * ── De dónde sale el archivo ───────────────────────────────────────────────
 *
 * De seia-abierto.cl → «Proyectos en calificación» → «Detalle oficios
 * pendientes» → «Descargar datos». Ese portal está detrás de un login de
 * Firebase y sus tableros son Power BI, así que el archivo lo baja una
 * persona: no hay URL estable que un cron pueda pedir. Por eso la entrada es
 * una subida y no un sync — y por eso TODO lo que decide qué entra vive puro
 * en `lib/oficiosSeia.ts`, para que el día que aparezca una fuente sin login
 * se reemplace solo este handler y nada más.
 *
 * ── Qué escribe ────────────────────────────────────────────────────────────
 *
 *   nuevos      → INSERT con automatico = true
 *   actualizar  → el expediente entró a una cartera desde la última
 *                 importación: el oficio deja de estar «sin asignar»
 *   resolver    → estaba pendiente y ya no viene en el archivo, que es la
 *                 lista COMPLETA de lo que falta: se respondió
 *
 * Lo que NUNCA toca son los oficios que el comité levantó a mano en una sesión
 * (`automatico = false`). La consulta de abajo los excluye y los CHECK de la
 * mig 117 impiden que un importado se haga pasar por uno de ellos.
 *
 * ── Autorización ───────────────────────────────────────────────────────────
 *
 * Es una importación NACIONAL: escribe en las 16 regiones de una. Por eso el
 * gate es admin/editor —el mismo alcance que la policy `sesion_oficios_staff_all`
 * de la mig 049— y no la capacidad del comité, que es por región. Escribe con
 * service role, así que la RLS no corre: toda la autorización es esta.
 */

import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import {
  parsearPendientes,
  planificarEscritura,
  type FilaPendiente,
  type FilaRegistro,
  type OficioGuardado,
  type ProyectoCartera,
} from '@/lib/oficiosSeia'

export const maxDuration = 120

const HOJA_PENDIENTES = 'Pendientes'
const HOJA_REGISTRO   = 'Registro'
const HOJA_ATRASO     = 'Atraso por ministerio'

/** Supabase no traga 600 filas de una sin quejarse en algún entorno; se
 *  trocea por las dudas, igual que hace el sync del SEIA. */
const LOTE = 200

export async function POST(request: Request) {
  const profile = await requireAuth()
  if (!profile) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (profile.role !== 'admin' && profile.role !== 'editor') {
    return NextResponse.json(
      { error: 'La importación de oficios del SEIA es nacional: solo admin o editor.' },
      { status: 403 },
    )
  }

  // ── 1. El archivo ─────────────────────────────────────────────────────────
  let archivo: File | null
  try {
    const form = await request.formData()
    archivo = form.get('archivo') as File | null
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo' }, { status: 400 })
  }
  if (!archivo) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 })
  }
  if (!/\.xlsx?$/i.test(archivo.name)) {
    return NextResponse.json(
      { error: 'El archivo tiene que ser el Excel que descarga seia-abierto.cl (.xlsx)' },
      { status: 400 },
    )
  }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array' })
  } catch {
    return NextResponse.json({ error: 'El archivo no se pudo abrir como Excel' }, { status: 400 })
  }

  if (!wb.Sheets[HOJA_PENDIENTES]) {
    return NextResponse.json(
      {
        error: `El archivo no tiene la hoja «${HOJA_PENDIENTES}». ` +
               `Tiene: ${wb.SheetNames.join(', ')}. ¿Es el de «Detalle oficios pendientes»?`,
      },
      { status: 400 },
    )
  }

  const pendientes = XLSX.utils.sheet_to_json(wb.Sheets[HOJA_PENDIENTES], { defval: null }) as FilaPendiente[]
  // «Registro» es la única hoja con la región REAL del proyecto. Sin ella se
  // puede seguir: los oficios cuyo expediente esté en una cartera igual
  // resuelven su región por ahí; el resto se descarta y se reporta.
  const registro = wb.Sheets[HOJA_REGISTRO]
    ? XLSX.utils.sheet_to_json(wb.Sheets[HOJA_REGISTRO], { defval: null }) as FilaRegistro[]
    : []

  // La fecha de corte del DATO (no la de la importación): es lo que hay que
  // mostrar en pantalla para saber si el archivo quedó viejo.
  const fechaCorte = leerFechaCorte(wb)

  const db = getSupabaseAdmin()

  // ── 2. La cartera, que es lo que le da región a cada oficio ───────────────
  const { data: carteraRows, error: carteraErr } = await db
    .from('comite_economico_proyecto')
    .select('id, region_cod, origen_sistema, origen_id')
    .eq('origen_sistema', 'seia')

  if (carteraErr) {
    console.error('[oficios-seia] lectura de cartera falló:', carteraErr)
    return NextResponse.json({ error: 'No se pudo leer la cartera' }, { status: 500 })
  }

  const parseo = parsearPendientes(pendientes, registro, (carteraRows ?? []) as ProyectoCartera[])

  // ── 3. Contra lo que ya está guardado ─────────────────────────────────────
  const { data: guardadosRows, error: guardadosErr } = await db
    .from('sesion_oficios_tratados')
    .select('id, id_documento, region_cod, estado, proyecto_privado_id')
    .eq('automatico', true)

  if (guardadosErr) {
    console.error('[oficios-seia] lectura de oficios falló:', guardadosErr)
    return NextResponse.json({ error: 'No se pudieron leer los oficios ya cargados' }, { status: 500 })
  }

  const plan = planificarEscritura(parseo.oficios, (guardadosRows ?? []) as OficioGuardado[])
  const ahora = new Date().toISOString()

  // ── 4. Escribir ───────────────────────────────────────────────────────────
  try {
    for (let i = 0; i < plan.nuevos.length; i += LOTE) {
      const lote = plan.nuevos.slice(i, i + LOTE).map(o => ({
        ...o,
        estado: 'pendiente' as const,
        automatico: true,
        importado_at: ahora,
      }))
      const { error } = await db.from('sesion_oficios_tratados').insert(lote)
      if (error) throw error
    }

    for (const u of plan.actualizar) {
      const { error } = await db
        .from('sesion_oficios_tratados')
        .update({ ...u.cambios, importado_at: ahora })
        .eq('id', u.id)
        .eq('automatico', true)   // cinturón: nunca tocar uno manual
      if (error) throw error
    }

    for (let i = 0; i < plan.resolver.length; i += LOTE) {
      const ids = plan.resolver.slice(i, i + LOTE)
      const { error } = await db
        .from('sesion_oficios_tratados')
        // Sin `resuelto_en_sesion_id`: no se resolvió en ninguna reunión, dejó
        // de aparecer en el archivo. Y sin email: no lo cerró una persona.
        .update({ estado: 'resuelto', estado_updated_at: ahora, importado_at: ahora })
        .in('id', ids)
        .eq('automatico', true)
      if (error) throw error
    }
  } catch (err) {
    console.error('[oficios-seia] escritura falló:', err)
    return NextResponse.json(
      { error: 'La importación falló a mitad de camino. Volvé a subir el archivo: es idempotente, no duplica lo que ya entró.' },
      { status: 500 },
    )
  }

  // ── 5. Dejar huella ───────────────────────────────────────────────────────
  const resumen = {
    fecha_corte: fechaCorte,
    archivo_nombre: archivo.name,
    filas_leidas: pendientes.length,
    filas_nuevas: plan.nuevos.length,
    filas_actualizadas: plan.actualizar.length,
    filas_resueltas: plan.resolver.length,
    filas_sin_region: parseo.descartadas.length,
    // Se guardan los descartes para poder explicar la diferencia entre lo que
    // el archivo trae y lo que el panel muestra, sin volver a bajar nada.
    detalle: { descartadas: parseo.descartadas.slice(0, 200), sin_asignar: parseo.sinAsignar },
    importado_por_email: profile.email,
  }

  const { error: logErr } = await db.from('seia_oficios_import').insert(resumen)
  if (logErr) console.error('[oficios-seia] no se pudo registrar la importación:', logErr)

  console.log(
    `[oficios-seia] ${profile.email} importó ${archivo.name}: ` +
    `${pendientes.length} leídas · ${plan.nuevos.length} nuevas · ` +
    `${plan.actualizar.length} enganchadas · ${plan.resolver.length} resueltas · ` +
    `${parseo.descartadas.length} descartadas`,
  )

  return NextResponse.json({ ok: true, ...resumen, sin_asignar: parseo.sinAsignar })
}

/**
 * La fecha de corte del archivo, que trae la hoja «Atraso por ministerio».
 * Es distinta de la fecha en que se sube: un archivo bajado el lunes y subido
 * el miércoles sigue siendo del lunes, y eso es lo que hay que mostrar.
 */
function leerFechaCorte(wb: XLSX.WorkBook): string | null {
  const hoja = wb.Sheets[HOJA_ATRASO]
  if (!hoja) return null
  const filas = XLSX.utils.sheet_to_json(hoja, { defval: null }) as Record<string, unknown>[]
  const serial = filas[0]?.['Fecha de corte']
  if (typeof serial !== 'number') return null
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}
