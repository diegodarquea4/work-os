import { SEMAFORO_CONFIG, type SemaforoKey } from '@/lib/config'

/**
 * Semáforo del sistema — SIEMPRE desde lib/config (fuente única de dot + label).
 * Reemplaza los puntos inline duplicados (bg-red-500/bg-amber-400/…) y los
 * configs locales que divergían en labels.
 */

// Presentación soft del pill (bg + text + ring). El dot y el label vienen de
// SEMAFORO_CONFIG — acá solo el "chip" de fondo, específico de la píldora.
const PILL: Record<SemaforoKey, string> = {
  verde: 'bg-green-50 text-green-700 ring-green-200',
  ambar: 'bg-amber-50 text-amber-700 ring-amber-200',
  rojo:  'bg-red-50 text-red-700 ring-red-200',
  gris:  'bg-slate-100 text-slate-600 ring-slate-200',
}

export function StatusDot({ estado, className = '' }: { estado: SemaforoKey; className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${SEMAFORO_CONFIG[estado].dot} ${className}`}
      title={SEMAFORO_CONFIG[estado].label}
      aria-label={SEMAFORO_CONFIG[estado].label}
    />
  )
}

export function StatusPill({
  estado, showLabel = true, className = '',
}: { estado: SemaforoKey; showLabel?: boolean; className?: string }) {
  const cfg = SEMAFORO_CONFIG[estado]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${PILL[estado]} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {showLabel && cfg.label}
    </span>
  )
}
