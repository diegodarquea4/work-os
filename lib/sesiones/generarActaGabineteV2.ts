import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import { normalizeCarteraGabinete, compareCarteras } from '@/lib/cartera'
import type { EjeSesion, GabineteTema, SesionCompromiso } from '@/lib/types'
import { panoramaPorEje, clasificarCompromisosGabinete, COMITES_CON_ESCALAMIENTO } from './helpers'
import { verificadosOr, type ActaOpts } from './generarActa'
import { resolvePreside } from './preside'
import ActaGabineteV2Pdf, { type ActaGabineteV2Data } from '@/components/ActaGabineteV2Pdf'

/**
 * Renderiza el acta del GABINETE v2 (formato_acta=2) a un buffer. Se ARMA desde
 * la pauta: la sección "Desarrollo de la sesión" recorre los puntos
 * (gabinete_temas de la sesión) en orden y anida bajo cada uno su relato +
 * intervenciones por cartera (sesion_intervenciones) + iniciativas del PREGO
 * (gabinete_tema_iniciativas) + compromisos que nacieron del punto
 * (sesion_compromisos.tema_id). Verificación de compromisos anteriores y
 * panorama por eje se conservan del v1.
 *
 * Despachado por renderActaBuffer cuando sesion.formato_acta === 2. En preview
 * lee el estado BORRADOR (semáforos en vivo, N° proyectado). Service-role.
 *
 * NOTA: las iniciativas vinculadas se leen EN VIVO de prioridades (no hay
 * snapshot por punto en v2, a diferencia de sesion_iniciativas del v1). Para el
 * acta oficial eso refleja el semáforo al momento de generar — suficiente en
 * esta etapa; un snapshot por punto se puede sumar después.
 */

export async function renderActaGabineteV2Buffer(db: SupabaseClient, sesion: EjeSesion, opts: ActaOpts): Promise<Buffer> {
  const sesionId = sesion.id
  const region_cod = sesion.region_cod

  const [numRes, asisRes, temasRes, intervRes, vocRes, prioRegionRes, nuevosRes, ejesRes, cfgRes, preside] = await Promise.all([
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', region_cod).eq('instancia', 'gabinete').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    db.from('gabinete_temas').select('*').eq('sesion_id', sesionId).order('orden').order('id'),
    db.from('sesion_intervenciones').select('tema_id, institucion, texto, orden').eq('sesion_id', sesionId).order('orden').order('id'),
    db.from('sesion_vocerias').select('dia, vocero, tema_texto, orden').eq('sesion_id', sesionId).order('orden').order('id'),
    db.from('prioridades_territoriales').select('eje, estado_semaforo, pct_avance').eq('cod', region_cod),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    db.from('region_ejes').select('id, numero, sesiones_nombre').eq('region_cod', region_cod),
    db.from('region_config').select('gabinete_nombre, infraestructura_nombre').eq('region_cod', region_cod).maybeSingle(),
    resolvePreside(db, sesion, opts),
  ])

  const temas = (temasRes.data ?? []) as GabineteTema[]
  const temaIds = temas.map(t => t.id)

  // Carteras + iniciativas (en vivo) por tema.
  const [cartRes, iniRes] = temaIds.length
    ? await Promise.all([
        db.from('gabinete_tema_carteras').select('tema_id, institucion, orden').in('tema_id', temaIds),
        db.from('gabinete_tema_iniciativas')
          .select('tema_id, prioridad:prioridades_territoriales(nombre, estado_semaforo, pct_avance, es_desalojo)')
          .in('tema_id', temaIds),
      ])
    : [{ data: [] }, { data: [] }]

  const carterasPorTema = new Map<number, string[]>()
  for (const c of ((cartRes.data ?? []) as { tema_id: number; institucion: string; orden: number }[])
    .slice().sort((a, b) => a.orden - b.orden)) {
    const arr = carterasPorTema.get(c.tema_id) ?? []
    arr.push(normalizeCarteraGabinete(c.institucion))
    carterasPorTema.set(c.tema_id, arr)
  }

  type IniRow = { tema_id: number; prioridad: { nombre: string; estado_semaforo: string | null; pct_avance: number | null; es_desalojo: boolean } | null }
  const iniPorTema = new Map<number, { nombre: string; semaforo: string | null; pctAvance: number | null }[]>()
  for (const r of (iniRes.data ?? []) as unknown as IniRow[]) {
    if (!r.prioridad) continue
    const arr = iniPorTema.get(r.tema_id) ?? []
    arr.push({ nombre: r.prioridad.nombre, semaforo: r.prioridad.estado_semaforo, pctAvance: r.prioridad.es_desalojo ? null : r.prioridad.pct_avance })
    iniPorTema.set(r.tema_id, arr)
  }

  // Intervenciones por tema: institucion NULL = relato general; resto = por cartera.
  const relatoPorTema = new Map<number, string>()
  const intervPorTema = new Map<number, { institucion: string; texto: string }[]>()
  for (const iv of (intervRes.data ?? []) as { tema_id: number; institucion: string | null; texto: string }[]) {
    if (iv.institucion == null) {
      if (!relatoPorTema.has(iv.tema_id)) relatoPorTema.set(iv.tema_id, iv.texto)
    } else {
      const arr = intervPorTema.get(iv.tema_id) ?? []
      arr.push({ institucion: normalizeCarteraGabinete(iv.institucion), texto: iv.texto })
      intervPorTema.set(iv.tema_id, arr)
    }
  }

  // Nombre del comité de un mandato (eje_id → sesiones_nombre; infra aparte).
  const ejesPorId = new Map(
    ((ejesRes.data ?? []) as { id: number; numero: number; sesiones_nombre: string | null }[])
      .map(e => [e.id, e.sesiones_nombre ?? `Eje ${e.numero}`]),
  )
  const infraNombre = (cfgRes.data?.infraestructura_nombre as string | undefined) ?? 'Comité de Infraestructura'
  const mandatoComiteNombre = (c: SesionCompromiso): string | null => {
    if (c.instancia === 'infraestructura') return infraNombre
    if (c.instancia === 'eje' && c.eje_id != null) return ejesPorId.get(c.eje_id) ?? 'Comité'
    return null
  }

  // Compromisos nuevos de esta sesión, agrupados por tema (los sin tema_id van al primer punto que los reclame — o quedan fuera del desarrollo).
  const nuevos = (nuevosRes.data ?? []) as SesionCompromiso[]
  const compPorTema = new Map<number, SesionCompromiso[]>()
  for (const c of nuevos) {
    if (c.tema_id == null) continue
    const arr = compPorTema.get(c.tema_id) ?? []
    arr.push(c)
    compPorTema.set(c.tema_id, arr)
  }

  // ── Verificación de compromisos anteriores (zona 1, patrón v1) ─────────────
  const VERIF = verificadosOr(sesionId, opts.preview)
  const gabIds = ((numRes.data ?? []) as { id: number }[]).map(r => r.id).filter(id => id !== sesionId)
  const [propiosRes, escaladosRes, mandatosRes] = await Promise.all([
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', region_cod).eq('instancia', 'gabinete').neq('sesion_origen_id', sesionId).or(VERIF),
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', region_cod).in('instancia', COMITES_CON_ESCALAMIENTO)
      .eq('escalado_a_gabinete', true).neq('sesion_origen_id', sesionId).or(VERIF),
    gabIds.length
      ? db.from('sesion_compromisos').select('*')
          .eq('region_cod', region_cod).eq('instancia', 'eje').in('sesion_origen_id', gabIds).or(VERIF)
      : Promise.resolve({ data: [] as SesionCompromiso[] }),
  ])
  const verificados = clasificarCompromisosGabinete(
    (propiosRes.data ?? []) as SesionCompromiso[],
    (escaladosRes.data ?? []) as SesionCompromiso[],
    (mandatosRes.data ?? []) as SesionCompromiso[],
  )

  // N° correlativo (posición por fecha entre cerradas; preview = próxima).
  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = sesion.numero
    ?? (opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1))

  const regionNombre = REGIONS.find(r => r.cod === region_cod)?.nombre ?? region_cod

  type AsisRow = {
    presente: boolean; invitado_nombre: string | null; invitado_institucion: string | null
    nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
  }

  const data: ActaGabineteV2Data = {
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
    nombreInstancia: (cfgRes.data?.gabinete_nombre as string | undefined) ?? 'Gabinete Regional',
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
    puntos: temas.map(t => ({
      orden:        t.orden,
      titulo:       (t.titulo ?? t.texto ?? '').trim() || '(sin título)',
      carteras:     (carterasPorTema.get(t.id) ?? []).slice().sort(compareCarteras),
      proposito:    t.proposito?.trim() || null,
      relato:       relatoPorTema.get(t.id) ?? null,
      intervenciones: intervPorTema.get(t.id) ?? [],
      iniciativas:  iniPorTema.get(t.id) ?? [],
      compromisos:  (compPorTema.get(t.id) ?? []).map(c => ({
        descripcion:  c.descripcion,
        institucion:  c.responsable_todas ? 'Todas las carteras' : c.responsable_institucion,
        nombre:       c.responsable_nombre,
        plazo:        c.plazo_tipo === 'fecha' ? c.plazo : null,
        mandatoComite: mandatoComiteNombre(c),
      })),
      enSala:       t.origen === 'en_sala',
      estadoCierre: t.estado_cierre,
    })),
    vocerias: ((vocRes.data ?? []) as { dia: string; vocero: string; tema_texto: string }[])
      .map(v => ({ dia: v.dia, vocero: v.vocero, tema: v.tema_texto })),
    panoramaEjes: panoramaPorEje(
      (prioRegionRes.data ?? []) as { eje: string | null; estado_semaforo: string | null; pct_avance: number | null }[],
    ),
    compVerificados: verificados.map(c => ({
      descripcion:  c.descripcion,
      institucion:  c.responsable_institucion,
      nombre:       c.responsable_nombre,
      plazo:        c.plazo,
      estado:       c.estado,
      origen:       c.origenTipo,
      comiteNombre: c.origenTipo === 'gabinete' ? null : mandatoComiteNombre(c),
    })),
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }

  registerPdfFonts()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(ActaGabineteV2Pdf as any, { data }) as any)
}
