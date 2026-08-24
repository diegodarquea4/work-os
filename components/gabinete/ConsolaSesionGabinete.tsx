'use client'

import { useMemo, useState } from 'react'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { useCurrentUserEmail } from '@/lib/context/UserContext'
import { usePautaGabinete, type PautaPunto, type PautaIniciativa } from '@/lib/hooks/usePautaGabinete'
import { useSalaGabinete, type SalaApi } from '@/lib/hooks/useSalaGabinete'
import { IniBuscador, CarteraBuscador, shortCartera } from './pickers'
import CierreGabinete from './CierreGabinete'
import AsistenciaGabinete from './AsistenciaGabinete'
import ExpandableText from './ExpandableText'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { GabineteTema } from '@/lib/types'

/**
 * CONSOLA DE SESIÓN del Gabinete Regional v2 (spec §7 Fase 2 — mockups v5).
 * Superficie a pantalla completa para conducir la sesión EN SALA, en el mismo
 * lenguaje que Preparación: rail de la pauta a la izquierda + tarjeta del punto
 * activo a la derecha (relato / intervenciones por cartera / iniciativas /
 * compromisos que cuelgan del punto / estado). Reusa usePautaGabinete (los
 * puntos) + useSalaGabinete (lo que se registra en sala) + los buscadores
 * flotantes de ./pickers. "Terminar gabinete →" abre el CIERRE en 4 movimientos
 * (fase='cierre') — overlay que continúa la consola sin desmontarla.
 */

const ESTADOS: { v: NonNullable<GabineteTema['estado_cierre']>; l: string }[] = [
  { v: 'tratado', l: 'Tratado' },
  { v: 'sin_novedades', l: 'Sin novedades' },
  { v: 'pospuesto', l: 'Pospuesto' },
  { v: 'retirado', l: 'Retirado' },
]

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function iniDesdeProyecto(p: Iniciativa): PautaIniciativa {
  return { prioridad_id: p.id, nombre: p.nombre, pctAvance: p.es_desalojo ? null : p.pct_avance, semaforo: p.estado_semaforo, es_desalojo: p.es_desalojo }
}

type Props = {
  region: Region
  gabineteNombre: string
  sesionId: number
  fecha: string
  numeroLabel: string
  projects: Iniciativa[]
  canEdit: boolean
  onOpenIniciativa: (p: Iniciativa) => void
  onClose: () => void
}

export default function ConsolaSesionGabinete(props: Props) {
  const { region, gabineteNombre, sesionId, fecha, numeroLabel, projects, canEdit, onOpenIniciativa, onClose } = props
  const email = useCurrentUserEmail()
  const pauta = usePautaGabinete({ regionCod: region.cod, sesionId, enabled: true })
  const sala = useSalaGabinete({ sesionId, regionCod: region.cod, email, enabled: true })

  const [fase, setFase] = useState<'sala' | 'cierre'>('sala')
  const [asistOpen, setAsistOpen] = useState(false)
  const [active, setActive] = useState<number | 'vocerias'>(0)
  // active numérico = id del punto; 0 hasta que carga → se resuelve al primero.
  const puntoActivo = useMemo<PautaPunto | null>(() => {
    if (active === 'vocerias') return null
    return pauta.pauta.find(p => p.id === active) ?? pauta.pauta[0] ?? null
  }, [active, pauta.pauta])

  async function agregarPunto() {
    const creado = await pauta.addPunto({ titulo: 'Punto surgido en sala', origen: 'en_sala' })
    if (creado) setActive(creado.id)
  }

  return (
    <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-none flex-wrap">
        <span className="text-[14.5px] font-bold text-slate-900">
          {gabineteNombre} <span className="font-medium text-slate-400">· {numeroLabel} · {fecha}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> En sesión
        </span>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setAsistOpen(true)} title="Tomar / corregir asistencia"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full hover:border-violet-300 hover:text-violet-700">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Asistencia {sala.asistencia.presentes}/{sala.asistencia.total}
          </button>
          {canEdit && (
            <button onClick={() => setFase('cierre')}
              className="text-[12.5px] font-semibold text-violet-700 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-lg hover:bg-violet-100">
              Terminar gabinete
            </button>
          )}
          <button onClick={onClose} title="Cerrar consola" className="text-slate-400 hover:text-slate-700 p-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </header>

      {/* Body: rail + main */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-[270px_1fr] min-h-0">
        {/* Rail */}
        <aside className="border-r border-slate-200 bg-white flex flex-col min-h-0">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 px-4 pt-4 pb-2">Pauta — clic para saltar</div>
          <div className="flex-1 overflow-y-auto px-2">
            {pauta.loading && <p className="text-xs text-slate-400 italic px-2 py-4">Cargando la pauta…</p>}
            {!pauta.loading && pauta.pauta.length === 0 && (
              <p className="text-xs text-slate-400 italic px-2 py-4">Esta sesión no tiene puntos. Ármalos en Preparación o agrega uno en sala.</p>
            )}
            {pauta.pauta.map((p, i) => {
              const activo = puntoActivo?.id === p.id && active !== 'vocerias'
              const tieneActividad = (sala.compromisos.some(c => c.tema_id === p.id)) || !!sala.relatos[p.id] || sala.intervs.some(iv => iv.tema_id === p.id)
              const nuevo = p.origen === 'en_sala'
              return (
                <button key={p.id} onClick={() => setActive(p.id)}
                  className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 mb-0.5 transition-colors ${
                    activo ? 'bg-violet-600 text-white' : 'hover:bg-slate-50 text-slate-700'} ${nuevo ? 'border border-dashed border-violet-200' : ''}`}>
                  <span className={`w-[22px] h-[22px] flex-none rounded-full grid place-items-center text-[12px] font-bold tabular-nums ${
                    activo ? 'bg-white/25 text-white' : 'bg-slate-50 border border-slate-200 text-slate-500'}`}>{i + 1}</span>
                  <span className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="flex-1 min-w-0 font-semibold truncate">{p.titulo || p.texto || '(sin título)'}</span>
                    {nuevo && <span className={`text-[9.5px] font-extrabold uppercase px-1.5 rounded-full ${activo ? 'bg-white/25' : 'bg-violet-100 text-violet-700'}`}>Nuevo</span>}
                    {!nuevo && p.carteras[0] && <span className={`text-[11px] flex-none ${activo ? 'text-white/80' : 'text-slate-400'}`}>{shortCartera(p.carteras[0])}</span>}
                    {p.estado_cierre ? <span className={`flex-none font-extrabold ${activo ? 'text-white' : 'text-green-600'}`}>✓</span>
                      : tieneActividad ? <span className={`w-1.5 h-1.5 rounded-full flex-none ${activo ? 'bg-white' : 'bg-violet-500'}`} /> : null}
                  </span>
                </button>
              )
            })}
            {/* Vocerías */}
            <button onClick={() => setActive('vocerias')}
              className={`w-full flex items-center gap-2.5 text-left rounded-lg px-2.5 py-2 mt-1 transition-colors ${
                active === 'vocerias' ? 'bg-violet-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}>
              <span className={`w-[22px] h-[22px] flex-none rounded-full grid place-items-center ${active === 'vocerias' ? 'bg-white/25' : 'bg-slate-50 border border-slate-200'}`}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-5v12L3 14v-3zM11.6 16.8a3 3 0 0 1-5.8-1.6"/></svg>
              </span>
              <span className="flex-1 font-semibold">Vocerías de la semana</span>
              {sala.vocerias.length > 0 && <span className={`text-[11px] ${active === 'vocerias' ? 'text-white/80' : 'text-slate-400'}`}>{sala.vocerias.length}</span>}
            </button>
          </div>
          {canEdit && (
            <div className="p-2.5 border-t border-slate-100 flex-none">
              <button onClick={agregarPunto}
                className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300 rounded-lg text-slate-500 text-[13px] font-semibold hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/60">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Agregar punto
              </button>
            </div>
          )}
        </aside>

        {/* Main */}
        <section className="overflow-y-auto p-5 md:p-6">
          <div className="max-w-3xl mx-auto">
            {active === 'vocerias'
              ? <VoceriasPanel sala={sala} canEdit={canEdit} />
              : puntoActivo
                ? <PuntoPanel key={puntoActivo.id} punto={puntoActivo} idx={pauta.pauta.findIndex(p => p.id === puntoActivo.id)}
                    pauta={pauta} sala={sala} projects={projects} canEdit={canEdit} onOpenIniciativa={onOpenIniciativa}
                    onDelete={async () => {
                      const next = pauta.pauta.find(p => p.id !== puntoActivo.id)?.id ?? 0
                      await pauta.removePunto(puntoActivo.id)
                      setActive(next)
                    }} />
                : <p className="text-sm text-slate-400 italic text-center py-16">Elige un punto de la pauta a la izquierda.</p>}

            <div className="mt-4 flex gap-2.5 items-start px-3.5 py-3 rounded-xl bg-violet-50 text-violet-800 text-[13px] leading-snug">
              <svg className="flex-none mt-0.5" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
              <span>El relato, las intervenciones y los compromisos cuelgan del punto. Al <b className="font-semibold">Terminar gabinete</b>, el acta se arma sola en este orden.</span>
            </div>
          </div>
        </section>
      </div>

      {/* Cierre en 4 movimientos — overlay que continúa la consola sin desmontarla */}
      {fase === 'cierre' && (
        <CierreGabinete
          gabineteNombre={gabineteNombre}
          sesionId={sesionId}
          fecha={fecha}
          numeroLabel={numeroLabel}
          pauta={pauta}
          sala={sala}
          canEdit={canEdit}
          onVolver={() => setFase('sala')}
          onCerrada={onClose}
        />
      )}

      {/* Asistencia — modal desde el pill del header (sala o cierre) */}
      {asistOpen && <AsistenciaGabinete sala={sala} canEdit={canEdit} onClose={() => setAsistOpen(false)} />}
    </div>
  )
}

// ── Panel del punto activo ─────────────────────────────────────────────────────

function PuntoPanel({ punto, idx, pauta, sala, projects, canEdit, onOpenIniciativa, onDelete }: {
  punto: PautaPunto; idx: number
  pauta: ReturnType<typeof usePautaGabinete>; sala: SalaApi
  projects: Iniciativa[]; canEdit: boolean; onOpenIniciativa: (p: Iniciativa) => void
  onDelete: () => void
}) {
  const [addInterv, setAddInterv] = useState(false)
  const [ivCartera, setIvCartera] = useState('')
  const [ivTexto, setIvTexto] = useState('')
  const [compOpen, setCompOpen] = useState(false)
  const [cDesc, setCDesc] = useState('')
  const [cResp, setCResp] = useState(punto.carteras[0] ?? '')
  const [cPlazo, setCPlazo] = useState('')

  const misInterv = sala.intervs.filter(i => i.tema_id === punto.id)
  const misComp = sala.compromisos.filter(c => c.tema_id === punto.id)
  const iniDisp = useMemo(() => projects.filter(p => !punto.iniciativas.some(i => i.prioridad_id === p.id)), [projects, punto.iniciativas])
  const projById = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects])

  function guardarInterv() {
    if (!ivCartera || !ivTexto.trim()) return
    sala.agregarInterv(punto.id, ivCartera, ivTexto)
    setIvCartera(''); setIvTexto(''); setAddInterv(false)
  }
  function guardarComp() {
    if (!cDesc.trim() || !cResp) return
    sala.agregarCompromiso(punto.id, { descripcion: cDesc, institucion: cResp, plazo: cPlazo || null })
    setCDesc(''); setCPlazo(''); setCompOpen(false)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      {/* Head */}
      <div className="flex items-start gap-3">
        <span className="w-[30px] h-[30px] flex-none rounded-full bg-violet-600 text-white grid place-items-center text-[14.5px] font-extrabold tabular-nums">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {punto.carteras.map(c => (
              <span key={c} className="inline-flex items-center gap-1 text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-800">
                {shortCartera(c)}
                {canEdit && (
                  <button onClick={() => pauta.quitarCartera(punto.id, c)} className="text-violet-400 hover:text-violet-700" title="Quitar cartera">
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                  </button>
                )}
              </span>
            ))}
            {canEdit && <CarteraBuscador yaElegidas={punto.carteras} onPick={inst => pauta.agregarCartera(punto.id, inst)} />}
          </div>
          {canEdit ? (
            <textarea defaultValue={punto.titulo ?? punto.texto ?? ''} rows={1} ref={autoGrow} onInput={e => autoGrow(e.currentTarget)}
              onBlur={e => { const v = e.target.value.trim(); if (v !== (punto.titulo ?? '')) pauta.updatePunto(punto.id, { titulo: v }) }}
              className="w-full text-[18px] font-extrabold text-slate-900 leading-tight resize-none overflow-hidden bg-transparent focus:outline-none border-b border-transparent focus:border-violet-300 placeholder:text-slate-300"
              placeholder="Título del punto…" />
          ) : <h2 className="text-[18px] font-extrabold text-slate-900 leading-tight">{punto.titulo || punto.texto || '(sin título)'}</h2>}
        </div>
        {canEdit && (
          <div className="flex-none flex items-center gap-1.5">
            {punto.origen === 'en_sala' && (
              <button onClick={() => { if (confirm('¿Borrar este punto? Se pierde lo escrito en él.')) onDelete() }} title="Borrar punto"
                className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-50">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
              </button>
            )}
            <select value={punto.estado_cierre ?? ''} onChange={e => pauta.updatePunto(punto.id, { estado_cierre: (e.target.value || null) as GabineteTema['estado_cierre'] })}
              className={`text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border focus:outline-none ${
                punto.estado_cierre ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-slate-200 text-slate-500'}`}
              title="Estado del punto (aparece en el acta)">
              <option value="">Estado…</option>
              {ESTADOS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Contexto — mismo campo y lenguaje que en Preparación (converse) */}
      {(punto.proposito || canEdit) && (
        <div className="mt-4 rounded-lg px-3 py-2 bg-slate-50 border border-slate-200">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contexto</div>
          {canEdit ? (
            <ExpandableText value={punto.proposito ?? ''} minRows={1} titulo="Contexto"
              onCommit={t => { const v = t.trim(); if (v !== (punto.proposito ?? '')) pauta.updatePunto(punto.id, { proposito: v || null }) }}
              placeholder="Más info sobre el punto, si corresponde (opcional)"
              className="w-full mt-0.5 pr-7 text-[13.5px] text-slate-800 leading-snug resize-none overflow-hidden bg-transparent focus:outline-none placeholder:text-slate-400" />
          ) : <p className="mt-0.5 text-[13.5px] text-slate-800 leading-snug">{punto.proposito}</p>}
        </div>
      )}

      {/* Relato */}
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">Relato del punto</div>
      <ExpandableText value={sala.relatos[punto.id]?.texto ?? ''} minRows={2} disabled={!canEdit} titulo="Relato del punto"
        onCommit={t => sala.commitRelato(punto.id, t)}
        placeholder="Qué se planteó, qué se acordó…"
        className="w-full px-3 py-2.5 pr-9 border border-slate-200 rounded-lg text-[14px] text-slate-900 leading-relaxed resize-none overflow-hidden focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 placeholder:text-slate-400" />

      {/* Intervenciones */}
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">Intervenciones</div>
      <div>
        {misInterv.map(iv => (
          <div key={iv.id} className="group flex items-start gap-2.5 py-2 border-b border-slate-50 last:border-0">
            <span className="flex-none text-[11px] font-bold uppercase text-violet-800 bg-violet-50 rounded px-2 py-0.5 leading-snug w-[104px] text-center">{shortCartera(iv.institucion ?? '')}</span>
            {canEdit ? (
              <ExpandableText value={iv.texto} minRows={1} titulo={`Intervención · ${shortCartera(iv.institucion ?? '')}`}
                wrapperClassName="relative flex-1 min-w-0" onCommit={t => sala.editarInterv(iv.id, t)}
                className="w-full pr-8 text-[14px] text-slate-700 border border-slate-200 rounded-md px-2 py-1 resize-none overflow-hidden focus:outline-none focus:border-violet-400" />
            ) : <p className="flex-1 text-[14px] text-slate-700 pt-1">{iv.texto}</p>}
            {canEdit && (
              <button onClick={() => sala.quitarInterv(iv.id)} className="flex-none text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 mt-1" title="Quitar">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (addInterv ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 bg-slate-50 rounded-lg p-2.5">
          {ivCartera
            ? <span className="text-[11px] font-bold uppercase text-violet-800 bg-violet-100 rounded px-2 py-1">{shortCartera(ivCartera)}</span>
            : <CarteraBuscador yaElegidas={[]} onPick={setIvCartera} label="Elegir cartera" />}
          <input value={ivTexto} onChange={e => setIvTexto(e.target.value)} placeholder="Qué planteó…"
            onKeyDown={e => { if (e.key === 'Enter') guardarInterv() }}
            className="flex-1 min-w-[180px] text-[13px] text-slate-900 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
          <button onClick={guardarInterv} disabled={!ivCartera || !ivTexto.trim()} className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700">Agregar</button>
          <button onClick={() => { setAddInterv(false); setIvCartera(''); setIvTexto('') }} className="text-[12px] font-semibold px-2 py-1.5 text-slate-500 hover:text-slate-700">Cancelar</button>
        </div>
      ) : (
        <button onClick={() => setAddInterv(true)} className="mt-2 text-[13px] font-semibold text-violet-700 hover:text-violet-900">+ Intervención de cartera</button>
      ))}

      {/* Iniciativas vinculadas */}
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-slate-400 mt-5 mb-1.5">Iniciativas vinculadas</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {punto.iniciativas.map(ini => {
          const sem = SEMAFORO_CONFIG[(ini.semaforo ?? 'gris') as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
          return (
            <span key={ini.prioridad_id} className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden shadow-sm">
              <button onClick={() => { const p = projById.get(ini.prioridad_id); if (p) onOpenIniciativa(p) }} title="Abrir la ficha"
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-2 py-1 text-slate-700 hover:bg-violet-50 hover:text-violet-800">
                <span className={`w-1.5 h-1.5 rounded-full flex-none ${sem.dot}`} />
                <span className="truncate max-w-[240px]">{ini.nombre}</span>
                {ini.pctAvance != null && <span className="text-violet-700 font-bold tabular-nums">{Math.round(ini.pctAvance)}%</span>}
              </button>
              {canEdit && (
                <button onClick={() => pauta.quitarIniciativa(punto.id, ini.prioridad_id)} title="Desvincular"
                  className="flex-none px-1.5 py-1 border-l border-slate-100 text-slate-300 hover:text-red-500 hover:bg-red-50">
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                </button>
              )}
            </span>
          )
        })}
        {canEdit && iniDisp.length > 0 && (
          <IniBuscador disponibles={iniDisp} onPick={p => pauta.agregarIniciativa(punto.id, iniDesdeProyecto(p))} />
        )}
      </div>

      {/* Compromisos del punto */}
      <div className="flex items-center gap-2 mt-6 pt-4 border-t border-slate-100">
        {canEdit && (
          <button onClick={() => { setCResp(punto.carteras[0] ?? ''); setCompOpen(v => !v) }}
            className="text-[13px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-violet-700 hover:bg-violet-50 hover:border-violet-200">
            + Agregar compromiso
          </button>
        )}
        <span className="ml-auto text-[12px] text-slate-400">{misComp.length} compromiso{misComp.length === 1 ? '' : 's'} en este punto</span>
      </div>
      {compOpen && canEdit && (
        <div className="mt-2.5 rounded-lg bg-violet-50 border border-violet-100 p-3 flex flex-wrap items-center gap-2">
          <input value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Compromiso: qué hará la cartera…"
            onKeyDown={e => { if (e.key === 'Enter') guardarComp() }}
            className="flex-1 min-w-[240px] text-[13px] text-slate-900 border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
          {cResp
            ? <span className="text-[11.5px] font-bold uppercase text-violet-800 bg-violet-100 rounded px-2 py-1 inline-flex items-center gap-1">{shortCartera(cResp)}
                <button onClick={() => setCResp('')} className="text-violet-500 hover:text-violet-800"><svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg></button></span>
            : <CarteraBuscador yaElegidas={[]} onPick={setCResp} label="Responsable" />}
          <input type="date" value={cPlazo} onChange={e => setCPlazo(e.target.value)}
            className="text-[13px] text-slate-700 border border-slate-200 rounded-md px-2 py-1.5 tabular-nums focus:outline-none focus:border-violet-400" />
          <button onClick={guardarComp} disabled={!cDesc.trim() || !cResp} className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700">Registrar</button>
          <button onClick={() => setCompOpen(false)} className="text-[12px] font-semibold px-2 py-1.5 text-slate-500 hover:text-slate-700">Cancelar</button>
        </div>
      )}
      {misComp.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {misComp.map(c => (
            <span key={c.id} className="group inline-flex items-center gap-2 text-[12.5px] font-medium text-violet-900 bg-violet-50 border border-violet-100 px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 flex-none" />
              {c.descripcion}
              <span className="text-violet-400">· {c.responsable_todas ? 'Todas' : shortCartera(c.responsable_institucion ?? '')}{c.confirmado && c.plazo ? ` · ${c.plazo}` : ''}</span>
              {!c.confirmado && <span className="text-[10.5px] font-semibold text-slate-400 italic">por confirmar</span>}
              {canEdit && (
                <button onClick={() => sala.quitarCompromiso(c.id)} className="text-violet-300 hover:text-red-500 opacity-0 group-hover:opacity-100" title="Quitar">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Vocerías de la semana ──────────────────────────────────────────────────────

function VoceriasPanel({ sala, canEdit }: { sala: SalaApi; canEdit: boolean }) {
  const [dia, setDia] = useState(''); const [vocero, setVocero] = useState(''); const [tema, setTema] = useState('')
  function agregar() {
    if (!dia.trim() || !vocero.trim() || !tema.trim()) return
    sala.agregarVoceria(dia, vocero, tema); setDia(''); setVocero(''); setTema('')
  }
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <h2 className="text-[16px] font-extrabold text-slate-900 mb-1">Vocerías de la semana</h2>
      <p className="text-[13px] text-slate-500 mb-4">Día · vocero · tema. Salen en el acta y se recuerdan al preparar la próxima sesión.</p>
      {sala.vocerias.map(v => (
        <div key={v.id} className="group flex items-center gap-3 py-2.5 border-b border-slate-50 last:border-0 text-[14px]">
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
      {sala.vocerias.length === 0 && <p className="text-[13px] text-slate-400 italic py-2">Sin vocerías registradas.</p>}
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input value={dia} onChange={e => setDia(e.target.value)} placeholder="Día" className="w-28 text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
          <input value={vocero} onChange={e => setVocero(e.target.value)} placeholder="Vocero" className="w-44 text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
          <input value={tema} onChange={e => setTema(e.target.value)} placeholder="Tema" onKeyDown={e => { if (e.key === 'Enter') agregar() }} className="flex-1 min-w-[160px] text-[13px] border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400" />
          <button onClick={agregar} disabled={!dia.trim() || !vocero.trim() || !tema.trim()} className="text-[12px] font-bold px-3 py-1.5 rounded-md bg-violet-600 text-white disabled:opacity-40 hover:bg-violet-700">+ Vocería</button>
        </div>
      )}
    </div>
  )
}
