'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { Region } from '@/lib/regions'
import type { EjeSesion, RegionEje, SesionCompromiso, ComiteInstitucion, ComiteDesglose } from '@/lib/types'
import { COMITE_INSTITUCIONES } from '@/lib/sesiones/helpers'

/**
 * Historial de sesiones de la instancia — comité (región, eje) o Gabinete
 * Regional (región, instancia='gabinete'): lista fecha DESC con asistentes /
 * compromisos / estado del acta; el detalle se expande por fila. En gabinete
 * el detalle muestra las INICIATIVAS TRATADAS con su acuerdo (snapshot del
 * cierre) en lugar de indicadores.
 * El acta se descarga vía GET /api/sesiones/[id]/acta (URL firmada, bucket
 * privado). Si una sesión quedó cerrada sin acta (falló el PDF), acá está el
 * botón de reintento (POST /acta — solo regenera el PDF, nunca las métricas).
 */

type Props = {
  region: Region
  instancia: 'eje' | 'gabinete'
  eje: RegionEje | null          // null ⇔ instancia='gabinete'
  nombreInstancia: string
  onClose: () => void
}

type SesionRow = EjeSesion & {
  sesion_asistencia: { count: number }[]
}

type DetalleSesion = {
  asistencia: { presente: boolean; invitado_nombre: string | null; invitado_institucion: string | null; nomina: { nombre: string; institucion: string; calidad: string } | null }[]
  // Reporte por institución del comité (mig 048).
  valores: {
    valor_num: number | null; valor_texto: string | null; observaciones: string | null; desglose: ComiteDesglose[]
    metrica: { nombre: string; unidad: string | null; tipo: 'numerico' | 'texto'; institucion: ComiteInstitucion; orden: number } | null
  }[]
  iniciativas: { semaforo_al_momento: string | null; pct_avance_al_momento: number | null; acuerdo: string | null; prioridad: { nombre: string } | null }[]
  compromisos: SesionCompromiso[]
}

export default function HistorialSesionesModal({ region, instancia, eje, nombreInstancia, onClose }: Props) {
  const [sesiones, setSesiones] = useState<SesionRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [detalle, setDetalle]   = useState<Record<number, DetalleSesion>>({})
  const [working, setWorking]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    let q = getSupabase()
      .from('eje_sesiones')
      .select('*, sesion_asistencia(count)')
      .eq('region_cod', region.cod)
    q = instancia === 'gabinete' ? q.eq('instancia', 'gabinete') : q.eq('eje_id', eje!.id)
    const { data } = await q
      .order('fecha', { ascending: false })
      .order('id',    { ascending: false })
    setSesiones((data ?? []) as SesionRow[])
    setLoading(false)
  }, [region.cod, instancia, eje?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const [asisRes, valRes, iniRes, compRes] = await Promise.all([
      sb.from('sesion_asistencia')
        .select('presente, invitado_nombre, invitado_institucion, nomina:sesion_nomina(nombre, institucion, calidad)')
        .eq('sesion_id', s.id),
      // Reporte por institución: solo en comités (el gabinete tiene iniciativas).
      instancia === 'eje'
        ? sb.from('sesion_comite_valor')
            .select('valor_num, valor_texto, observaciones, desglose, metrica:comite_metrica(nombre, unidad, tipo, institucion, orden)')
            .eq('sesion_id', s.id)
        : Promise.resolve({ data: [] }),
      // Iniciativas tratadas: solo en gabinete (snapshot + acuerdo).
      instancia === 'gabinete'
        ? sb.from('sesion_iniciativas')
            .select('semaforo_al_momento, pct_avance_al_momento, acuerdo, prioridad:prioridades_territoriales(nombre)')
            .eq('sesion_id', s.id)
            .order('created_at')
        : Promise.resolve({ data: [] }),
      sb.from('sesion_compromisos')
        .select('*')
        .eq('sesion_origen_id', s.id)
        .order('created_at'),
    ])
    setDetalle(prev => ({
      ...prev,
      [s.id]: {
        asistencia:  (asisRes.data ?? []) as unknown as DetalleSesion['asistencia'],
        valores:     (valRes.data ?? []) as unknown as DetalleSesion['valores'],
        iniciativas: (iniRes.data ?? []) as unknown as DetalleSesion['iniciativas'],
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-gray-900">Historial — {nombreInstancia}</p>
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
                        {/* Acciones de acta */}
                        {s.estado === 'cerrada' && (
                          <div className="flex items-center gap-2">
                            {s.acta_path ? (
                              <button
                                onClick={() => descargarActa(s)}
                                disabled={working}
                                className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-700 disabled:opacity-50"
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
                            {det.valores.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Reporte por institución</p>
                                <div className="space-y-2">
                                  {COMITE_INSTITUCIONES.map(instDef => {
                                    const filas = det.valores
                                      .filter(v => v.metrica?.institucion === instDef.key)
                                      .sort((a, b) => (a.metrica?.orden ?? 0) - (b.metrica?.orden ?? 0))
                                    if (filas.length === 0) return null
                                    return (
                                      <div key={instDef.key}>
                                        <p className="text-[11px] font-semibold text-slate-700">{instDef.label}</p>
                                        <div className="space-y-0.5 pl-2">
                                          {filas.map((v, i) => {
                                            const desg = Array.isArray(v.desglose) ? v.desglose.filter(d => d.etiqueta.trim() || d.valor.trim()) : []
                                            return (
                                              <div key={i} className="text-xs text-gray-600">
                                                <p className="flex justify-between gap-2">
                                                  <span className="truncate">{v.metrica?.nombre ?? '—'}</span>
                                                  {v.metrica?.tipo === 'numerico' && (
                                                    <span className="font-semibold tabular-nums flex-shrink-0">
                                                      {v.valor_num != null ? v.valor_num.toLocaleString('es-CL') : '—'}{v.metrica?.unidad ? ` ${v.metrica.unidad}` : ''}
                                                    </span>
                                                  )}
                                                </p>
                                                {v.metrica?.tipo === 'texto' && v.valor_texto && <p className="text-gray-500 leading-snug pl-2">{v.valor_texto}</p>}
                                                {desg.length > 0 && (
                                                  <p className="text-[11px] text-gray-400 pl-2">{desg.map(d => `${d.etiqueta}: ${d.valor}`).join(' · ')}</p>
                                                )}
                                                {v.observaciones && <p className="text-[11px] text-gray-400 pl-2 italic">{v.observaciones}</p>}
                                              </div>
                                            )
                                          })}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                            {det.iniciativas.length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Iniciativas tratadas</p>
                                <div className="space-y-1.5">
                                  {det.iniciativas.map((ini, i) => (
                                    <div key={i} className="text-xs text-gray-600">
                                      <p className="flex items-center gap-1.5">
                                        {ini.semaforo_al_momento && (
                                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                            ini.semaforo_al_momento === 'rojo'  ? 'bg-red-500'   :
                                            ini.semaforo_al_momento === 'ambar' ? 'bg-amber-400' :
                                            ini.semaforo_al_momento === 'verde' ? 'bg-green-500' : 'bg-gray-300'
                                          }`} />
                                        )}
                                        <span className="font-medium truncate">{ini.prioridad?.nombre ?? '—'}</span>
                                        {ini.pct_avance_al_momento != null && (
                                          <span className="text-gray-400 tabular-nums flex-shrink-0">{Math.round(Number(ini.pct_avance_al_momento))}%</span>
                                        )}
                                      </p>
                                      {ini.acuerdo && <p className="text-gray-500 mt-0.5 pl-3.5 leading-snug">Acuerdo: {ini.acuerdo}</p>}
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
                            {det.valores.length === 0 && det.iniciativas.length === 0 && det.asistencia.length === 0 && det.compromisos.length === 0 && (
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
