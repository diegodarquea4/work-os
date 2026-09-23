'use client'

import { SEMAFORO_CONFIG } from '@/lib/config'
import type { Iniciativa } from '@/lib/projects'

/**
 * Una fila de la cartera del Comité de Infraestructura: la card de la
 * iniciativa más, opcionalmente, la acción de sacarla del comité.
 *
 * Vive acá y no dentro del tab porque la usan las dos pantallas —el preview
 * del panel y la cartera completa— y ya había una copia de este mismo card en
 * ComiteEconomicoProyectosPanel. Una sola definición evita que se separen.
 *
 * SIN etiquetas a propósito: adentro del comité TODAS llevan la del comité, así
 * que repetirla en cada fila no distingue nada, y los megaproyectos —que también
 * son etiquetas— o son el encabezado del grupo (preview) o van como `contexto`
 * (cartera completa).
 */

type Props = {
  p: Iniciativa
  onAbrir: () => void
  /** Si se omite, la fila es solo de lectura (sin la × para sacarla). */
  onQuitar?: () => void
  quitando?: boolean
  /** Megaproyectos de la iniciativa, para mostrarlos donde no hay agrupación. */
  megaproyectos?: string[]
}

export default function FilaCarteraInfra({ p, onAbrir, onQuitar, quitando = false, megaproyectos }: Props) {
  const sem = SEMAFORO_CONFIG[p.estado_semaforo as keyof typeof SEMAFORO_CONFIG] ?? SEMAFORO_CONFIG.gris
  const pct = p.pct_avance ?? 0
  // Mismo criterio que la ficha: sin comuna cargada, una iniciativa marcada
  // como regional lo dice en vez de quedar en blanco.
  const lugar = p.comuna ?? (p.alcance_regional ? 'Alcance regional' : null)
  const contexto = [lugar, p.ministerio].filter(Boolean).join(' · ')

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={onAbrir}
        className="flex-1 min-w-0 text-left px-2.5 py-2 border border-slate-200 rounded-lg hover:border-violet-300 hover:shadow-sm bg-white transition-all flex items-center gap-2.5"
        title="Ver ficha completa de la iniciativa"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${sem.dot}`} title={sem.label} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-800 font-medium truncate">{p.nombre}</p>
          {(contexto || (megaproyectos && megaproyectos.length > 0)) && (
            <p className="text-[11px] text-gray-400 truncate">
              {megaproyectos && megaproyectos.length > 0 && (
                <span className="text-violet-600 font-medium">{megaproyectos.join(' · ')}</span>
              )}
              {megaproyectos && megaproyectos.length > 0 && contexto ? ' — ' : ''}
              {contexto}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-1 rounded-full ${sem.dot}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-semibold text-gray-600 tabular-nums w-9 text-right">{pct}%</span>
        </div>
      </button>

      {/* Fuera del botón principal, nunca adentro: un <button> dentro de otro es
          HTML inválido y el navegador desarma el marcado. */}
      {onQuitar && (
        <button
          onClick={onQuitar}
          disabled={quitando}
          aria-label={`Sacar ${p.nombre} de la cartera del comité`}
          title="Sacar de la cartera del comité"
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          {quitando ? (
            <span className="text-[10px] font-semibold text-gray-400">···</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15"/>
            </svg>
          )}
        </button>
      )}
    </div>
  )
}
