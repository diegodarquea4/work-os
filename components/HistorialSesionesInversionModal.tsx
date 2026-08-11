'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useIsAdmin } from '@/lib/context/UserContext'
import type { Region } from '@/lib/regions'
import type { SeccionComiteEconomico, SesionCompromiso, SesionOficioTratado } from '@/lib/types'
import {
  HistorialShell, SesionCard, ActaAcciones, AsistenciaCard, CompromisosCard,
  DetalleCard, SeccionLabel, CargandoDetalle, SinDetalle, useActaAcciones,
  type SesionResumen, type AsistenciaRow,
} from './historial/historialUi'

/**
 * Historial de sesiones del Comité Económico (`instancia='inversion'`, sin
 * eje): el detalle muestra Proyectos tratados y Oficios tratados en vez del
 * reporte por institución. Comparte shell/fila/asistencia/compromisos con
 * HistorialSesionesModal vía ./historial/historialUi.
 */

type Props = {
  region: Region
  onClose: () => void
}

type DetalleSesion = {
  asistencia: AsistenciaRow[]
  proyectos: { nota: string | null; proyecto: { nombre: string } | null }[]
  oficios: (SesionOficioTratado & { oaeca: { nombre: string } | null; proyecto: { nombre: string } | null })[]
  compromisos: SesionCompromiso[]
}

const ESTADO_OFIC = {
  pendiente: 'bg-slate-100 text-slate-600',
  resuelto:  'bg-green-100 text-green-700',
} as const

const SECCION_LABEL: Record<SeccionComiteEconomico, string> = {
  mesa_empleo:            'Mesa Empleo',
  seguimiento_inversion:  'Seguimiento Inversión',
  general:                'General',
}

export default function HistorialSesionesInversionModal({ region, onClose }: Props) {
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
      .eq('instancia', 'inversion')
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

  const isAdmin = useIsAdmin()
  const { working, descargarActa, reintentarActa, eliminarSesion } = useActaAcciones(load)

  async function toggleExpand(s: SesionResumen) {
    if (expandedId === s.id) { setExpandedId(null); return }
    setExpandedId(s.id)
    if (detalle[s.id]) return
    const sb = getSupabase()
    const [asisRes, proyRes, oficRes, compRes] = await Promise.all([
      sb.from('sesion_asistencia')
        .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, institucion, calidad)')
        .eq('sesion_id', s.id),
      sb.from('sesion_proyectos')
        .select('nota, proyecto:v2_proyectos_inversion(nombre)')
        .eq('sesion_id', s.id),
      sb.from('sesion_oficios_tratados')
        .select('*, oaeca:oaeca(nombre), proyecto:v2_proyectos_inversion(nombre)')
        .eq('sesion_origen_id', s.id)
        .order('created_at'),
      sb.from('sesion_compromisos')
        .select('*')
        .eq('sesion_origen_id', s.id)
        .order('created_at'),
    ])
    setDetalle(prev => ({
      ...prev,
      [s.id]: {
        asistencia:  (asisRes.data ?? []) as unknown as DetalleSesion['asistencia'],
        proyectos:   (proyRes.data ?? []) as unknown as DetalleSesion['proyectos'],
        oficios:     (oficRes.data ?? []) as unknown as DetalleSesion['oficios'],
        compromisos: (compRes.data ?? []) as SesionCompromiso[],
      },
    }))
  }

  return (
    <HistorialShell
      title="Historial — Comité Económico"
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
              const allEmpty = det.proyectos.length === 0 && det.oficios.length === 0 && det.asistencia.length === 0 && det.compromisos.length === 0
              return (
                <>
                  {det.proyectos.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Proyectos tratados</SeccionLabel>
                      <div className="space-y-1.5">
                        {det.proyectos.map((p, i) => (
                          <p key={i} className="text-sm text-slate-700">
                            <span className="font-medium">{p.proyecto?.nombre ?? '—'}</span>
                            {p.nota ? <span className="text-slate-500"> — {p.nota}</span> : null}
                          </p>
                        ))}
                      </div>
                    </DetalleCard>
                  )}

                  {det.oficios.length > 0 && (
                    <DetalleCard>
                      <SeccionLabel>Oficios tratados</SeccionLabel>
                      <div className="space-y-2">
                        {det.oficios.map(o => (
                          <div key={o.id} className="flex items-start gap-2.5 text-sm text-slate-700">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${ESTADO_OFIC[o.estado]}`}>
                              {o.estado === 'resuelto' ? 'Resuelto' : 'Pendiente'}
                            </span>
                            <span className="flex-1 leading-snug">{o.proyecto?.nombre ?? '—'} <span className="text-slate-400">— {o.oaeca?.nombre ?? '—'}</span></span>
                          </div>
                        ))}
                      </div>
                    </DetalleCard>
                  )}

                  {(det.asistencia.length > 0 || det.compromisos.length > 0) && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <AsistenciaCard asistencia={det.asistencia} />
                      <CompromisosCard
                        compromisos={det.compromisos}
                        seccionLabel={c => c.seccion ? SECCION_LABEL[c.seccion] : null}
                      />
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
