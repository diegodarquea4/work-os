import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { REGIONS } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionOficioTratado, ComiteMetrica, SesionComiteValor } from '@/lib/types'
import ActaComitePdf, { type ActaData } from '@/components/ActaComitePdf'
import { generarActaGabinete } from './generarActaGabinete'
import { agruparPorInstitucion, formatoValorComite } from './helpers'
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

export async function generarActa(sesionId: number): Promise<string> {
  const db = getSupabaseAdmin()

  // ── Cargar todo lo que el acta necesita ────────────────────────────────────
  const { data: sesionRow, error: sesErr } = await db
    .from('eje_sesiones').select('*').eq('id', sesionId).single()
  if (sesErr || !sesionRow) throw new Error(`Sesión ${sesionId} no encontrada`)
  const sesion = sesionRow as EjeSesion

  if (sesion.instancia === 'gabinete') return generarActaGabinete(db, sesion)

  const regionNombre = REGIONS.find(r => r.cod === sesion.region_cod)?.nombre ?? sesion.region_cod

  const data: ActaData = sesion.instancia === 'inversion'
    ? await armarActaInversion(db, sesion, sesionId, regionNombre)
    : await armarActaPolicial(db, sesion, sesionId, regionNombre)

  // ── Render + upload ────────────────────────────────────────────────────────
  registerPdfFonts()
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que minuta/route.ts y renderPdf.tsx).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(React.createElement(ActaComitePdf as any, { data }) as any)

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
async function armarActaPolicial(db: Db, sesion: EjeSesion, sesionId: number, regionNombre: string): Promise<ActaData> {
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
      .or(`cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso)`),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
  ])

  const catalogo = (catRes.data ?? []) as ComiteMetrica[]
  const valores  = ((valRes.data ?? []) as SesionComiteValor[])
    .map(v => ({ ...v, desglose: Array.isArray(v.desglose) ? v.desglose : [] }))

  // N° correlativo: posición por fecha (y id como desempate) entre cerradas.
  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  return {
    variante: 'policial',
    nombreInstancia: (ejeRes.data?.sesiones_nombre as string | null) ?? 'Comité',
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
    proyectosTratados: [],
    oficiosTratados: [],
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
    })),
    compNuevos: ((nuevosRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
    })),
    generadoPor: sesion.closed_by_email,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }
}

/**
 * Comité Seguimiento de la Inversión — sin eje (mig 049): nombre fijo, sin
 * indicadores/apuntes; en su lugar, proyectos tratados y oficios tratados.
 */
async function armarActaInversion(db: Db, sesion: EjeSesion, sesionId: number, regionNombre: string): Promise<ActaData> {
  const [numRes, asisRes, proyRes, verifRes, nuevosRes, oficVerifRes, oficNuevosRes] = await Promise.all([
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
      .or(`cerrado_en_sesion_id.eq.${sesionId},estado.in.(pendiente,en_curso)`),
    db.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId).order('created_at'),
    // Oficios: verificados (resueltos en esta sesión o aún pendientes) +
    // nuevos (marcados "tratado" durante esta sesión) — mismo criterio.
    db.from('sesion_oficios_tratados').select('*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)')
      .eq('region_cod', sesion.region_cod)
      .neq('sesion_origen_id', sesionId)
      .or(`resuelto_en_sesion_id.eq.${sesionId},estado.eq.pendiente`),
    db.from('sesion_oficios_tratados').select('*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)')
      .eq('sesion_origen_id', sesionId).order('created_at'),
  ])

  const cerradas = ((numRes.data ?? []) as { id: number; fecha: string }[])
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id)
  const sesionNumero = Math.max(1, cerradas.findIndex(c => c.id === sesionId) + 1)

  type OficioConNombres = SesionOficioTratado & { oaeca: { nombre: string } | null; proyecto: { nombre: string } | null }
  const oficios = [
    ...((oficVerifRes.data ?? []) as unknown as OficioConNombres[]),
    ...((oficNuevosRes.data ?? []) as unknown as OficioConNombres[]),
  ]

  return {
    variante: 'inversion',
    nombreInstancia: 'Comité Seguimiento de la Inversión',
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
    instituciones: [],
    proyectosTratados: ((proyRes.data ?? []) as unknown as { nota: string | null; proyecto: { nombre: string } | null }[])
      .map(p => ({ nombre: p.proyecto?.nombre ?? '—', nota: p.nota })),
    oficiosTratados: oficios.map(o => ({
      nombreProyecto: o.proyecto?.nombre ?? '—',
      oaeca:          o.oaeca?.nombre ?? '—',
      fechaLimite:    o.fecha_limite,
      estado:         o.estado,
    })),
    compVerificados: ((verifRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
    })),
    compNuevos: ((nuevosRes.data ?? []) as SesionCompromiso[]).map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
    })),
    generadoPor: sesion.closed_by_email,
    generadoEn:  new Date().toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
  }
}
