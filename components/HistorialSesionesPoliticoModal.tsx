'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useIsAdmin } from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { SesionCompromiso } from '@/lib/types'
import {
  HistorialShell, SesionCard, ActaAcciones, AsistenciaCard, CompromisosCard,
  DetalleCard, SeccionLabel, CargandoDetalle, SinDetalle, useActaAcciones,
  type SesionResumen, type AsistenciaRow,
} from './historial/historialUi'

/**
 * Historial de sesiones del Comité Político (`instancia='politico'`, sin eje,
 * mig 059): el detalle muestra Asistencia + Temas conversados + Compromisos.
 * Comparte shell/fila/asistencia/compromisos con las otras instancias vía
 * ./historial/historialUi (incluye la X de borrado solo-admin).
 */

type Props = {
  region: Region
  onClose: () => void
  initialSesionId?: number | null
}

type DetalleSesion = {
  asistencia: AsistenciaRow[]
  temas: { texto: string; subitems: string[] }[]
  compromisos: SesionCompromiso[]
}

export default function HistorialSesionesPoliticoModal({ region, onClose, initialSesionId = null }: Props) {
  const isAdmin = useIsAdmin()
  const [sesiones, setSesiones] = useState<SesionResumen[]>([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalle, setDetalle]   = useState<Record<number, DetalleSesion>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase()
      .from('eje_sesiones')
      .select('*, sesion_asistencia(count)')
      .eq('region_cod', region.cod)
      .eq('instancia', 'politico')
      .order('fecha', { ascending: false })
      .order('id',    { ascending: false })
    setSesiones((data ?? []) as SesionResumen[])
    setLoading(false)
  }, [region.cod])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const { working, descargarActa, reintentarActa, eliminarSesion } = useActaAcciones(load)

  async function toggleExpand(s: SesionResumen) {
    if (expandedId === s.id) { setExpandedId(null); return }
    setExpandedId(s.id)
    if (detalle[s.id]) return
    const sb = getSupabase()
    const [asisRes, temasRes, compRes] = await Promise.all([
      sb.from('sesion_asistencia')
        .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, institucion, calidad)')
        .eq('sesion_id', s.id),
      sb.from('sesion_temas').select('texto, subitems').eq('sesion_id', s.id).order('orden').order('id'),
      sb.from('sesion_compromisos').select('*').eq('sesion_origen_id', s.id).order('created_at'),
    ])
    setDetalle(prev => ({
      ...prev,
      [s.id]: {
        asistencia:  (asisRes.data ?? []) as unknown as DetalleSesion['asistencia'],
        temas:       ((temasRes.data ?? []) as { texto: string; subitems: unknown }[]).map(t => ({
          texto: t.texto,
          subitems: Array.isArray(t.subitems) ? t.subitems as string[] : [],
        })),
        compromisos: (compRes.data ?? []) as SesionCompromiso[],
      },
    }))
  }

  useEffect(() => {
    if (!initialSesionId || expandedId === initialSesionId) return
    const s = sesiones.find(x => x.id === initialSesionId)
    if (s) toggleExpand(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesiones, initialSesionId])

  return (
    <HistorialShell
      title="Historial — Comité Político"
      subtitle={region.nombre}
      onClose={onClose}
      loading={loading}
      isEmpty={sesiones.length === 0}
    >
      {sesiones.map(s => {
        const det = detalle[s.id]
        return (
          <SesionCard
            key={s.id}
            sesion={s}
            nAsis={s.sesion_asistencia?.[0]?.count ?? 0}
            expanded={expandedId === s.id}
            onToggle={() => toggleExpand(s)}
            onDelete={isAdmin ? () => eliminarSesion(s.id) : undefined}
          >
            <ActaAcciones
              sesion={s}
              working={working}
              onDescargar={() => descargarActa(s.id)}
              onReintentar={() => reintentarActa(s.id)}
            />

            {!det ? <CargandoDetalle /> : (() => {
              const allEmpty = det.asistencia.length === 0 && det.temas.length === 0 && det.compromisos.length === 0
              return (
                <>
                  {det.temas.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Temas conversados</SeccionLabel>
                      <ol className="list-decimal list-inside space-y-1.5">
                        {det.temas.map((t, i) => (
                          <li key={i} className="text-sm text-slate-700 leading-snug">
                            {t.texto}
                            {t.subitems.length > 0 && (
                              <ul className="mt-0.5 ml-5 space-y-0.5 list-none">
                                {t.subitems.map((sub, si) => (
                                  <li key={si} className="text-[13px] text-slate-500 leading-snug">· {sub}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    </DetalleCard>
                  )}

                  {(det.asistencia.length > 0 || det.compromisos.length > 0) && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <AsistenciaCard asistencia={det.asistencia} />
                      <CompromisosCard compromisos={det.compromisos} />
                    </div>
                  )}

                  {allEmpty && <SinDetalle />}
                </>
              )
            })()}
          </SesionCard>
        )
      })}
    </HistorialShell>
  )
}
