'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import type { SesionAsistencia, SesionCompromiso, SesionIntervencion, SesionNomina, SesionVoceria } from '@/lib/types'

/**
 * Data layer de la CAPTURA EN SALA del Gabinete v2 (Consola de sesión). Complementa
 * a usePautaGabinete (que trae los puntos + carteras + iniciativas): acá viven las
 * cosas que se registran DURANTE la sesión y cuelgan del punto —
 *   - relato general del punto      (sesion_intervenciones, institucion NULL)
 *   - intervenciones por cartera    (sesion_intervenciones, institucion != NULL)
 *   - compromisos del punto          (sesion_compromisos con tema_id)
 *   - vocerías de la semana          (sesion_vocerias)
 *   - conteo de asistencia           (sesion_asistencia, solo lectura para el header)
 *   - pendientes anteriores          (compromisos abiertos del gabinete — cierre mov. 1)
 *
 * Mismo patrón defensivo del repo (safeWrite/safeDelete + alert/resync en error).
 * Los compromisos de la consola se crean confirmado=FALSE (borrador): se confirman
 * con su plazo en el cierre (movimiento 2). El cierre server-side (regla 2 del
 * spec) 409ea si queda alguno sin confirmar.
 */

type Relatos = Record<number, SesionIntervencion>   // por tema_id (institucion NULL)

export type NuevoCompromiso = {
  descripcion: string
  institucion: string
  nombre?: string | null
  plazo?: string | null
  prioridadId?: number | null
}

export function useSalaGabinete(args: { sesionId: number | null; regionCod: string; email: string | null; enabled: boolean }) {
  const { sesionId, regionCod, email, enabled } = args
  const [relatos, setRelatos] = useState<Relatos>({})
  const [intervs, setIntervs] = useState<SesionIntervencion[]>([])      // institucion != null
  const [compromisos, setCompromisos] = useState<SesionCompromiso[]>([]) // creados en esta sesión
  const [pendientesPrevios, setPendientesPrevios] = useState<SesionCompromiso[]>([]) // abiertos de antes (cierre mov. 1)
  const [vocerias, setVocerias] = useState<SesionVoceria[]>([])
  const [nomina, setNomina] = useState<SesionNomina[]>([])            // roster del gabinete
  const [asistenciaRows, setAsistenciaRows] = useState<SesionAsistencia[]>([])
  const [loading, setLoading] = useState(enabled && !!sesionId)
  const [reloadKey, setReloadKey] = useState(0)
  // Estado original de un pendiente antes de marcarlo "cumplido hoy" (para poder
  // revertir sin perder si venía 'pendiente' o 'en_curso').
  const estadoPrevioRef = useRef<Map<number, SesionCompromiso['estado']>>(new Map())

  useEffect(() => {
    if (!enabled || !sesionId) { setLoading(false); return }
    let cancelled = false
    async function load() {
      setLoading(true)
      const sb = getSupabase()
      const [intRes, vocRes, compRes, asisRes, nominaRes, prevRes] = await Promise.all([
        sb.from('sesion_intervenciones').select('*').eq('sesion_id', sesionId!).order('orden').order('id'),
        sb.from('sesion_vocerias').select('*').eq('sesion_id', sesionId!).order('orden').order('id'),
        sb.from('sesion_compromisos').select('*').eq('sesion_origen_id', sesionId!).order('created_at'),
        sb.from('sesion_asistencia').select('*').eq('sesion_id', sesionId!),
        sb.from('sesion_nomina').select('*')
          .eq('region_cod', regionCod).eq('instancia', 'gabinete').eq('activo', true)
          .order('institucion').order('calidad'),
        // Pendientes anteriores del gabinete (propios ∪ escalados) de OTRAS
        // sesiones: los abiertos, más los ya marcados "cumplido" en la sala de
        // ESTA sesión (para que no desaparezcan de la lista al recargar).
        sb.from('sesion_compromisos').select('*')
          .eq('region_cod', regionCod)
          .or('instancia.eq.gabinete,escalado_a_gabinete.eq.true')
          .neq('sesion_origen_id', sesionId!)
          .or(`estado.in.(pendiente,en_curso),verificado_en_sala_sesion_id.eq.${sesionId!}`)
          .order('plazo', { ascending: true, nullsFirst: false }),
      ])
      if (cancelled) return
      const all = (intRes.data ?? []) as SesionIntervencion[]
      setRelatos(Object.fromEntries(all.filter(i => i.institucion == null).map(i => [i.tema_id, i])))
      setIntervs(all.filter(i => i.institucion != null))
      setVocerias((vocRes.data ?? []) as SesionVoceria[])
      setCompromisos((compRes.data ?? []) as SesionCompromiso[])
      setPendientesPrevios((prevRes.data ?? []) as SesionCompromiso[])
      setNomina((nominaRes.data ?? []) as SesionNomina[])
      setAsistenciaRows((asisRes.data ?? []) as SesionAsistencia[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sesionId, regionCod, enabled, reloadKey])

  const refresh = useCallback(() => setReloadKey(k => k + 1), [])
  const fallo = useCallback((err: unknown) => { window.alert((err as Error).message); refresh() }, [refresh])

  // ── Relato general del punto (institucion NULL, uno por tema) ────────────────
  const commitRelato = useCallback(async (temaId: number, texto: string) => {
    if (!sesionId) return
    const t = texto.trim()
    const existente = relatos[temaId]
    if ((existente?.texto ?? '') === t) return
    const sb = getSupabase()
    try {
      if (existente) {
        if (!t) {
          await safeDelete(sb.from('sesion_intervenciones').delete().eq('id', existente.id), 'relato delete')
          setRelatos(prev => { const n = { ...prev }; delete n[temaId]; return n })
        } else {
          await safeWrite(sb.from('sesion_intervenciones').update({ texto: t }).eq('id', existente.id), 'relato update')
          setRelatos(prev => ({ ...prev, [temaId]: { ...existente, texto: t } }))
        }
      } else if (t) {
        const rows = await safeWrite(
          sb.from('sesion_intervenciones').insert({ sesion_id: sesionId, tema_id: temaId, institucion: null, texto: t, orden: 0, created_by_email: email || null }),
          'relato insert',
        )
        setRelatos(prev => ({ ...prev, [temaId]: rows[0] as SesionIntervencion }))
      }
    } catch (err) { fallo(err) }
  }, [sesionId, relatos, email, fallo])

  // ── Intervenciones por cartera ──────────────────────────────────────────────
  const agregarInterv = useCallback(async (temaId: number, institucion: string, texto: string) => {
    if (!sesionId) return
    const inst = institucion.trim(); const txt = texto.trim()
    if (!inst || !txt) return
    const sb = getSupabase()
    try {
      const orden = intervs.filter(i => i.tema_id === temaId).length + 1
      const rows = await safeWrite(
        sb.from('sesion_intervenciones').insert({ sesion_id: sesionId, tema_id: temaId, institucion: inst, texto: txt, orden, created_by_email: email || null }),
        'intervencion insert',
      )
      setIntervs(prev => [...prev, rows[0] as SesionIntervencion])
    } catch (err) { fallo(err) }
  }, [sesionId, intervs, email, fallo])

  const editarInterv = useCallback(async (id: number, texto: string) => {
    const t = texto.trim(); const cur = intervs.find(i => i.id === id)
    if (!cur || cur.texto === t) return
    const sb = getSupabase()
    try {
      if (!t) { await safeDelete(sb.from('sesion_intervenciones').delete().eq('id', id), 'interv delete'); setIntervs(prev => prev.filter(i => i.id !== id)) }
      else { await safeWrite(sb.from('sesion_intervenciones').update({ texto: t }).eq('id', id), 'interv update'); setIntervs(prev => prev.map(i => i.id === id ? { ...i, texto: t } : i)) }
    } catch (err) { fallo(err) }
  }, [intervs, fallo])

  const quitarInterv = useCallback(async (id: number) => {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_intervenciones').delete().eq('id', id), 'interv delete'); setIntervs(prev => prev.filter(i => i.id !== id)) }
    catch (err) { fallo(err) }
  }, [fallo])

  // ── Compromisos del punto (confirmado=FALSE; llave estable prioridad_id) ─────
  // Nacen como borrador: se confirman con su plazo en el cierre (movimiento 2).
  const agregarCompromiso = useCallback(async (temaId: number, c: NuevoCompromiso) => {
    if (!sesionId) return null
    const desc = c.descripcion.trim(); const inst = c.institucion.trim()
    if (!desc || !inst) return null
    const sb = getSupabase()
    try {
      const rows = await safeWrite(
        sb.from('sesion_compromisos').insert({
          region_cod: regionCod,
          instancia: 'gabinete',
          eje_id: null,
          sesion_origen_id: sesionId,
          descripcion: desc,
          responsable_institucion: inst,
          responsable_nombre: c.nombre?.trim() || null,
          plazo: c.plazo || null,
          plazo_tipo: c.plazo ? 'fecha' : 'por_definir',
          confirmado: false,
          prioridad_id: c.prioridadId ?? null,
          tema_id: temaId,
        }),
        `sesion_compromisos insert tema=${temaId}`,
      )
      const nuevo = rows[0] as SesionCompromiso
      setCompromisos(prev => [...prev, nuevo])
      return nuevo
    } catch (err) { fallo(err); return null }
  }, [sesionId, regionCod, fallo])

  const quitarCompromiso = useCallback(async (id: number) => {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_compromisos').delete().eq('id', id), `compromiso delete id=${id}`); setCompromisos(prev => prev.filter(c => c.id !== id)) }
    catch (err) { fallo(err) }
  }, [fallo])

  // ── Cierre movimiento 2: confirmar un compromiso de hoy con su plazo ─────────
  // plazoTipo 'fecha' exige plazo (YYYY-MM-DD); 'permanente'/'por_definir' → null.
  const confirmarCompromiso = useCallback(async (
    id: number,
    plazoTipo: SesionCompromiso['plazo_tipo'],
    plazo: string | null,
  ) => {
    const patch = { confirmado: true, plazo_tipo: plazoTipo, plazo: plazoTipo === 'fecha' ? plazo : null }
    setCompromisos(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    const sb = getSupabase()
    try { await safeWrite(sb.from('sesion_compromisos').update(patch).eq('id', id), `compromiso confirmar id=${id}`) }
    catch (err) { fallo(err) }
  }, [fallo])

  // ── Cierre movimiento 1: marcar un pendiente anterior "cumplido hoy" ─────────
  // Sella estado='cumplido' + verificado_en_sala_sesion_id; revertir restaura el
  // estado original (pendiente/en_curso). El cierre le pone cerrado_en_sesion_id.
  const verificarPendiente = useCallback(async (id: number, cumplido: boolean) => {
    if (!sesionId) return
    const actual = pendientesPrevios.find(c => c.id === id)
    if (!actual) return
    if (cumplido && !estadoPrevioRef.current.has(id)) estadoPrevioRef.current.set(id, actual.estado)
    const previo = estadoPrevioRef.current.get(id) ?? 'pendiente'
    const patch = cumplido
      ? { estado: 'cumplido' as const, verificado_en_sala_sesion_id: sesionId, estado_updated_at: new Date().toISOString(), estado_updated_by_email: email }
      : { estado: previo, verificado_en_sala_sesion_id: null, estado_updated_at: new Date().toISOString(), estado_updated_by_email: email }
    setPendientesPrevios(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
    const sb = getSupabase()
    try { await safeWrite(sb.from('sesion_compromisos').update(patch).eq('id', id), `pendiente verificar id=${id}`) }
    catch (err) { fallo(err) }
  }, [sesionId, pendientesPrevios, email, fallo])

  // ── Vocerías de la semana ────────────────────────────────────────────────────
  const agregarVoceria = useCallback(async (dia: string, vocero: string, tema: string) => {
    if (!sesionId || !dia.trim() || !vocero.trim() || !tema.trim()) return
    const sb = getSupabase()
    try {
      const rows = await safeWrite(
        sb.from('sesion_vocerias').insert({ sesion_id: sesionId, dia: dia.trim(), vocero: vocero.trim(), tema_texto: tema.trim(), orden: vocerias.length + 1 }),
        'voceria insert',
      )
      setVocerias(prev => [...prev, rows[0] as SesionVoceria])
    } catch (err) { fallo(err) }
  }, [sesionId, vocerias.length, fallo])

  const quitarVoceria = useCallback(async (id: number) => {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_vocerias').delete().eq('id', id), 'voceria delete'); setVocerias(prev => prev.filter(v => v.id !== id)) }
    catch (err) { fallo(err) }
  }, [fallo])

  // ── Asistencia (roster fijo + invitados) ─────────────────────────────────────
  const toggleAsistencia = useCallback(async (nominaId: number) => {
    if (!sesionId) return
    const fila = asistenciaRows.find(a => a.nomina_id === nominaId)
    const sb = getSupabase()
    try {
      if (fila) {
        const presente = !fila.presente
        setAsistenciaRows(prev => prev.map(a => a.id === fila.id ? { ...a, presente } : a))
        await safeWrite(sb.from('sesion_asistencia').update({ presente }).eq('id', fila.id), `asistencia toggle id=${fila.id}`)
      } else {
        const rows = await safeWrite(
          sb.from('sesion_asistencia').insert({ sesion_id: sesionId, nomina_id: nominaId, presente: true }),
          `asistencia insert nomina=${nominaId}`,
        )
        setAsistenciaRows(prev => [...prev, rows[0] as SesionAsistencia])
      }
    } catch (err) { fallo(err) }
  }, [sesionId, asistenciaRows, fallo])

  const agregarInvitado = useCallback(async (nombre: string, institucion: string) => {
    if (!sesionId || !nombre.trim() || !institucion.trim()) return
    const sb = getSupabase()
    try {
      const rows = await safeWrite(
        sb.from('sesion_asistencia').insert({
          sesion_id: sesionId, invitado_nombre: nombre.trim(), invitado_institucion: institucion.trim(), presente: true,
        }),
        'asistencia invitado insert',
      )
      setAsistenciaRows(prev => [...prev, rows[0] as SesionAsistencia])
    } catch (err) { fallo(err) }
  }, [sesionId, fallo])

  const quitarInvitado = useCallback(async (id: number) => {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_asistencia').delete().eq('id', id), `asistencia invitado delete id=${id}`); setAsistenciaRows(prev => prev.filter(a => a.id !== id)) }
    catch (err) { fallo(err) }
  }, [fallo])

  // Marca TODO el roster presente/ausente de una (los invitados no se tocan —
  // siempre están presentes por definición). Inserta filas para los que aún no
  // tienen y actualiza las existentes que difieran.
  const marcarTodos = useCallback(async (presente: boolean) => {
    if (!sesionId || nomina.length === 0) return
    const sb = getSupabase()
    const porNomina = new Map(asistenciaRows.filter(a => a.nomina_id != null).map(a => [a.nomina_id, a]))
    const inserts = nomina.filter(m => !porNomina.has(m.id)).map(m => ({ sesion_id: sesionId, nomina_id: m.id, presente }))
    const updates = nomina.map(m => porNomina.get(m.id)).filter((a): a is SesionAsistencia => !!a && a.presente !== presente)
    setAsistenciaRows(prev => prev.map(a => (a.nomina_id != null && a.presente !== presente) ? { ...a, presente } : a))
    try {
      if (inserts.length) {
        const rows = await safeWrite(sb.from('sesion_asistencia').insert(inserts), 'asistencia bulk insert')
        setAsistenciaRows(prev => [...prev, ...(rows as SesionAsistencia[])])
      }
      for (const u of updates) {
        await safeWrite(sb.from('sesion_asistencia').update({ presente }).eq('id', u.id), `asistencia bulk id=${u.id}`)
      }
    } catch (err) { fallo(err) }
  }, [sesionId, nomina, asistenciaRows, fallo])

  // Resumen del header: presentes / (roster + invitados). Un miembro sin fila
  // cuenta como ausente pero suma al total (es parte de la nómina citada).
  const asistencia = useMemo(() => {
    const invitados = asistenciaRows.filter(a => a.nomina_id == null).length
    const presentes = asistenciaRows.filter(a => a.presente).length
    return { presentes, total: nomina.length + invitados }
  }, [nomina, asistenciaRows])

  return {
    relatos, intervs, compromisos, pendientesPrevios, vocerias, nomina, asistenciaRows, asistencia, loading, refresh,
    commitRelato, agregarInterv, editarInterv, quitarInterv,
    agregarCompromiso, quitarCompromiso, confirmarCompromiso, verificarPendiente,
    agregarVoceria, quitarVoceria,
    toggleAsistencia, agregarInvitado, quitarInvitado, marcarTodos,
  }
}

export type SalaApi = ReturnType<typeof useSalaGabinete>
