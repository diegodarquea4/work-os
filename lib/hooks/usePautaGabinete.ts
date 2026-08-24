'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { GabineteTema } from '@/lib/types'

/**
 * Data layer de la PAUTA del Gabinete v2 (mig 074 · "pauta como columna
 * vertebral"). A diferencia de useTemasGabinete (que lee el pool suelto
 * sesion_id IS NULL), esto opera sobre los puntos de UNA sesión-borrador: cada
 * punto (`gabinete_temas` con sesion_id) con sus carteras responsables
 * (`gabinete_tema_carteras`) e iniciativas del PREGO vinculadas
 * (`gabinete_tema_iniciativas`).
 *
 * Escrituras cliente con el patrón defensivo del repo (safeWrite/safeDelete,
 * lib/dbWrite): la mutación va a la BD primero; en éxito se aplica al estado
 * local, en error se hace `alert` + `refresh()` (resync desde la BD). No hay
 * revert-optimista complejo sobre el árbol compuesto — el resync es más simple
 * y robusto, y la Preparación no es un hot path.
 *
 * El borrador se resuelve/crea en el componente (useSesionesResumen → borradorId
 * o `iniciarPreparacionGabinete`); acá llega el `sesionId` ya conocido.
 */

export type PautaIniciativa = {
  prioridad_id: number
  nombre: string
  pctAvance: number | null
  semaforo: string | null
  es_desalojo: boolean
}

/** Un punto de la pauta con sus carteras (instituciones, orden asc) e iniciativas. */
export type PautaPunto = GabineteTema & {
  carteras: string[]
  iniciativas: PautaIniciativa[]
}

/** Payload para crear un punto (desde el paso Pauta o promovido desde Pendientes). */
export type NuevoPunto = {
  titulo: string
  detalle?: string | null
  proposito?: string | null
  minutos?: number
  carteras?: string[]
  iniciativas?: PautaIniciativa[]
  origen?: GabineteTema['origen']
  recurrente_id?: number | null
}

// ── Creación del borrador v2 (formato_acta=2) ────────────────────────────────
// Resuelve el borrador vivo de gabinete de la región o lo crea. Maneja la
// carrera contra el UNIQUE parcial (mismo patrón que SesionModal.init). Devuelve
// el sesion_id, o lanza con un mensaje legible.
export async function iniciarPreparacionGabinete(
  regionCod: string,
  email: string | null,
): Promise<number> {
  const sb = getSupabase()
  // ¿Ya hay borrador? (lo reusa — a lo más uno por región+instancia)
  const { data: existente } = await sb
    .from('eje_sesiones').select('id')
    .eq('region_cod', regionCod).eq('instancia', 'gabinete').eq('estado', 'borrador')
    .limit(1)
  if (existente?.[0]?.id) return existente[0].id as number

  const hoy = new Date().toISOString().slice(0, 10)
  const { data, error } = await sb
    .from('eje_sesiones')
    .insert({
      region_cod: regionCod,
      instancia: 'gabinete',
      eje_id: null,
      fecha: hoy,
      formato_acta: 2,          // v2: la Preparación estrena el formato de pauta
      created_by_email: email || null,
    })
    .select('id')
  if (data?.[0]?.id) return data[0].id as number

  // Carrera con el UNIQUE parcial (otro creó el borrador entremedio) o RLS.
  const { data: retry } = await sb
    .from('eje_sesiones').select('id')
    .eq('region_cod', regionCod).eq('instancia', 'gabinete').eq('estado', 'borrador')
    .limit(1)
  if (retry?.[0]?.id) return retry[0].id as number
  throw new Error(error?.message ?? 'No se pudo iniciar la preparación de la sesión.')
}

// ── Carga y ensamblado ───────────────────────────────────────────────────────

function normalizarTema(t: GabineteTema): GabineteTema {
  return {
    ...t,
    subitems: Array.isArray(t.subitems) ? t.subitems : [],
    minutos: t.minutos ?? 5,
  }
}

type IniJoinRow = {
  tema_id: number
  prioridad: { id: number; nombre: string; pct_avance: number | null; estado_semaforo: string | null; es_desalojo: boolean } | null
}

export function usePautaGabinete(args: { regionCod: string | null; sesionId: number | null; enabled: boolean }) {
  const { regionCod, sesionId, enabled } = args
  const [pauta, setPauta] = useState<PautaPunto[]>([])
  const [loading, setLoading] = useState(enabled && !!sesionId)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !sesionId) { setPauta([]); setLoading(false); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const sb = getSupabase()
      const { data: temasData } = await sb
        .from('gabinete_temas').select('*')
        .eq('sesion_id', sesionId!).order('orden').order('id')
      const temas = ((temasData ?? []) as GabineteTema[]).map(normalizarTema)
      const ids = temas.map(t => t.id)

      const [cartRes, iniRes] = ids.length
        ? await Promise.all([
            sb.from('gabinete_tema_carteras').select('tema_id, institucion, orden').in('tema_id', ids),
            sb.from('gabinete_tema_iniciativas')
              .select('tema_id, prioridad:prioridades_territoriales(id, nombre, pct_avance, estado_semaforo, es_desalojo)')
              .in('tema_id', ids),
          ])
        : [{ data: [] }, { data: [] }]

      const carterasPorTema = new Map<number, string[]>()
      for (const c of ((cartRes.data ?? []) as { tema_id: number; institucion: string; orden: number }[])
        .slice().sort((a, b) => a.orden - b.orden)) {
        const arr = carterasPorTema.get(c.tema_id) ?? []
        arr.push(c.institucion)
        carterasPorTema.set(c.tema_id, arr)
      }
      const iniPorTema = new Map<number, PautaIniciativa[]>()
      for (const r of (iniRes.data ?? []) as unknown as IniJoinRow[]) {
        if (!r.prioridad) continue
        const arr = iniPorTema.get(r.tema_id) ?? []
        arr.push({
          prioridad_id: r.prioridad.id,
          nombre:       r.prioridad.nombre,
          pctAvance:    r.prioridad.es_desalojo ? null : r.prioridad.pct_avance,
          semaforo:     r.prioridad.estado_semaforo,
          es_desalojo:  r.prioridad.es_desalojo,
        })
        iniPorTema.set(r.tema_id, arr)
      }

      if (cancelled) return
      setPauta(temas.map(t => ({
        ...t,
        carteras: carterasPorTema.get(t.id) ?? [],
        iniciativas: iniPorTema.get(t.id) ?? [],
      })))
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sesionId, enabled, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  // Envuelve cada mutación: en error, alerta + resync desde la BD.
  const fallo = useCallback((err: unknown) => {
    window.alert((err as Error).message)
    refresh()
  }, [refresh])

  // ── Puntos ─────────────────────────────────────────────────────────────────
  const addPunto = useCallback(async (p: NuevoPunto): Promise<PautaPunto | null> => {
    if (!sesionId || !regionCod) return null
    const sb = getSupabase()
    try {
      const nextOrden = pauta.length ? Math.max(...pauta.map(x => x.orden)) + 1 : 1
      const rows = await safeWrite(
        sb.from('gabinete_temas').insert({
          region_cod: regionCod,
          sesion_id: sesionId,
          texto: p.detalle ?? '',            // v2: texto = detalle (titulo lleva el título)
          titulo: p.titulo,
          proposito: p.proposito ?? null,
          minutos: p.minutos ?? 5,
          orden: nextOrden,
          origen: p.origen ?? 'manual',
          recurrente_id: p.recurrente_id ?? null,
        }),
        'gabinete_temas insert (pauta)',
      )
      const tema = normalizarTema(rows[0] as GabineteTema)

      // Carteras + iniciativas del punto (si vienen precargadas).
      const carteras = p.carteras ?? []
      if (carteras.length) {
        await safeWrite(
          sb.from('gabinete_tema_carteras').insert(
            carteras.map((institucion, i) => ({ tema_id: tema.id, institucion, orden: i + 1 })),
          ),
          'gabinete_tema_carteras insert',
        )
      }
      const inis = p.iniciativas ?? []
      if (inis.length) {
        await safeWrite(
          sb.from('gabinete_tema_iniciativas').insert(
            inis.map(ini => ({ tema_id: tema.id, prioridad_id: ini.prioridad_id })),
          ),
          'gabinete_tema_iniciativas insert',
        )
      }
      const punto: PautaPunto = { ...tema, carteras, iniciativas: inis }
      setPauta(prev => [...prev, punto])
      return punto
    } catch (err) { fallo(err); return null }
  }, [sesionId, regionCod, pauta, fallo])

  const updatePunto = useCallback(async (
    id: number,
    patch: Partial<Pick<GabineteTema, 'titulo' | 'texto' | 'proposito' | 'minutos' | 'estado_cierre'>>,
  ) => {
    const sb = getSupabase()
    try {
      await safeWrite(sb.from('gabinete_temas').update(patch).eq('id', id), `gabinete_temas update id=${id}`)
      setPauta(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    } catch (err) { fallo(err) }
  }, [fallo])

  const removePunto = useCallback(async (id: number) => {
    const sb = getSupabase()
    try {
      // CASCADE limpia carteras/iniciativas. Si un compromiso apunta al tema
      // (tema_id ON DELETE RESTRICT) el DELETE falla — en Preparación aún no hay.
      await safeDelete(sb.from('gabinete_temas').delete().eq('id', id), `gabinete_temas delete id=${id}`)
      setPauta(prev => prev.filter(x => x.id !== id))
    } catch (err) { fallo(err) }
  }, [fallo])

  /** Reordena moviendo un punto arriba/abajo; persiste el `orden` de los dos afectados. */
  const moverPunto = useCallback(async (id: number, dir: 'up' | 'down') => {
    const idx = pauta.findIndex(x => x.id === id)
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swap < 0 || swap >= pauta.length) return
    const a = pauta[idx], b = pauta[swap]
    // Optimista (el usuario ve el salto), luego persiste ambos.
    setPauta(prev => {
      const next = prev.slice()
      next[idx] = { ...b, orden: a.orden }
      next[swap] = { ...a, orden: b.orden }
      return next.sort((x, y) => x.orden - y.orden)
    })
    const sb = getSupabase()
    try {
      await safeWrite(sb.from('gabinete_temas').update({ orden: b.orden }).eq('id', a.id), `orden id=${a.id}`)
      await safeWrite(sb.from('gabinete_temas').update({ orden: a.orden }).eq('id', b.id), `orden id=${b.id}`)
    } catch (err) { fallo(err) }
  }, [pauta, fallo])

  // ── Carteras ─────────────────────────────────────────────────────────────────
  const agregarCartera = useCallback(async (temaId: number, institucion: string) => {
    const tema = pauta.find(t => t.id === temaId)
    if (!tema || tema.carteras.includes(institucion)) return
    const sb = getSupabase()
    try {
      await safeWrite(
        sb.from('gabinete_tema_carteras').insert({ tema_id: temaId, institucion, orden: tema.carteras.length + 1 }),
        'gabinete_tema_carteras insert',
      )
      setPauta(prev => prev.map(t => t.id === temaId ? { ...t, carteras: [...t.carteras, institucion] } : t))
    } catch (err) { fallo(err) }
  }, [pauta, fallo])

  const quitarCartera = useCallback(async (temaId: number, institucion: string) => {
    const sb = getSupabase()
    try {
      await safeDelete(
        sb.from('gabinete_tema_carteras').delete().eq('tema_id', temaId).eq('institucion', institucion),
        'gabinete_tema_carteras delete',
      )
      setPauta(prev => prev.map(t => t.id === temaId ? { ...t, carteras: t.carteras.filter(c => c !== institucion) } : t))
    } catch (err) { fallo(err) }
  }, [fallo])

  // ── Iniciativas del PREGO ─────────────────────────────────────────────────────
  const agregarIniciativa = useCallback(async (temaId: number, ini: PautaIniciativa) => {
    const tema = pauta.find(t => t.id === temaId)
    if (!tema || tema.iniciativas.some(i => i.prioridad_id === ini.prioridad_id)) return
    const sb = getSupabase()
    try {
      await safeWrite(
        sb.from('gabinete_tema_iniciativas').insert({ tema_id: temaId, prioridad_id: ini.prioridad_id }),
        'gabinete_tema_iniciativas insert',
      )
      setPauta(prev => prev.map(t => t.id === temaId ? { ...t, iniciativas: [...t.iniciativas, ini] } : t))
    } catch (err) { fallo(err) }
  }, [pauta, fallo])

  const quitarIniciativa = useCallback(async (temaId: number, prioridadId: number) => {
    const sb = getSupabase()
    try {
      await safeDelete(
        sb.from('gabinete_tema_iniciativas').delete().eq('tema_id', temaId).eq('prioridad_id', prioridadId),
        'gabinete_tema_iniciativas delete',
      )
      setPauta(prev => prev.map(t => t.id === temaId
        ? { ...t, iniciativas: t.iniciativas.filter(i => i.prioridad_id !== prioridadId) } : t))
    } catch (err) { fallo(err) }
  }, [fallo])

  return {
    pauta, loading, refresh,
    addPunto, updatePunto, removePunto, moverPunto,
    agregarCartera, quitarCartera,
    agregarIniciativa, quitarIniciativa,
  }
}

/** Forma del data-layer de la pauta — la consumen los pasos del stepper. */
export type PautaApi = ReturnType<typeof usePautaGabinete>
