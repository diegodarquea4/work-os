'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { normalizeCarteraGabinete, TODAS_CARTERAS } from '@/lib/cartera'
import type { Iniciativa } from '@/lib/projects'
import type { GabineteRecurrente, SesionCompromiso } from '@/lib/types'

/** Patch de edición completa de un compromiso desde Pendientes. */
export type CompromisoPatch = {
  descripcion: string
  responsableTodas: boolean
  responsableInstitucion: string | null
  plazo: string | null
  estado: SesionCompromiso['estado']
}

/**
 * Data del paso "Pendientes" del stepper (Gabinete v2): lo que arrastramos de
 * la sesión anterior y sirve de insumo para la pauta. Cuatro fuentes:
 *   - compromisos por verificar  (sesion_compromisos abiertos del gabinete)
 *   - recurrentes                (gabinete_recurrentes activos, plantillas)
 *   - temas anotados             (pool legado: gabinete_temas sesion_id IS NULL)
 *   - iniciativas en foco        (derivadas de `projects`, sin query extra)
 *
 * Cada ítem trae lo necesario para PROMOVERLO a un punto de la pauta (título,
 * cartera responsable, iniciativa, origen). Sugerencias automáticas (hito
 * vencido, sin actividad) se integran en una iteración posterior.
 */

export type PendienteCompromiso = {
  key: string
  id: number
  titulo: string
  cartera: string | null
  prioridadId: number | null
  plazo: string | null
  estado: SesionCompromiso['estado']
  escalado: boolean
}
export type PendienteRecurrente = {
  key: string
  recurrenteId: number
  titulo: string
  detalle: string | null
  proposito: string | null
}
export type PendienteTema = {
  key: string
  temaId: number
  titulo: string
}
export type PendienteFoco = {
  key: string
  prioridadId: number
  nombre: string
  pctAvance: number | null
  semaforo: string | null
  esDesalojo: boolean
}

export type Pendientes = {
  compromisos: PendienteCompromiso[]
  recurrentes: PendienteRecurrente[]
  temas: PendienteTema[]
  foco: PendienteFoco[]
}

const VACIO: Pendientes = { compromisos: [], recurrentes: [], temas: [], foco: [] }

export function usePendientesGabinete(args: {
  regionCod: string | null
  projects: Iniciativa[]
  enabled: boolean
}) {
  const { regionCod, projects, enabled } = args
  const [data, setData] = useState<Pendientes>(VACIO)
  const [loading, setLoading] = useState(enabled && !!regionCod)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!enabled || !regionCod) { setData(VACIO); setLoading(false); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const sb = getSupabase()
      const [compRes, recRes, temasRes] = await Promise.all([
        sb.from('sesion_compromisos').select('*')
          .eq('region_cod', regionCod!)
          .in('estado', ['pendiente', 'en_curso'])
          .or('instancia.eq.gabinete,escalado_a_gabinete.eq.true')
          .order('plazo', { ascending: true, nullsFirst: false }),
        sb.from('gabinete_recurrentes').select('*')
          .eq('region_cod', regionCod!).eq('activo', true)
          .order('orden').order('id'),
        // Pool legado (mig 053): temas anotados sin sesión que quedaron pendientes.
        sb.from('gabinete_temas').select('id, texto, titulo')
          .eq('region_cod', regionCod!).is('sesion_id', null)
          .order('orden').order('id'),
      ])
      if (cancelled) return

      const compromisos: PendienteCompromiso[] = ((compRes.data ?? []) as SesionCompromiso[]).map(c => ({
        key: `comp-${c.id}`,
        id: c.id,
        titulo: c.descripcion,
        cartera: c.responsable_todas ? TODAS_CARTERAS : (normalizeCarteraGabinete(c.responsable_institucion) || null),
        prioridadId: c.prioridad_id,
        plazo: c.plazo,
        estado: c.estado,
        escalado: c.escalado_a_gabinete,
      }))

      const recurrentes: PendienteRecurrente[] = ((recRes.data ?? []) as {
        id: number; titulo: string; detalle: string | null; proposito_plantilla: string | null
      }[]).map(r => ({
        key: `rec-${r.id}`, recurrenteId: r.id, titulo: r.titulo, detalle: r.detalle, proposito: r.proposito_plantilla,
      }))

      const temas: PendienteTema[] = ((temasRes.data ?? []) as { id: number; texto: string | null; titulo: string | null }[])
        .map(t => ({ key: `tema-${t.id}`, temaId: t.id, titulo: (t.titulo ?? t.texto ?? '').trim() }))
        .filter(t => t.titulo.length > 0)

      setData({ compromisos, recurrentes, temas, foco: [] })
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [regionCod, enabled, reloadKey])

  // Foco se deriva de projects (sin query) — se recomputa barato en cada cambio.
  const foco: PendienteFoco[] = projects
    .filter(p => p.en_foco)
    .map(p => ({
      key: `foco-${p.id}`, prioridadId: p.id, nombre: p.nombre,
      pctAvance: p.es_desalojo ? null : p.pct_avance, semaforo: p.estado_semaforo, esDesalojo: p.es_desalojo,
    }))

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  // Sacar un compromiso de la lista (ya no se le hará seguimiento). Optimista;
  // en error, alerta + resync desde la BD.
  const borrarCompromiso = useCallback(async (id: number) => {
    setData(prev => ({ ...prev, compromisos: prev.compromisos.filter(c => c.id !== id) }))
    try {
      await safeDelete(getSupabase().from('sesion_compromisos').delete().eq('id', id), `sesion_compromisos delete id=${id}`)
    } catch (err) { window.alert((err as Error).message); refresh() }
  }, [refresh])

  // Editar un compromiso completo desde Pendientes (título, responsable, plazo,
  // estado). Optimista; en error, alerta + resync.
  const editarCompromiso = useCallback(async (id: number, patch: CompromisoPatch) => {
    const descripcion = patch.descripcion.trim()
    if (!descripcion) return
    setData(prev => ({ ...prev, compromisos: prev.compromisos.map(c => c.id === id ? {
      ...c,
      titulo: descripcion,
      cartera: patch.responsableTodas ? TODAS_CARTERAS : (normalizeCarteraGabinete(patch.responsableInstitucion) || null),
      plazo: patch.plazo,
      estado: patch.estado,
    } : c) }))
    try {
      await safeWrite(getSupabase().from('sesion_compromisos').update({
        descripcion,
        responsable_todas: patch.responsableTodas,
        responsable_institucion: patch.responsableTodas ? null : patch.responsableInstitucion,
        plazo: patch.plazo,
        plazo_tipo: patch.plazo ? 'fecha' : 'por_definir',
        estado: patch.estado,
      }).eq('id', id), `sesion_compromisos edit id=${id}`)
    } catch (err) { window.alert((err as Error).message); refresh() }
  }, [refresh])

  // Crear una plantilla recurrente (aparece en el aside "Recurrentes").
  const agregarRecurrente = useCallback(async (input: { titulo: string; proposito?: string | null }) => {
    if (!regionCod) return
    const titulo = input.titulo.trim()
    if (!titulo) return
    const sb = getSupabase()
    try {
      const email = (await sb.auth.getUser()).data.user?.email ?? null
      const rows = await safeWrite(
        sb.from('gabinete_recurrentes').insert({
          region_cod: regionCod,
          titulo,
          proposito_plantilla: input.proposito?.trim() || null,
          orden: data.recurrentes.length + 1,
          created_by_email: email,
        }),
        'gabinete_recurrentes insert',
      )
      const r = rows[0] as GabineteRecurrente
      setData(prev => ({
        ...prev,
        recurrentes: [...prev.recurrentes, {
          key: `rec-${r.id}`, recurrenteId: r.id, titulo: r.titulo, detalle: r.detalle, proposito: r.proposito_plantilla,
        }],
      }))
    } catch (err) { window.alert((err as Error).message); refresh() }
  }, [regionCod, data.recurrentes.length, refresh])

  // Quitar una plantilla recurrente (soft-delete: activo=false, para no romper la
  // FK de temas históricos que nacieron de ella).
  const borrarRecurrente = useCallback(async (id: number) => {
    setData(prev => ({ ...prev, recurrentes: prev.recurrentes.filter(r => r.recurrenteId !== id) }))
    try {
      await safeWrite(getSupabase().from('gabinete_recurrentes').update({ activo: false }).eq('id', id), `gabinete_recurrentes off id=${id}`)
    } catch (err) { window.alert((err as Error).message); refresh() }
  }, [refresh])

  return { pendientes: { ...data, foco }, loading, refresh, borrarCompromiso, editarCompromiso, agregarRecurrente, borrarRecurrente }
}
