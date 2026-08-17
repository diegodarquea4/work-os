import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionIniciativa } from '@/lib/types'
import { subirActa } from './actaUpload'
import ActaInfraestructuraPdf, { type ActaInfraestructuraData } from '@/components/ActaInfraestructuraPdf'

/**
 * Builder del acta de una sesión del Comité de Infraestructura cerrada (mig
 * 057). Lo invoca generarActa() (el entry point único despacha por
 * instancia). Igual que los demás builders: NUNCA toca métricas ni
 * compromisos — solo lee, renderiza y sube.
 *
 * A diferencia del gabinete, acá NO hay clasificación de compromisos
 * (propios/escalados/mandatos): nada escala HACIA Infraestructura, así que
 * "verificados" es una query simple por instancia. `enviadoAGabinete` marca
 * los que el propio comité mandó al Gabinete Regional (escalado_a_gabinete).
 */

export async function generarActaInfraestructura(db: SupabaseClient, sesion: EjeSesion): Promise<string> {
  const sesionId = sesion.id

  const [numRes, asisRes, iniRes, verifRes, nuevosRes, cfgRes] = await Promise.all([
    // N° de sesión = cerradas de Infraestructura de la región (correlativo
    // propio, independiente de los otros comités).
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'infraestructura').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    // Iniciativas contempladas — snapshot ya escrito por el cierre.
    db.from('sesion_iniciativas')
      .select('*, prioridad:prioridades_territoriales(nombre)')
      .eq('sesion_id', sesionId)
      .order('created_at'),
    // Verificados: compromisos de sesiones anteriores — cumplidos en esta
    // sesión o aún abiertos (mismo criterio que el Comité Policial).
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'infraestructura')
      .neq('sesion_origen_id', sesionId)
      .or(`cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso)`),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    db.from('region_config').select('infraestructura_nombre, infraestructura_tag')
      .eq('region_cod', sesion.region_cod).maybeSingle(),
  ])

  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  type AsisRow = {
    presente: boolean
    invitado_nombre: string | null
    invitado_institucion: string | null
    nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
  }
  type IniRow = SesionIniciativa & { prioridad: { nombre: string } | null }

  const nuevos = (nuevosRes.data ?? []) as SesionCompromiso[]
  const vinculadasIds = nuevos.map(c => c.prioridad_id).filter((x): x is number => x != null)
  let nombresVinculadas = new Map<number, string>()
  if (vinculadasIds.length) {
    const { data: vn } = await db
      .from('prioridades_territoriales').select('id, nombre').in('id', vinculadasIds)
    nombresVinculadas = new Map(((vn ?? []) as { id: number; nombre: string }[]).map(p => [p.id, p.nombre]))
  }

  const regionNombre = REGIONS.find(r => r.cod === sesion.region_cod)?.nombre ?? sesion.region_cod

  const data: ActaInfraestructuraData = {
    nombreInstancia: (cfgRes.data?.infraestructura_nombre as string | undefined) ?? 'Comité de Infraestructura',
    tipoComite: sesion.tipo_comite,
    tag: (cfgRes.data?.infraestructura_tag as string | undefined) ?? 'CRI',
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
    iniciativas: ((iniRes.data ?? []) as unknown as IniRow[]).map(ini => ({
      nombre:    ini.prioridad?.nombre ?? `Iniciativa #${ini.prioridad_id}`,
      semaforo:  ini.semaforo_al_momento,
      pctAvance: ini.pct_avance_al_momento != null ? Number(ini.pct_avance_al_momento) : null,
      acuerdo:   ini.acuerdo,
    })),
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
      enviadoAGabinete: c.escalado_a_gabinete,
      megaproyecto: c.megaproyecto,
    })),
    compNuevos: nuevos.map(c => ({
      descripcion:      c.descripcion,
      institucion:      c.responsable_institucion,
      nombre:           c.responsable_nombre,
      plazo:            c.plazo,
      enviadoAGabinete: c.escalado_a_gabinete,
      megaproyecto:     c.megaproyecto,
      iniciativaNombre: c.prioridad_id != null ? nombresVinculadas.get(c.prioridad_id) ?? null : null,
    })),
    generadoPor: sesion.closed_by_email,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }

  // ── Render + upload ────────────────────────────────────────────────────────
  registerPdfFonts()
  const dataConBranding: ActaInfraestructuraData = {
    ...data,
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
  }
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que generarActa.ts/generarActaGabinete.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(ActaInfraestructuraPdf as any, { data: dataConBranding }) as any)

  return subirActa(db, sesion, buffer)
}
