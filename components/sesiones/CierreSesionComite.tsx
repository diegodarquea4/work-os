'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { formatoValorComite } from '@/lib/sesiones/helpers'
import {
  ESTADO_COMPROMISO, resumenAsistencia, resumenCierreComite, avisosCierreComite,
  type InstanciaConsola, type ZonaRef,
} from '@/lib/sesiones/consola'
import { Movimiento, Vacio } from './Movimiento'
import type { InstitucionComite } from '@/lib/hooks/useComiteMetricas'
import type { Iniciativa } from '@/lib/projects'
import type {
  ComiteMetrica, EjeSesion, SesionAsistencia, SesionComiteValor, SesionCompromiso, SesionIniciativa, SesionNomina,
} from '@/lib/types'

/**
 * PANTALLA DE CIERRE de la sesión de un comité (Policial / Infraestructura).
 * Overlay que continúa la consola sin desmontarla («Terminar sesión» →), con el
 * mismo esqueleto que `CierreGabinete`: revisión en movimientos + footer con
 * «Previsualizar acta» / «Generar acta y cerrar» + estado de éxito en la misma
 * pantalla.
 *
 * REGLA (decisión de Diego, 2026-09-08): esta pantalla NO agrega requisitos.
 * Hoy el cierre del comité no exige nada y sigue sin exigir nada: lo único que
 * hace es mostrar avisos ámbar (institución sin datos, compromisos que siguen
 * pendientes, asistencia en cero). «Generar acta y cerrar» está siempre
 * habilitado (salvo mientras se está cerrando). No hay `puedeGenerar` acá ni en
 * lib/sesiones/consola.ts, y hay un test que lo delata si alguien lo agrega.
 *
 * Los handlers de cierre / preview / reintento / descarga vivían en
 * SesionModal; se movieron acá tal cual (mismos endpoints, mismos textos).
 */

function fmtFecha(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}

type Props = {
  instancia: InstanciaConsola
  sesion: EjeSesion
  nombreInstancia: string
  compAnteriores: SesionCompromiso[]
  onEstadoCompromiso: (c: SesionCompromiso, estado: SesionCompromiso['estado']) => Promise<void>
  compNuevos: SesionCompromiso[]
  nomina: SesionNomina[]
  asistencia: SesionAsistencia[]
  // Solo Policial
  instituciones?: InstitucionComite[]
  catalogo?: ComiteMetrica[]
  valores?: SesionComiteValor[]
  // Solo Infraestructura
  iniciativas?: { fila: SesionIniciativa; p: Iniciativa | null }[]
  onVolver: () => void
  /** Tras el éxito, «Listo»: cierra la consola (el padre refresca lo suyo). */
  onCerrada: () => void
  /** «corregir →»: vuelve a la sala parado en esa zona. */
  onIrA: (ref: ZonaRef) => void
  /** Deja al padre saber si hay un cierre en vuelo (bloquea Escape y la ✕). */
  onCerrandoChange?: (cerrando: boolean) => void
}

export default function CierreSesionComite({
  instancia, sesion, nombreInstancia, compAnteriores, onEstadoCompromiso, compNuevos, nomina, asistencia,
  instituciones = [], catalogo = [], valores = [], iniciativas = [],
  onVolver, onCerrada, onIrA, onCerrandoChange,
}: Props) {
  const [cerrando, setCerrando]   = useState(false)
  const [preview, setPreview]     = useState(false)
  const [resultado, setResultado] = useState<{ actaGenerada: boolean; error?: string } | null>(null)
  const volverRef = useRef<HTMLButtonElement>(null)

  useEffect(() => { onCerrandoChange?.(cerrando) }, [cerrando, onCerrandoChange])
  // Foco al entrar: el botón de volver (es el "escape" visible de la pantalla).
  useEffect(() => { volverRef.current?.focus() }, [])

  const asist = useMemo(() => resumenAsistencia(nomina, asistencia), [nomina, asistencia])
  const resumen = useMemo(() => resumenCierreComite({
    instancia, compAnteriores, asistencia: asist, compNuevos,
    instituciones, catalogo, valores, comentarios: sesion.comentarios, iniciativas: iniciativas.length,
  }), [instancia, compAnteriores, asist, compNuevos, instituciones, catalogo, valores, sesion.comentarios, iniciativas.length])
  const avisos = useMemo(() => avisosCierreComite(resumen, instancia), [resumen, instancia])

  const porMetrica = useMemo(() => new Map(valores.map(v => [v.metrica_id, v])), [valores])

  const presentesNombres = useMemo(() => {
    const deNomina = nomina
      .filter(n => asistencia.some(a => a.nomina_id === n.id && a.presente))
      .map(n => n.nombre)
    const invitados = asistencia
      .filter(a => a.nomina_id === null && a.presente && a.invitado_nombre)
      .map(a => `${a.invitado_nombre} (inv.)`)
    return [...deNomina, ...invitados]
  }, [nomina, asistencia])

  // ── Acciones (movidas desde SesionModal, sin cambios de fondo) ─────────────

  async function handleCerrar() {
    if (cerrando) return
    const sinDatos = instancia === 'eje' && valores.length === 0
    const msg = instancia === 'infraestructura'
      ? '¿Cerrar la sesión y generar el acta?\n\nLos acuerdos y compromisos quedarán sellados; la sesión no se podrá editar.'
      : sinDatos
        ? 'No se registró ningún dato en el reporte por institución. ¿Cerrar la sesión igual y generar el acta?\n\nUna sesión cerrada no se puede editar.'
        : '¿Cerrar la sesión y generar el acta?\n\nEl reporte por institución quedará sellado y la sesión será inmutable.'
    if (!confirm(msg)) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/cerrar`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(body.error ?? `No se pudo cerrar la sesión (HTTP ${res.status})`)
        return
      }
      setResultado({ actaGenerada: !!body.acta_generada, error: body.error })
    } catch {
      window.alert('Error de red cerrando la sesión. Reintenta — el borrador sigue guardado.')
    } finally {
      setCerrando(false)
    }
  }

  async function handleReintentarActa() {
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/acta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.acta_generada) setResultado({ actaGenerada: true })
      else window.alert(body.error ?? 'No se pudo generar el acta. Puedes reintentar desde el historial.')
    } finally {
      setCerrando(false)
    }
  }

  async function handleDescargarActa() {
    const res = await fetch(`/api/sesiones/${sesion.id}/acta`)
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.url) window.open(body.url, '_blank', 'noopener,noreferrer')
    else window.alert(body.error ?? 'No se pudo obtener el acta')
  }

  // Vista previa del acta con el estado actual (sin cerrar). El PDF viene
  // marcado "BORRADOR"; se abre en una pestaña nueva.
  async function handlePreview() {
    if (preview) return
    setPreview(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/acta/preview`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        window.alert(body.error ?? `No se pudo generar la vista previa (HTTP ${res.status})`)
        return
      }
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch {
      window.alert('Error de red generando la vista previa del acta.')
    } finally {
      setPreview(false)
    }
  }

  const corregir = (ref: ZonaRef) => (
    <button onClick={() => onIrA(ref)} disabled={cerrando}
      className="flex-none text-[12px] font-semibold text-violet-700 hover:text-violet-900 disabled:opacity-40">
      corregir →
    </button>
  )

  return (
    <>
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-none flex-wrap">
        <button ref={volverRef} onClick={onVolver} disabled={cerrando}
          className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 disabled:opacity-40">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Volver a la sala
        </button>
        <span className="text-slate-200">|</span>
        <span className="text-[14.5px] font-bold text-slate-900">
          Terminar sesión <span className="font-medium text-slate-400">· {nombreInstancia} · {fmtFecha(sesion.fecha)}</span>
        </span>
        <button onClick={() => onIrA({ zona: 'asistencia' })} disabled={cerrando} title="Corregir la asistencia en la sala"
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {asist.presentes} / {asist.total} presentes
        </button>
      </header>

      {resultado ? (
        /* Cerrada con éxito (o cerrada con el acta pendiente) */
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-7 text-center">
            <div className={`mx-auto w-12 h-12 rounded-full grid place-items-center mb-3 ${resultado.actaGenerada ? 'bg-green-100' : 'bg-amber-100'}`}>
              {resultado.actaGenerada
                ? <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>}
            </div>
            <h2 className="text-[17px] font-extrabold text-slate-900">
              {resultado.actaGenerada ? 'Sesión cerrada — acta generada' : 'Sesión cerrada — acta pendiente'}
            </h2>
            <p className="text-[13.5px] text-slate-500 mt-1">
              {instancia === 'infraestructura'
                ? resultado.actaGenerada
                  ? 'Los acuerdos y compromisos quedaron sellados y el acta está disponible.'
                  : 'La sesión quedó cerrada con sus acuerdos, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'
                : resultado.actaGenerada
                  ? 'El reporte por institución quedó sellado y el acta está disponible.'
                  : 'El reporte quedó sellado, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              {resultado.actaGenerada ? (
                <button onClick={handleDescargarActa} className="text-[13px] font-bold px-4 py-2 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50">Descargar acta</button>
              ) : (
                <button onClick={handleReintentarActa} disabled={cerrando} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50">
                  {cerrando ? 'Generando…' : 'Reintentar acta'}
                </button>
              )}
              <button onClick={onCerrada} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">Listo</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Body */}
          <section className="flex-1 overflow-y-auto overscroll-contain p-5 md:p-6">
            <div className="max-w-3xl mx-auto space-y-6">

              {/* 1 — Compromisos anteriores */}
              <Movimiento n={1} label="Compromisos anteriores — cómo quedaron">
                {compAnteriores.length === 0
                  ? <Vacio>No había compromisos de sesiones anteriores por verificar.</Vacio>
                  : compAnteriores.map(c => (
                      <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-slate-800">{c.descripcion}</div>
                          <div className="text-[12px] text-slate-400 mt-0.5">
                            {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                            {c.escalado_a_gabinete ? ' · escalado al gabinete' : ''}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-none">
                          {(Object.keys(ESTADO_COMPROMISO) as (keyof typeof ESTADO_COMPROMISO)[]).map(est => (
                            <button key={est} onClick={() => onEstadoCompromiso(c, est)} disabled={cerrando}
                              className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors disabled:opacity-50 ${
                                c.estado === est ? ESTADO_COMPROMISO[est].on : ESTADO_COMPROMISO[est].off}`}>
                              {ESTADO_COMPROMISO[est].label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
              </Movimiento>

              {/* 2 — Reporte por institución (Policial) / Iniciativas tratadas (Infraestructura) */}
              {instancia === 'eje' ? (
                <Movimiento n={2} label="Reporte por institución — qué se registró">
                  {resumen.instituciones.length === 0
                    ? <Vacio>Esta región no tiene instituciones configuradas.</Vacio>
                    : resumen.instituciones.map(i => {
                        const metricas = catalogo
                          .filter(m => m.institucion === i.key && m.activo)
                          .sort((a, b) => a.orden - b.orden || a.id - b.id)
                        const conDato = metricas.filter(m => porMetrica.has(m.id))
                        const vacia = i.total > 0 && i.conDato === 0
                        return (
                          <div key={i.key} className="px-4 py-3 border-b border-slate-100 last:border-0">
                            <div className="flex items-center gap-2.5">
                              <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-slate-800">{i.label}</span>
                              {i.total === 0 ? (
                                <span className="text-[12px] text-slate-400">sin métricas</span>
                              ) : vacia ? (
                                <span className="text-[12px] font-semibold text-amber-700">Sin datos esta semana</span>
                              ) : (
                                <span className="text-[12px] text-slate-500 tabular-nums">{i.conDato} / {i.total} con dato</span>
                              )}
                              {i.total > 0 && corregir({ zona: 'reporte', inst: i.key })}
                            </div>
                            {conDato.length > 0 && (
                              <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                                {conDato.map(m => (
                                  <li key={m.id} className="text-[12.5px] text-slate-600 flex items-baseline gap-1.5 min-w-0">
                                    <span className="truncate">{m.nombre}</span>
                                    <span className="flex-none font-semibold text-slate-800 tabular-nums">{formatoValorComite(porMetrica.get(m.id) ?? null, m)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                </Movimiento>
              ) : (
                <Movimiento n={2} label="Iniciativas tratadas">
                  {iniciativas.length === 0
                    ? <Vacio>Sin iniciativas en la agenda de esta sesión.</Vacio>
                    : iniciativas.map(({ fila, p }) => {
                        const sem = p ? (SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris) : null
                        return (
                          <div key={fila.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0">
                            {sem && <span className={`w-2 h-2 rounded-full flex-none ${sem.dot}`} title={sem.label} />}
                            <span className="flex-1 min-w-0 text-[13.5px] text-slate-800 truncate">{p?.nombre ?? `Iniciativa #${fila.prioridad_id}`}</span>
                            {p && !p.es_desalojo && <span className="text-[12px] text-slate-400 tabular-nums flex-none">{p.pct_avance}%</span>}
                          </div>
                        )
                      })}
                  <div className="px-4 py-2 bg-slate-50/60 flex justify-end">{corregir({ zona: 'iniciativas' })}</div>
                </Movimiento>
              )}

              {/* 3 — Compromisos de hoy */}
              <Movimiento n={3} label="Compromisos de hoy">
                {compNuevos.length === 0
                  ? <Vacio>No se registraron compromisos hoy.</Vacio>
                  : compNuevos.map(c => (
                      <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-slate-800">{c.descripcion}</div>
                          <div className="text-[12px] text-slate-400 mt-0.5">
                            {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                            {c.megaproyecto ? ` · ${c.megaproyecto}` : ''}
                          </div>
                        </div>
                        {c.escalado_a_gabinete && (
                          <span className="flex-none text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">⬆ Gabinete</span>
                        )}
                      </div>
                    ))}
                <div className="px-4 py-2 bg-slate-50/60 flex justify-end">{corregir({ zona: 'nuevos' })}</div>
              </Movimiento>

              {/* 4 — Asistencia */}
              <Movimiento n={4} label="Asistencia">
                <div className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex-1 text-[13.5px] font-semibold text-slate-800">
                      {asist.presentes} de {asist.total} {asist.total === 1 ? 'convocado' : 'convocados'}
                    </span>
                    {asist.presentes === 0 && <span className="text-[12px] font-semibold text-amber-700">Sin asistencia registrada</span>}
                    {corregir({ zona: 'asistencia' })}
                  </div>
                  {presentesNombres.length > 0 && (
                    <p className="text-[12.5px] text-slate-600 mt-1.5 leading-relaxed">{presentesNombres.join(' · ')}</p>
                  )}
                </div>
              </Movimiento>

              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-[13px] text-violet-800 leading-relaxed">
                Al generar el acta, {instancia === 'eje' ? 'el reporte por institución' : 'la agenda de iniciativas'} y los
                compromisos quedan sellados. Los compromisos abiertos reaparecen para verificarlos en la próxima sesión.
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="flex-none bg-white border-t border-slate-200 px-5 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-2.5 flex-wrap">
              {avisos.length > 0 && (
                <span className="text-[12.5px] font-medium text-amber-700 inline-flex items-start gap-1.5 min-w-0">
                  <svg className="flex-none mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
                  <span>{avisos.join(' · ')}</span>
                </span>
              )}
              <div className="ml-auto flex items-center gap-2.5">
                <button onClick={handlePreview} disabled={preview || cerrando}
                  title="Ver el acta con el estado actual, antes de cerrar (borrador)"
                  className="text-[13px] font-bold px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  {preview ? 'Generando…' : 'Previsualizar acta'}
                </button>
                {/* Siempre habilitado (salvo en vuelo): los avisos informan, no bloquean. */}
                <button onClick={handleCerrar} disabled={cerrando}
                  className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">
                  {cerrando ? 'Cerrando…' : 'Generar acta y cerrar'}
                </button>
              </div>
            </div>
          </footer>
        </>
      )}
    </>
  )
}
