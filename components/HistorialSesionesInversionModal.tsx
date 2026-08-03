'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Region } from '@/lib/regions'
import type { EjeSesion, SesionCompromiso, SesionOficioTratado } from '@/lib/types'

/**
 * Historial de sesiones del Comité Seguimiento de la Inversión — copia de
 * HistorialSesionesModal pero para `instancia='inversion'` (sin eje): el
 * detalle muestra Proyectos tratados y Oficios tratados en vez de
 * Indicadores. HistorialSesionesModal (Comité Policial) no se toca.
 */

type Props = {
  region: Region
  onClose: () => void
}

type SesionRow = EjeSesion & {
  sesion_asistencia: { count: number }[]
}

type DetalleSesion = {
  asistencia: { presente: boolean; invitado_nombre: string | null; invitado_institucion: string | null; nomina: { nombre: string; institucion: string; calidad: string } | null }[]
  proyectos: { nota: string | null; proyecto: { nombre: string } | null }[]
  oficios: (SesionOficioTratado & { oaeca: { nombre: string } | null; proyecto: { nombre: string } | null })[]
  compromisos: SesionCompromiso[]
}

export default function HistorialSesionesInversionModal({ region, onClose }: Props) {
  const [sesiones, setSesiones] = useState<SesionRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalle, setDetalle]   = useState<Record<number, DetalleSesion>>({})
  const [working, setWorking]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await getSupabase()
      .from('eje_sesiones')
      .select('*, sesion_asistencia(count)')
      .eq('region_cod', region.cod)
      .eq('instancia', 'inversion')
      .order('fecha', { ascending: false })
      .order('id',    { ascending: false })
    setSesiones((data ?? []) as SesionRow[])
    setLoading(false)
  }, [region.cod])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function toggleExpand(s: SesionRow) {
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

  async function descargarActa(s: SesionRow) {
    setWorking(true)
    try {
      const res = await fetch(`/api/sesiones/${s.id}/acta`)
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.url) window.open(body.url, '_blank')
      else window.alert(body.error ?? 'No se pudo obtener el acta')
    } finally {
      setWorking(false)
    }
  }

  async function reintentarActa(s: SesionRow) {
    setWorking(true)
    try {
      const res = await fetch(`/api/sesiones/${s.id}/acta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.acta_generada) {
        await load()
      } else {
        window.alert(body.error ?? 'No se pudo generar el acta')
      }
    } finally {
      setWorking(false)
    }
  }

  function fmtFecha(fecha: string): string {
    return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const ESTADO_COMP = {
    pendiente: 'bg-gray-100 text-gray-600',
    en_curso:  'bg-blue-100 text-blue-700',
    cumplido:  'bg-green-100 text-green-700',
  } as const

  const ESTADO_OFIC = {
    pendiente: 'bg-gray-100 text-gray-600',
    resuelto:  'bg-green-100 text-green-700',
  } as const

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Historial — Comité Seguimiento de la Inversión</p>
            <p className="text-xs text-gray-500 mt-0.5">{region.nombre}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 mt-0.5" title="Cerrar">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-center text-sm text-gray-400 py-8">Cargando historial…</p>
          ) : sesiones.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">Aún no hay sesiones registradas.</p>
          ) : (
            <div className="space-y-2">
              {sesiones.map(s => {
                const nAsis = s.sesion_asistencia?.[0]?.count ?? 0
                const expanded = expandedId === s.id
                const det = detalle[s.id]
                return (
                  <div key={s.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleExpand(s)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"
                        className={`text-gray-400 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}>
                        <path d="M3 1l4 4-4 4" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{fmtFecha(s.fecha)}{s.lugar ? ` · ${s.lugar}` : ''}</p>
                        <p className="text-xs text-gray-400">{nAsis} en asistencia</p>
                      </div>
                      {s.estado === 'borrador' ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">Borrador</span>
                      ) : s.acta_path ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex-shrink-0">Acta lista</span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700 flex-shrink-0">Acta pendiente</span>
                      )}
                    </button>

                    {expanded && (
                      <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/60 space-y-3">
                        {s.estado === 'cerrada' && (
                          <div className="flex items-center gap-2">
                            {s.acta_path ? (
                              <button
                                onClick={() => descargarActa(s)}
                                disabled={working}
                                className="text-xs px-3 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-50"
                              >
                                ⬇ Descargar acta
                              </button>
                            ) : (
                              <>
                                <span className="text-xs text-red-600">El acta no se generó al cerrar.</span>
                                <button
                                  onClick={() => reintentarActa(s)}
                                  disabled={working}
                                  className="text-xs px-3 py-1.5 rounded-lg bg-amber-500 text-white font-semibold hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {working ? 'Generando…' : 'Reintentar acta'}
                                </button>
                              </>
                            )}
                          </div>
                        )}

                        {!det ? (
                          <p className="text-xs text-gray-400">Cargando detalle…</p>
                        ) : (
                          <>
                            {det.proyectos.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Proyectos tratados</p>
                                <div className="space-y-0.5">
                                  {det.proyectos.map((p, i) => (
                                    <p key={i} className="text-xs text-gray-600">
                                      <span className="font-medium">{p.proyecto?.nombre ?? '—'}</span>
                                      {p.nota ? <span className="text-gray-400"> — {p.nota}</span> : null}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}
                            {det.oficios.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Oficios tratados</p>
                                <div className="space-y-1">
                                  {det.oficios.map(o => (
                                    <div key={o.id} className="flex items-start gap-2 text-xs text-gray-600">
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-px ${ESTADO_OFIC[o.estado]}`}>
                                        {o.estado === 'resuelto' ? 'Resuelto' : 'Pendiente'}
                                      </span>
                                      <span className="flex-1 leading-snug">{o.proyecto?.nombre ?? '—'} <span className="text-gray-400">— {o.oaeca?.nombre ?? '—'}</span></span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {det.asistencia.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Asistencia</p>
                                <div className="flex flex-wrap gap-1">
                                  {det.asistencia.map((a, i) => {
                                    const nombre = a.nomina?.nombre ?? a.invitado_nombre ?? '—'
                                    const inst   = a.nomina?.institucion ?? a.invitado_institucion ?? ''
                                    return (
                                      <span
                                        key={i}
                                        className={`text-[10px] px-1.5 py-0.5 rounded-full ${a.presente ? 'bg-white border border-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400 line-through'}`}
                                        title={inst}
                                      >
                                        {!a.nomina && '👤 '}{nombre}
                                      </span>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {det.compromisos.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Compromisos de esta sesión</p>
                                <div className="space-y-1">
                                  {det.compromisos.map(c => (
                                    <div key={c.id} className="flex items-start gap-2 text-xs text-gray-600">
                                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0 mt-px ${ESTADO_COMP[c.estado]}`}>
                                        {c.estado === 'en_curso' ? 'En curso' : c.estado === 'cumplido' ? 'Cumplido' : 'Pendiente'}
                                      </span>
                                      <span className="flex-1 leading-snug">{c.descripcion} <span className="text-gray-400">— {c.responsable_institucion}</span></span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {det.proyectos.length === 0 && det.oficios.length === 0 && det.asistencia.length === 0 && det.compromisos.length === 0 && (
                              <p className="text-xs text-gray-400">Sesión sin registros de detalle.</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
