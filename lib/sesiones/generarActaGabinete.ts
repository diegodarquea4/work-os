import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionIniciativa } from '@/lib/types'
import { panoramaPorEje, clasificarCompromisosGabinete, COMITES_CON_ESCALAMIENTO } from './helpers'
import { subirActa } from './actaUpload'
import ActaGabinetePdf, { type ActaGabineteData } from '@/components/ActaGabinetePdf'

/**
 * Builder del acta de una sesión de GABINETE cerrada (spec gabinete §7.4).
 * Lo invoca generarActa() (el entry point único despacha por instancia — el
 * contrato de /cerrar y /acta no cambia). Igual que el builder de comité:
 * NUNCA toca métricas ni compromisos — solo lee, renderiza y sube.
 */

export async function generarActaGabinete(db: SupabaseClient, sesion: EjeSesion): Promise<string> {
  const sesionId = sesion.id

  const [numRes, asisRes, iniRes, prioRegionRes, apunRes, gabSesRes, nuevosRes, ejesRes, temasRes] = await Promise.all([
    // N° de sesión = cerradas de gabinete de la región (correlativo propio,
    // independiente de los comités).
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'gabinete').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    // Iniciativas tratadas — snapshot ya escrito por el cierre.
    db.from('sesion_iniciativas')
      .select('*, prioridad:prioridades_territoriales(nombre)')
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
    // "Temas a tratar" archivados a esta sesión por el cierre (mig 053/054) —
    // el stamping corre ANTES de generarActa, así que acá ya tienen sesion_id.
    db.from('gabinete_temas').select('texto, subitems').eq('sesion_id', sesionId).order('orden').order('id'),
  ])

  // Verificados (zona 1 de la sesión): propios + escalados + mandatos —
  // cumplidos en esta sesión o aún abiertos.
  const VERIF = `cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso)`
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
  const sesionNumero = Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  const regionNombre = REGIONS.find(r => r.cod === sesion.region_cod)?.nombre ?? sesion.region_cod

  type AsisRow = {
    presente: boolean
    invitado_nombre: string | null
    invitado_institucion: string | null
    nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
  }
  type IniRow = SesionIniciativa & { prioridad: { nombre: string } | null }

  const data: ActaGabineteData = {
    nombreInstancia: (cfg?.gabinete_nombre as string | undefined) ?? 'Gabinete Regional',
    regionNombre,
    sesionNumero,
    fecha: sesion.fecha,
    lugar: sesion.lugar,
    preside: sesion.closed_by_email ?? sesion.created_by_email,
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
      semaforo:  ini.semaforo_al_momento,
      pctAvance: ini.pct_avance_al_momento != null ? Number(ini.pct_avance_al_momento) : null,
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
    generadoPor: sesion.closed_by_email,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }

  // ── Render + upload ────────────────────────────────────────────────────────
  registerPdfFonts()
  const dataConBranding: ActaGabineteData = {
    ...data,
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
  }
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que generarActa.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(ActaGabinetePdf as any, { data: dataConBranding }) as any)

  return subirActa(db, sesion, buffer)
}
