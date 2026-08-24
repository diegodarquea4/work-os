'use client'

import { useState } from 'react'
import { CARTERAS_GABINETE, ACTORES_GABINETE_NO_SEREMI, TODAS_CARTERAS } from '@/lib/cartera'
import { SEMAFORO_CONFIG } from '@/lib/config'
import type { Iniciativa } from '@/lib/projects'
import type { SesionCompromiso } from '@/lib/types'
import type { NuevoPunto, PautaIniciativa } from '@/lib/hooks/usePautaGabinete'
import type { Pendientes, PendienteCompromiso, CompromisoPatch } from '@/lib/hooks/usePendientesGabinete'

/**
 * Paso 1 del stepper (Gabinete v2): TRIAGE de arrastres. Cada ítem se promueve
 * a un punto de la pauta con un botón. Los compromisos se editan en línea
 * (título, responsable, plazo, estado) o se sacan (x); las plantillas
 * recurrentes se crean con el mismo formato que un punto (título + contexto).
 */

const SEREMIS_GABINETE = CARTERAS_GABINETE.filter(c => !ACTORES_GABINETE_NO_SEREMI.includes(c))
const shortCartera = (c: string) => c.replace(/^Ministerio (de las |de la |de los |del |de )/, '')

type Props = {
  pendientes: Pendientes
  loading: boolean
  canOperar: boolean
  promovidos: Set<string>
  projects: Iniciativa[]
  onPromover: (key: string, punto: NuevoPunto) => void
  onDeleteCompromiso: (id: number) => void
  onEditarCompromiso: (id: number, patch: CompromisoPatch) => void
  onAgregarRecurrente: (input: { titulo: string; proposito?: string | null }) => void
  onBorrarRecurrente: (id: number) => void
  onOpenIniciativa: (prioridadId: number) => void
  onQuitarFoco: (prioridadId: number) => void
}

function iniDesdeProyecto(p: Iniciativa): PautaIniciativa {
  return { prioridad_id: p.id, nombre: p.nombre, pctAvance: p.es_desalojo ? null : p.pct_avance, semaforo: p.estado_semaforo, es_desalojo: p.es_desalojo }
}

export default function PasoPendientes({
  pendientes, loading, canOperar, promovidos, projects,
  onPromover, onDeleteCompromiso, onEditarCompromiso, onAgregarRecurrente, onBorrarRecurrente,
  onOpenIniciativa, onQuitarFoco,
}: Props) {
  const { compromisos, recurrentes, temas, foco } = pendientes
  const [agregandoRec, setAgregandoRec] = useState(false)
  const projById = new Map(projects.map(p => [p.id, p]))
  const vacio = !loading && compromisos.length === 0 && temas.length === 0 && foco.length === 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_.95fr] gap-5 items-start">
      {/* Columna principal — scrollea sola para no empujar el footer */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden max-h-[calc(100vh-400px)] min-h-[220px]">
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 flex-none">
          <h3 className="text-[15px] font-bold text-slate-900">Lo que quedó abierto</h3>
          <span className="text-xs text-slate-400">suma lo que se trata esta semana</span>
        </div>
        <div className="p-2.5 overflow-y-auto">
          {loading && <p className="text-sm text-slate-400 italic px-2 py-6 text-center">Cargando…</p>}
          {vacio && <p className="text-sm text-slate-400 italic px-2 py-6 text-center">Nada pendiente que arrastrar. Arma la pauta directo en el paso 2.</p>}

          <Grupo label="Compromisos por verificar" n={compromisos.length}>
            {compromisos.map(c => {
              const proj = c.prioridadId != null ? projById.get(c.prioridadId) : undefined
              return (
                <CompromisoFila key={c.key} c={c} canOperar={canOperar} promovido={promovidos.has(c.key)}
                  onAdd={() => onPromover(c.key, {
                    titulo: c.titulo,
                    carteras: c.cartera ? [c.cartera] : [],
                    iniciativas: proj ? [iniDesdeProyecto(proj)] : [],
                    origen: 'pospuesto',
                  })}
                  onDelete={() => { if (confirm('¿Sacar este compromiso de pendientes? Deja de hacérsele seguimiento.')) onDeleteCompromiso(c.id) }}
                  onEditar={patch => onEditarCompromiso(c.id, patch)}
                />
              )
            })}
          </Grupo>

          <Grupo label="Temas anotados" n={temas.length}>
            {temas.map(t => (
              <Fila key={t.key} promovido={promovidos.has(t.key)} canOperar={canOperar}
                onAdd={() => onPromover(t.key, { titulo: t.titulo, origen: 'legado' })}
                titulo={t.titulo} metas={[{ chip: 'anotado' }]} />
            ))}
          </Grupo>

          <Grupo label="Iniciativas en foco (del Tablero)" n={foco.length}>
            {foco.map(f => {
              const sem = SEMAFORO_CONFIG[(f.semaforo ?? 'gris') as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
              const proj = projById.get(f.prioridadId)
              return (
                <Fila key={f.key} promovido={promovidos.has(f.key)} canOperar={canOperar}
                  onAdd={() => onPromover(f.key, {
                    titulo: f.nombre,
                    iniciativas: proj ? [iniDesdeProyecto(proj)] : [],
                    origen: 'sugerido',
                  })}
                  onClickContent={() => onOpenIniciativa(f.prioridadId)}
                  clickHint="Ver la ficha de la iniciativa"
                  onDelete={() => onQuitarFoco(f.prioridadId)}
                  deleteTitle="Quitar de «En foco»"
                  titulo={f.nombre}
                  metas={[{ sem: f.semaforo === 'verde' ? 'verde' : f.semaforo === 'rojo' ? 'rojo' : f.semaforo === 'gris' ? 'gris' : 'ambar',
                            label: `${sem.label}${f.pctAvance != null ? ` · ${Math.round(f.pctAvance)}%` : ''}` }]} />
              )
            })}
          </Grupo>
        </div>
      </div>

      {/* Aside: recurrentes + info */}
      <div className="space-y-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
            <h3 className="text-[15px] font-bold text-slate-900">Recurrentes</h3>
            <span className="text-xs text-slate-400">plantillas</span>
          </div>
          <div className="p-2.5">
            {recurrentes.length === 0 && !agregandoRec && (
              <p className="text-sm text-slate-400 italic px-2 py-3">Sin plantillas. Creá los puntos que se repiten cada sesión (PSG, probidad, agenda de visitas…).</p>
            )}
            {recurrentes.map(r => (
              <Fila key={r.key} promovido={promovidos.has(r.key)} canOperar={canOperar}
                onAdd={() => onPromover(r.key, { titulo: r.titulo, detalle: r.detalle, proposito: r.proposito, origen: 'recurrente', recurrente_id: r.recurrenteId })}
                onDelete={() => { if (confirm('¿Quitar esta plantilla recurrente?')) onBorrarRecurrente(r.recurrenteId) }}
                titulo={r.titulo} metas={[{ chip: 'cada sesión' }]} addLabel="Incluir" />
            ))}

            {canOperar && (agregandoRec ? (
              <NuevaRecurrente
                onGuardar={(titulo, contexto) => { onAgregarRecurrente({ titulo, proposito: contexto }); setAgregandoRec(false) }}
                onCancel={() => setAgregandoRec(false)}
              />
            ) : (
              <button onClick={() => setAgregandoRec(true)}
                className="mt-1 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-slate-400 text-[13px] font-semibold hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50/60 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Nueva plantilla
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2.5 items-start px-3.5 py-3 rounded-xl bg-violet-50 text-violet-800 text-[13px] leading-snug">
          <svg className="flex-none mt-0.5" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          <span>Lo que sumás acá aparece como punto en la <b className="font-semibold">Pauta</b>, listo para asignarle cartera, contexto y minutos.</span>
        </div>
      </div>
    </div>
  )
}

// ── Compromiso: fila display + editor inline completo ──────────────────────────

function CompromisoFila({ c, canOperar, promovido, onAdd, onDelete, onEditar }: {
  c: PendienteCompromiso; canOperar: boolean; promovido: boolean
  onAdd: () => void; onDelete: () => void; onEditar: (patch: CompromisoPatch) => void
}) {
  const [editando, setEditando] = useState(false)
  if (canOperar && editando) {
    return <CompromisoEditor c={c} onGuardar={patch => { onEditar(patch); setEditando(false) }} onCancel={() => setEditando(false)} />
  }
  return (
    <Fila titulo={c.titulo} promovido={promovido} canOperar={canOperar}
      onAdd={onAdd} onDelete={onDelete} onClickContent={() => setEditando(true)}
      metas={[
        c.cartera ? { chip: c.cartera } : null,
        c.plazo ? { chip: `plazo ${c.plazo}` } : null,
        c.escalado ? { chip: 'escalado de comité' } : null,
        { sem: c.estado === 'en_curso' ? 'verde' : 'ambar', label: c.estado === 'en_curso' ? 'En curso' : 'Pendiente' },
      ]} />
  )
}

const inputCls = 'w-full text-[13px] text-slate-800 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-violet-400'

function CompromisoEditor({ c, onGuardar, onCancel }: {
  c: PendienteCompromiso; onGuardar: (patch: CompromisoPatch) => void; onCancel: () => void
}) {
  const [descripcion, setDescripcion] = useState(c.titulo)
  const [responsable, setResponsable] = useState(c.cartera ?? '')
  const [plazo, setPlazo] = useState(c.plazo ?? '')
  const [estado, setEstado] = useState<SesionCompromiso['estado']>(c.estado)
  const puede = descripcion.trim().length > 0
  const guardar = () => {
    if (!puede) return
    const todas = responsable === TODAS_CARTERAS
    onGuardar({
      descripcion,
      responsableTodas: todas,
      responsableInstitucion: todas || !responsable ? null : responsable,
      plazo: plazo || null,
      estado,
    })
  }
  return (
    <div className="my-1 rounded-xl border border-violet-200 bg-violet-50/40 p-3 space-y-2.5">
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Descripción</label>
        <textarea autoFocus value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          placeholder="Descripción del compromiso" className={`${inputCls} resize-none`} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Responsable</label>
          <select value={responsable} onChange={e => setResponsable(e.target.value)} className={inputCls}>
            <option value="">Sin responsable</option>
            <option value={TODAS_CARTERAS}>Todas las carteras</option>
            <optgroup label="SEREMIs">{SEREMIS_GABINETE.map(x => <option key={x} value={x}>{shortCartera(x)}</option>)}</optgroup>
            <optgroup label="Otros actores">{ACTORES_GABINETE_NO_SEREMI.map(x => <option key={x} value={x}>{x}</option>)}</optgroup>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Plazo</label>
          <input type="date" value={plazo} onChange={e => setPlazo(e.target.value)} className={`${inputCls} tabular-nums`} />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1">Estado</label>
          <select value={estado} onChange={e => setEstado(e.target.value as SesionCompromiso['estado'])} className={inputCls}>
            <option value="pendiente">Pendiente</option>
            <option value="en_curso">En curso</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="text-[12px] font-semibold px-3 py-1.5 rounded-md text-slate-500 hover:bg-slate-100">Cancelar</button>
        <button onClick={guardar} disabled={!puede}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}

// ── Recurrente: mismo formato que un punto (título + contexto) ─────────────────

function NuevaRecurrente({ onGuardar, onCancel }: { onGuardar: (titulo: string, contexto: string) => void; onCancel: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [contexto, setContexto] = useState('')
  const puede = titulo.trim().length > 0
  const guardar = () => { if (puede) onGuardar(titulo, contexto) }
  return (
    <div className="mt-1 rounded-xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="px-3 pt-2.5 pb-1.5">
        <input autoFocus value={titulo} onChange={e => setTitulo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') onCancel() }}
          placeholder="Título de la plantilla (ej. Estado PSG)"
          className="w-full text-[14px] font-bold text-slate-900 bg-transparent focus:outline-none placeholder:text-slate-300 placeholder:font-normal" />
      </div>
      <div className="mx-3 mb-2.5 rounded-lg px-3 py-2 bg-slate-50 border border-slate-200">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Contexto</div>
        <textarea value={contexto} onChange={e => setContexto(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Escape') onCancel() }}
          placeholder="Más info sobre el punto, si corresponde (opcional)"
          className="w-full mt-0.5 text-[13px] text-slate-800 leading-snug resize-none bg-transparent focus:outline-none placeholder:text-slate-400" />
      </div>
      <div className="flex justify-end gap-2 px-3 pb-2.5">
        <button onClick={onCancel} className="text-[12px] font-semibold px-2.5 py-1 rounded-md text-slate-500 hover:bg-slate-100">Cancelar</button>
        <button onClick={guardar} disabled={!puede}
          className="text-[12px] font-semibold px-2.5 py-1 rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">Guardar</button>
      </div>
    </div>
  )
}

function Grupo({ label, n, children }: { label: string; n: number; children: React.ReactNode }) {
  if (n === 0) return null
  return (
    <>
      <div className="flex items-center gap-2 px-2.5 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        {label}
        <span className="bg-slate-50 border border-slate-200 rounded-full px-1.5 text-[10.5px] text-slate-500">{n}</span>
      </div>
      {children}
    </>
  )
}

type Meta = { chip?: string; sem?: 'verde' | 'ambar' | 'rojo' | 'gris'; label?: string } | null

function Fila({ titulo, metas, promovido, canOperar, onAdd, onDelete, onClickContent, addLabel = 'A la pauta', clickHint = 'Click para editar', deleteTitle = 'Sacar de pendientes' }: {
  titulo: string; metas: Meta[]; promovido: boolean; canOperar: boolean
  onAdd: () => void; onDelete?: () => void; onClickContent?: () => void; addLabel?: string
  clickHint?: string; deleteTitle?: string
}) {
  const clickable = canOperar && !!onClickContent
  return (
    <div className="group flex items-start gap-2.5 px-2.5 py-2 rounded-lg hover:bg-slate-50">
      <button type="button" disabled={!clickable} onClick={onClickContent}
        title={clickable ? clickHint : undefined}
        className={`flex-1 min-w-0 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}>
        <div className={`text-[14px] font-medium text-slate-800 leading-snug ${clickable ? 'group-hover:text-violet-800' : ''}`}>{titulo}</div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1">
          {metas.filter(Boolean).map((m, i) => {
            const meta = m as NonNullable<Meta>
            if (meta.sem) {
              const dot = SEMAFORO_CONFIG[meta.sem].dot
              return <span key={i} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600"><span className={`w-2 h-2 rounded-full ${dot}`} />{meta.label}</span>
            }
            return <span key={i} className="inline-flex items-center text-[11.5px] font-semibold px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500">{meta.chip}</span>
          })}
        </div>
      </button>
      {canOperar && (
        <div className="flex items-center gap-1 flex-none mt-0.5">
          <button onClick={onAdd} disabled={promovido}
            className={`text-[12.5px] font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
              promovido ? 'bg-violet-600 text-white border-violet-600 cursor-default'
                        : 'bg-white text-violet-700 border-slate-200 hover:bg-violet-50 hover:border-violet-200'}`}>
            {promovido ? '✓ En la pauta' : `+ ${addLabel}`}
          </button>
          {onDelete && (
            <button onClick={onDelete} title={deleteTitle}
              className="text-slate-300 hover:text-red-500 p-1 rounded-md transition-colors">
              <svg width="13" height="13" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
