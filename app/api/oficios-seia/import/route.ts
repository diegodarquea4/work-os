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
import {
  compromisosACerrar,
  type CompromisoSeguimiento,
  type OficioSeguimiento,
} from '@/lib/oficiosSeguimiento'

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

  // ── Chequeo previo: ¿está corrida la migración 117? ───────────────────────
  // Sin esto, el primer INSERT falla con un error de Postgres sobre una
  // columna cualquiera y hay que deducir la causa. Preguntar primero cuesta
  // una consulta y convierte el problema en una instrucción.
  {
    const { error } = await db
      .from('sesion_oficios_tratados')
      .select('id, automatico, id_documento, id_expediente, region_seia')
      .limit(1)
    if (error) {
      return NextResponse.json(
        {
          error: 'La base todavía no tiene las columnas que esta importación necesita: falta correr la migración 117.',
          detalle: error.message,
        },
        { status: 409 },
      )
    }
  }

  // ── 2. La cartera, que es lo que le da región a cada oficio ───────────────
  const { data: carteraRows, error: carteraErr } = await db
    .from('comite_economico_proyecto')
    .select('id, region_cod, origen_sistema, origen_id, seia_expediente_id')
    // Los dos caminos al expediente: importado del catálogo (origen_id) o
    // cargado a mano en la ficha (seia_expediente_id, mig 119). Por eso NO se
    // filtra por origen_sistema: eso dejaría fuera justo a los manuales.
    .or('origen_sistema.eq.seia,seia_expediente_id.not.is.null')

  if (carteraErr) {
    console.error('[oficios-seia] lectura de cartera falló:', carteraErr)
    // Igual que el chequeo de la 117: el caso frecuente es una migración sin
    // correr, y sin nombrarla el error obliga a leer los logs del servidor.
    if (/seia_expediente_id/.test(carteraErr.message ?? '')) {
      return NextResponse.json(
        {
          error: 'Falta correr la migración 119 (seia_expediente_id) en Supabase.',
          detalle: carteraErr.message,
        },
        { status: 409 },
      )
    }
    return NextResponse.json(
      { error: 'No se pudo leer la cartera', detalle: carteraErr.message },
      { status: 500 },
    )
  }

  const parseo = parsearPendientes(pendientes, registro, (carteraRows ?? []) as ProyectoCartera[])

  // ── 3. Contra lo que ya está guardado ─────────────────────────────────────
  const { data: guardadosRows, error: guardadosErr } = await db
    .from('sesion_oficios_tratados')
    // `oaeca_sea` va en el select porque es parte de la llave natural: un
    // mismo documento se dirige a varios organismos (ver `clave` en
    // lib/oficiosSeia.ts). Sin él, la reconciliación daría por repetidos
    // oficios distintos del mismo oficio.
    // `fecha_limite` y `plazo_estimado` van porque el archivo trae la fecha
    // OFICIAL y esta importación tiene que poder corregir una estimada del
    // scraper (mig 121).
    .select('id, id_documento, oaeca_sea, oaeca_nombre, region_cod, estado, proyecto_privado_id, fecha_limite, plazo_estimado')
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
    // El detalle del error de Postgres va AL CLIENTE, no solo al log del
    // servidor: esto lo corre una persona desde una pantalla, y «falló a
    // mitad de camino» sin decir por qué la deja sin nada que hacer. Lo que
    // Postgres dice —qué columna falta, qué constraint se violó— es
    // exactamente lo que hay que saber para arreglarlo.
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    const detalle = [e?.message, e?.details, e?.hint].filter(Boolean).join(' · ')
    return NextResponse.json(
      {
        error: 'La importación falló a mitad de camino. Volvé a subir el archivo: es idempotente, no duplica lo que ya entró.',
        detalle: detalle || String(err),
        codigo: e?.code ?? null,
      },
      { status: 500 },
    )
  }

  // ── 4b. Cerrar los seguimientos que se cumplieron solos ───────────────────
  //
  // El objetivo de un compromiso de seguimiento es que el organismo responda.
  // Cuando ya no le queda ningún oficio pendiente eso pasó, y pedirle a
  // alguien que lo confirme sería pedirle que ratifique lo que el archivo ya
  // dice. Se cierra acá y el acta de la sesión siguiente lo reporta.
  //
  // Va DESPUÉS de escribir y con una lectura nueva a propósito: lo que decide
  // es el estado de los oficios recién guardados, no el de antes de importar.
  let seguimientosCerrados = 0
  try {
    const { data: comps } = await db
      .from('sesion_compromisos')
      .select('id, region_cod, oaeca_objetivo, estado')
      .not('oaeca_objetivo', 'is', null)
      .in('estado', ['pendiente', 'en_curso'])

    if (comps && comps.length > 0) {
      const { data: vivos } = await db
        .from('sesion_oficios_tratados')
        .select('id, region_cod, oaeca_sea, oaeca_nombre, nombre_proyecto, proyecto_privado_id, fecha_limite, estado')
        .eq('automatico', true)
        .eq('estado', 'pendiente')
        .limit(20000)

      // Por región: un organismo puede deber oficios en una y no en otra, y
      // el compromiso es de una región.
      const porRegion = new Map<string, OficioSeguimiento[]>()
      for (const o of (vivos ?? []) as (OficioSeguimiento & { region_cod: string })[]) {
        const acc = porRegion.get(o.region_cod) ?? []
        acc.push(o)
        porRegion.set(o.region_cod, acc)
      }

      const cerrar: number[] = []
      const porRegionComp = new Map<string, CompromisoSeguimiento[]>()
      for (const c of comps as (CompromisoSeguimiento & { region_cod: string })[]) {
        const acc = porRegionComp.get(c.region_cod) ?? []
        acc.push(c)
        porRegionComp.set(c.region_cod, acc)
      }
      for (const [region, cs] of porRegionComp) {
        cerrar.push(...compromisosACerrar(cs, porRegion.get(region) ?? []))
      }

      if (cerrar.length > 0) {
        const { error } = await db
          .from('sesion_compromisos')
          .update({ estado: 'cumplido', estado_updated_at: ahora })
          // Sin `estado_updated_by_email`: no lo cerró una persona. Queda en
          // NULL, que es lo que distingue un cierre automático de uno de sala.
          .in('id', cerrar)
        if (error) console.error('[oficios-seia] no se pudieron cerrar seguimientos:', error)
        else seguimientosCerrados = cerrar.length
      }
    }
  } catch (err) {
    // Un fallo acá no invalida la importación, que ya está escrita. Se
    // reporta y el próximo archivo vuelve a intentarlo.
    console.error('[oficios-seia] cierre de seguimientos falló:', err)
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

  return NextResponse.json({
    ok: true,
    ...resumen,
    sin_asignar: parseo.sinAsignar,
    // Fuera de `resumen` porque no se guarda en seia_oficios_import: es una
    // consecuencia de la importación, no una medida del archivo.
    seguimientos_cerrados: seguimientosCerrados,
  })
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
