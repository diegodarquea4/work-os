'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getSupabase } from '@/lib/supabase'
import { safeWrite, safeDelete } from '@/lib/dbWrite'
import { SEMAFORO_CONFIG } from '@/lib/config'
import type { Region } from '@/lib/regions'
import type { Iniciativa } from '@/lib/projects'
import type { EjeSesion, SesionAsistencia, SesionCompromiso, SesionTema } from '@/lib/types'
import { Alert } from '@/components/ui'

/**
 * Formulario de sesión del Comité Político (mig 059) — la instancia más liviana.
 * Tres zonas:
 *   1. Asistencia — 100% ad-hoc (invitados: nombre + institución). Al crear una
 *      sesión nueva se precargan los invitados presentes de la última cerrada.
 *   2. Temas conversados (opcional, destacado) — lista con subpuntos.
 *   3. Compromisos — anteriores (verificación) + nuevos, con enlace a iniciativa
 *      (prioridad_id) y delegación a otra instancia (mandato: instancia destino).
 *
 * Sin nómina fija, sin indicadores, sin proyectos/oficios. Cierre → acta vía
 * POST /api/sesiones/[id]/cerrar (mismo contrato que las demás instancias).
 */

export type DestinoCompromiso = {
  value: string                              // 'gabinete' | 'inversion' | `eje:${id}`
  label: string
  instancia: 'gabinete' | 'inversion' | 'eje'
  ejeId: number | null
}

type Props = {
  region: Region
  borradorId: number | null
  currentUserEmail: string
  iniciativas: Iniciativa[]
  destinos: DestinoCompromiso[]
  onAbrirIniciativa: (p: Iniciativa) => void
  onClose: () => void
}

const NOMBRE_COMITE = 'Comité Político'

const ESTADO_COMPROMISO = {
  pendiente: { label: 'Pendiente', on: 'bg-gray-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  en_curso:  { label: 'En curso',  on: 'bg-blue-600 text-white',   off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
  cumplido:  { label: 'Cumplido',  on: 'bg-green-600 text-white',  off: 'bg-gray-100 text-gray-500 hover:bg-gray-200' },
} as const

const inputCls = 'px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300'
const zoneCls  = 'border border-gray-200 rounded-xl overflow-hidden'
const zoneHead = 'px-4 py-2.5 bg-violet-50/70 border-b border-violet-100 flex items-center gap-2'
const zoneNum  = 'w-5 h-5 rounded-full bg-violet-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0'

function hoyISO(): string {
  return new Date().toLocaleDateString('en-CA')
}
function fmtFecha(fecha: string | null): string {
  if (!fecha) return '—'
  return new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function normalizarTema(t: SesionTema): SesionTema {
  return { ...t, subitems: Array.isArray(t.subitems) ? t.subitems : [] }
}

// ── Typeahead de iniciativas (mismo patrón que SesionModal) ──────────────────

function IniciativaTypeahead({ buscar, onPick }: {
  buscar: (q: string) => Iniciativa[]
  onPick: (p: Iniciativa) => void
}) {
  const [q, setQ] = useState('')
  const [visible, setVisible] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultados = useMemo(() => buscar(q), [q, buscar])
  const hayResultados = resultados.length > 0
  const abierto = visible && hayResultados && rect !== null

  const medir = useCallback(() => {
    const el = inputRef.current
    if (el) setRect(el.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!visible || !hayResultados) return
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    return () => {
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
    }
  }, [visible, hayResultados, medir])

  let dropStyle: CSSProperties = {}
  if (abierto && rect) {
    const MAXH = 224, GAP = 4
    const espacioAbajo = window.innerHeight - rect.bottom
    const arriba = espacioAbajo < MAXH + GAP && rect.top > espacioAbajo
    dropStyle = {
      position: 'fixed', left: rect.left, width: rect.width, zIndex: 9999,
      ...(arriba
        ? { bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.max(0, rect.top - GAP) }
        : { top: rect.bottom + GAP, maxHeight: Math.max(0, espacioAbajo - GAP) }),
    }
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={q}
        onChange={e => { setQ(e.target.value); setVisible(true); medir() }}
        onFocus={() => { setVisible(true); medir() }}
        onBlur={() => setVisible(false)}
        placeholder="Vincular a iniciativa (opcional)…"
        className={`${inputCls} w-full text-xs py-1.5`}
      />
      {abierto && typeof document !== 'undefined' && createPortal(
        <div
          style={dropStyle}
          onMouseDown={e => e.preventDefault()}
          className="bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden overflow-y-auto"
        >
          {resultados.map(p => {
            const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => { onPick(p); setQ(''); setVisible(false) }}
                className="w-full px-3 py-2 text-left hover:bg-violet-50 flex items-center gap-2 border-b border-gray-50 last:border-b-0"
              >
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sem.dot}`} />
                <span className="flex-1 min-w-0">
                  <span className="text-xs text-gray-800 block truncate">{p.nombre}</span>
                  <span className="text-[10px] text-gray-400 block truncate">{p.ministerio ?? '—'} · {p.pct_avance}%</span>
                </span>
              </button>
            )
          })}
        </div>,
        document.body,
      )}
    </div>
  )
}

export default function SesionModalPolitico({
  region, borradorId, currentUserEmail, iniciativas, destinos, onAbrirIniciativa, onClose,
}: Props) {
  const [sesion, setSesion]       = useState<EjeSesion | null>(null)
  const [initError, setInitError] = useState<string | null>(null)

  const [asistencia, setAsistencia]         = useState<SesionAsistencia[]>([])
  const [temas, setTemas]                   = useState<SesionTema[]>([])
  const [compAnteriores, setCompAnteriores] = useState<SesionCompromiso[]>([])
  const [compNuevos, setCompNuevos]         = useState<SesionCompromiso[]>([])

  // Invitado form
  const [invNombre, setInvNombre]           = useState('')
  const [invInstitucion, setInvInstitucion] = useState('')

  // Tema nuevo
  const [nuevoTema, setNuevoTema] = useState('')
  const [temaSaving, setTemaSaving] = useState(false)

  // Compromiso nuevo form
  const [cDescripcion, setCDescripcion]     = useState('')
  const [cInstitucion, setCInstitucion]     = useState('')
  const [cNombre, setCNombre]               = useState('')
  const [cPlazo, setCPlazo]                 = useState('')
  const [cVinculada, setCVinculada]         = useState<Iniciativa | null>(null)
  const [cDestino, setCDestino]             = useState('')      // '' = se gestiona en Político
  const [cSaving, setCSaving]               = useState(false)

  // Cierre
  const [cerrando, setCerrando]             = useState(false)
  const [cierreResultado, setCierreResultado] = useState<{ actaGenerada: boolean; error?: string } | null>(null)

  // ── Init: reabrir o crear el borrador; precargar asistencia si es nuevo ──────

  useEffect(() => {
    let cancelled = false
    async function init() {
      const sb = getSupabase()
      let s: EjeSesion | null = null
      if (borradorId) {
        const { data } = await sb.from('eje_sesiones').select('*').eq('id', borradorId).single()
        s = data as EjeSesion | null
      }
      let recienCreada = false
      if (!s) {
        const { data, error } = await sb
          .from('eje_sesiones')
          .insert({
            region_cod: region.cod,
            instancia: 'politico',
            fecha: hoyISO(),
            created_by_email: currentUserEmail || null,
          })
          .select('*')
        if (error || !data?.length) {
          const { data: retry } = await sb
            .from('eje_sesiones').select('*')
            .eq('region_cod', region.cod).eq('instancia', 'politico').eq('estado', 'borrador')
            .limit(1)
          s = (retry?.[0] as EjeSesion | undefined) ?? null
          if (!s) {
            if (!cancelled) setInitError(error?.message ?? 'No se pudo crear el borrador de sesión.')
            return
          }
        } else {
          s = data[0] as EjeSesion
          recienCreada = true
        }
      }
      // Precarga: copiar los invitados presentes de la última sesión cerrada
      // ANTES de setSesion, para que loadAll los levante en el primer fetch.
      if (recienCreada && s) await precargarAsistencia(s)
      if (cancelled) return
      setSesion(s)
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function precargarAsistencia(s: EjeSesion) {
    const sb = getSupabase()
    const { data: ult } = await sb
      .from('eje_sesiones').select('id')
      .eq('region_cod', region.cod).eq('instancia', 'politico').eq('estado', 'cerrada')
      .order('fecha', { ascending: false }).order('id', { ascending: false }).limit(1)
    const ultId = ult?.[0]?.id as number | undefined
    if (!ultId) return
    const { data: prev } = await sb
      .from('sesion_asistencia').select('invitado_nombre, invitado_institucion')
      .eq('sesion_id', ultId).eq('presente', true)
    const invitados = ((prev ?? []) as { invitado_nombre: string | null; invitado_institucion: string | null }[])
      .filter(a => a.invitado_nombre)
    if (invitados.length === 0) return
    try {
      await safeWrite(
        sb.from('sesion_asistencia').insert(invitados.map(a => ({
          sesion_id: s.id, invitado_nombre: a.invitado_nombre, invitado_institucion: a.invitado_institucion, presente: true,
        }))),
        `sesion_asistencia precarga sesion=${s.id}`,
      )
    } catch {
      // Precarga best-effort: si falla, la sesión abre con asistencia vacía.
    }
  }

  const loadAll = useCallback(async (s: EjeSesion) => {
    const sb = getSupabase()
    const [asisRes, temasRes, compRes, nuevosRes] = await Promise.all([
      sb.from('sesion_asistencia').select('*').eq('sesion_id', s.id),
      sb.from('sesion_temas').select('*').eq('sesion_id', s.id).order('orden').order('id'),
      sb.from('sesion_compromisos').select('*')
        .eq('region_cod', region.cod).eq('instancia', 'politico')
        .neq('sesion_origen_id', s.id)
        .or('estado.in.(pendiente,en_curso),and(estado.eq.cumplido,cerrado_en_sesion_id.is.null)')
        .order('created_at'),
      sb.from('sesion_compromisos').select('*').eq('sesion_origen_id', s.id).order('created_at'),
    ])
    setAsistencia((asisRes.data ?? []) as SesionAsistencia[])
    setTemas(((temasRes.data ?? []) as SesionTema[]).map(normalizarTema))
    setCompAnteriores((compRes.data ?? []) as SesionCompromiso[])
    setCompNuevos((nuevosRes.data ?? []) as SesionCompromiso[])
  }, [region.cod])

  useEffect(() => { if (sesion) loadAll(sesion) }, [sesion, loadAll])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !cerrando) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, cerrando])

  // ── Zona 1: asistencia ad-hoc ────────────────────────────────────────────────

  async function agregarInvitado(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !invNombre.trim() || !invInstitucion.trim()) return
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_asistencia').insert({
          sesion_id: sesion.id, invitado_nombre: invNombre.trim(), invitado_institucion: invInstitucion.trim(), presente: true,
        }),
        'sesion_asistencia invitado',
      )
      setAsistencia(prev => [...prev, rows[0] as SesionAsistencia])
      setInvNombre(''); setInvInstitucion('')
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function toggleInvitado(fila: SesionAsistencia) {
    const nuevo = !fila.presente
    setAsistencia(prev => prev.map(a => a.id === fila.id ? { ...a, presente: nuevo } : a))
    try {
      await safeWrite(
        getSupabase().from('sesion_asistencia').update({ presente: nuevo }).eq('id', fila.id),
        `sesion_asistencia toggle id=${fila.id}`,
      )
    } catch (err) {
      setAsistencia(prev => prev.map(a => a.id === fila.id ? { ...a, presente: fila.presente } : a))
      window.alert((err as Error).message)
    }
  }

  async function quitarInvitado(fila: SesionAsistencia) {
    try {
      await safeDelete(
        getSupabase().from('sesion_asistencia').delete().eq('id', fila.id),
        `sesion_asistencia delete id=${fila.id}`,
      )
      setAsistencia(prev => prev.filter(a => a.id !== fila.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  // ── Zona 2: temas conversados (lista con subpuntos) ──────────────────────────

  async function agregarTema(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !nuevoTema.trim()) return
    setTemaSaving(true)
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_temas').insert({
          sesion_id: sesion.id, texto: nuevoTema.trim(), subitems: [], orden: temas.length, created_by_email: currentUserEmail || null,
        }),
        `sesion_temas insert sesion=${sesion.id}`,
      )
      setTemas(prev => [...prev, normalizarTema(rows[0] as SesionTema)])
      setNuevoTema('')
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setTemaSaving(false)
    }
  }

  async function commitTemaTexto(tema: SesionTema, texto: string) {
    const t = texto.trim()
    if (t === tema.texto || t === '') return
    setTemas(prev => prev.map(x => x.id === tema.id ? { ...x, texto: t } : x))
    try {
      await safeWrite(
        getSupabase().from('sesion_temas').update({ texto: t }).eq('id', tema.id),
        `sesion_temas texto id=${tema.id}`,
      )
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function borrarTema(tema: SesionTema) {
    try {
      await safeDelete(
        getSupabase().from('sesion_temas').delete().eq('id', tema.id),
        `sesion_temas delete id=${tema.id}`,
      )
      setTemas(prev => prev.filter(x => x.id !== tema.id))
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function commitSubitems(tema: SesionTema, subitems: string[]) {
    setTemas(prev => prev.map(x => x.id === tema.id ? { ...x, subitems } : x))
    try {
      await safeWrite(
        getSupabase().from('sesion_temas').update({ subitems }).eq('id', tema.id),
        `sesion_temas subitems id=${tema.id}`,
      )
    } catch (err) {
      window.alert((err as Error).message)
      if (sesion) loadAll(sesion)
    }
  }

  // ── Zona 3: compromisos ──────────────────────────────────────────────────────

  async function setEstadoCompromiso(c: SesionCompromiso, estado: SesionCompromiso['estado']) {
    if (c.estado === estado) return
    const prevEstado = c.estado
    setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, estado } : x))
    try {
      await safeWrite(
        getSupabase().from('sesion_compromisos').update({
          estado, estado_updated_at: new Date().toISOString(), estado_updated_by_email: currentUserEmail || null,
        }).eq('id', c.id),
        `sesion_compromisos estado id=${c.id}`,
      )
    } catch (err) {
      setCompAnteriores(prev => prev.map(x => x.id === c.id ? { ...x, estado: prevEstado } : x))
      window.alert((err as Error).message)
    }
  }

  async function agregarCompromiso(e: React.FormEvent) {
    e.preventDefault()
    if (!sesion || !cDescripcion.trim() || !cInstitucion.trim()) return
    setCSaving(true)
    // Delegación (mandato): si hay destino, el compromiso se inserta con la
    // instancia (y eje) de destino → aparece en la próxima sesión de esa
    // instancia. Sin destino, queda en el Comité Político.
    const dest = destinos.find(d => d.value === cDestino) ?? null
    try {
      const rows = await safeWrite(
        getSupabase().from('sesion_compromisos').insert({
          region_cod: region.cod,
          instancia: dest ? dest.instancia : 'politico',
          eje_id: dest ? dest.ejeId : null,
          sesion_origen_id: sesion.id,
          descripcion: cDescripcion.trim(),
          responsable_institucion: cInstitucion.trim(),
          responsable_nombre: cNombre.trim() || null,
          plazo: cPlazo || null,
          prioridad_id: cVinculada?.id ?? null,
        }),
        `sesion_compromisos insert sesion=${sesion.id}`,
      )
      setCompNuevos(prev => [...prev, rows[0] as SesionCompromiso])
      setCDescripcion(''); setCInstitucion(''); setCNombre(''); setCPlazo(''); setCVinculada(null); setCDestino('')
    } catch (err) {
      window.alert((err as Error).message)
    } finally {
      setCSaving(false)
    }
  }

  // ── Metadatos + cierre ───────────────────────────────────────────────────────

  async function commitSesionField(patch: Partial<Pick<EjeSesion, 'fecha' | 'lugar'>>) {
    if (!sesion) return
    try {
      await safeWrite(
        getSupabase().from('eje_sesiones').update(patch).eq('id', sesion.id),
        `eje_sesiones meta id=${sesion.id}`,
      )
      setSesion(prev => prev ? { ...prev, ...patch } : prev)
    } catch (err) {
      window.alert((err as Error).message)
    }
  }

  async function handleCerrar() {
    if (!sesion) return
    if (!confirm('¿Cerrar la sesión y generar el acta?\n\nUna sesión cerrada no se puede editar.')) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/cerrar`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(body.error ?? `No se pudo cerrar la sesión (HTTP ${res.status})`)
        return
      }
      setCierreResultado({ actaGenerada: !!body.acta_generada, error: body.error })
    } catch {
      window.alert('Error de red cerrando la sesión. Reintenta — el borrador sigue guardado.')
    } finally {
      setCerrando(false)
    }
  }

  async function handleReintentarActa() {
    if (!sesion) return
    setCerrando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesion.id}/acta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok && body.acta_generada) setCierreResultado({ actaGenerada: true })
      else window.alert(body.error ?? 'No se pudo generar el acta. Puedes reintentar desde el historial.')
    } finally {
      setCerrando(false)
    }
  }

  async function handleDescargarActa() {
    if (!sesion) return
    const res = await fetch(`/api/sesiones/${sesion.id}/acta`)
    const body = await res.json().catch(() => ({}))
    if (res.ok && body.url) window.open(body.url, '_blank')
    else window.alert(body.error ?? 'No se pudo obtener el acta')
  }

  // ── Derivados ─────────────────────────────────────────────────────────────

  const presentes = useMemo(() => asistencia.filter(a => a.presente).length, [asistencia])
  const buscarIniciativas = useCallback((q: string): Iniciativa[] => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    return iniciativas
      .filter(p => p.nombre.toLowerCase().includes(t) || (p.ministerio ?? '').toLowerCase().includes(t))
      .slice(0, 8)
  }, [iniciativas])
  const iniPorId = useMemo(() => new Map(iniciativas.map(p => [p.id, p])), [iniciativas])
  const destinoLabel = useCallback((c: SesionCompromiso): string | null => {
    if (c.instancia === 'politico') return null
    const d = destinos.find(x => x.instancia === c.instancia && x.ejeId === c.eje_id)
    return d?.label ?? (c.instancia === 'gabinete' ? 'Gabinete Regional' : c.instancia === 'inversion' ? 'Comité Económico' : 'Comité')
  }, [destinos])

  // ── Render ────────────────────────────────────────────────────────────────

  if (cierreResultado) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
          <div className={`px-6 py-4 ${cierreResultado.actaGenerada ? 'bg-green-600' : 'bg-amber-500'}`}>
            <p className="text-white font-semibold text-sm">
              {cierreResultado.actaGenerada ? 'Sesión cerrada — acta generada' : 'Sesión cerrada — acta pendiente'}
            </p>
          </div>
          <div className="px-6 py-5 space-y-3">
            <p className="text-sm text-gray-700">
              {cierreResultado.actaGenerada
                ? 'El acta quedó disponible para descargar.'
                : 'La sesión se cerró, pero el acta no se pudo generar. Puedes reintentar ahora o después desde el historial.'}
            </p>
            <div className="flex gap-2 pt-1">
              {cierreResultado.actaGenerada ? (
                <button onClick={handleDescargarActa} className="flex-1 py-2.5 bg-violet-700 text-white text-sm font-semibold rounded-lg hover:bg-violet-800">
                  Descargar acta
                </button>
              ) : (
                <button onClick={handleReintentarActa} disabled={cerrando} className="flex-1 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 disabled:opacity-50">
                  {cerrando ? 'Generando…' : 'Reintentar acta'}
                </button>
              )}
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => !cerrando && onClose()}>
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <header className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 bg-violet-50/40">
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-gray-900">{NOMBRE_COMITE} — {sesion?.estado === 'borrador' && borradorId ? 'Continuar sesión' : 'Nueva sesión'}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                Fecha
                <input
                  type="date"
                  value={sesion?.fecha ?? hoyISO()}
                  onChange={e => e.target.value && commitSesionField({ fecha: e.target.value })}
                  className="border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-violet-300"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 flex-1 min-w-[160px]">
                Lugar
                <input
                  type="text"
                  defaultValue={sesion?.lugar ?? ''}
                  onBlur={e => commitSesionField({ lugar: e.target.value.trim() || null })}
                  placeholder="Ej: Delegación Presidencial"
                  className="flex-1 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-gray-700 placeholder:text-gray-300 focus:outline-none focus:ring-1 focus:ring-violet-300"
                />
              </label>
            </div>
          </div>
          <button onClick={onClose} disabled={cerrando} className="text-gray-400 hover:text-gray-600 mt-0.5 disabled:opacity-50" title="Cerrar (el borrador queda guardado)">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 4l12 12M16 4L4 16"/>
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {initError ? (
            <Alert variant="error">{initError}</Alert>
          ) : !sesion ? (
            <p className="text-center text-sm text-gray-400 py-10">Preparando la sesión…</p>
          ) : (
            <>
              {/* ── Zona 1: asistencia ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>1</span>
                  <h3 className="text-sm font-semibold text-gray-800">Asistencia</h3>
                  <span className="text-xs text-gray-400 ml-auto">{presentes} presente{presentes === 1 ? '' : 's'}</span>
                </div>
                <div className="p-3">
                  {asistencia.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">
                      Aún sin asistentes. Agrega parlamentarios / entes políticos abajo.
                    </p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {asistencia.map(a => (
                        <div key={a.id} className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={a.presente}
                            onChange={() => toggleInvitado(a)}
                            className="rounded border-gray-300 text-violet-700 focus:ring-violet-400"
                            title={a.presente ? 'Marcar como ausente' : 'Marcar como presente'}
                          />
                          <span className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                            {a.invitado_nombre}
                            {a.invitado_institucion ? <span className="text-xs text-gray-400"> · {a.invitado_institucion}</span> : null}
                          </span>
                          <button onClick={() => quitarInvitado(a)} className="text-gray-300 hover:text-red-500 p-0.5" title="Quitar">
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <form onSubmit={agregarInvitado} className="flex gap-2">
                    <input type="text" value={invNombre} onChange={e => setInvNombre(e.target.value)} placeholder="Nombre" className={`${inputCls} flex-1 text-xs py-1.5`} />
                    <input type="text" value={invInstitucion} onChange={e => setInvInstitucion(e.target.value)} placeholder="Institución / partido" className={`${inputCls} w-44 text-xs py-1.5`} />
                    <button
                      type="submit"
                      disabled={!invNombre.trim() || !invInstitucion.trim()}
                      className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 font-medium hover:bg-violet-50 disabled:opacity-40"
                    >
                      + Agregar
                    </button>
                  </form>
                </div>
              </section>

              {/* ── Zona 2: temas conversados (destacada) ── */}
              <section className="border-2 border-violet-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-violet-100/70 border-b border-violet-200 flex items-center gap-2">
                  <span className={zoneNum}>2</span>
                  <h3 className="text-sm font-semibold text-violet-900">Temas conversados</h3>
                  <span className="text-[11px] text-violet-400 ml-auto">opcional</span>
                </div>
                <div className="p-3 space-y-2.5">
                  {temas.map((tema, i) => (
                    <div key={tema.id} className="rounded-lg border border-violet-100 bg-violet-50/40 p-2.5">
                      <div className="flex items-start gap-2">
                        <span className="text-xs font-bold text-violet-400 mt-1.5 flex-shrink-0">{i + 1}.</span>
                        <textarea
                          defaultValue={tema.texto}
                          ref={autoGrow}
                          onInput={e => autoGrow(e.currentTarget)}
                          onBlur={e => commitTemaTexto(tema, e.target.value)}
                          rows={1}
                          placeholder="Tema conversado…"
                          className="flex-1 resize-none overflow-hidden px-2 py-1 border border-transparent bg-transparent rounded text-sm text-slate-800 focus:bg-white focus:border-violet-200 focus:outline-none focus:ring-1 focus:ring-violet-300"
                        />
                        <button onClick={() => borrarTema(tema)} className="text-violet-300 hover:text-red-500 p-0.5 mt-1 flex-shrink-0" title="Quitar tema">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                      {/* Subpuntos */}
                      <div className="pl-6 mt-1 space-y-1">
                        {tema.subitems.map((sub, si) => (
                          <div key={si} className="flex items-center gap-1.5">
                            <span className="text-violet-300 text-xs flex-shrink-0">·</span>
                            <input
                              type="text"
                              defaultValue={sub}
                              onBlur={e => {
                                const v = e.target.value.trim()
                                if (v === sub) return
                                const next = tema.subitems.slice()
                                if (v === '') next.splice(si, 1); else next[si] = v
                                commitSubitems(tema, next)
                              }}
                              className="flex-1 px-2 py-0.5 border border-transparent bg-transparent rounded text-[13px] text-slate-600 focus:bg-white focus:border-violet-200 focus:outline-none focus:ring-1 focus:ring-violet-300"
                            />
                            <button
                              onClick={() => commitSubitems(tema, tema.subitems.filter((_, k) => k !== si))}
                              className="text-violet-200 hover:text-red-500 p-0.5 flex-shrink-0" title="Quitar subpunto"
                            >
                              <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M2 2l8 8M10 2l-8 8" strokeLinecap="round"/>
                              </svg>
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => commitSubitems(tema, [...tema.subitems, ''])}
                          className="text-[11px] text-violet-500 hover:text-violet-700 font-medium pl-3.5"
                        >
                          + subpunto
                        </button>
                      </div>
                    </div>
                  ))}
                  <form onSubmit={agregarTema} className="flex gap-2">
                    <input
                      type="text"
                      value={nuevoTema}
                      onChange={e => setNuevoTema(e.target.value)}
                      placeholder="Agregar un tema conversado…"
                      className={`${inputCls} flex-1 text-sm py-1.5`}
                    />
                    <button
                      type="submit"
                      disabled={temaSaving || !nuevoTema.trim()}
                      className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                    >
                      {temaSaving ? 'Guardando…' : '+ Tema'}
                    </button>
                  </form>
                </div>
              </section>

              {/* ── Zona 3a: compromisos anteriores (verificación) ── */}
              <section className={zoneCls}>
                <div className={zoneHead}>
                  <span className={zoneNum}>3</span>
                  <h3 className="text-sm font-semibold text-gray-800">Compromisos</h3>
                  <span className="text-xs text-gray-400 ml-auto">{compAnteriores.length} anterior{compAnteriores.length === 1 ? '' : 'es'}</span>
                </div>
                <div className="p-3 space-y-3">
                  {compAnteriores.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Verificación de compromisos anteriores</p>
                      {compAnteriores.map(c => (
                        <div key={c.id} className="flex items-start gap-3 px-3 py-2 bg-gray-50 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {(Object.keys(ESTADO_COMPROMISO) as (keyof typeof ESTADO_COMPROMISO)[]).map(est => (
                              <button
                                key={est}
                                onClick={() => setEstadoCompromiso(c, est)}
                                className={`text-[10px] font-semibold px-2 py-1 rounded-full transition-colors ${c.estado === est ? ESTADO_COMPROMISO[est].on : ESTADO_COMPROMISO[est].off}`}
                              >
                                {ESTADO_COMPROMISO[est].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Zona 3b: compromisos nuevos */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Compromisos nuevos de esta sesión</p>
                    {compNuevos.map(c => {
                      const dLabel = destinoLabel(c)
                      const vinc = c.prioridad_id != null ? iniPorId.get(c.prioridad_id) ?? null : null
                      return (
                        <div key={c.id} className="px-3 py-2 bg-violet-50/60 border border-violet-100 rounded-lg">
                          <p className="text-sm text-gray-700 leading-snug">{c.descripcion}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Responsable: {c.responsable_institucion}{c.responsable_nombre ? ` · ${c.responsable_nombre}` : ''}{c.plazo ? ` · plazo ${fmtFecha(c.plazo)}` : ''}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {dLabel && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-sky-100 text-sky-700" title="Delegado a otra instancia — se gestiona en su próxima sesión">
                                Delegado → {dLabel}
                              </span>
                            )}
                            {vinc && (
                              <button
                                onClick={() => onAbrirIniciativa(vinc)}
                                className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 hover:bg-violet-200"
                                title="Abrir la ficha de la iniciativa"
                              >
                                🔗 {vinc.nombre}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    <form onSubmit={agregarCompromiso} className="space-y-2 pt-1">
                      <textarea
                        value={cDescripcion}
                        onChange={e => setCDescripcion(e.target.value)}
                        rows={2}
                        placeholder="Descripción del compromiso…"
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
                      />
                      <div className="flex gap-2 flex-wrap">
                        <input type="text" value={cInstitucion} onChange={e => setCInstitucion(e.target.value)} placeholder="Institución responsable *" className={`${inputCls} flex-1 min-w-[150px] text-xs py-1.5`} />
                        <input type="text" value={cNombre} onChange={e => setCNombre(e.target.value)} placeholder="Responsable (nombre)" className={`${inputCls} flex-1 min-w-[130px] text-xs py-1.5`} />
                        <input type="date" value={cPlazo} onChange={e => setCPlazo(e.target.value)} className={`${inputCls} w-36 text-xs py-1.5`} title="Plazo" />
                        <button
                          type="submit"
                          disabled={cSaving || !cDescripcion.trim() || !cInstitucion.trim()}
                          className="text-xs px-3.5 py-1.5 rounded-lg bg-violet-700 text-white font-semibold hover:bg-violet-800 disabled:opacity-40"
                        >
                          {cSaving ? 'Guardando…' : '+ Compromiso'}
                        </button>
                      </div>
                      <div className="flex gap-2 flex-wrap items-start">
                        <div className="flex-1 min-w-[220px]">
                          {cVinculada ? (
                            <div className="flex items-center gap-2 text-xs bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-1.5">
                              <span className="text-violet-800 truncate flex-1">🔗 {cVinculada.nombre}</span>
                              <button type="button" onClick={() => setCVinculada(null)} className="text-violet-400 hover:text-violet-700" title="Quitar vínculo">✕</button>
                            </div>
                          ) : (
                            <IniciativaTypeahead buscar={buscarIniciativas} onPick={p => setCVinculada(p)} />
                          )}
                        </div>
                        {destinos.length > 0 && (
                          <select
                            value={cDestino}
                            onChange={e => setCDestino(e.target.value)}
                            className={`${inputCls} w-56 text-xs py-1.5`}
                            title="Delegar el compromiso a otra instancia (aparecerá en su próxima sesión)"
                          >
                            <option value="">Se gestiona en el Comité Político</option>
                            {destinos.map(d => (
                              <option key={d.value} value={d.value}>Delegar → {d.label}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </form>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex-shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
          <p className="text-[11px] text-gray-400">El borrador se guarda automáticamente con cada cambio.</p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={cerrando} className="text-sm px-4 py-2 border border-gray-200 text-gray-600 font-medium rounded-lg hover:bg-white disabled:opacity-50">
              Guardar borrador
            </button>
            <button onClick={handleCerrar} disabled={cerrando || !sesion} className="text-sm px-4 py-2 bg-violet-700 text-white font-semibold rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {cerrando ? 'Cerrando…' : 'Cerrar sesión y generar acta'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
