'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite } from '@/lib/dbWrite'
import { diaChile } from '@/lib/fechaChile'
import { COLUMNAS_AGENDA, type SesionAgenda } from '@/lib/sesiones/calendario'
import type { SesionesFiltro } from '@/lib/hooks/useSesionesEje'

/**
 * El calendario de UN comité de una región (mig 123): sus sesiones y lo que se
 * hace con ellas — agendar, abrir, mover, anular. Lo usan el selector «Nueva
 * sesión» y el modal «Calendario» de los cinco comités.
 *
 * Toda escritura va por `safeWrite`: si la RLS o el trigger de la mig 123 la
 * rechazan, el mensaje llega tal cual al usuario (p. ej. «Este comité ya tiene
 * dos sesiones abiertas…»).
 */
export function useAgendaComite(regionCod: string, filtro: SesionesFiltro, email: string | null, enabled: boolean) {
  const [sesiones, setSesiones] = useState<SesionAgenda[]>([])
  const [cargando, setCargando] = useState(enabled)
  const instancia = filtro.instancia
  const ejeId = filtro.instancia === 'eje' ? filtro.ejeId : null

  // Se relee al cambiar de comité y después de cada escritura (version).
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (!enabled) return
    let cancelado = false
    let q = getSupabase().from('eje_sesiones').select(COLUMNAS_AGENDA).eq('region_cod', regionCod)
    q = instancia === 'eje' ? q.eq('eje_id', ejeId!) : q.eq('instancia', instancia)
    q.order('fecha').order('id').then(({ data }) => {
      if (cancelado) return
      setSesiones((data ?? []) as SesionAgenda[])
      setCargando(false)
    })
    return () => { cancelado = true }
  }, [regionCod, instancia, ejeId, enabled, version])
  const recargar = useCallback(() => setVersion(v => v + 1), [])

  // Lo que toda sesión nueva de este comité lleva, igual que el insert de los
  // modales (SesionModal*, iniciarPreparacionGabinete).
  const base = useCallback(() => ({
    region_cod: regionCod,
    instancia,
    eje_id: ejeId,
    tipo_comite: instancia === 'infraestructura' ? 'cri' : null,
    formato_acta: instancia === 'gabinete' ? 2 : 1,
    created_by_email: email || null,
  }), [regionCod, instancia, ejeId, email])

  const db = () => getSupabase().from('eje_sesiones')

  /** Agenda una o varias fechas. Varias = una serie recurrente. */
  async function agendar(fechas: string[], lugar: string) {
    const serie = fechas.length > 1 ? crypto.randomUUID() : null
    await safeWrite(
      db().insert(fechas.map(fecha => ({ ...base(), fecha, lugar: lugar.trim() || null, estado: 'programada', agenda: 'ordinaria', serie_id: serie }))),
      `agendar ${instancia} ${regionCod}`,
    )
    recargar()
  }

  /** Pasa una programada a abierta y devuelve su id. */
  async function abrir(id: number): Promise<number> {
    await safeWrite(db().update({ estado: 'borrador' }).eq('id', id).eq('estado', 'programada'), `abrir sesión ${id}`)
    recargar()
    return id
  }

  /** Abre una sesión que no estaba agendada: hoy (extraordinaria) o una fecha pasada (registrada). */
  async function abrirFueraDeCalendario(fecha: string, lugar: string): Promise<number> {
    const agenda = fecha < diaChile() ? 'registrada' : 'extraordinaria'
    const filas = await safeWrite(
      db().insert({ ...base(), fecha, lugar: lugar.trim() || null, estado: 'borrador', agenda }),
      `sesión ${agenda} ${instancia} ${regionCod}`,
    ) as { id: number }[]
    recargar()
    return filas[0].id
  }

  async function mover(s: SesionAgenda, fecha: string, motivo: string) {
    await safeWrite(
      db().update({ fecha, fecha_original: s.fecha_original ?? s.fecha, motivo_cambio: motivo.trim() }).eq('id', s.id),
      `mover sesión ${s.id}`,
    )
    recargar()
  }

  async function anular(s: SesionAgenda, motivo: string) {
    await safeWrite(db().update({ estado: 'anulada', motivo_cambio: motivo.trim() }).eq('id', s.id), `anular sesión ${s.id}`)
    recargar()
  }

  return { sesiones, cargando, recargar, agendar, abrir, abrirFueraDeCalendario, mover, anular }
}
