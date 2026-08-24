import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import type { SupabaseClient } from '@supabase/supabase-js'
import { registerPdfFonts } from '@/lib/pdfFonts'
import { getLogoDataUrl, getFooterBannerDataUrl } from '@/lib/pdfBranding'
import { REGIONS } from '@/lib/regions'
import { normalizeCarteraGabinete, compareCarteras } from '@/lib/cartera'
import { edadEnSemanas } from '@/lib/sesiones/helpers'
import type { EjeSesion, GabineteTema, GabineteTemaCartera, SesionCompromiso } from '@/lib/types'
import HojaConduccionPdf, { type HojaConduccionData } from '@/components/HojaConduccionPdf'

/**
 * Ensambla y renderiza la HOJA DE CONDUCCIÓN de una sesión de gabinete v2
 * (spec v2, PR-2) — el papel de 2 caras que la Delegación tiene delante en la
 * mesa. Lee del modelo "pauta como columna vertebral": los puntos de la pauta
 * (gabinete_temas de la sesión) con sus carteras responsables, propósito ("la
 * pregunta"), minutos e iniciativas del PREGO vinculadas; y, para la cara 2,
 * los compromisos pendientes a cobrar agrupados por cartera.
 *
 * Lee por `sesion_id` (la sesión en BORRADOR que se está preparando) — en v2 los
 * temas nacen perteneciendo a la sesión, no al pool. Service-role (bypass RLS),
 * igual que los builders de acta. NO muta nada: es un render de referencia.
 *
 * `horaInicio` ("HH:MM") es la hora de partida elegida por el DPR; alimenta la
 * hora objetivo por punto (acumulado de minutos). `numeroLabel` proyecta el
 * correlativo que le tocará (cerradas de gabinete + 1) — el `numero` recién se
 * estampa al cerrar (mig 074 backfill + cierre v2).
 */

const HORA_INICIO_DEFAULT = '09:00'

export async function renderHojaConduccionBuffer(
  db: SupabaseClient,
  sesion: EjeSesion,
  opts: { horaInicio?: string | null; ahora: Date },
): Promise<Buffer> {
  const sesionId = sesion.id
  const region_cod = sesion.region_cod

  const [cfgRes, temasRes, cerradasRes, compRes] = await Promise.all([
    db.from('region_config').select('gabinete_nombre').eq('region_cod', region_cod).maybeSingle(),
    // Puntos de la pauta de ESTA sesión (v2: temas pertenecen a la sesión).
    db.from('gabinete_temas').select('*').eq('sesion_id', sesionId).order('orden').order('id'),
    // Correlativo proyectado: cerradas de gabinete de la región.
    db.from('eje_sesiones').select('id')
      .eq('region_cod', region_cod).eq('instancia', 'gabinete').eq('estado', 'cerrada'),
    // Cara 2 — compromisos a cobrar: propios del gabinete + escalados desde
    // comités, aún abiertos.
    db.from('sesion_compromisos').select('*')
      .eq('region_cod', region_cod)
      .in('estado', ['pendiente', 'en_curso'])
      .or('instancia.eq.gabinete,escalado_a_gabinete.eq.true')
      .order('created_at', { ascending: true }),
  ])

  const temas = (temasRes.data ?? []) as GabineteTema[]
  const temaIds = temas.map(t => t.id)

  // Carteras e iniciativas vinculadas a los puntos (una query por tabla).
  const [cartRes, iniRes] = await Promise.all([
    temaIds.length
      ? db.from('gabinete_tema_carteras').select('tema_id, institucion, orden').in('tema_id', temaIds)
      : Promise.resolve({ data: [] as GabineteTemaCartera[] }),
    temaIds.length
      ? db.from('gabinete_tema_iniciativas')
          .select('tema_id, prioridad:prioridades_territoriales(nombre, pct_avance, es_desalojo)')
          .in('tema_id', temaIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  // Carteras por tema (orden asc; orden=1 = principal).
  const carterasPorTema = new Map<number, string[]>()
  for (const c of ((cartRes.data ?? []) as GabineteTemaCartera[])
    .slice()
    .sort((a, b) => a.orden - b.orden)) {
    const arr = carterasPorTema.get(c.tema_id) ?? []
    arr.push(normalizeCarteraGabinete(c.institucion))
    carterasPorTema.set(c.tema_id, arr)
  }

  // Iniciativas por tema.
  type IniRow = { tema_id: number; prioridad: { nombre: string; pct_avance: number | null; es_desalojo: boolean } | null }
  const iniPorTema = new Map<number, { nombre: string; pctAvance: number | null }[]>()
  for (const r of (iniRes.data ?? []) as unknown as IniRow[]) {
    if (!r.prioridad) continue
    const arr = iniPorTema.get(r.tema_id) ?? []
    arr.push({
      nombre: r.prioridad.nombre,
      // En desalojos el % de avance se gestiona en su propio módulo → vacío acá.
      pctAvance: r.prioridad.es_desalojo ? null : r.prioridad.pct_avance,
    })
    iniPorTema.set(r.tema_id, arr)
  }

  const cerradas = (cerradasRes.data ?? []) as { id: number }[]
  const nombreInstancia = (cfgRes.data?.gabinete_nombre as string | undefined) ?? 'Gabinete Regional'
  const regionNombre = REGIONS.find(r => r.cod === region_cod)?.nombre ?? region_cod

  // ── Cara 1 — puntos de la pauta ────────────────────────────────────────────
  const puntos: HojaConduccionData['puntos'] = temas.map((t, i) => ({
    orden:    t.orden || i + 1,
    titulo:   (t.titulo ?? t.texto ?? '').trim() || '(sin título)',
    detalle:  t.titulo ? (t.texto?.trim() || null) : null,   // en legado, texto ES el título
    carteras: carterasPorTema.get(t.id) ?? [],
    proposito: t.proposito?.trim() || null,
    minutos:  t.minutos ?? 5,
    iniciativas: iniPorTema.get(t.id) ?? [],
  }))

  // ── Cara 2 — compromisos a cobrar, agrupados por cartera ───────────────────
  const comps = (compRes.data ?? []) as SesionCompromiso[]
  const grupos = new Map<string, HojaConduccionData['pendientesPorCartera'][number]['compromisos']>()
  for (const c of comps) {
    const cartera = c.responsable_todas
      ? 'Todas las carteras'
      : normalizeCarteraGabinete(c.responsable_institucion) || '(sin cartera)'
    const arr = grupos.get(cartera) ?? []
    arr.push({
      descripcion: c.descripcion,
      plazo:       c.plazo_tipo === 'fecha' ? c.plazo : null,
      edad:        c.plazo_tipo !== 'fecha' ? (edadEnSemanas(c.created_at, opts.ahora) ?? null) : null,
    })
    grupos.set(cartera, arr)
  }
  const pendientesPorCartera: HojaConduccionData['pendientesPorCartera'] = [...grupos.entries()]
    .sort(([a], [b]) => compareCarteras(a, b))
    .map(([cartera, compromisos]) => ({ cartera, compromisos }))

  const data: HojaConduccionData = {
    logoDataUrl:         getLogoDataUrl(),
    footerBannerDataUrl: getFooterBannerDataUrl(),
    nombreInstancia,
    regionNombre,
    fecha:       sesion.fecha,
    horaInicio:  (opts.horaInicio && /^\d{1,2}:\d{2}$/.test(opts.horaInicio.trim())) ? opts.horaInicio.trim() : HORA_INICIO_DEFAULT,
    generadoEn:  opts.ahora.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }),
    numeroLabel: `Sesión N° ${cerradas.length + 1} (próxima)`,
    puntos,
    pendientesPorCartera,
  }

  registerPdfFonts()
  // Cast as any: conflicto de tipos conocido de @react-pdf/renderer con
  // componentes funcionales (mismo patrón que generarActaGabinete.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return renderToBuffer(React.createElement(HojaConduccionPdf as any, { data }) as any)
}
