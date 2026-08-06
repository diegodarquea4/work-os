/**
 * PDF del CRONOGRAMA de preparación del Gabinete Regional — se descarga desde
 * Gabinete → Preparación, antes de la reunión (spec gabinete §7.2, producto
 * nuevo: distinto de la cartera PDF del Tablero). Espeja el arranque de la
 * sesión: compromisos por verificar + iniciativas en foco + compromisos
 * levantados desde comités.
 * (Antes se llamaba "temario"; se renombró a cronograma — es una reunión.)
 *
 * Body: { region: { cod, nombre, ... } }  (el server arma el contenido).
 * Auth: requireAuth() + scope regional (mismo patrón que /api/cartera-pdf).
 * Gate: region_config.gabinete_habilitado — el cronograma es un producto del
 * gabinete; sin flag, 400 (el botón tampoco se muestra, pero se defiende acá).
 */

import { renderToBuffer } from '@react-pdf/renderer'
import React from 'react'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { SesionCompromiso } from '@/lib/types'
import { requireAuth } from '@/lib/apiAuth'
import { getSupabaseAdmin } from '@/lib/supabaseServer'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { cronogramaGabineteSchema } from '@/lib/schemas'
import CronogramaGabinetePdf, { type CronogramaGabineteData } from '@/components/CronogramaGabinetePdf'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const authProfile = await requireAuth()
  if (!authProfile) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let rawBody: unknown
  try { rawBody = await request.json() }
  catch { return new Response(JSON.stringify({ error: 'Solicitud inválida' }), { status: 400 }) }

  const parse = cronogramaGabineteSchema.safeParse(rawBody)
  if (!parse.success) {
    return new Response(
      JSON.stringify({ error: 'Solicitud inválida', detalle: parse.error.issues }),
      { status: 400 },
    )
  }
  const region = parse.data.region as Region

  // Scope regional (idéntico a /api/cartera-pdf): regional/viewer solo su región.
  const isRestricted = authProfile.role === 'regional' ||
    (authProfile.role === 'viewer' && authProfile.region_cods.length > 0)
  if (isRestricted && !authProfile.region_cods.includes(region.cod)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  }

  const sb = getSupabaseAdmin()

  // Gate: gabinete habilitado en la región (region_config, mig 046).
  const { data: cfg } = await sb
    .from('region_config')
    .select('gabinete_habilitado, gabinete_nombre')
    .eq('region_cod', region.cod)
    .maybeSingle()
  if (!cfg?.gabinete_habilitado) {
    return new Response(
      JSON.stringify({ error: 'El Gabinete Regional no está habilitado para esta región.' }),
      { status: 400 },
    )
  }
  const nombreInstancia = cfg.gabinete_nombre ?? 'Gabinete Regional'

  // 1. Cartera de la región (para el foco + resolver nombres de iniciativas
  //    vinculadas en las trabas escaladas, que pueden NO estar en foco).
  const { data: rawIni, error: iniErr } = await sb
    .from('prioridades_territoriales')
    .select('*')
    .eq('cod', region.cod)
    .order('n', { ascending: true })
  if (iniErr) {
    return new Response(JSON.stringify({ error: `DB: ${iniErr.message}` }), { status: 500 })
  }
  const todas = (rawIni ?? []) as Iniciativa[]
  const foco  = todas.filter(p => p.en_foco === true)
  const iniPorId = new Map(todas.map(p => [p.id, p]))

  // 1b. Temas a tratar pendientes (mig 053/054) — pauta general, sección I del PDF.
  const { data: rawTemas } = await sb
    .from('gabinete_temas')
    .select('texto, subitems')
    .eq('region_cod', region.cod)
    .is('sesion_id', null)
    .order('orden')
    .order('id')
  const temas = ((rawTemas ?? []) as { texto: string; subitems: unknown }[])
    .filter(t => t.texto.trim().length > 0)
    .map(t => ({
      texto: t.texto,
      subitems: (Array.isArray(t.subitems) ? t.subitems as string[] : []).filter(s => s.trim().length > 0),
    }))

  // Gate: basta con foco O temas para armar el cronograma (los temas son
  // pauta general válida por sí sola — decisión 2026-08-05).
  if (foco.length === 0 && temas.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Sin contenido para el cronograma. Marcá iniciativas en foco o escribe temas a tratar en Preparación.' }),
      { status: 400 },
    )
  }

  // 2. Compromisos del gabinete abiertos (por verificar al inicio de la sesión).
  const { data: rawComp } = await sb
    .from('sesion_compromisos')
    .select('*')
    .eq('region_cod', region.cod)
    .eq('instancia', 'gabinete')
    .in('estado', ['pendiente', 'en_curso'])
    .order('plazo', { ascending: true, nullsFirst: false })
  const comps = (rawComp ?? []) as SesionCompromiso[]

  // 3. Compromisos levantados desde comités (subsidiariedad — pendientes).
  const { data: rawTrabas } = await sb
    .from('sesion_compromisos')
    .select('*')
    .eq('region_cod', region.cod)
    .eq('escalado_a_gabinete', true)
    .in('estado', ['pendiente', 'en_curso'])
    .order('escalado_at', { ascending: false })
  const trabas = (rawTrabas ?? []) as SesionCompromiso[]

  // 4. Nombre del comité de origen (eje_id → sesiones_nombre).
  const { data: rawEjes } = await sb
    .from('region_ejes')
    .select('id, numero, sesiones_nombre')
    .eq('region_cod', region.cod)
  const comitePorEje = new Map(
    (rawEjes ?? []).map((e: { id: number; numero: number; sesiones_nombre: string | null }) =>
      [e.id, e.sesiones_nombre ?? `Eje ${e.numero}`]),
  )

  const data: CronogramaGabineteData = {
    logoDataUrl: getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
    nombreInstancia,
    regionNombre: region.nombre,
    generadoEn: new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' }),
    temas,
    compromisosVerificar: comps.map(c => ({
      descripcion: c.descripcion,
      institucion: c.responsable_institucion,
      nombre:      c.responsable_nombre,
      plazo:       c.plazo,
      estado:      c.estado,
    })),
    iniciativasFoco: foco.map(p => ({
      nombre:    p.nombre,
      // En desalojos el % de avance se gestiona en el módulo de Desalojos, no en
      // la iniciativa → va vacío en el cronograma.
      pctAvance: p.es_desalojo ? null : p.pct_avance,
    })),
    trabasEscaladas: trabas.map(t => ({
      descripcion:     t.descripcion,
      comiteNombre:    t.eje_id != null ? (comitePorEje.get(t.eje_id) ?? 'Comité') : 'Comité',
      institucion:     t.responsable_institucion,
      nombre:          t.responsable_nombre,
      plazo:           t.plazo,
      iniciativaNombre: t.prioridad_id != null ? (iniPorId.get(t.prioridad_id)?.nombre ?? null) : null,
    })),
  }

  registerPdfFonts()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const element = React.createElement(CronogramaGabinetePdf as any, { data })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(element as any)

  const filename = `cronograma-gabinete-${region.cod}-${new Date().toISOString().slice(0, 10)}.pdf`

  return new Response(pdfBuffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
