import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionIniciativa } from '@/lib/types'
import { panoramaPorEje, clasificarCompromisosGabinete, COMITES_CON_ESCALAMIENTO } from './helpers'
import { verificadosOr, type ActaOpts } from './generarActa'
import { resolvePreside } from './preside'
import ActaGabinetePdf, { type ActaGabineteData } from '@/components/ActaGabinetePdf'

/**
 * Renderiza el acta de una sesión de GABINETE a un buffer (spec gabinete §7.4).
 * Lo invoca renderActaBuffer() (el entry point único despacha por instancia). La
 * SUBIDA la hace generarActa (cierre). NUNCA toca métricas ni compromisos.
 *
 * En `opts.preview` (sesión aún abierta) lee el estado BORRADOR: los "temas a
 * tratar" desde el pool pendiente (aún sin sesion_id), los semáforos EN VIVO de
 * las iniciativas (el snapshot recién se escribe al cerrar), el N° que le tocará
 * y quien previsualiza como preside/generado-por. El PDF se marca "BORRADOR".
 */

export async function renderActaGabineteBuffer(db: SupabaseClient, sesion: EjeSesion, opts: ActaOpts): Promise<Buffer> {
  const sesionId = sesion.id

  const [numRes, asisRes, iniRes, prioRegionRes, apunRes, gabSesRes, nuevosRes, ejesRes, temasRes, preside] = await Promise.all([
    // N° de sesión = cerradas de gabinete de la región (correlativo propio,
    // independiente de los comités).
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'gabinete').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    // Iniciativas tratadas. En preview no hay snapshot todavía → traemos también
    // el semáforo/avance EN VIVO de la iniciativa para mostrar lo que capturará
    // el cierre.
    db.from('sesion_iniciativas')
      .select('*, prioridad:prioridades_territoriales(nombre, estado_semaforo, pct_avance)')
      .eq('sesion_id', sesionId)
      .order('created_at'),
    // Panorama por eje: TODAS las iniciativas de la región al cierre.
    db.from('prioridades_territoriales')
      .select('eje, estado_semaforo, pct_avance')
      .eq('cod', sesion.region_cod),
    db.from('sesion_apuntes').select('institucion, texto').eq('sesion_id', sesionId).order('institucion'),
    db.from('eje_sesiones').select('id')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'gabinete'),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    db.from('region_ejes').select('id, numero, sesiones_nombre').eq('region_cod', sesion.region_cod),
    // "Temas a tratar" archivados a esta sesión por el cierre (mig 053/054) — el
    // stamping corre ANTES de generarActa, así que en el cierre ya tienen
    // sesion_id. En preview aún NO están estampados → los leemos del pool
    // pendiente de la región (sesion_id nulo), que es lo que el cierre archivará.
    opts.preview
      ? db.from('gabinete_temas').select('texto, subitems').eq('region_cod', sesion.region_cod).is('sesion_id', null).order('orden').order('id')
      : db.from('gabinete_temas').select('texto, subitems').eq('sesion_id', sesionId).order('orden').order('id'),
    resolvePreside(db, sesion, opts),
  ])

  // Verificados (zona 1 de la sesión): propios + escalados + mandatos —
  // cumplidos en esta sesión o aún abiertos.
  const VERIF = verificadosOr(sesionId, opts.preview)
  const gabIds = ((gabSesRes.data ?? []) as { id: number }[]).map(r => r.id).filter(id => id !== sesionId)
  const [propiosRes, escaladosRes, mandatosRes] = await Promise.all([
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'gabinete')
      .neq('sesion_origen_id', sesionId)
      .or(VERIF),
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).in('instancia', COMITES_CON_ESCALAMIENTO)
      .eq('escalado_a_gabinete', true)
      .neq('sesion_origen_id', sesionId)
      .or(VERIF),
    gabIds.length
      ? db.from('sesion_compromisos').select('*')
          .eq('region_cod', sesion.region_cod).eq('instancia', 'eje')
          .in('sesion_origen_id', gabIds)
          .or(VERIF)
      : Promise.resolve({ data: [] as SesionCompromiso[] }),
  ])

  const verificados = clasificarCompromisosGabinete(
    (propiosRes.data ?? []) as SesionCompromiso[],
    (escaladosRes.data ?? []) as SesionCompromiso[],
    (mandatosRes.data ?? []) as SesionCompromiso[],
  )

  // Nombre de la instancia + del comité de cada eje. Infraestructura no
  // cuelga de region_ejes (sin eje_id) — su nombre se resuelve por separado.
  const { data: cfg } = await db
    .from('region_config').select('gabinete_nombre, infraestructura_nombre')
    .eq('region_cod', sesion.region_cod).maybeSingle()
  const ejesPorId = new Map(
    ((ejesRes.data ?? []) as { id: number; numero: number; sesiones_nombre: string | null }[])
      .map(e => [e.id, e.sesiones_nombre ?? `Eje ${e.numero}`]),
  )
  const infraestructuraNombre = (cfg?.infraestructura_nombre as string | undefined) ?? 'Comité de Infraestructura'
  const comiteOrigenNombre = (c: SesionCompromiso): string | null =>
    c.instancia === 'infraestructura' ? infraestructuraNombre : (c.eje_id != null ? ejesPorId.get(c.eje_id) ?? null : null)

  // Nombre de las iniciativas vinculadas en compromisos nuevos
  const nuevos = (nuevosRes.data ?? []) as SesionCompromiso[]
  const vinculadasIds = nuevos.map(c => c.prioridad_id).filter((x): x is number => x != null)
  let nombresVinculadas = new Map<number, string>()
  if (vinculadasIds.length) {
    const { data: vn } = await db
      .from('prioridades_territoriales').select('id, nombre').in('id', vinculadasIds)
    nombresVinculadas = new Map(((vn ?? []) as { id: number; nombre: string }[]).map(p => [p.id, p.nombre]))
  }

  // N° correlativo: posición por fecha (id desempate) entre cerradas gabinete.
  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  const regionNombre = REGIONS.find(r => r.cod === sesion.region_cod)?.nombre ?? sesion.region_cod

  type AsisRow = {
    presente: boolean
    invitado_nombre: string | null
    invitado_institucion: string | null
    nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
  }
  type IniRow = SesionIniciativa & { prioridad: { nombre: string; estado_semaforo?: string | null; pct_avance?: number | null } | null }

  const data: ActaGabineteData = {
    nombreInstancia: (cfg?.gabinete_nombre as string | undefined) ?? 'Gabinete Regional',
    regionNombre,
    sesionNumero,
    fecha: sesion.fecha,
    lugar: sesion.lugar,
    preside,
    asistencia: ((asisRes.data ?? []) as unknown as AsisRow[]).map(a => ({
      nombre:      a.nomina?.nombre ?? a.invitado_nombre ?? '—',
      cargo:       a.nomina?.cargo ?? null,
      institucion: a.nomina?.institucion ?? a.invitado_institucion ?? '—',
      calidad:     a.nomina ? a.nomina.calidad : 'invitado',
      presente:    a.presente,
    })),
    temas: ((temasRes.data ?? []) as { texto: string; subitems: unknown }[])
      .filter(t => t.texto.trim().length > 0)
      .map(t => ({
        texto: t.texto,
        subitems: (Array.isArray(t.subitems) ? t.subitems as string[] : []).filter(s => s.trim().length > 0),
      })),
    panoramaEjes: panoramaPorEje(
      (prioRegionRes.data ?? []) as { eje: string | null; estado_semaforo: string | null; pct_avance: number | null }[],
    ),
    iniciativas: ((iniRes.data ?? []) as unknown as IniRow[]).map(ini => ({
      nombre:    ini.prioridad?.nombre ?? `Iniciativa #${ini.prioridad_id}`,
      semaforo:  opts.preview ? (ini.prioridad?.estado_semaforo ?? null) : ini.semaforo_al_momento,
      pctAvance: opts.preview
        ? (ini.prioridad?.pct_avance != null ? Number(ini.prioridad.pct_avance) : null)
        : (ini.pct_avance_al_momento != null ? Number(ini.pct_avance_al_momento) : null),
      acuerdo:   ini.acuerdo,
    })),
    apuntes: ((apunRes.data ?? []) as { institucion: string; texto: string }[])
      .filter(a => a.texto.trim().length > 0),
    compVerificados: verificados.map(c => ({
      descripcion:  c.descripcion,
      institucion:  c.responsable_institucion,
      nombre:       c.responsable_nombre,
      plazo:        c.plazo,
      estado:       c.estado,
      origen:       c.origenTipo,
      comiteNombre: comiteOrigenNombre(c),
    })),
    compNuevos: nuevos.map(c => ({
      descripcion:      c.descripcion,
      institucion:      c.responsable_institucion,
      nombre:           c.responsable_nombre,
      plazo:            c.plazo,
      mandatoComite:    c.instancia === 'eje' && c.eje_id != null ? ejesPorId.get(c.eje_id) ?? 'Comité' : null,
      iniciativaNombre: c.prioridad_id != null ? nombresVinculadas.get(c.prioridad_id) ?? null : null,
    })),
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }

  // ── Render (la subida la hace generarActa) ─────────────────────────────────
  registerPdfFonts()
  const dataConBranding: ActaGabineteData = {
    ...data,
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
  }
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que generarActa.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(ActaGabinetePdf as any, { data: dataConBranding }) as any)
}
