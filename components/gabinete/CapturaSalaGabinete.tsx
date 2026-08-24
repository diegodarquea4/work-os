'use client'

import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { useCurrentUserEmail } from '@/lib/context/UserContext'
import { CARTERAS_GABINETE, ACTORES_GABINETE_NO_SEREMI, normalizeCarteraGabinete } from '@/lib/cartera'
import type { GabineteTema, SesionIntervencion, SesionVoceria } from '@/lib/types'

/**
 * Captura EN SALA del Gabinete v2 (spec v2 · PR-3). Se monta dentro de
 * SesionModal cuando la sesión es de gabinete formato_acta=2, en reemplazo de la
 * zona 4 "apuntes por institución" del v1. Recorre los puntos de la pauta
 * (gabinete_temas de la sesión) y, bajo cada uno, permite escribir el RELATO
 * general (sesion_intervenciones institucion NULL) y las INTERVENCIONES por
 * cartera (institucion != NULL). Abajo, las VOCERÍAS de la semana.
 *
 * Autocontenido: carga puntos + intervenciones + vocerías por sesion_id y
 * escribe con el patrón defensivo safeWrite/safeDelete. Los compromisos ligados
 * a cada punto se capturan en la zona de Compromisos de SesionModal (selector de
 * tema); acá va la narración.
 */

const SEREMIS = CARTERAS_GABINETE.filter(c => !ACTORES_GABINETE_NO_SEREMI.includes(c))
const cartaCorta = (c: string) => c.replace(/^Ministerio (de las |de la |de los |del |de )/, '')

function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

type EstadoCierre = 'tratado' | 'sin_novedades' | 'pospuesto' | 'retirado'
type Punto = { id: number; titulo: string; orden: number; carteras: string[]; estadoCierre: EstadoCierre | null }

const CIERRE_OPCIONES: { v: EstadoCierre; label: string }[] = [
  { v: 'tratado', label: 'Tratado' },
  { v: 'sin_novedades', label: 'Sin novedades' },
  { v: 'pospuesto', label: 'Pospuesto' },
  { v: 'retirado', label: 'Retirado' },
]

export default function CapturaSalaGabinete({ sesionId, canEdit }: { sesionId: number; canEdit: boolean }) {
  const email = useCurrentUserEmail()
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [relatos, setRelatos] = useState<Record<number, SesionIntervencion>>({})     // por tema_id
  const [intervs, setIntervs] = useState<SesionIntervencion[]>([])                    // institucion != null
  const [vocerias, setVocerias] = useState<SesionVoceria[]>([])
  const [loading, setLoading] = useState(true)
  const [addIntervTema, setAddIntervTema] = useState<number | null>(null)
  const [nuevaCartera, setNuevaCartera] = useState('')
  const [nuevoTexto, setNuevoTexto] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const sb = getSupabase()
      const { data: temasData } = await sb.from('gabinete_temas').select('id, titulo, texto, orden, estado_cierre')
        .eq('sesion_id', sesionId).order('orden').order('id')
      const temas = (temasData ?? []) as Pick<GabineteTema, 'id' | 'titulo' | 'texto' | 'orden' | 'estado_cierre'>[]
      const ids = temas.map(t => t.id)
      const [cartRes, intRes, vocRes] = await Promise.all([
        ids.length ? sb.from('gabinete_tema_carteras').select('tema_id, institucion, orden').in('tema_id', ids) : Promise.resolve({ data: [] }),
        sb.from('sesion_intervenciones').select('*').eq('sesion_id', sesionId).order('orden').order('id'),
        sb.from('sesion_vocerias').select('*').eq('sesion_id', sesionId).order('orden').order('id'),
      ])
      if (cancelled) return
      const carterasPorTema = new Map<number, string[]>()
      for (const c of ((cartRes.data ?? []) as { tema_id: number; institucion: string; orden: number }[])
        .slice().sort((a, b) => a.orden - b.orden)) {
        const arr = carterasPorTema.get(c.tema_id) ?? []; arr.push(normalizeCarteraGabinete(c.institucion)); carterasPorTema.set(c.tema_id, arr)
      }
      setPuntos(temas.map(t => ({ id: t.id, titulo: (t.titulo ?? t.texto ?? '').trim() || '(sin título)', orden: t.orden, carteras: carterasPorTema.get(t.id) ?? [], estadoCierre: t.estado_cierre })))
      const all = (intRes.data ?? []) as SesionIntervencion[]
      setRelatos(Object.fromEntries(all.filter(i => i.institucion == null).map(i => [i.tema_id, i])))
      setIntervs(all.filter(i => i.institucion != null))
      setVocerias((vocRes.data ?? []) as SesionVoceria[])
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [sesionId, reloadKey])

  const fallo = useCallback((err: unknown) => { window.alert((err as Error).message); setReloadKey(k => k + 1) }, [])

  // ── Estado de cierre del punto (alimenta el chip del acta) ──────────────────
  async function setEstadoCierre(temaId: number, valor: EstadoCierre | null) {
    const sb = getSupabase()
    try {
      await safeWrite(sb.from('gabinete_temas').update({ estado_cierre: valor }).eq('id', temaId), `estado_cierre id=${temaId}`)
      setPuntos(prev => prev.map(p => p.id === temaId ? { ...p, estadoCierre: valor } : p))
    } catch (err) { fallo(err) }
  }

  // ── Relato general (institucion NULL, uno por tema) ─────────────────────────
  async function commitRelato(temaId: number, texto: string) {
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
  }

  // ── Intervenciones por cartera ──────────────────────────────────────────────
  async function agregarInterv(temaId: number) {
    const inst = nuevaCartera.trim(); const txt = nuevoTexto.trim()
    if (!inst || !txt) return
    const sb = getSupabase()
    try {
      const orden = intervs.filter(i => i.tema_id === temaId).length + 1
      const rows = await safeWrite(
        sb.from('sesion_intervenciones').insert({ sesion_id: sesionId, tema_id: temaId, institucion: inst, texto: txt, orden, created_by_email: email || null }),
        'intervencion insert',
      )
      setIntervs(prev => [...prev, rows[0] as SesionIntervencion])
      setNuevaCartera(''); setNuevoTexto(''); setAddIntervTema(null)
    } catch (err) { fallo(err) }
  }
  async function editarInterv(id: number, texto: string) {
    const t = texto.trim(); const cur = intervs.find(i => i.id === id)
    if (!cur || cur.texto === t) return
    const sb = getSupabase()
    try {
      if (!t) { await safeDelete(sb.from('sesion_intervenciones').delete().eq('id', id), 'interv delete'); setIntervs(prev => prev.filter(i => i.id !== id)) }
      else { await safeWrite(sb.from('sesion_intervenciones').update({ texto: t }).eq('id', id), 'interv update'); setIntervs(prev => prev.map(i => i.id === id ? { ...i, texto: t } : i)) }
    } catch (err) { fallo(err) }
  }
  async function quitarInterv(id: number) {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_intervenciones').delete().eq('id', id), 'interv delete'); setIntervs(prev => prev.filter(i => i.id !== id)) }
    catch (err) { fallo(err) }
  }

  // ── Vocerías ────────────────────────────────────────────────────────────────
  const [vDia, setVDia] = useState(''); const [vVocero, setVVocero] = useState(''); const [vTema, setVTema] = useState('')
  async function agregarVoceria(e: React.FormEvent) {
    e.preventDefault()
    if (!vDia.trim() || !vVocero.trim() || !vTema.trim()) return
    const sb = getSupabase()
    try {
      const rows = await safeWrite(
        sb.from('sesion_vocerias').insert({ sesion_id: sesionId, dia: vDia.trim(), vocero: vVocero.trim(), tema_texto: vTema.trim(), orden: vocerias.length + 1 }),
        'voceria insert',
      )
      setVocerias(prev => [...prev, rows[0] as SesionVoceria]); setVDia(''); setVVocero(''); setVTema('')
    } catch (err) { fallo(err) }
  }
  async function quitarVoceria(id: number) {
    const sb = getSupabase()
    try { await safeDelete(sb.from('sesion_vocerias').delete().eq('id', id), 'voceria delete'); setVocerias(prev => prev.filter(v => v.id !== id)) }
    catch (err) { fallo(err) }
  }

  if (loading) return <p className="text-xs text-gray-400 text-center py-3">Cargando la pauta…</p>
  if (puntos.length === 0) return <p className="text-xs text-gray-400 text-center py-3">Esta sesión no tiene puntos de pauta. Armalos en Preparación.</p>

  const inputCls = 'px-2 py-1 border border-slate-200 rounded-md text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-300'

  return (
    <div className="space-y-3">
      {puntos.map(p => {
        const misInterv = intervs.filter(i => i.tema_id === p.id)
        const opciones = [...new Set([...p.carteras, ...SEREMIS])]
        return (
          <div key={p.id} className="border border-slate-200 rounded-lg p-3">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xs font-extrabold text-violet-700">{p.orden}.</span>
              <span className="text-sm font-bold text-slate-900 flex-1">{p.titulo}</span>
              {canEdit && (
                <select
                  value={p.estadoCierre ?? ''}
                  onChange={e => setEstadoCierre(p.id, (e.target.value || null) as EstadoCierre | null)}
                  className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md border border-slate-200 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-violet-300 self-start"
                  title="Estado del punto al cierre (aparece en el acta)"
                >
                  <option value="">Estado…</option>
                  {CIERRE_OPCIONES.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
              )}
            </div>

            {/* Relato general */}
            <textarea
              defaultValue={relatos[p.id]?.texto ?? ''} rows={2} disabled={!canEdit}
              ref={autoGrow} onInput={e => autoGrow(e.currentTarget)}
              onBlur={e => commitRelato(p.id, e.target.value)}
              placeholder="Relato general del punto: qué se planteó, qué se acordó…"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none overflow-hidden"
            />

            {/* Intervenciones por cartera */}
            {misInterv.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {misInterv.map(iv => (
                  <div key={iv.id} className="flex items-start gap-2 group">
                    <span className="text-[11px] font-bold text-slate-500 uppercase w-24 flex-none pt-1.5 truncate" title={iv.institucion ?? ''}>{cartaCorta(iv.institucion ?? '')}</span>
                    {canEdit ? (
                      <textarea
                        defaultValue={iv.texto} rows={1} ref={autoGrow} onInput={e => autoGrow(e.currentTarget)}
                        onBlur={e => editarInterv(iv.id, e.target.value)}
                        className="flex-1 min-w-0 text-sm text-slate-700 border border-slate-200 rounded-md px-2 py-1 resize-none overflow-hidden focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                    ) : <p className="flex-1 text-sm text-slate-700 py-1">{iv.texto}</p>}
                    {canEdit && (
                      <button onClick={() => quitarInterv(iv.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 mt-1.5 flex-none" title="Quitar">
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Agregar intervención */}
            {canEdit && (addIntervTema === p.id ? (
              <div className="mt-2 flex flex-wrap items-start gap-2 bg-slate-50 rounded-lg p-2">
                <select value={nuevaCartera} onChange={e => setNuevaCartera(e.target.value)} className={`${inputCls} w-40`} autoFocus>
                  <option value="">Cartera…</option>
                  {opciones.map(c => <option key={c} value={c}>{cartaCorta(c)}</option>)}
                </select>
                <input value={nuevoTexto} onChange={e => setNuevoTexto(e.target.value)} placeholder="Qué planteó…" className={`${inputCls} flex-1 min-w-[160px]`} />
                <button onClick={() => agregarInterv(p.id)} disabled={!nuevaCartera || !nuevoTexto.trim()} className="text-xs px-3 py-1 rounded-md bg-violet-700 text-white font-semibold disabled:opacity-40">Agregar</button>
                <button onClick={() => { setAddIntervTema(null); setNuevaCartera(''); setNuevoTexto('') }} className="text-xs px-2 py-1 text-slate-400 hover:text-slate-600">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => { setAddIntervTema(p.id); setNuevaCartera(''); setNuevoTexto('') }} className="mt-2 text-xs font-medium text-violet-700 hover:text-violet-900">
                + Intervención de cartera
              </button>
            ))}
          </div>
        )
      })}

      {/* Vocerías de la semana */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h4 className="text-sm font-bold text-slate-900 mb-2">Vocerías de la semana</h4>
        {vocerias.length > 0 && (
          <div className="space-y-1 mb-2">
            {vocerias.map(v => (
              <div key={v.id} className="flex items-center gap-2 text-sm text-slate-700 group">
                <span className="font-semibold w-20 flex-none">{v.dia}</span>
                <span className="font-medium flex-none">{v.vocero}</span>
                <span className="text-slate-500 flex-1 truncate">— {v.tema_texto}</span>
                {canEdit && (
                  <button onClick={() => quitarVoceria(v.id)} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 flex-none" title="Quitar">
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7"/></svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {canEdit && (
          <form onSubmit={agregarVoceria} className="flex flex-wrap items-center gap-2">
            <input value={vDia} onChange={e => setVDia(e.target.value)} placeholder="Día" className={`${inputCls} w-24`} />
            <input value={vVocero} onChange={e => setVVocero(e.target.value)} placeholder="Vocero" className={`${inputCls} w-40`} />
            <input value={vTema} onChange={e => setVTema(e.target.value)} placeholder="Tema" className={`${inputCls} flex-1 min-w-[140px]`} />
            <button type="submit" disabled={!vDia.trim() || !vVocero.trim() || !vTema.trim()} className="text-xs px-3 py-1 rounded-md bg-violet-700 text-white font-semibold disabled:opacity-40">+ Vocería</button>
          </form>
        )}
      </div>
    </div>
  )
}
