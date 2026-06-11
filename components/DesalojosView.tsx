'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Iniciativa } from '@/lib/projects'
import type { DesalojoCapa, DesalojoFaseEstado, SemaforoDimension } from '@/lib/types'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { FASES_CON_SEMAFORO, FASE_CFG, aplicaFase, rollupSemaforoFase } from '@/lib/desalojos'
import DesalojoBadge from './DesalojoBadge'
import DesalojoCaseView from './DesalojoCaseView'
import DesalojoTablero from './DesalojoTablero'
import { HomeIcon } from './icons/HomeIcon'

/**
 * Vista de la Mesa Interministerial de Desalojos. Admin-only (el render se
 * gatea desde WorkOSApp; las API routes también validan rol).
 *
 * v2: dos modos.
 *   - Lista: split desktop (340px lista + ficha), foco de trabajo.
 *   - Tablero: matriz proyectable (densidad media, tipografía base, lectura
 *     a distancia) — pensada para sesión de la Mesa.
 *
 * En modo Lista, la fila de cada caso muestra el ROLLUP de los semáforos de
 * sus capas activas (peor por severidad de atención). Lo mismo el indicador
 * silencioso de financiamiento bloqueado.
 */

type Props = {
  projects:           Iniciativa[]
  onUpdatePrioridad: (n: number, patch: Partial<Iniciativa>) => void
}

type Caso = {
  prioridad_id: number
  capas:        DesalojoCapa[]
  fases_estado: DesalojoFaseEstado[]
}

export default function DesalojosView({ projects }: Props) {
  const cases = useMemo(
    () => projects.filter(p => p.es_desalojo).sort((a, b) => a.nombre.localeCompare(b.nombre)),
    [projects],
  )

  const [modo, setModo]                       = useState<'lista' | 'tablero'>('lista')
  const [selectedN, setSelectedN]             = useState<number | null>(null)
  const [casosByN, setCasosByN]               = useState<Map<number, Caso>>(new Map())
  const [loading, setLoading]                 = useState(true)
  const [loadError, setLoadError]             = useState<string | null>(null)

  // Fetch bulk de casos + capas (single round-trip) — evita N+1.
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError(null)
      try {
        const res  = await fetch('/api/desalojos')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) {
          setLoadError(json?.error ?? `Error HTTP ${res.status}`)
          setCasosByN(new Map())
        } else {
          const m = new Map<number, Caso>()
          for (const c of (json.casos ?? []) as Caso[]) {
            m.set(c.prioridad_id, c)
          }
          setCasosByN(m)
        }
      } catch (err) {
        if (!cancelled) setLoadError(`Error de red: ${String(err)}`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Auto-seleccionar el primero si no hay nada seleccionado.
  useEffect(() => {
    if (selectedN === null && cases.length > 0) {
      setSelectedN(cases[0].n)
    } else if (selectedN !== null && !cases.find(c => c.n === selectedN)) {
      setSelectedN(cases[0]?.n ?? null)
    }
  }, [cases, selectedN])

  const selectedIniciativa = selectedN !== null ? cases.find(c => c.n === selectedN) ?? null : null

  // ── Estado vacío ─────────────────────────────────────────────────────────

  if (cases.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md text-center space-y-3">
          <div className="mx-auto w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
            <HomeIcon className="w-7 h-7" />
          </div>
          <h2 className="text-base font-bold text-gray-800">Sin casos etiquetados</h2>
          <p className="text-sm text-gray-500 leading-relaxed">
            Aún no hay iniciativas marcadas como caso de desalojo. Para etiquetar una,
            ábrela desde Kanban / Mi Región / Dashboard y usa el botón &quot;Marcar desalojo&quot;
            en la ficha. Solo admin puede etiquetar.
          </p>
        </div>
      </div>
    )
  }

  // ── Tablero ──────────────────────────────────────────────────────────────

  if (modo === 'tablero') {
    return (
      <div className="h-full overflow-y-auto bg-gray-50">
        <div className="px-6 py-4 border-b border-gray-200 bg-white flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <DesalojoBadge size="md" />
            <h1 className="text-base font-bold text-gray-900">Tablero de la Mesa</h1>
          </div>
          <ModoToggle modo={modo} setModo={setModo} />
        </div>
        <DesalojoTablero
          cases={cases}
          casosByN={casosByN}
          loading={loading}
          loadError={loadError}
        />
      </div>
    )
  }

  // ── Lista (split) ────────────────────────────────────────────────────────

  return (
    <div className="h-full flex bg-gray-50">

      {/* Lista de casos */}
      <aside className="w-[340px] flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <header className="px-4 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Casos de desalojo</h2>
            <ModoToggle modo={modo} setModo={setModo} compact />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{cases.length} {cases.length === 1 ? 'caso etiquetado' : 'casos etiquetados'}</p>
        </header>
        {loadError && (
          <div className="m-3 p-2.5 text-xs bg-red-50 border border-red-200 rounded-lg text-red-700">
            {loadError}
          </div>
        )}
        <ul>
          {cases.map(c => {
            const caso     = casosByN.get(c.n)
            const capas    = caso?.capas ?? []
            const fases    = caso?.fases_estado ?? []
            const capasActivasIds = new Set(capas.filter(k => k.activa).map(k => k.id))
            const isActive = c.n === selectedN
            const sem      = SEMAFORO_CONFIG[c.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
            const sinDipres = capas.some(k => k.activa && k.financiamiento_asegurado === false)
            return (
              <li key={c.n}>
                <button
                  onClick={() => setSelectedN(c.n)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 transition-colors ${
                    isActive ? 'bg-slate-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 line-clamp-2 leading-snug">{c.nombre}</p>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {c.region}
                        {c.comuna && <> · {c.comuna.replace(/;/g, ', ')}</>}
                      </p>
                      {/* Mini dots del rollup por fase — sólo fases aplicables a alguna capa activa */}
                      <div className="flex items-center gap-1.5 mt-1.5">
                        {FASES_CON_SEMAFORO.map(f => {
                          // Conjunto de capas activas para las que esta fase aplica.
                          const idsAplicables = new Set(
                            capas.filter(k => k.activa && aplicaFase(k, f)).map(k => k.id),
                          )
                          if (idsAplicables.size === 0) return null  // ninguna capa usa esta fase
                          const semValue: SemaforoDimension = rollupSemaforoFase(fases, idsAplicables, f)
                          const dotCls = SEMAFORO_CONFIG[semValue]?.dot ?? SEMAFORO_CONFIG.gris.dot
                          return (
                            <span
                              key={f}
                              title={`${FASE_CFG[f].label} — ${SEMAFORO_CONFIG[semValue]?.label ?? 'Sin evaluar'}`}
                              className="inline-flex items-center gap-0.5 text-[10px] text-gray-400"
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                              {FASE_CFG[f].short}
                            </span>
                          )
                        })}
                        {/* Indicador silencioso si alguna capa activa sin DIPRES */}
                        {sinDipres && (
                          <span title="Una o más capas sin financiamiento DIPRES" className="text-[10px] text-red-600 font-bold ml-auto">!</span>
                        )}
                        {capasActivasIds.size > 1 && (
                          <span title={`${capasActivasIds.size} capas`} className="text-[10px] text-gray-500 ml-auto">
                            {capasActivasIds.size} capas
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
        {loading && (
          <p className="text-xs text-gray-400 text-center py-3">Cargando capas…</p>
        )}
        <header className="px-4 py-3 border-t border-gray-100 mt-4">
          <p className="text-[11px] text-gray-400 leading-snug flex items-start gap-1.5">
            <DesalojoBadge size="inline" showLabel={false} />
            Mesa Interministerial de Desalojos · DCI · Ministerio del Interior
          </p>
        </header>
      </aside>

      {/* Ficha del caso seleccionado */}
      <main className="flex-1 min-w-0 overflow-hidden">
        {selectedIniciativa ? (
          <DesalojoCaseView key={selectedIniciativa.n} iniciativa={selectedIniciativa} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            Selecciona un caso de la izquierda para ver su seguimiento.
          </div>
        )}
      </main>
    </div>
  )
}

// ── Toggle Lista/Tablero ────────────────────────────────────────────────────

function ModoToggle({
  modo, setModo, compact = false,
}: {
  modo:    'lista' | 'tablero'
  setModo: (m: 'lista' | 'tablero') => void
  compact?: boolean
}) {
  const pxy = compact ? 'px-2 py-0.5' : 'px-3 py-1.5'
  return (
    <div className="inline-flex bg-gray-100 rounded-full p-0.5">
      <button
        onClick={() => setModo('lista')}
        className={`text-xs ${pxy} rounded-full font-semibold transition-colors ${
          modo === 'lista' ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Lista
      </button>
      <button
        onClick={() => setModo('tablero')}
        className={`text-xs ${pxy} rounded-full font-semibold transition-colors ${
          modo === 'tablero' ? 'bg-slate-900 text-white' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        Tablero
      </button>
    </div>
  )
}
