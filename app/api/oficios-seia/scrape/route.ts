/**
 * POST /api/oficios-seia/scrape — lee los oficios pendientes directamente del
 * SEIA, expediente por expediente, sin que nadie baje ni suba ningún archivo.
 *
 * ── Qué reemplaza ──────────────────────────────────────────────────────────
 *
 * A la importación del Excel de seia-abierto.cl, que está detrás de un login y
 * por eso la hacía una persona cada lunes. Los dos endpoints que usa acá son
 * públicos y no piden sesión:
 *
 *   expediente/documentos.php?id_expediente=N      todos los documentos
 *   documentos/verDestinatarios.php?id_documento=N a quiénes se les pidió
 *
 * La importación por Excel NO se retira: sigue existiendo y gana cuando se
 * usa, porque trae la fecha límite OFICIAL y esta ruta la estima (ver
 * `plazo_estimado`, mig 121).
 *
 * ── Qué recorre ────────────────────────────────────────────────────────────
 *
 * Los expedientes de la CARTERA, no los del país. El archivo del SEIA es
 * nacional y traía 638 oficios de los cuales el panel solo podía mostrar ~100:
 * el resto era de proyectos que nadie sigue. Recorrer la cartera cuesta
 * ~200 expedientes en vez de miles y cubre el 100% de lo que se ve.
 *
 * ── Reanudable ─────────────────────────────────────────────────────────────
 *
 * Mismo patrón que /api/seia-sync-v2: cursor en `sync_status.notes`, corte
 * limpio a 240s y `partial: true` con el cursor siguiente. Quien dispara
 * vuelve a llamar hasta que termine. Cada expediente es independiente, así que
 * cortar a la mitad no deja nada inconsistente.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { recordSyncStatus } from '@/lib/syncStatus'
import {
  claveOrganismo,
  esSolicitud,
  parsearDestinatarios,
  parsearDocumentos,
  pendientesDelExpediente,
  presentacionDe,
  type SolicitudConDestinatarios,
} from '@/lib/seiaScraper'
import {
  expedienteDeProyecto,
  type ProyectoCartera,
} from '@/lib/oficiosSeia'

export const maxDuration = 300

const SYNC_NAME = 'oficios-seia-scrape'
/** 80% del maxDuration, igual que el sync del catálogo. */
const PRESUPUESTO_MS = 240_000
const BASE = 'https://seia.sea.gob.cl'
const UA = 'work-os DCI panel (Ministerio del Interior, Chile)'

type Cursor = { idx: number }

type ProyectoAScrapear = {
  id: number
  region_cod: string
  nombre: string
  expediente: number
}

// ── Red ──────────────────────────────────────────────────────────────────────

/**
 * El SEIA responde en ISO-8859-1 y es flaky: un reintento corto alcanza, y lo
 * que no, queda para la reinvocación siguiente vía cursor.
 */
async function bajar(url: string): Promise<string> {
  const pedir = () => fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20_000),
  })
  let res: Response
  try {
    res = await pedir()
  } catch {
    await new Promise(r => setTimeout(r, 2_000))
    res = await pedir()
  }
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  return new TextDecoder('iso-8859-1').decode(await res.arrayBuffer())
}

// ── Un expediente ────────────────────────────────────────────────────────────

type OficioParaEscribir = {
  region_cod: string
  proyecto_privado_id: number
  id_expediente: number
  id_documento: number | null
  seia_doc_n: number | null
  nombre_proyecto: string
  oaeca_sea: string
  oaeca_nombre: string
  tipo_oficio: string
  tipo_presentacion: string | null
  fecha_oficio: string
  fecha_limite: string | null
  plazo_estimado: boolean
  url_proyecto: string
  url_oficio: string | null
  region_seia: string | null
  automatico: true
}

async function scrapearExpediente(p: ProyectoAScrapear): Promise<OficioParaEscribir[]> {
  const docs = parsearDocumentos(
    await bajar(`${BASE}/expediente/documentos.php?id_expediente=${p.expediente}`),
  )
  if (docs.length === 0) return []

  // La presentación sale del tipo de las solicitudes del propio expediente:
  // «Solicitud de evaluación de Adenda» no la dice, y de ella dependen 11 o 16
  // días de plazo.
  const solicitudes = docs.filter(d => esSolicitud(d.tipo))
  let presentacion: 'DIA' | 'EIA' | null = null
  for (const s of solicitudes) {
    const pr = presentacionDe(s.tipo)
    if (pr) presentacion = pr
  }

  const conDest: SolicitudConDestinatarios[] = []
  for (const s of solicitudes) {
    if (s.destinatarios == null) {
      conDest.push({ fila: s, destinatarios: s.destinadoA ? [s.destinadoA] : [] })
      continue
    }
    if (s.idDocumento == null) {
      // Varios destinatarios pero sin enlace: no hay dónde leer la lista.
      conDest.push({ fila: s, destinatarios: [] })
      continue
    }
    conDest.push({
      fila: s,
      destinatarios: parsearDestinatarios(
        await bajar(`${BASE}/documentos/verDestinatarios.php?id_documento=${s.idDocumento}`),
      ),
    })
  }

  const urlProyecto = `${BASE}/expediente/expediente.php?id_expediente=${p.expediente}`

  return pendientesDelExpediente(conDest, docs, presentacion).map(o => ({
    region_cod: p.region_cod,
    proyecto_privado_id: p.id,
    id_expediente: p.expediente,
    id_documento: o.idDocumento,
    // Solo cuando falta el documento: con él presente, la llave tiene que
    // quedar idéntica a la de la mig 118 para que una fila del Excel y una de
    // acá sigan siendo la misma (ver mig 121).
    seia_doc_n: o.idDocumento == null ? o.n : null,
    nombre_proyecto: p.nombre,
    // Las dos columnas con el mismo valor: el SEIA publica un solo nombre, con
    // jurisdicción, y es el que el Excel pone en «OAECCA (SEA)».
    oaeca_sea: o.oaeca,
    oaeca_nombre: o.oaeca,
    tipo_oficio: o.tipoOficio,
    tipo_presentacion: presentacion,
    fecha_oficio: o.fechaOficio,
    fecha_limite: o.fechaLimite,
    // Siempre: el SEIA no publica el plazo por organismo, este se calculó.
    plazo_estimado: true,
    url_proyecto: urlProyecto,
    url_oficio: o.idDocumento ? `${BASE}/documentos/documento.php?idDocumento=${o.idDocumento}` : null,
    region_seia: null,
    automatico: true as const,
  }))
}

// ── Cursor ───────────────────────────────────────────────────────────────────

async function leerCursor(db: ReturnType<typeof getSupabaseAdmin>): Promise<Cursor> {
  const { data } = await db.from('sync_status').select('notes').eq('name', SYNC_NAME).maybeSingle()
  if (!data?.notes) return { idx: 0 }
  try {
    const c = JSON.parse(data.notes as string) as Partial<Cursor>
    if (typeof c.idx === 'number' && c.idx >= 0) return { idx: c.idx }
  } catch { /* cursor ilegible: se empieza de nuevo, que es idempotente */ }
  return { idx: 0 }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Dos formas de entrar, igual que el sync del catálogo: el cron con bearer,
  // o una persona admin/editor desde el panel.
  const bearer = request.headers.get('authorization')
  const esCron = !!process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`
  if (!esCron) {
    const profile = await requireAuth()
    if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (profile.role !== 'admin' && profile.role !== 'editor') {
      return NextResponse.json(
        { error: 'El scraping del SEIA es nacional: solo admin o editor.' },
        { status: 403 },
      )
    }
  }

  const db = getSupabaseAdmin()
  const t0 = Date.now()

  // ── La cartera, que define qué expedientes se miran ──────────────────────
  const { data: carteraRows, error: carteraErr } = await db
    .from('comite_economico_proyecto')
    .select('id, region_cod, nombre, origen_sistema, origen_id, seia_expediente_id')
    .or('origen_sistema.eq.seia,seia_expediente_id.not.is.null')

  if (carteraErr) {
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

  // Orden estable: el cursor es un índice, y si la lista se reordenara entre
  // invocaciones saltearía expedientes sin avisar.
  const proyectos: ProyectoAScrapear[] = (carteraRows ?? [])
    .map(r => {
      const exp = expedienteDeProyecto(r as unknown as ProyectoCartera)
      return exp == null ? null : {
        id: r.id as number,
        region_cod: r.region_cod as string,
        nombre: (r.nombre as string) ?? 'Proyecto sin nombre',
        expediente: exp,
      }
    })
    .filter((x): x is ProyectoAScrapear => x !== null)
    .sort((a, b) => a.id - b.id)

  if (proyectos.length === 0) {
    await recordSyncStatus(SYNC_NAME, {
      status: 'ok', durationMs: Date.now() - t0, rows: 0, notes: '',
    })
    return NextResponse.json({
      ok: true,
      partial: false,
      proyectos: 0,
      mensaje: 'Ningún proyecto de la cartera tiene expediente del SEIA cargado.',
    })
  }

  const cursor = await leerCursor(db)
  const desde = cursor.idx < proyectos.length ? cursor.idx : 0

  let i = desde
  let escritos = 0
  let resueltos = 0
  let fallados = 0
  const errores: string[] = []

  for (; i < proyectos.length; i++) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break
    const p = proyectos[i]

    let vivos: OficioParaEscribir[]
    try {
      vivos = await scrapearExpediente(p)
    } catch (err) {
      fallados++
      if (errores.length < 20) errores.push(`${p.expediente}: ${(err as Error).message}`)
      continue   // el expediente que falla se reintenta en la corrida siguiente
    }

    const ahora = new Date().toISOString()

    // ── Escribir, comparando contra lo guardado DE ESTE EXPEDIENTE ─────────
    //
    // Explícito y no un upsert: el índice único de la mig 121 va sobre
    // expresiones COALESCE, y PostgREST no puede apuntar su ON CONFLICT a un
    // índice así. Además la identidad real es (expediente, organismo) —
    // `pendientesDelExpediente` devuelve a lo sumo una fila por organismo—, que
    // es más simple de razonar que la llave de columnas.
    const { data: guardados, error: leerErr } = await db
      .from('sesion_oficios_tratados')
      .select('id, oaeca_sea, oaeca_nombre, estado')
      .eq('automatico', true)
      .eq('id_expediente', p.expediente)

    if (leerErr) {
      fallados++
      if (errores.length < 20) errores.push(`${p.expediente}: ${leerErr.message}`)
      continue
    }

    const porOrganismo = new Map<string, { id: number; estado: string }>()
    for (const g of guardados ?? []) {
      const k = claveOrganismo((g.oaeca_sea as string) ?? (g.oaeca_nombre as string))
      // Si el Excel dejó dos filas del mismo organismo, gana la primera y la
      // otra queda para resolverse abajo.
      if (!porOrganismo.has(k)) porOrganismo.set(k, { id: g.id as number, estado: g.estado as string })
    }

    const nuevas = vivos.filter(v => !porOrganismo.has(claveOrganismo(v.oaeca_sea)))
    if (nuevas.length > 0) {
      const { error } = await db
        .from('sesion_oficios_tratados')
        .insert(nuevas.map(v => ({ ...v, estado: 'pendiente' as const, importado_at: ahora })))
      if (error) {
        fallados++
        if (errores.length < 20) errores.push(`${p.expediente}: ${error.message}`)
        continue
      }
      escritos += nuevas.length
    }

    // Los que ya estaban: se refresca el plazo y se los devuelve a pendiente
    // si el SEIA los volvió a listar (una Adenda reabre el pedido al mismo
    // organismo). No se toca `estado_updated_by_email`: nadie los tocó.
    for (const v of vivos) {
      const g = porOrganismo.get(claveOrganismo(v.oaeca_sea))
      if (!g) continue
      const { error } = await db
        .from('sesion_oficios_tratados')
        .update({
          estado: 'pendiente',
          tipo_oficio: v.tipo_oficio,
          fecha_oficio: v.fecha_oficio,
          fecha_limite: v.fecha_limite,
          plazo_estimado: true,
          id_documento: v.id_documento,
          seia_doc_n: v.seia_doc_n,
          url_oficio: v.url_oficio,
          proyecto_privado_id: v.proyecto_privado_id,
          region_cod: v.region_cod,
          importado_at: ahora,
        })
        .eq('id', g.id)
        .eq('automatico', true)
      if (error && errores.length < 20) errores.push(`${p.expediente}: ${error.message}`)
    }

    // Lo que YA NO está pendiente: estaba guardado y el SEIA ya no lo lista.
    // Es la regla del Excel —el archivo es la lista completa de lo que falta—
    // aplicada a un expediente.
    const clavesVivas = new Set(vivos.map(v => claveOrganismo(v.oaeca_sea)))
    const aResolver = (guardados ?? [])
      .filter(g => g.estado === 'pendiente')
      .filter(g => !clavesVivas.has(claveOrganismo((g.oaeca_sea as string) ?? (g.oaeca_nombre as string))))
      .map(g => g.id as number)

    if (aResolver.length > 0) {
      // Sin `resuelto_en_sesion_id` ni email: no lo cerró una persona ni una
      // reunión — el organismo respondió y el SEIA dejó de listarlo.
      const { error } = await db
        .from('sesion_oficios_tratados')
        .update({ estado: 'resuelto', estado_updated_at: ahora, importado_at: ahora })
        .in('id', aResolver)
        .eq('automatico', true)
      if (!error) resueltos += aResolver.length
    }
  }

  const termino = i >= proyectos.length
  // Cadena vacía y no null: es lo que `leerCursor` entiende como «empezar de
  // cero», y es como el sync del catálogo limpia el suyo.
  const notes = termino ? '' : JSON.stringify({ idx: i } satisfies Cursor)

  await recordSyncStatus(SYNC_NAME, {
    status:     !termino || fallados > 0 ? 'partial' : 'ok',
    durationMs: Date.now() - t0,
    rows:       escritos,
    errors:     errores.length > 0 ? errores : undefined,
    notes,
  })

  console.log(
    `[oficios-seia/scrape] ${desde}→${i} de ${proyectos.length} · ` +
    `${escritos} pendientes · ${resueltos} resueltos · ${fallados} fallados`,
  )

  return NextResponse.json({
    ok: true,
    partial: !termino,
    next_cursor: termino ? null : { idx: i },
    proyectos: proyectos.length,
    procesados: i - desde,
    desde,
    hasta: i,
    pendientes_escritos: escritos,
    resueltos,
    fallados,
    errores,
  })
}
