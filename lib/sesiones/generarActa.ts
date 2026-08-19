import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionOficioTratado, ComiteMetrica, SesionComiteValor } from '@/lib/types'
import ActaComitePdf, { type ActaData } from '@/components/ActaComitePdf'
import { renderActaGabineteBuffer } from './generarActaGabinete'
import { renderActaInfraestructuraBuffer } from './generarActaInfraestructura'
import { agruparPorInstitucion, formatoValorComite, MESA_EMPLEO_HABILITADA } from './helpers'
import { subirActa } from './actaUpload'

/**
 * Genera el acta PDF de una sesión CERRADA y la sube al bucket privado
 * comite-docs. Compartido por POST /api/sesiones/[id]/cerrar (paso final)
 * y POST /api/sesiones/[id]/acta (reintento cuando el PDF falló al cerrar).
 * ÚNICO entry point: despacha por instancia (comité acá mismo; gabinete en
 * generarActaGabinete) — el contrato de /cerrar y /acta no cambia.
 *
 * NUNCA toca métricas ni compromisos — solo lee, renderiza y sube.
 * Path vía actaStoragePath(): el primer segmento DEBE ser la región exacta
 * (las policies de storage.objects filtran por foldername[1]). upsert:true
 * para que el reintento no falle si el upload original quedó huérfano
 * (subió pero no alcanzó a guardar acta_path).
 */

/**
 * Opciones de generación del acta. En `preview` se lee el estado BORRADOR (la
 * sesión aún abierta, sin los efectos del cierre) y el PDF se marca como vista
 * previa; `currentUserEmail` es quien previsualiza (para «preside»/«generado por»).
 */
export type ActaOpts = { preview: boolean; currentUserEmail?: string | null }

const OPTS_CIERRE: ActaOpts = { preview: false }

/**
 * Cláusula `.or()` de los compromisos "verificados". En preview incluye además
 * los marcados "cumplido" aún SIN sellar — los que ESTE cierre sellará — para que
 * la vista previa muestre lo mismo que quedará en el acta al cerrar.
 */
export function verificadosOr(sesionId: number, preview: boolean): string {
  return preview
    ? `cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso),and(estado.eq.cumplido,cerrado_en_sesion_id.is.null)`
    : `cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso)`
}

/**
 * Renderiza el PDF del acta a un buffer SIN subirlo. Despacha por instancia.
 * Compartido por `generarActa` (cierre → sube) y la vista previa (devuelve el
 * PDF inline). NUNCA toca métricas/compromisos — solo lee, renderiza.
 */
export async function renderActaBuffer(db: Db, sesion: EjeSesion, opts: ActaOpts): Promise<Buffer> {
  if (sesion.instancia === 'gabinete') return renderActaGabineteBuffer(db, sesion, opts)
  if (sesion.instancia === 'infraestructura') return renderActaInfraestructuraBuffer(db, sesion, opts)

  const regionNombre = REGIONS.find(r => r.cod === sesion.region_cod)?.nombre ?? sesion.region_cod
  const data: ActaData =
    sesion.instancia === 'inversion' ? await armarActaInversion(db, sesion, sesion.id, regionNombre, opts)
    : sesion.instancia === 'politico' ? await armarActaPolitico(db, sesion, sesion.id, regionNombre, opts)
    : await armarActaPolicial(db, sesion, sesion.id, regionNombre, opts)

  registerPdfFonts()
  const dataConBranding: ActaData = {
    ...data,
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
  }
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que minuta/route.ts y renderPdf.tsx).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(ActaComitePdf as any, { data: dataConBranding }) as any)
}

/**
 * Genera el acta PDF de una sesión CERRADA y la sube al bucket comite-docs.
 * Compartido por POST /cerrar (paso final) y POST /acta (reintento). El entry
 * point único despacha por instancia dentro de `renderActaBuffer`.
 */
export async function generarActa(sesionId: number): Promise<string> {
  const db = getSupabaseAdmin()
  const { data: sesionRow, error: sesErr } = await db
    .from('eje_sesiones').select('*').eq('id', sesionId).single()
  if (sesErr || !sesionRow) throw new Error(`Sesión ${sesionId} no encontrada`)
  const sesion = sesionRow as EjeSesion

  const buffer = await renderActaBuffer(db, sesion, OPTS_CIERRE)
  return subirActa(db, sesion, buffer)
}

type AsisRow = {
  presente: boolean
  invitado_nombre: string | null
  invitado_institucion: string | null
  nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
}

type Db = ReturnType<typeof getSupabaseAdmin>

/** Comité Policial — reporte por institución (mig 048). */
async function armarActaPolicial(db: Db, sesion: EjeSesion, sesionId: number, regionNombre: string, opts: ActaOpts): Promise<ActaData> {
  const [ejeRes, numRes, asisRes, valRes, catRes, verifRes, nuevosRes] = await Promise.all([
    db.from('region_ejes').select('sesiones_nombre').eq('id', sesion.eje_id).single(),
    // N° de sesión = cerradas anteriores del (región, eje) hasta esta fecha/id
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('eje_id', sesion.eje_id).eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    // Reporte por institución (mig 048): valores de la sesión + catálogo.
    db.from('sesion_comite_valor').select('*').eq('sesion_id', sesionId),
    db.from('comite_metrica').select('*').eq('region_cod', sesion.region_cod),
    // Verificados: compromisos de sesiones anteriores — cumplidos en esta
    // sesión o aún abiertos (se reporta su estado resultante)
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('eje_id', sesion.eje_id)
      .neq('sesion_origen_id', sesionId)
      .or(verificadosOr(sesionId, opts.preview)),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
  ])

  const catalogo = (catRes.data ?? []) as ComiteMetrica[]
  const valores  = ((valRes.data ?? []) as SesionComiteValor[])
    .map(v => ({ ...v, desglose: Array.isArray(v.desglose) ? v.desglose : [] }))

  // N° correlativo: posición por fecha (y id como desempate) entre cerradas.
  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  return {
    variante: 'policial',
    nombreInstancia: (ejeRes.data?.sesiones_nombre as string | null) ?? 'Comité',
    regionNombre,
    sesionNumero,
    fecha: sesion.fecha,
    lugar: sesion.lugar,
    preside: opts.preview ? (opts.currentUserEmail ?? sesion.created_by_email) : (sesion.closed_by_email ?? sesion.created_by_email),
    asistencia: ((asisRes.data ?? []) as unknown as AsisRow[]).map(a => ({
      nombre:      a.nomina?.nombre ?? a.invitado_nombre ?? '—',
      cargo:       a.nomina?.cargo ?? null,
      institucion: a.nomina?.institucion ?? a.invitado_institucion ?? '—',
      calidad:     a.nomina ? a.nomina.calidad : 'invitado',
      presente:    a.presente,
    })),
    // Reporte por institución: solo instituciones con datos; en cada fila el
    // valor viene pre-formateado y el desglose sin sub-valores vacíos.
    instituciones: agruparPorInstitucion(catalogo, valores, true)
      .filter(g => g.filas.length > 0)
      .map(g => ({
        label: g.label,
        filas: g.filas.map(f => ({
          nombre:        f.metrica.nombre,
          unidad:        f.metrica.unidad,
          tipo:          f.metrica.tipo,
          valor:         formatoValorComite(f.valor, f.metrica),
          observaciones: f.valor?.observaciones ?? null,
          desglose:      (f.valor?.desglose ?? []).filter(d => d.etiqueta.trim() || d.valor.trim()),
        })),
      })),
    metaEmpleo: null,
    subsidios: null,
    proyectosTratados: [],
    oficiosTratados: [],
    temas: [],
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
      seccion:     null,
    })),
    compNuevos: ((nuevosRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      seccion:     null,
    })),
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }
}

/**
 * Comité Económico — sin eje (mig 049): nombre fijo, sin
 * indicadores/apuntes; en su lugar, proyectos tratados y oficios tratados.
 */
async function armarActaInversion(db: Db, sesion: EjeSesion, sesionId: number, regionNombre: string, opts: ActaOpts): Promise<ActaData> {
  const [
    numRes, asisRes, proyRes, verifRes, nuevosRes, oficVerifRes, oficNuevosRes,
    metaRegionRes, subRegionRes,
  ] = await Promise.all([
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'inversion').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    db.from('sesion_proyectos')
      .select('nota, proyecto:v2_proyectos_inversion(nombre)')
      .eq('sesion_id', sesionId),
    // Verificados: compromisos de sesiones anteriores — cumplidos en esta
    // sesión o aún abiertos (mismo criterio que el Comité Policial).
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'inversion')
      .neq('sesion_origen_id', sesionId)
      .or(verificadosOr(sesionId, opts.preview)),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    // Oficios: verificados (resueltos en esta sesión o aún pendientes) +
    // nuevos (marcados "tratado" durante esta sesión) — mismo criterio.
    db.from('sesion_oficios_tratados').select('*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)')
      .eq('region_cod', sesion.region_cod)
      .neq('sesion_origen_id', sesionId)
      .or(opts.preview
        ? `resuelto_en_sesion_id.eq.${sesionId},estado.eq.pendiente,and(estado.eq.resuelto,resuelto_en_sesion_id.is.null)`
        : `resuelto_en_sesion_id.eq.${sesionId},estado.eq.pendiente`),
    db.from('sesion_oficios_tratados').select('*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)')
      .eq('sesion_origen_id', sesionId).order('created_at'),
    // Mesa Empleo (mig 052): el cierre ya sumó el valor de esta sesión al
    // acumulado ANTES de generar el acta — igual que valor_actual en el
    // Comité Policial, acá se lee post-cierre.
    db.from('region_meta_empleo').select('objetivo, valor_actual, foco_productivo').eq('region_cod', sesion.region_cod).maybeSingle(),
    // Subsidios (mig 055): mismo criterio — se lee post-cierre.
    db.from('region_subsidio_empleo').select('cupos, postulados, entregados, empresas_postulantes')
      .eq('region_cod', sesion.region_cod).maybeSingle(),
  ])

  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  type OficioConNombres = SesionOficioTratado & { oaeca: { nombre: string } | null; proyecto: { nombre: string } | null }
  const oficios = [
    ...((oficVerifRes.data ?? []) as unknown as OficioConNombres[]),
    ...((oficNuevosRes.data ?? []) as unknown as OficioConNombres[]),
  ]

  // Mesa Empleo aún no está confirmada (ver MESA_EMPLEO_HABILITADA) — la
  // sección no se muestra en el acta mientras esté escondida en la sesión.
  const metaRegion = metaRegionRes.data as { objetivo: number; valor_actual: number; foco_productivo: string | null } | null
  const metaEmpleo = (MESA_EMPLEO_HABILITADA && metaRegion) ? {
    acumulado:       Number(metaRegion.valor_actual),
    objetivo:        Number(metaRegion.objetivo),
    pctAvance:       metaRegion.objetivo > 0 ? Math.round((Number(metaRegion.valor_actual) / Number(metaRegion.objetivo)) * 100) : null,
    focoProductivo:  metaRegion.foco_productivo,
  } : null

  const subRegion = subRegionRes.data as { cupos: number; postulados: number; entregados: number; empresas_postulantes: number } | null
  const subsidios = (MESA_EMPLEO_HABILITADA && subRegion) ? {
    postulados:           Number(subRegion.postulados),
    entregados:           Number(subRegion.entregados),
    empresasPostulantes:  Number(subRegion.empresas_postulantes),
    cupos:                Number(subRegion.cupos),
    pctAvance:            subRegion.cupos > 0 ? Math.round((Number(subRegion.postulados) / Number(subRegion.cupos)) * 100) : null,
  } : null

  return {
    variante: 'inversion',
    nombreInstancia: 'Comité Económico',
    regionNombre,
    sesionNumero,
    fecha: sesion.fecha,
    lugar: sesion.lugar,
    preside: opts.preview ? (opts.currentUserEmail ?? sesion.created_by_email) : (sesion.closed_by_email ?? sesion.created_by_email),
    asistencia: ((asisRes.data ?? []) as unknown as AsisRow[]).map(a => ({
      nombre:      a.nomina?.nombre ?? a.invitado_nombre ?? '—',
      cargo:       a.nomina?.cargo ?? null,
      institucion: a.nomina?.institucion ?? a.invitado_institucion ?? '—',
      calidad:     a.nomina ? a.nomina.calidad : 'invitado',
      presente:    a.presente,
    })),
    instituciones: [],
    metaEmpleo,
    subsidios,
    proyectosTratados: ((proyRes.data ?? []) as unknown as { nota: string | null; proyecto: { nombre: string } | null }[])
      .map(p => ({ nombre: p.proyecto?.nombre ?? '—', nota: p.nota })),
    oficiosTratados: oficios.map(o => ({
      nombreProyecto: o.proyecto?.nombre ?? '—',
      oaeca:          o.oaeca?.nombre ?? '—',
      fechaLimite:    o.fecha_limite,
      estado:         o.estado,
    })),
    temas: [],
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
      seccion:     c.seccion,
    })),
    compNuevos: ((nuevosRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      seccion:     c.seccion,
    })),
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }
}

/**
 * Comité Político — sin eje (mig 059): asistencia ad-hoc + temas conversados
 * (lista con subpuntos) + compromisos. Sin indicadores/proyectos/oficios.
 */
async function armarActaPolitico(db: Db, sesion: EjeSesion, sesionId: number, regionNombre: string, opts: ActaOpts): Promise<ActaData> {
  const [numRes, asisRes, temasRes, verifRes, nuevosRes] = await Promise.all([
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'politico').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    db.from('sesion_temas').select('texto, subitems').eq('sesion_id', sesionId).order('orden').order('id'),
    // Verificados: compromisos gestionados en Político de sesiones anteriores,
    // cumplidos en esta sesión o aún abiertos (mismo criterio que los demás).
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'politico')
      .neq('sesion_origen_id', sesionId)
      .or(verificadosOr(sesionId, opts.preview)),
    // Nuevos: TODO lo originado en esta sesión, incluida la delegación a otras
    // instancias (sin filtro de instancia — igual que inversion).
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
  ])

  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  return {
    variante: 'politico',
    nombreInstancia: 'Comité Político',
    regionNombre,
    sesionNumero,
    fecha: sesion.fecha,
    lugar: sesion.lugar,
    preside: opts.preview ? (opts.currentUserEmail ?? sesion.created_by_email) : (sesion.closed_by_email ?? sesion.created_by_email),
    asistencia: ((asisRes.data ?? []) as unknown as AsisRow[]).map(a => ({
      nombre:      a.nomina?.nombre ?? a.invitado_nombre ?? '—',
      cargo:       a.nomina?.cargo ?? null,
      institucion: a.nomina?.institucion ?? a.invitado_institucion ?? '—',
      calidad:     a.nomina ? a.nomina.calidad : 'invitado',
      presente:    a.presente,
    })),
    instituciones: [],
    metaEmpleo: null,
    subsidios: null,
    proyectosTratados: [],
    oficiosTratados: [],
    temas: ((temasRes.data ?? []) as { texto: string; subitems: unknown }[]).map(t => ({
      texto:    t.texto,
      subitems: Array.isArray(t.subitems) ? t.subitems as string[] : [],
    })),
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
      seccion:     null,
    })),
    compNuevos: ((nuevosRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      seccion:     null,
    })),
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }
}
