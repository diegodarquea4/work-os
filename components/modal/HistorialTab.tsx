'use client'

import type { Seguimiento, SemaforoLog } from '@/lib/types'
import type { SemaforoKey } from '@/lib/config'

const TIPO_CONFIG = {
  avance:  { label: 'Avance',  color: 'bg-blue-100 text-blue-700',    dot: 'bg-blue-500'   },
  reunion: { label: 'Reunión', color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500' },
  hito:    { label: 'Hito',    color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'  },
  alerta:  { label: 'Alerta',  color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'    },
} as const

const ESTADO_CONFIG = {
  en_curso:   { label: 'En curso',   color: 'bg-blue-100 text-blue-700'   },
  completado: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  bloqueado:  { label: 'Bloqueado',  color: 'bg-red-100 text-red-700'     },
  pendiente:  { label: 'Pendiente',  color: 'bg-gray-100 text-gray-600'   },
} as const

const SEM_COLOR: Record<string, string> = {
  verde: 'bg-green-500', ambar: 'bg-amber-400', rojo: 'bg-red-500', gris: 'bg-gray-300',
}
const SEM_TEXT: Record<string, string> = {
  verde: 'text-green-600', ambar: 'text-amber-600', rojo: 'text-red-600', gris: 'text-gray-500',
}
const SEM_LABEL: Record<string, string> = {
  verde: 'En verde', ambar: 'En revisión', rojo: 'Bloqueado', gris: 'Sin evaluar',
}

type Props = {
  seguimientos: Seguimiento[]
  semaforoLog: SemaforoLog[]
  semaforo: SemaforoKey
  pctAvance: number
}

export default function HistorialTab({ seguimientos, semaforoLog, semaforo, pctAvance }: Props) {
  return (
    <div className="px-6 py-5 space-y-6">

      {/* Progreso */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Progreso</h3>
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-600">Avance del proyecto</span>
            <span className="text-xs font-bold text-gray-800">{pctAvance}%</span>
          </div>
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                semaforo === 'rojo' ? 'bg-red-400' :
                semaforo === 'ambar' ? 'bg-amber-400' :
                semaforo === 'verde' ? 'bg-green-500' : 'bg-gray-400'
              }`}
              style={{ width: `${pctAvance}%` }}
            />
          </div>
        </div>
      </div>

      {/* Trayectoria semáforo */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Trayectoria del semáforo</h3>
        {semaforoLog.length === 0 ? (
          <p className="text-xs text-gray-400">Sin cambios registrados aún</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1 flex-wrap">
              {semaforoLog.filter(l => l.campo === 'semaforo').map((l, i) => (
                <div key={l.id} className="flex items-center gap-1">
                  {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                  <div
                    className="flex flex-col items-center gap-0.5"
                    title={`${new Date(l.created_at).toLocaleDateString('es-CL')}${l.cambiado_por ? ` · ${l.cambiado_por}` : ''}`}
                  >
                    <span className={`w-5 h-5 rounded-full ${SEM_COLOR[l.valor_nuevo] ?? 'bg-gray-300'}`} />
                    <span className="text-gray-400" style={{ fontSize: '9px' }}>
                      {new Date(l.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
              {semaforoLog.some(l => l.campo === 'semaforo') && (
                <div className="flex items-center gap-1">
                  <span className="text-gray-300 text-xs">→</span>
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`w-5 h-5 rounded-full ring-2 ring-offset-1 ring-gray-400 ${SEM_COLOR[semaforo]}`} />
                    <span className="text-gray-500 font-medium" style={{ fontSize: '9px' }}>hoy</span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5 mt-2">
              {semaforoLog.map(l => (
                <div key={l.id} className="flex items-start gap-2 text-xs text-gray-600">
                  <span className="text-gray-400 flex-shrink-0 w-20 mt-0.5">
                    {new Date(l.created_at).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                  {l.campo === 'semaforo' ? (
                    <span>
                      Semáforo:&nbsp;
                      <span className="text-gray-500">{SEM_LABEL[l.valor_anterior ?? ''] ?? l.valor_anterior ?? '—'}</span>
                      &nbsp;→&nbsp;
                      <span className={`font-semibold ${SEM_TEXT[l.valor_nuevo] ?? ''}`}>{SEM_LABEL[l.valor_nuevo] ?? l.valor_nuevo}</span>
                    </span>
                  ) : (
                    <span>
                      Avance:&nbsp;
                      <span className="text-gray-500">{l.valor_anterior ?? '—'}%</span>
                      &nbsp;→&nbsp;
                      <span className="font-semibold text-slate-700">{l.valor_nuevo}%</span>
                    </span>
                  )}
                  {l.cambiado_por && <span className="text-gray-400 ml-auto">{l.cambiado_por}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Timeline por mes */}
      {seguimientos.length > 0 && (() => {
        const byMonth: Record<string, Seguimiento[]> = {}
        for (const s of seguimientos) {
          const d = new Date(s.fecha ? s.fecha + 'T12:00:00' : s.created_at)
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          if (!byMonth[key]) byMonth[key] = []
          byMonth[key].push(s)
        }
        const months = Object.keys(byMonth).sort().reverse()

        return (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Actividad por mes</h3>
            <div className="space-y-4">
              {months.map(monthKey => {
                const [y, m] = monthKey.split('-')
                const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' })
                const entries = byMonth[monthKey]
                const counts = { avance: 0, reunion: 0, hito: 0, alerta: 0 }
                entries.forEach(s => { counts[s.tipo] = (counts[s.tipo] ?? 0) + 1 })
                return (
                  <div key={monthKey}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-semibold text-gray-700 capitalize">{label}</span>
                      <div className="flex items-center gap-1 ml-auto">
                        {(Object.entries(counts) as [keyof typeof TIPO_CONFIG, number][])
                          .filter(([, n]) => n > 0)
                          .map(([tipo, n]) => (
                            <span key={tipo} className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${TIPO_CONFIG[tipo].color}`}>
                              {n} {TIPO_CONFIG[tipo].label}
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="relative pl-4">
                      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-100" />
                      <div className="space-y-2">
                        {entries.map(s => {
                          const cfg = TIPO_CONFIG[s.tipo]
                          const est = s.estado ? ESTADO_CONFIG[s.estado as keyof typeof ESTADO_CONFIG] : null
                          return (
                            <div key={s.id} className="flex gap-2 items-start">
                              <span className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${cfg.dot} ring-2 ring-white`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>{cfg.label}</span>
                                  {est && <span className={`text-xs px-1.5 py-0.5 rounded-full ${est.color}`}>{est.label}</span>}
                                  <span className="text-xs text-gray-400 ml-auto">
                                    {new Date((s.fecha ?? s.created_at) + (s.fecha ? 'T12:00:00' : '')).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-700 leading-snug">{s.descripcion}</p>
                                {s.autor && <p className="text-xs text-gray-400 mt-0.5">{s.autor}</p>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
