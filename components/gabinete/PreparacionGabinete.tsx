'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useSesionesResumen } from '@/lib/hooks/useSesionesEje'
import { usePautaGabinete, iniciarPreparacionGabinete, type NuevoPunto } from '@/lib/hooks/usePautaGabinete'
import { usePendientesGabinete } from '@/lib/hooks/usePendientesGabinete'
import type { Iniciativa } from '@/lib/projects'
import PasoPendientes from './PasoPendientes'
import PasoPauta from './PasoPauta'
import PasoRevisar from './PasoRevisar'

/**
 * Stepper de Preparación del Gabinete Regional v2 (spec v2 · "pauta como columna
 * vertebral"). Reemplaza el panel suelto de "Temas a tratar": un solo flujo
 * Pendientes → Pauta → Revisar y enviar, operando sobre la MISMA sesión-borrador
 * (≤1 por región). Diseño aprobado por Diego (mockup 2026-08-20).
 *
 * NO montado aún: al lanzar reemplaza a TemasGabinetePanel en el pane
 * Preparación (KanbanView / AttentionTray) y se aplican las migraciones 074-076.
 */

type Props = {
  region: { cod: string; nombre: string }
  projects: Iniciativa[]
  canOperar: boolean
  onOpenIniciativa: (prioridadId: number) => void
  onQuitarFoco: (prioridadId: number) => void
}

const PASOS = [
  { n: 1, t: 'Pendientes',       d: 'Qué arrastramos' },
  { n: 2, t: 'Pauta',            d: 'Los puntos, cartera por cartera' },
  { n: 3, t: 'Revisar y enviar', d: 'Hoja de conducción + citación' },
] as const

export default function PreparacionGabinete({ region, projects, canOperar, onOpenIniciativa, onQuitarFoco }: Props) {
  const { resumen, refresh: refreshResumen } = useSesionesResumen(region.cod, { instancia: 'gabinete' }, true)
  const sesionId = resumen.borradorId
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [pautaEnviadaAt, setPautaEnviadaAt] = useState<string | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // Mapa key-de-pendiente → id del punto creado. `promovidos` se DERIVA de acá
  // cruzando con la pauta viva: si el punto se borra en el paso 2, la key
  // desaparece del set y el pendiente vuelve a ofrecerse ("+ A la pauta").
  const [promovidosMap, setPromovidosMap] = useState<Map<string, number>>(new Map())

  const pautaApi = usePautaGabinete({ regionCod: region.cod, sesionId, enabled: true })
  const { pendientes, loading: pendientesLoading, borrarCompromiso, editarCompromiso, agregarRecurrente, borrarRecurrente } =
    usePendientesGabinete({ regionCod: region.cod, projects, enabled: true })

  const promovidos = useMemo(() => {
    const s = new Set<string>()
    for (const [key, temaId] of promovidosMap) {
      if (pautaApi.pauta.some(p => p.id === temaId)) s.add(key)
    }
    // Recurrentes: sobreviven una recarga vía recurrente_id del punto.
    for (const p of pautaApi.pauta) {
      if (p.recurrente_id != null) s.add(`rec-${p.recurrente_id}`)
    }
    return s
  }, [promovidosMap, pautaApi.pauta])

  // Cargar pauta_enviada_at del borrador (para el estado del footer).
  useEffect(() => {
    if (!sesionId) { setPautaEnviadaAt(null); return }
    let cancelled = false
    getSupabase().from('eje_sesiones').select('pauta_enviada_at').eq('id', sesionId).maybeSingle()
      .then(({ data }) => { if (!cancelled) setPautaEnviadaAt((data?.pauta_enviada_at as string | null) ?? null) })
    return () => { cancelled = true }
  }, [sesionId])

  const onPromover = useCallback(async (key: string, punto: NuevoPunto) => {
    const creado = await pautaApi.addPunto(punto)
    if (creado) setPromovidosMap(prev => new Map(prev).set(key, creado.id))
  }, [pautaApi])

  async function iniciar() {
    setIniciando(true)
    try {
      const email = (await getSupabase().auth.getUser()).data.user?.email ?? null
      await iniciarPreparacionGabinete(region.cod, email)
      refreshResumen()
    } catch (e) { window.alert((e as Error).message) }
    finally { setIniciando(false) }
  }

  async function enviarPauta() {
    if (!sesionId) return
    setEnviando(true)
    try {
      const res = await fetch(`/api/sesiones/${sesionId}/enviar-pauta`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { window.alert(body.error ?? 'No se pudo enviar la pauta.'); return }
      setPautaEnviadaAt(body.pauta_enviada_at ?? new Date().toISOString())
    } catch (e) { window.alert((e as Error).message) }
    finally { setEnviando(false) }
  }

  // ── Sin borrador: estado de arranque ───────────────────────────────────────
  if (!sesionId) {
    return (
      <div className="max-w-lg mx-auto text-center py-16 px-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-50 grid place-items-center text-violet-600 mb-4">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/></svg>
        </div>
        <h3 className="text-lg font-bold text-slate-900">Preparación de la próxima sesión</h3>
        <p className="text-sm text-slate-500 mt-1.5 leading-snug">
          Arma la pauta de izquierda a derecha: lo pendiente, los puntos por cartera, y la hoja que se despacha a los seremis.
        </p>
        {canOperar ? (
          <button onClick={iniciar} disabled={iniciando}
            className="mt-5 inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            {iniciando ? 'Iniciando…' : 'Iniciar preparación'}
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-400 italic">No hay una sesión en preparación.</p>
        )}
      </div>
    )
  }

  const enviada = !!pautaEnviadaAt

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header + hora de inicio */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-wider text-violet-700">Gabinete Regional · Preparación</div>
          <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mt-0.5">Arma la pauta de la próxima sesión</h2>
        </div>
        {paso >= 2 && (
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm">
            Hora de inicio
            <input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value || '09:00')}
              disabled={!canOperar}
              className="font-semibold text-slate-900 bg-transparent focus:outline-none tabular-nums" />
          </label>
        )}
      </div>

      {/* Rail de pasos */}
      <nav className="flex items-center bg-white border border-slate-200 rounded-xl p-1.5 shadow-sm mb-5" role="tablist">
        {PASOS.map((p, i) => (
          <div key={p.n} className="flex items-center flex-1">
            <button role="tab" aria-current={paso === p.n}
              onClick={() => setPaso(p.n as 1 | 2 | 3)}
              className={`flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg text-left transition-colors ${
                paso === p.n ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
              <span className={`w-[26px] h-[26px] rounded-full grid place-items-center text-[13px] font-bold flex-none ${
                paso > p.n ? 'bg-green-100 text-green-600'
                : paso === p.n ? 'bg-violet-600 text-white'
                : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                {paso > p.n ? '✓' : p.n}
              </span>
              <span className="min-w-0 leading-tight">
                <span className={`block text-[14px] font-semibold ${paso === p.n ? 'text-violet-800' : 'text-slate-700'}`}>{p.t}</span>
                <span className="block text-[12px] text-slate-400 truncate">{p.d}</span>
              </span>
            </button>
            {i < PASOS.length - 1 && (
              <svg className="text-slate-300 flex-none mx-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 6l6 6-6 6"/></svg>
            )}
          </div>
        ))}
      </nav>

      {/* Panel del paso */}
      {paso === 1 && (
        <PasoPendientes pendientes={pendientes} loading={pendientesLoading} canOperar={canOperar}
          promovidos={promovidos} projects={projects} onPromover={onPromover}
          onDeleteCompromiso={borrarCompromiso} onEditarCompromiso={editarCompromiso}
          onAgregarRecurrente={agregarRecurrente} onBorrarRecurrente={borrarRecurrente}
          onOpenIniciativa={onOpenIniciativa} onQuitarFoco={onQuitarFoco} />
      )}
      {paso === 2 && (
        <PasoPauta api={pautaApi} projects={projects} horaInicio={horaInicio} canOperar={canOperar} onOpenIniciativa={onOpenIniciativa} />
      )}
      {paso === 3 && (
        <PasoRevisar pauta={pautaApi.pauta} horaInicio={horaInicio} region={region} sesionId={sesionId} />
      )}

      {/* Footer de acciones */}
      <div className="sticky bottom-0 mt-5 bg-white/85 backdrop-blur border border-slate-200 rounded-xl shadow-lg px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="text-[13px] text-slate-500 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${enviada ? 'bg-green-500' : 'bg-orange-400'}`} />
          {enviada ? 'Pauta enviada a los seremis' : 'Borrador · la pauta aún no se envía'}
        </div>
        <div className="flex gap-2 flex-wrap">
          {paso > 1 && (
            <button onClick={() => setPaso((paso - 1) as 1 | 2 | 3)}
              className="text-[13.5px] font-semibold px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
              ← {PASOS.find(p => p.n === paso - 1)?.t}
            </button>
          )}
          {paso < 3 && (
            <button onClick={() => setPaso((paso + 1) as 1 | 2 | 3)}
              className="text-[13.5px] font-semibold px-4 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
              {PASOS.find(p => p.n === paso + 1)?.t} →
            </button>
          )}
          {paso === 3 && canOperar && (
            <button onClick={enviarPauta} disabled={enviando || pautaApi.pauta.length === 0}
              className={`text-[13.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-60 ${
                enviada ? 'bg-green-100 text-green-700' : 'bg-violet-600 text-white hover:bg-violet-700'}`}>
              {enviada ? '✓ Pauta enviada — reenviar' : enviando ? 'Enviando…' : 'Enviar pauta a los seremis'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
