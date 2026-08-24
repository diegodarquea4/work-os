'use client'

import { useMemo, useState } from 'react'
import AsistenciaGabinete from './AsistenciaGabinete'
import { shortCartera } from './pickers'
import { TODAS_CARTERAS } from '@/lib/cartera'
import { edadEnSemanas } from '@/lib/sesiones/helpers'
import type { PautaApi } from '@/lib/hooks/usePautaGabinete'
import type { SalaApi } from '@/lib/hooks/useSalaGabinete'
import type { GabineteTema, SesionCompromiso } from '@/lib/types'

type EstadoCierre = GabineteTema['estado_cierre']

/**
 * CIERRE DEL GABINETE v2 en 4 movimientos (spec §8 · mockup v5 «Terminar
 * gabinete»). Overlay a pantalla completa que continúa la Consola en sala:
 *   1. Compromisos pendientes anteriores — cómo quedaron (cumplido / sigue).
 *   2. Compromisos de hoy — se confirman con su plazo.
 *   3. Vocerías de la semana.
 *   4. Lo que se arrastra a la próxima (puntos pospuestos).
 * → Previsualizar acta · Generar acta y cerrar (reusa /acta/preview + /cerrar).
 *
 * Regla 2 del cierre (bloqueosCierreGabineteV2): no se genera el acta con puntos
 * sin estado de cierre ni compromisos de hoy sin confirmar. El pre-flight de acá
 * espeja el guard server-side; si igual se cuela, /cerrar devuelve 409.
 */

// ── Fechas (local, sin corrimiento por timezone) ─────────────────────────────
function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function comingFriday(): string {
  const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7)); return isoLocal(d)
}
function plusDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n); return isoLocal(d)
}
function nextMonday(): string {
  const d = new Date(); d.setDate(d.getDate() + (((1 - d.getDay() + 7) % 7) || 7)); return isoLocal(d)
}
function fmtCorta(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
}
function fmtLarga(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
}

function responsableLabel(c: Pick<SesionCompromiso, 'responsable_todas' | 'responsable_institucion'>): string {
  return c.responsable_todas ? TODAS_CARTERAS : shortCartera(c.responsable_institucion ?? '—')
}

type Props = {
  gabineteNombre: string
  sesionId: number
  fecha: string
  numeroLabel: string
  pauta: PautaApi
  sala: SalaApi
  canEdit: boolean
  onVolver: () => void
  onCerrada: () => void
}

export default function CierreGabinete({ gabineteNombre, sesionId, fecha, numeroLabel, pauta, sala, canEdit, onVolver, onCerrada }: Props) {
  const [cerrando, setCerrando] = useState(false)
  const [preview, setPreview] = useState(false)
  const [asistOpen, setAsistOpen] = useState(false)
  const [resultado, setResultado] = useState<{ actaGenerada: boolean; error?: string } | null>(null)

  // Pre-flight (regla 2): puntos sin estado + compromisos de hoy sin confirmar.
  const puntosSinEstado   = useMemo(() => pauta.pauta.filter(p => !p.estado_cierre), [pauta.pauta])
  const comprSinConfirmar = useMemo(() => sala.compromisos.filter(c => !c.confirmado), [sala.compromisos])
  const puedeGenerar = puntosSinEstado.length === 0 && comprSinConfirmar.length === 0

  const pospuestos = useMemo(() => pauta.pauta.filter(p => p.estado_cierre === 'pospuesto'), [pauta.pauta])
  const puntoPorId = useMemo(() => new Map(pauta.pauta.map((p, i) => [p.id, { n: i + 1, titulo: p.titulo || p.texto || '(sin título)' }])), [pauta.pauta])

  const siguenPendientes = sala.pendientesPrevios.filter(c => !(c.estado === 'cumplido' && c.verificado_en_sala_sesion_id === sesionId)).length
  const arrastreSeguimiento = siguenPendientes + sala.compromisos.length

  async function handlePreview() {
    if (preview) return
    setPreview(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/acta/preview`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        window.alert(body.error ?? `No se pudo generar la vista previa (HTTP ${res.status})`)
        return
      }
      const url = URL.createObjectURL(await res.blob())
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch { window.alert('Error de red generando la vista previa del acta.') }
    finally { setPreview(false) }
  }

  async function handleCerrar() {
    if (cerrando || !puedeGenerar) return
    if (!confirm('¿Generar el acta y cerrar el gabinete?\n\nLos acuerdos y compromisos quedan sellados; la sesión no se podrá editar.')) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/cerrar`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(body.error ?? `No se pudo cerrar el gabinete (HTTP ${res.status})`)
        return
      }
      setResultado({ actaGenerada: !!body.acta_generada, error: body.error })
    } catch { window.alert('Error de red cerrando el gabinete. Reintenta — el borrador sigue guardado.') }
    finally { setCerrando(false) }
  }

  async function descargarActa() {
    const res = await fetch(`/api/sesiones/${sesionId}/acta`)
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.url) window.open(body.url, '_blank')
    else window.alert(body.error ?? 'No se pudo obtener el acta')
  }

  return (
    <div className="fixed inset-0 z-[71] bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-none flex-wrap">
        <button onClick={onVolver} disabled={cerrando} className="text-[12.5px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 disabled:opacity-40">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Volver a la sala
        </button>
        <span className="text-slate-200">|</span>
        <span className="text-[14.5px] font-bold text-slate-900">Terminar gabinete <span className="font-medium text-slate-400">· {gabineteNombre} · {numeroLabel} · {fecha}</span></span>
        <button onClick={() => setAsistOpen(true)} disabled={cerrando} title="Tomar / corregir asistencia"
          className="ml-auto inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full hover:border-violet-300 hover:text-violet-700 disabled:opacity-50">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          {sala.asistencia.presentes} / {sala.asistencia.total} presentes
        </button>
      </header>

      {asistOpen && <AsistenciaGabinete sala={sala} canEdit={canEdit} onClose={() => setAsistOpen(false)} />}

      {/* Cerrado con éxito */}
      {resultado ? (
        <div className="flex-1 grid place-items-center p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-7 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 grid place-items-center mb-3">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
            </div>
            <h2 className="text-[17px] font-extrabold text-slate-900">Gabinete cerrado</h2>
            <p className="text-[13.5px] text-slate-500 mt-1">
              {resultado.actaGenerada
                ? 'El acta quedó generada y sellada. La sesión ya no se puede editar.'
                : 'La sesión se cerró, pero el acta falló al generarse. Reintentá desde el historial.'}
            </p>
            <div className="mt-5 flex items-center justify-center gap-2.5">
              {resultado.actaGenerada && (
                <button onClick={descargarActa} className="text-[13px] font-bold px-4 py-2 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50">Descargar acta</button>
              )}
              <button onClick={onCerrada} className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">Listo</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Body */}
          <section className="flex-1 overflow-y-auto p-5 md:p-6">
            <div className="max-w-3xl mx-auto space-y-6">

              {/* Pre-flight: puntos sin estado de cierre */}
              {puntosSinEstado.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-[13px] font-bold text-amber-800">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
                    {puntosSinEstado.length} punto{puntosSinEstado.length === 1 ? '' : 's'} sin estado de cierre
                  </div>
                  <p className="text-[12.5px] text-amber-700/90 mt-1 mb-2.5">Decide cómo quedó cada uno para poder cerrar (también puedes hacerlo en la sala).</p>
                  <div className="space-y-1.5">
                    {puntosSinEstado.map(p => (
                      <div key={p.id} className="flex items-center gap-2.5 bg-white rounded-lg border border-amber-100 px-3 py-2">
                        <span className="flex-1 min-w-0 text-[13.5px] font-semibold text-slate-800 truncate">{p.titulo || p.texto || '(sin título)'}</span>
                        <EstadoSelect value={p.estado_cierre} disabled={!canEdit} onChange={v => pauta.updatePunto(p.id, { estado_cierre: v })} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 1 — Pendientes anteriores */}
              <Movimiento n={1} label="Compromisos pendientes — cómo quedaron">
                {sala.pendientesPrevios.length === 0
                  ? <Vacio>No hay compromisos anteriores por verificar.</Vacio>
                  : sala.pendientesPrevios.map(c => {
                      const cumplido = c.estado === 'cumplido' && c.verificado_en_sala_sesion_id === sesionId
                      const semanas = edadEnSemanas(c.created_at, new Date())
                      return (
                        <div key={c.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13.5px] font-semibold text-slate-800">{c.descripcion}</div>
                            <div className="text-[12px] text-slate-400 mt-0.5">
                              {responsableLabel(c)}{semanas && !cumplido ? ` · ${semanas}` : ''}{c.escalado_a_gabinete ? ' · escalado' : ''}
                            </div>
                          </div>
                          {canEdit && (
                            <div className="flex-none inline-flex rounded-lg border border-slate-200 overflow-hidden text-[12px] font-bold">
                              <button onClick={() => sala.verificarPendiente(c.id, true)}
                                className={`px-2.5 py-1.5 ${cumplido ? 'bg-green-100 text-green-700' : 'text-slate-500 hover:bg-slate-50'}`}>Cumplido hoy</button>
                              <button onClick={() => sala.verificarPendiente(c.id, false)}
                                className={`px-2.5 py-1.5 border-l border-slate-200 ${!cumplido ? 'bg-red-100 text-red-700' : 'text-slate-500 hover:bg-slate-50'}`}>Sigue pendiente</button>
                            </div>
                          )}
                        </div>
                      )
                    })}
              </Movimiento>

              {/* 2 — Compromisos de hoy */}
              <Movimiento n={2} label="Compromisos de hoy — confirma su plazo">
                {sala.compromisos.length === 0
                  ? <Vacio>No se registraron compromisos hoy.</Vacio>
                  : sala.compromisos.map(c => (
                      <CompromisoHoyRow key={c.id} c={c} punto={c.tema_id != null ? puntoPorId.get(c.tema_id) : undefined}
                        canEdit={canEdit}
                        onConfirmar={(tipo, plazo) => sala.confirmarCompromiso(c.id, tipo, plazo)}
                        onQuitar={() => sala.quitarCompromiso(c.id)} />
                    ))}
              </Movimiento>

              {/* 3 — Vocerías */}
              <Movimiento n={3} label="Vocerías de la semana">
                {sala.vocerias.length === 0 && !canEdit && <Vacio>Sin vocerías.</Vacio>}
                {sala.vocerias.map(v => (
                  <div key={v.id} className="group flex items-center gap-3 px-4 py-2.5 border-b border-slate-100 last:border-0 text-[13.5px]">
                    <span className="font-semibold text-slate-800 w-24 flex-none">{v.dia}</span>
                    <span className="font-medium text-slate-700 flex-none">{v.vocero}</span>
                    <span className="text-slate-500 flex-1 truncate">— {v.tema_texto}</span>
                    {canEdit && (
                      <button onClick={() => sala.quitarVoceria(v.id)} className="flex-none text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title="Quitar">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                      </button>
                    )}
                  </div>
                ))}
                {canEdit && <NuevaVoceria onAdd={(d, vo, t) => sala.agregarVoceria(d, vo, t)} />}
              </Movimiento>

              {/* 4 — Arrastre a la próxima */}
              <Movimiento n={4} label="Lo que se arrastra a la próxima">
                {pospuestos.length === 0
                  ? <Vacio>Nada quedó pospuesto.</Vacio>
                  : pospuestos.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="text-[13.5px] font-semibold text-slate-800 truncate">{p.titulo || p.texto || '(sin título)'}</div>
                          {p.carteras[0] && <div className="text-[12px] text-slate-400 mt-0.5">{shortCartera(p.carteras[0])}</div>}
                        </div>
                        {canEdit && (
                          <div className="flex-none inline-flex rounded-lg border border-slate-200 overflow-hidden text-[12px] font-bold">
                            <button onClick={() => pauta.updatePunto(p.id, { estado_cierre: 'pospuesto' })}
                              className="px-2.5 py-1.5 bg-violet-600 text-white">Próxima pauta</button>
                            <button onClick={() => pauta.updatePunto(p.id, { estado_cierre: 'retirado' })}
                              className="px-2.5 py-1.5 border-l border-slate-200 text-slate-500 hover:bg-slate-50">Retirar</button>
                          </div>
                        )}
                      </div>
                    ))}
              </Movimiento>

              {/* Nota de cierre */}
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-3 text-[13px] text-violet-800 leading-relaxed">
                El <b className="font-semibold">{fmtLarga(nextMonday())}</b> se reinsertan en la preparación:{' '}
                <b className="font-semibold">{pospuestos.length}</b> punto{pospuestos.length === 1 ? '' : 's'} pospuesto{pospuestos.length === 1 ? '' : 's'} ·{' '}
                <b className="font-semibold">{arrastreSeguimiento}</b> compromiso{arrastreSeguimiento === 1 ? '' : 's'} en seguimiento. Las vocerías reaparecen como recordatorio. El acta se arma ordenada por la pauta, con lo surgido en sala al final.
              </div>
            </div>
          </section>

          {/* Footer */}
          <footer className="flex-none bg-white border-t border-slate-200 px-5 py-3">
            <div className="max-w-3xl mx-auto flex items-center gap-2.5 flex-wrap">
              {!puedeGenerar && (
                <span className="text-[12.5px] font-medium text-amber-700 inline-flex items-center gap-1.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
                  {[puntosSinEstado.length && `${puntosSinEstado.length} punto${puntosSinEstado.length === 1 ? '' : 's'} sin estado`,
                    comprSinConfirmar.length && `${comprSinConfirmar.length} compromiso${comprSinConfirmar.length === 1 ? '' : 's'} sin confirmar`]
                    .filter(Boolean).join(' · ')}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2.5">
                <button onClick={handlePreview} disabled={preview}
                  className="text-[13px] font-bold px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  {preview ? 'Generando…' : 'Previsualizar acta'}
                </button>
                <button onClick={handleCerrar} disabled={cerrando || !puedeGenerar || !canEdit}
                  className="text-[13px] font-bold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!puedeGenerar ? 'Completa los puntos sin estado y confirma los compromisos de hoy' : 'Generar el acta y cerrar el gabinete'}>
                  {cerrando ? 'Cerrando…' : 'Generar acta y cerrar'}
                </button>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const ESTADOS: { v: NonNullable<EstadoCierre>; l: string }[] = [
  { v: 'tratado', l: 'Tratado' },
  { v: 'sin_novedades', l: 'Sin novedades' },
  { v: 'pospuesto', l: 'Pospuesto' },
  { v: 'retirado', l: 'Retirado' },
]

function EstadoSelect({ value, disabled, onChange }: {
  value: EstadoCierre
  disabled: boolean
  onChange: (v: EstadoCierre) => void
}) {
  return (
    <select value={value ?? ''} disabled={disabled}
      onChange={e => onChange((e.target.value || null) as EstadoCierre)}
      className={`flex-none text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none ${
        value ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-amber-300 text-amber-700'}`}>
      <option value="">Estado…</option>
      {ESTADOS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function Movimiento({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-[18px] h-[18px] rounded-full bg-violet-100 text-violet-700 grid place-items-center text-[11px] font-extrabold">{n}</span>
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">{children}</div>
    </div>
  )
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-3.5 text-[13px] text-slate-400 italic">{children}</p>
}

// Compromiso de hoy: chips de plazo (confirman al elegir) + Fecha… con date-picker.
function CompromisoHoyRow({ c, punto, canEdit, onConfirmar, onQuitar }: {
  c: SesionCompromiso
  punto: { n: number; titulo: string } | undefined
  canEdit: boolean
  onConfirmar: (tipo: SesionCompromiso['plazo_tipo'], plazo: string | null) => void
  onQuitar: () => void
}) {
  const [fechaOpen, setFechaOpen] = useState(false)
  const viernes = comingFriday()
  const quince = plusDays(15)
  const activo: 'semana' | 'quince' | 'fecha' | 'permanente' | 'pordef' | null =
    !c.confirmado ? null
    : c.plazo_tipo === 'permanente' ? 'permanente'
    : c.plazo_tipo === 'por_definir' ? 'pordef'
    : c.plazo === viernes ? 'semana'
    : c.plazo === quince ? 'quince'
    : 'fecha'

  const chip = (on: boolean) =>
    `text-[12px] font-semibold px-2.5 py-1 rounded-full border ${on ? 'bg-violet-600 border-violet-600 text-white' : 'bg-white border-slate-200 text-slate-500 hover:border-violet-200'}`

  return (
    <div className="group px-4 py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-start gap-2.5">
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-semibold text-slate-800">{c.descripcion}</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            {responsableLabel(c)}
            {punto && <> · Punto {punto.n}</>}
            {c.prioridad_id != null && <> · 🔗 iniciativa</>}
          </div>
        </div>
        <span className={`flex-none text-[11px] font-bold px-2 py-0.5 rounded-full ${c.confirmado ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
          {c.confirmado ? 'Confirmado' : 'Por confirmar'}
        </span>
        {canEdit && (
          <button onClick={onQuitar} className="flex-none text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 mt-0.5" title="Quitar">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
          </button>
        )}
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="text-[11px] text-slate-400 font-semibold mr-0.5">Plazo:</span>
          <button className={chip(activo === 'semana')} onClick={() => { setFechaOpen(false); onConfirmar('fecha', viernes) }}>Esta semana</button>
          <button className={chip(activo === 'quince')} onClick={() => { setFechaOpen(false); onConfirmar('fecha', quince) }}>15 días</button>
          <button className={chip(activo === 'fecha')} onClick={() => setFechaOpen(v => !v)}>
            {activo === 'fecha' && c.plazo ? `Fecha · ${fmtCorta(c.plazo)}` : 'Fecha…'}
          </button>
          {fechaOpen && (
            <input type="date" autoFocus defaultValue={activo === 'fecha' ? c.plazo ?? '' : ''}
              onChange={e => { if (e.target.value) { onConfirmar('fecha', e.target.value); setFechaOpen(false) } }}
              className="text-[12px] text-slate-700 border border-violet-300 rounded-md px-2 py-1 tabular-nums focus:outline-none" />
          )}
          <button className={chip(activo === 'permanente')} onClick={() => { setFechaOpen(false); onConfirmar('permanente', null) }}>Permanente</button>
          <button className={chip(activo === 'pordef')} onClick={() => { setFechaOpen(false); onConfirmar('por_definir', null) }}>Por definir</button>
        </div>
      )}
    </div>
  )
}

function NuevaVoceria({ onAdd }: { onAdd: (dia: string, vocero: string, tema: string) => void }) {
  const [dia, setDia] = useState(''); const [vocero, setVocero] = useState(''); const [tema, setTema] = useState('')
  const listo = dia.trim() && vocero.trim() && tema.trim()
  function agregar() { if (!listo) return; onAdd(dia, vocero, tema); setDia(''); setVocero(''); setTema('') }
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50/60">
      <input value={dia} onChange={e => setDia(e.target.value)} placeholder="Día" className="w-24 text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
      <input value={vocero} onChange={e => setVocero(e.target.value)} placeholder="Vocero" className="w-40 text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
      <input value={tema} onChange={e => setTema(e.target.value)} placeholder="Tema" onKeyDown={e => { if (e.key === 'Enter') agregar() }} className="flex-1 min-w-[150px] text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
      <button onClick={agregar} disabled={!listo} className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700">+ Vocería</button>
    </div>
  )
}
