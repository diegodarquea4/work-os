import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionIniciativa } from '@/lib/types'
import { verificadosOr, type ActaOpts } from './generarActa'
import { resolvePreside } from './preside'
import ActaInfraestructuraPdf, { type ActaInfraestructuraData } from '@/components/ActaInfraestructuraPdf'

/**
 * Renderiza el acta de una sesión del Comité de Infraestructura a un buffer (mig
 * 057). Lo invoca renderActaBuffer() (el entry point único despacha por
 * instancia). La SUBIDA la hace generarActa (cierre). NUNCA toca métricas ni
 * compromisos. En `opts.preview` lee el estado BORRADOR (semáforos en vivo, N°
 * que le tocará, quien previsualiza) y el PDF se marca "BORRADOR".
 *
 * A diferencia del gabinete, acá NO hay clasificación de compromisos
 * (propios/escalados/mandatos): nada escala HACIA Infraestructura, así que
 * "verificados" es una query simple por instancia. `enviadoAGabinete` marca
 * los que el propio comité mandó al Gabinete Regional (escalado_a_gabinete).
 */

export async function renderActaInfraestructuraBuffer(db: SupabaseClient, sesion: EjeSesion, opts: ActaOpts): Promise<Buffer> {
  const sesionId = sesion.id

  const [numRes, asisRes, iniRes, verifRes, nuevosRes, cfgRes, preside] = await Promise.all([
    // N° de sesión = cerradas de Infraestructura de la región (correlativo
    // propio, independiente de los otros comités).
    db.from('eje_sesiones').select('id, fecha')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'infraestructura').eq('estado', 'cerrada'),
    db.from('sesion_asistencia')
      .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, cargo, institucion, calidad)')
      .eq('sesion_id', sesionId),
    // Iniciativas contempladas. En preview no hay snapshot todavía → traemos
    // también el semáforo/avance EN VIVO para mostrar lo que capturará el cierre.
    db.from('sesion_iniciativas')
      .select('*, prioridad:prioridades_territoriales(nombre, estado_semaforo, pct_avance)')
      .eq('sesion_id', sesionId)
      .order('created_at'),
    // Verificados: compromisos de sesiones anteriores — cumplidos en esta
    // sesión o aún abiertos (mismo criterio que el Comité Policial).
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', sesion.region_cod).eq('instancia', 'infraestructura')
      .neq('sesion_origen_id', sesionId)
      .or(verificadosOr(sesionId, opts.preview)),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    db.from('region_config').select('infraestructura_nombre, infraestructura_tag')
      .eq('region_cod', sesion.region_cod).maybeSingle(),
    resolvePreside(db, sesion, opts),
  ])

  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = opts.preview ? cerradas.length + 1 : Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  type AsisRow = {
    presente: boolean
    invitado_nombre: string | null
    invitado_institucion: string | null
    nomina: { nombre: string; cargo: string | null; institucion: string; calidad: 'titular' | 'suplente' } | null
  }
  type IniRow = SesionIniciativa & { prioridad: { nombre: string; estado_semaforo?: string | null; pct_avance?: number | null } | null }

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
    preside,
    asistencia: ((asisRes.data ?? []) as unknown as AsisRow[]).map(a => ({
      nombre:      a.nomina?.nombre ?? a.invitado_nombre ?? '—',
      cargo:       a.nomina?.cargo ?? null,
      institucion: a.nomina?.institucion ?? a.invitado_institucion ?? '—',
      calidad:     a.nomina ? a.nomina.calidad : 'invitado',
      presente:    a.presente,
    })),
    iniciativas: ((iniRes.data ?? []) as unknown as IniRow[]).map(ini => ({
      nombre:    ini.prioridad?.nombre ?? `Iniciativa #${ini.prioridad_id}`,
      semaforo:  opts.preview ? (ini.prioridad?.estado_semaforo ?? null) : ini.semaforo_al_momento,
      pctAvance: opts.preview
        ? (ini.prioridad?.pct_avance != null ? Number(ini.prioridad.pct_avance) : null)
        : (ini.pct_avance_al_momento != null ? Number(ini.pct_avance_al_momento) : null),
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
    generadoPor: opts.preview ? (opts.currentUserEmail ?? null) : sesion.closed_by_email,
    borrador:    opts.preview,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }

  // ── Render (la subida la hace generarActa) ─────────────────────────────────
  registerPdfFonts()
  const dataConBranding: ActaInfraestructuraData = {
    ...data,
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
  }
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que generarActa.ts/generarActaGabinete.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(ActaInfraestructuraPdf as any, { data: dataConBranding }) as any)
}
