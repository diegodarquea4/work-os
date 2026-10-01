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
 * Depende de quién llama (Manuel, 2026-10-01):
 *
 *   · La corrida NACIONAL (el cron, día por medio) recorre TODO lo que está
 *     en calificación en el SEIA, esté o no en la cartera, más la cartera y
 *     los que ya tienen oficios guardados. Es lo que alimenta el tablero de
 *     Métricas «Seguimiento de la inversión en el SEIA», que tiene que ser la
 *     foto del país y no solo de lo que cada comité cargó. Son ~350
 *     expedientes: no entra en una invocación, y para eso está el cursor.
 *   · La corrida de UNA región (`?region=`, el botón) recorre solo los
 *     proyectos PRIORIZADOS de la cartera de esa región. Es el refresco rápido
 *     de lo que el comité está empujando; el resto lo pone al día el cron.
 *
 * Los ya guardados entran a la nacional porque, sin refrescarlos, un oficio de
 * un proyecto que salió de calificación quedaría congelado: su plazo envejece
 * solo y con los meses aparece como un atraso gravísimo que ya fue respondido.
 *
 * Lo que NO se recorre es el catálogo entero (aprobados, rechazados…): son
 * miles de expedientes cerrados que no tienen oficios vivos.
 *
 * ── Cuánto tarda, y por qué ────────────────────────────────────────────────
 *
 * El SEIA tarda ~5,4 s por consulta (medido sobre 3 expedientes desde
 * Santiago). La primera versión de esta ruta las hacía TODAS en fila: los 6
 * expedientes de Los Lagos son ~18 consultas, o sea 97 s locales y ~5 min desde
 * Vercel — que es lo que Manuel reportó el 2026-09-30. Hoy van hasta
 * MAX_EN_VUELO en paralelo y un expediente ya consultado hoy no se vuelve a
 * consultar (ver «candado diario» más abajo).
 *
 * ── Reanudable ─────────────────────────────────────────────────────────────
 *
 * Mismo patrón que /api/seia-sync-v2: cursor en `sync_status.notes`, corte
 * limpio a 240s y `partial: true` con el cursor siguiente. Quien dispara
 * vuelve a llamar hasta que termine. Cada expediente es independiente, así que
 * cortar a la mitad no deja nada inconsistente — y el cursor avanza de lote en
 * lote, nunca por dentro de uno.
 */

import { NextResponse } from 'next/server'
import { requireAuth, requireCan } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { recordSyncStatus } from '@/lib/syncStatus'
import { inicioDelDiaChile } from '@/lib/fechaChile'
import { INE_INVERSE } from '@/lib/regions'
import { atrasoAlCerrar, type MotivoCierre } from '@/lib/oficiosFotos'
import { regionesQueNecesitanRespaldo, tomarFotoOficios } from '@/lib/oficiosFotoServer'
import {
  cierraExpediente,
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
  planificarVinculacion,
  type OficioSinProyecto,
  type ProyectoCartera,
} from '@/lib/oficiosSeia'

export const maxDuration = 300

const SYNC_NAME = 'oficios-seia-scrape'
/** 80% del maxDuration, igual que el sync del catálogo. */
const PRESUPUESTO_MS = 240_000
const BASE = 'https://seia.sea.gob.cl'
const UA = 'work-os DCI panel (Ministerio del Interior, Chile)'

/**
 * Consultas simultáneas al SEIA. Es el único número que gobierna la velocidad
 * de todo esto, así que vale decir de dónde sale: con 1 —la versión original—
 * una región tardaba ~5 min; con 6 tarda ~16 s. Más arriba deja de rendir: el
 * SEIA es flaky y castiga la insistencia con timeouts, que cuestan un reintento
 * de 20 s cada uno. Y es un servicio público al que no le pedimos permiso para
 * apurarlo. Seis es rápido y educado.
 */
const MAX_EN_VUELO = 6
/**
 * Expedientes que se toman juntos. El que manda es MAX_EN_VUELO —cada
 * expediente dispara 1 + N consultas—; esto solo evita armar 250 promesas de
 * una y mantiene el cursor avanzando en pasos chicos.
 */
const LOTE = 4

type Cursor = { idx: number }

type ProyectoAScrapear = {
  id: number
  region_cod: string
  nombre: string
  expediente: number
}

// ── Red ──────────────────────────────────────────────────────────────────────

/**
 * Deja pasar `max` promesas a la vez y encola el resto. Un semáforo global y no
 * un `Promise.all` por lote porque los expedientes traen distinta cantidad de
 * consultas: con lotes, el más chico espera al más grande y se desperdicia la
 * mitad del paralelismo.
 */
function crearLimitador(max: number) {
  let enVuelo = 0
  const cola: (() => void)[] = []
  return async function limitar<T>(fn: () => Promise<T>): Promise<T> {
    if (enVuelo >= max) await new Promise<void>(resolver => cola.push(resolver))
    enVuelo++
    try {
      return await fn()
    } finally {
      enVuelo--
      cola.shift()?.()
    }
  }
}

type Bajar = (url: string) => Promise<string>

/**
 * El SEIA responde en ISO-8859-1 y es flaky: un reintento corto alcanza, y lo
 * que no, queda para la reinvocación siguiente vía cursor.
 */
function crearBajar(limitar: ReturnType<typeof crearLimitador>): Bajar {
  return (url: string) => limitar(async () => {
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
  })
}

// ── Un expediente ────────────────────────────────────────────────────────────

type OficioParaEscribir = {
  region_cod: string
  /** `null` = el expediente no está en la cartera; se refresca igual. */
  proyecto_privado_id: number | null
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

type Scrapeo = {
  oficios: OficioParaEscribir[]
  /**
   * El expediente está muerto: hay RCA, término anticipado o desistimiento. Lo
   * que deje de figurar pendiente acá NO es un organismo que respondió — es un
   * proyecto que se acabó, y su atraso no se le puede cobrar a nadie (mig 122).
   */
  cerrado: boolean
}

async function scrapearExpediente(p: ProyectoAScrapear, bajar: Bajar): Promise<Scrapeo> {
  const docs = parsearDocumentos(
    await bajar(`${BASE}/expediente/documentos.php?id_expediente=${p.expediente}`),
  )
  if (docs.length === 0) return { oficios: [], cerrado: false }
  const cerrado = docs.some(d => cierraExpediente(d.tipo))

  // La presentación sale del tipo de las solicitudes del propio expediente:
  // «Solicitud de evaluación de Adenda» no la dice, y de ella dependen 11 o 16
  // días de plazo.
  const solicitudes = docs.filter(d => esSolicitud(d.tipo))
  let presentacion: 'DIA' | 'EIA' | null = null
  for (const s of solicitudes) {
    const pr = presentacionDe(s.tipo)
    if (pr) presentacion = pr
  }

  // En paralelo, que es de donde sale la mayor parte del tiempo: un expediente
  // con 8 solicitudes eran 8 esperas de 5 s en fila. El techo lo pone el
  // semáforo de `bajar`, compartido con los otros expedientes del lote.
  const conDest: SolicitudConDestinatarios[] = await Promise.all(
    solicitudes.map(async (s): Promise<SolicitudConDestinatarios> => {
      if (s.destinatarios == null) {
        return { fila: s, destinatarios: s.destinadoA ? [s.destinadoA] : [] }
      }
      if (s.idDocumento == null) {
        // Varios destinatarios pero sin enlace: no hay dónde leer la lista.
        return { fila: s, destinatarios: [] }
      }
      return {
        fila: s,
        destinatarios: parsearDestinatarios(
          await bajar(`${BASE}/documentos/verDestinatarios.php?id_documento=${s.idDocumento}`),
        ),
      }
    }),
  )

  const urlProyecto = `${BASE}/expediente/expediente.php?id_expediente=${p.expediente}`

  const oficios = pendientesDelExpediente(conDest, docs, presentacion).map(o => ({
    region_cod: p.region_cod,
    proyecto_privado_id: p.id > 0 ? p.id : null,
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

  return { oficios, cerrado }
}

// ── Lo que se escribe de un expediente ───────────────────────────────────────

type Db = ReturnType<typeof getSupabaseAdmin>

type Resultado = {
  escritos: number
  resueltos: number
  fallado: boolean
  errores: string[]
}

// Congelado porque se devuelve POR REFERENCIA al saltear un expediente: sin
// esto, cualquier código futuro que le empujara un error se lo empujaría a
// todos los saltados de la corrida.
const NADA: Resultado = Object.freeze({ escritos: 0, resueltos: 0, fallado: false, errores: [] as string[] })

async function procesarExpediente(p: ProyectoAScrapear, bajar: Bajar, db: Db): Promise<Resultado> {
  let scrapeo: Scrapeo
  try {
    scrapeo = await scrapearExpediente(p, bajar)
  } catch (err) {
    // El expediente que falla se reintenta en la corrida siguiente.
    return { ...NADA, fallado: true, errores: [`${p.expediente}: ${(err as Error).message}`] }
  }

  const vivos = scrapeo.oficios
  const ahora = new Date().toISOString()

  // ── Escribir, comparando contra lo guardado DE ESTE EXPEDIENTE ───────────
  //
  // Explícito y no un upsert: el índice único de la mig 121 va sobre
  // expresiones COALESCE, y PostgREST no puede apuntar su ON CONFLICT a un
  // índice así. Además la identidad real es (expediente, organismo) —
  // `pendientesDelExpediente` devuelve a lo sumo una fila por organismo—, que
  // es más simple de razonar que la llave de columnas.
  const { data: guardados, error: leerErr } = await db
    .from('sesion_oficios_tratados')
    // `fecha_limite` se lee aunque no se escriba: es lo que permite congelar el
    // atraso del que se está cerrando en esta misma pasada (mig 122).
    .select('id, oaeca_sea, oaeca_nombre, estado, id_documento, plazo_estimado, fecha_limite')
    .eq('automatico', true)
    .eq('id_expediente', p.expediente)

  if (leerErr) {
    return { ...NADA, fallado: true, errores: [`${p.expediente}: ${leerErr.message}`] }
  }

  const errores: string[] = []
  let escritos = 0
  let resueltos = 0

  type Guardado = { id: number; estado: string; id_documento: number | null; plazo_estimado: boolean }
  const porOrganismo = new Map<string, Guardado>()
  for (const g of guardados ?? []) {
    const k = claveOrganismo((g.oaeca_sea as string) ?? (g.oaeca_nombre as string))
    // Si el Excel dejó dos filas del mismo organismo, gana la primera y la
    // otra queda para resolverse abajo.
    if (!porOrganismo.has(k)) porOrganismo.set(k, {
      id: g.id as number,
      estado: g.estado as string,
      id_documento: (g.id_documento as number | null) ?? null,
      plazo_estimado: (g.plazo_estimado as boolean) ?? false,
    })
  }

  const nuevas = vivos.filter(v => !porOrganismo.has(claveOrganismo(v.oaeca_sea)))
  if (nuevas.length > 0) {
    const { error } = await db
      .from('sesion_oficios_tratados')
      .insert(nuevas.map(v => ({ ...v, estado: 'pendiente' as const, importado_at: ahora })))
    if (error) return { ...NADA, fallado: true, errores: [`${p.expediente}: ${error.message}`] }
    escritos += nuevas.length
  }

  // Los que ya estaban: se refresca el plazo y se los devuelve a pendiente
  // si el SEIA los volvió a listar (una Adenda reabre el pedido al mismo
  // organismo). No se toca `estado_updated_by_email`: nadie los tocó.
  for (const v of vivos) {
    const g = porOrganismo.get(claveOrganismo(v.oaeca_sea))
    if (!g) continue

    /**
     * Una fecha OFICIAL le gana a una estimada, para el MISMO oficio.
     *
     * El Excel de seia-abierto.cl trae la fecha límite que publica el SEA;
     * esta ruta la calcula y acierta ~80% al día exacto. Pisar la oficial
     * con la estimada en cada corrida perdía precisión sin ganar nada: la
     * primera pasada dejó los 120 oficios de la cartera marcados como
     * estimados, borrando lo que el Excel sabía.
     *
     * Si cambió el documento, en cambio, es OTRO oficio —una Adenda nueva
     * al mismo organismo— y ahí la fecha vieja no dice nada de él.
     */
    const mismoOficio = g.id_documento != null && g.id_documento === v.id_documento
    const conservarPlazo = mismoOficio && !g.plazo_estimado

    const { error } = await db
      .from('sesion_oficios_tratados')
      .update({
        estado: 'pendiente',
        tipo_oficio: v.tipo_oficio,
        fecha_oficio: v.fecha_oficio,
        ...(conservarPlazo ? {} : { fecha_limite: v.fecha_limite, plazo_estimado: true }),
        id_documento: v.id_documento,
        seia_doc_n: v.seia_doc_n,
        url_oficio: v.url_oficio,
        proyecto_privado_id: v.proyecto_privado_id,
        region_cod: v.region_cod,
        importado_at: ahora,
      })
      .eq('id', g.id)
      .eq('automatico', true)
    if (error) errores.push(`${p.expediente}: ${error.message}`)
  }

  // Lo que YA NO está pendiente: estaba guardado y el SEIA ya no lo lista.
  // Es la regla del Excel —el archivo es la lista completa de lo que falta—
  // aplicada a un expediente.
  const clavesVivas = new Set(vivos.map(v => claveOrganismo(v.oaeca_sea)))
  const aResolver = (guardados ?? [])
    .filter(g => g.estado === 'pendiente')
    .filter(g => !clavesVivas.has(claveOrganismo((g.oaeca_sea as string) ?? (g.oaeca_nombre as string))))

  if (aResolver.length > 0) {
    // Sin `resuelto_en_sesion_id` ni email: no lo cerró una persona ni una
    // reunión — el SEIA dejó de listarlo.
    //
    // El MOTIVO sale del expediente, no del oficio: si el proyecto tiene RCA,
    // término anticipado o desistimiento, estos organismos no respondieron —
    // se quedaron sin a quién responderle. Cobrarles ese atraso era el bug que
    // daba 855 días de promedio (mig 122).
    const motivo: MotivoCierre = scrapeo.cerrado ? 'expediente_cerrado' : 'respondio'

    // Agrupado por atraso: cada fila tiene su fecha límite, pero muchas
    // comparten el valor resultante y así son uno o dos UPDATE en vez de N.
    const porAtraso = new Map<number | null, number[]>()
    for (const g of aResolver) {
      const atraso = atrasoAlCerrar(g.fecha_limite as string | null, ahora)
      const ids = porAtraso.get(atraso)
      if (ids) ids.push(g.id as number)
      else porAtraso.set(atraso, [g.id as number])
    }

    for (const [atraso, ids] of porAtraso) {
      const { error } = await db
        .from('sesion_oficios_tratados')
        .update({
          estado: 'resuelto',
          estado_updated_at: ahora,
          importado_at: ahora,
          dias_atraso_al_cerrar: atraso,
          motivo_cierre: motivo,
        })
        .in('id', ids)
        .eq('automatico', true)
      if (!error) resueltos += ids.length
      else if (errores.length < 20) errores.push(`${p.expediente}: ${error.message}`)
    }
  }

  return { escritos, resueltos, fallado: false, errores }
}

// ── Cursor ───────────────────────────────────────────────────────────────────

async function leerCursor(db: Db): Promise<Cursor> {
  const { data } = await db.from('sync_status').select('notes').eq('name', SYNC_NAME).maybeSingle()
  if (!data?.notes) return { idx: 0 }
  try {
    const c = JSON.parse(data.notes as string) as Partial<Cursor>
    if (typeof c.idx === 'number' && c.idx >= 0) return { idx: c.idx }
  } catch { /* cursor ilegible: se empieza de nuevo, que es idempotente */ }
  return { idx: 0 }
}

// ── Candado diario ───────────────────────────────────────────────────────────

/**
 * Los expedientes que ya se consultaron HOY — día chileno, no UTC: a las 21:30
 * de Santiago en Vercel ya es mañana, y el candado se abriría seis horas antes
 * de tiempo (ver lib/fechaChile.ts).
 *
 * No se vuelven a tocar. El SEIA publica documentos en horario de oficina, así
 * que preguntarle dos veces el mismo día casi nunca cambia algo, pero cuesta
 * ~5 s por expediente y obliga a esperar de nuevo. Con esto, apretar «Renovar»
 * dos veces seguidas es instantáneo la segunda.
 *
 * La marca es `importado_at`, que ya se escribe en cada fila que el scraper
 * toca: no hace falta una tabla nueva. Un expediente SIN ninguna fila guardada
 * no aparece acá y se consulta igual, que es lo correcto — puede tener una
 * solicitud nueva y no hay nada que permita afirmar que ya se miró.
 */
async function expedientesVistosHoy(db: Db, soloRegion: string | null): Promise<Set<number>> {
  let q = db
    .from('sesion_oficios_tratados')
    .select('id_expediente')
    .eq('automatico', true)
    .not('id_expediente', 'is', null)
    .gte('importado_at', inicioDelDiaChile().toISOString())
    .limit(20_000)
  if (soloRegion) q = q.eq('region_cod', soloRegion)

  const { data, error } = await q
  if (error) {
    // Sin candado se trabaja más, no mal: se scrapea todo, como antes.
    console.error('[oficios-seia/scrape] no se pudo leer el candado diario:', error.message)
    return new Set()
  }
  return new Set((data ?? []).map(r => r.id_expediente as number))
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  /**
   * Con `?region=<cod>` recorre UNA región; sin él, las 16. La diferencia no
   * es solo de alcance:
   *
   *   · Una región recorre solo sus proyectos priorizados (ver arriba), así
   *     que entra de sobra en el presupuesto de tiempo y NO usa cursor. Tocarlo sería peor que inútil:
   *     pisaría el avance de la corrida nacional del cron, que es lo que
   *     garantiza que ninguna región se quede sin actualizar. Mismo criterio
   *     que /api/seia-sync-v2 con su `?region=`.
   *   · Y la puede apretar quien conduce ESE comité, no solo un admin: es su
   *     región y su cartera.
   *
   * Con `?forzar=1` se ignora el candado diario. Es para cuando alguien sabe
   * algo que el panel no —«el SEREMI dice que respondió hace una hora»— y queda
   * acotado a admin/editor: en una región son 16 s, pero a nivel nacional
   * volver a consultarlo todo son varios minutos de SEIA.
   */
  const params = new URL(request.url).searchParams
  const soloRegion = params.get('region')
  const pidioForzar = params.get('forzar') === '1'

  const bearer = request.headers.get('authorization')
  const esCron = !!process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`
  let puedeForzar = esCron
  if (!esCron) {
    const profile = await requireAuth()
    if (!profile) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    puedeForzar = profile.role === 'admin' || profile.role === 'editor'
    if (soloRegion) {
      if (!(await requireCan(profile, 'comite.economico.operar', soloRegion))) {
        return NextResponse.json(
          { error: 'Sin permiso sobre el Comité Económico de esta región.' },
          { status: 403 },
        )
      }
    } else if (!puedeForzar) {
      return NextResponse.json(
        { error: 'Sin región, el scraping recorre las 16: solo admin o editor.' },
        { status: 403 },
      )
    }
  }
  if (pidioForzar && !puedeForzar) {
    return NextResponse.json(
      { error: 'Volver a consultar lo que ya se consultó hoy es de admin o editor.' },
      { status: 403 },
    )
  }
  const forzar = pidioForzar && puedeForzar

  const db = getSupabaseAdmin()
  const t0 = Date.now()
  const bajar = crearBajar(crearLimitador(MAX_EN_VUELO))

  // ── La cartera, que define qué expedientes se miran ──────────────────────
  const { data: carteraRows, error: carteraErr } = await db
    .from('comite_economico_proyecto')
    .select('id, region_cod, nombre, priorizado, origen_sistema, origen_id, seia_expediente_id')
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

  // Por región, solo los priorizados: es el refresco rápido de lo que el
  // comité empuja. La nacional se lleva la cartera entera.
  const deCartera: ProyectoAScrapear[] = (carteraRows ?? [])
    .filter(r => !soloRegion || (r.region_cod === soloRegion && r.priorizado === true))
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

  // ── Los que ya están guardados, aunque no sean de la cartera ─────────────
  //
  // Se identifican por su expediente y NO tienen proyecto: `id` va en negativo
  // para que no colisione con un id de cartera en el orden, y
  // `proyecto_privado_id` queda nulo — lo que escriban sigue sin proyecto,
  // que es lo correcto: nadie los sumó. Solo en la nacional: la corrida por
  // región es solo de priorizados.
  const q = db
    .from('sesion_oficios_tratados')
    .select('id_expediente, region_cod, nombre_proyecto')
    .eq('automatico', true)
    .eq('estado', 'pendiente')
    .is('proyecto_privado_id', null)
    .not('id_expediente', 'is', null)
    .limit(5000)
  const { data: huerfanosRows } = soloRegion ? { data: [] } : await q

  const yaEnCartera = new Set(deCartera.map(p => p.expediente))

  // ── Todo lo que está en calificación en el SEIA (solo la nacional) ──────
  //
  // Sale del catálogo (`v2_proyectos_inversion`, que el sync del SEIA renueva
  // los lunes), con la región que le asigna el SEIA. Como los sueltos, va sin
  // proyecto: lo que escriba queda con `proyecto_privado_id` nulo hasta que
  // alguien lo sume a la cartera, y ahí la revinculación lo engancha.
  const enCalificacion = new Map<number, ProyectoAScrapear>()
  if (!soloRegion) {
    const { data: catalogo, error: catErr } = await db
      .from('v2_proyectos_inversion')
      .select('id, region_id, nombre')
      .eq('sistema_origen', 'seia')
      .eq('estado', 'En Calificación')
      .limit(5000)
    // Sin catálogo se trabaja con menos, no mal: cartera y sueltos igual van.
    if (catErr) console.error('[oficios-seia/scrape] no se pudo leer el catálogo:', catErr.message)
    for (const r of catalogo ?? []) {
      const exp = Number(String(r.id).replace(/^seia_/, ''))
      const region = r.region_id != null ? INE_INVERSE[r.region_id as number] : undefined
      if (!Number.isFinite(exp) || !region || region === 'NAC' || yaEnCartera.has(exp)) continue
      enCalificacion.set(exp, {
        id: -exp,
        region_cod: region,
        nombre: (r.nombre as string) ?? 'Proyecto sin nombre',
        expediente: exp,
      })
    }
  }

  const sueltos = new Map<number, ProyectoAScrapear>()
  for (const r of huerfanosRows ?? []) {
    const exp = r.id_expediente as number
    if (yaEnCartera.has(exp) || enCalificacion.has(exp) || sueltos.has(exp)) continue
    sueltos.set(exp, {
      id: -exp,
      region_cod: r.region_cod as string,
      nombre: (r.nombre_proyecto as string) ?? 'Proyecto sin nombre',
      expediente: exp,
    })
  }

  // Orden estable: el cursor es un índice, y si la lista se reordenara entre
  // invocaciones saltearía expedientes sin avisar. La cartera va primero —es
  // lo que el comité mira— para que un corte por tiempo deje afuera lo de
  // afuera, no lo propio.
  const proyectos: ProyectoAScrapear[] = [
    ...deCartera.sort((a, b) => a.id - b.id),
    ...[...enCalificacion.values()].sort((a, b) => a.expediente - b.expediente),
    ...[...sueltos.values()].sort((a, b) => a.expediente - b.expediente),
  ]

  if (proyectos.length === 0) {
    await recordSyncStatus(SYNC_NAME, {
      status: 'ok', durationMs: Date.now() - t0, rows: 0, notes: '',
    })
    return NextResponse.json({
      ok: true,
      partial: false,
      proyectos: 0,
      mensaje: soloRegion
        ? 'Esta región no tiene proyectos priorizados con expediente del SEIA.'
        : 'No hay proyectos en calificación ni en la cartera con expediente del SEIA.',
    })
  }

  const vistosHoy = forzar ? new Set<number>() : await expedientesVistosHoy(db, soloRegion)

  // Sin región se retoma el cursor nacional; con región se empieza de cero y
  // no se escribe ninguno.
  const cursor = soloRegion ? { idx: 0 } : await leerCursor(db)
  const desde = cursor.idx < proyectos.length ? cursor.idx : 0

  let i = desde
  let escritos = 0
  let resueltos = 0
  let fallados = 0
  let saltados = 0
  const errores: string[] = []

  // De a lotes y no de a uno: dentro del lote los expedientes van en paralelo,
  // y el cursor solo avanza cuando el lote entero terminó — así un corte por
  // tiempo nunca deja medio lote sin registrar.
  for (let base = desde; base < proyectos.length; base += LOTE) {
    if (Date.now() - t0 > PRESUPUESTO_MS) break
    const lote = proyectos.slice(base, base + LOTE)

    const resultados = await Promise.all(lote.map(p => {
      if (vistosHoy.has(p.expediente)) {
        saltados++
        return Promise.resolve(NADA)
      }
      return procesarExpediente(p, bajar, db)
    }))

    for (const r of resultados) {
      escritos += r.escritos
      resueltos += r.resueltos
      if (r.fallado) fallados++
      for (const e of r.errores) if (errores.length < 20) errores.push(e)
    }

    i = base + lote.length
  }

  const termino = i >= proyectos.length

  // ── Revincular, en la misma pasada ────────────────────────────────────────
  //
  // Lo que el scraper escribe ya viene con su proyecto —recorre la cartera, así
  // que sabe de quién es cada oficio—. Esto es para los que trajo el Excel y
  // quedaron sueltos: si el proyecto entró a la cartera después, acá se pegan.
  //
  // Va acá y no en un botón aparte porque quien aprieta «Actualizar oficios»
  // quiere verlos donde corresponde, no ejecutar dos pasos que solo tienen
  // sentido juntos.
  let vinculados = 0
  if (termino || soloRegion) {
    try {
      let q = db
        .from('sesion_oficios_tratados')
        .select('id, id_expediente, region_cod')
        .eq('automatico', true)
        .is('proyecto_privado_id', null)
        .not('id_expediente', 'is', null)
        .limit(5000)
      if (soloRegion) q = q.eq('region_cod', soloRegion)

      const { data: huerfanos } = await q
      const plan = planificarVinculacion(
        (huerfanos ?? []) as OficioSinProyecto[],
        (carteraRows ?? []) as ProyectoCartera[],
      )
      // Agrupado por destino: un oficio va hasta a 22 organismos, así que un
      // solo proyecto arrastra decenas de filas con el MISMO update.
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
          .is('proyecto_privado_id', null)
        if (!error) vinculados += ids.length
      }
    } catch (err) {
      // No invalida el scraping, que ya está escrito.
      console.error('[oficios-seia/scrape] revinculación falló:', err)
    }
  }

  // ── Foto de respaldo, si una región lleva 20 días sin ninguna ─────────────
  //
  // La foto buena la saca el cierre de la sesión (mig 122). Esto es la red: si
  // la región no sesionó —se postergó la reunión, vacaciones— la serie quedaría
  // con un hueco y a los dos meses no habría qué comparar.
  //
  // Solo al terminar una corrida nacional: recién ahí los pendientes están al
  // día en todas las regiones, y retratar datos a medio actualizar sería
  // guardar un número falso para siempre. La corrida por región no saca foto
  // —cualquiera puede apretar «Renovar» diez veces y eso no es un hito.
  let fotos = 0
  if (termino && !soloRegion) {
    try {
      for (const cod of await regionesQueNecesitanRespaldo(db)) {
        const f = await tomarFotoOficios(db, cod, { origen: 'respaldo' })
        if (f.ok) fotos++
        else console.error(`[oficios-seia/scrape] foto de respaldo ${cod}:`, f.error)
      }
    } catch (err) {
      // No invalida el scraping, que ya está escrito.
      console.error('[oficios-seia/scrape] fotos de respaldo fallaron:', err)
    }
  }

  // Cadena vacía y no null: es lo que `leerCursor` entiende como «empezar de
  // cero», y es como el sync del catálogo limpia el suyo.
  // La corrida por región NO toca el cursor nacional: si lo hiciera, apretar
  // el botón de una región borraría el avance del cron y las demás quedarían
  // sin actualizar sin que nadie se entere.
  if (!soloRegion) {
    await recordSyncStatus(SYNC_NAME, {
      status:     !termino || fallados > 0 ? 'partial' : 'ok',
      durationMs: Date.now() - t0,
      rows:       escritos,
      errors:     errores.length > 0 ? errores : undefined,
      notes:      termino ? '' : JSON.stringify({ idx: i } satisfies Cursor),
    })
  }

  console.log(
    `[oficios-seia/scrape] ${desde}→${i} de ${proyectos.length} · ` +
    `${escritos} pendientes · ${resueltos} resueltos · ` +
    `${saltados} ya vistos hoy · ${fallados} fallados · ${Date.now() - t0} ms`,
  )

  return NextResponse.json({
    ok: true,
    region: soloRegion,
    vinculados,
    partial: !termino,
    next_cursor: termino ? null : { idx: i },
    proyectos: proyectos.length,
    procesados: i - desde,
    // Cuántos de los procesados no se consultaron porque ya se habían
    // consultado hoy. Igual a `procesados` = no se tocó el SEIA.
    saltados,
    // Fotos de respaldo sacadas en esta corrida (mig 122).
    fotos,
    desde,
    hasta: i,
    pendientes_escritos: escritos,
    resueltos,
    fallados,
    errores,
  })
}
