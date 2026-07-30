/**
 * Helpers puros del módulo Sesiones (Comité Policial) — sin dependencias de
 * Supabase ni de React, para que la lógica crítica sea testeable en vitest.
 *
 * Reglas de negocio (spec §8):
 *  - Cerrar sesión con métrica suma: valor_actual += valor de la sesión.
 *  - Cerrar con pulso: valor_actual = valor (reemplaza; foto semanal).
 *  - Compromiso abierto = pendiente | en_curso (aparece en la zona 1 de la
 *    sesión siguiente hasta quedar cumplido).
 *  - Sesión cerrada es inmutable; el acta NO se regenera si ya existe.
 */

import type { EjeSesion, SesionCompromiso, SesionOficioTratado } from '@/lib/types'

// ── Agregación suma/pulso ────────────────────────────────────────────────────

/**
 * Nuevo valor_actual de una métrica al aplicar el valor digitado en la sesión.
 * ¡Cuidado con null!: `null + 12` en JS ingenuo da NaN vía coerción — una
 * métrica nunca reportada (valor_actual null) parte de 0.
 */
export function aplicarValorMetrica(
  tipo: 'suma' | 'pulso',
  valorActual: number | null,
  valorSesion: number,
): number {
  if (tipo === 'pulso') return valorSesion
  return (valorActual ?? 0) + valorSesion
}

// ── Tendencia pulso ──────────────────────────────────────────────────────────

/**
 * Delta de una métrica pulso vs la sesión anterior. null si no hay sesión
 * anterior (primera medición — sin tendencia que mostrar). Si el valor
 * anterior es 0 no se puede calcular % (división por cero) — pct va null y
 * la UI muestra solo el delta absoluto.
 */
export function deltaPulso(
  prev: number | null,
  curr: number,
): { abs: number; pct: number | null } | null {
  if (prev === null) return null
  const abs = curr - prev
  const pct = prev === 0 ? null : (abs / prev) * 100
  return { abs, pct }
}

// ── Compromisos ──────────────────────────────────────────────────────────────

/**
 * ¿El compromiso sigue vivo para la sesión siguiente? Solo depende del
 * estado — NO de cerrado_en_sesion_id (un cumplido de la sesión en curso ya
 * no es "abierto" aunque todavía no tenga sesión de cierre asignada).
 */
export function esCompromisoAbierto(c: Pick<SesionCompromiso, 'estado'>): boolean {
  return c.estado === 'pendiente' || c.estado === 'en_curso'
}

// ── Oficios pendientes (Comité Seguimiento de la Inversión) ──────────────────

/**
 * ¿El oficio tratado sigue vivo para la sesión siguiente? Mismo principio
 * que esCompromisoAbierto: solo depende del estado.
 */
export function esOficioAbierto(o: Pick<SesionOficioTratado, 'estado'>): boolean {
  return o.estado === 'pendiente'
}

// ── Instituciones sugeridas (tabs de apuntes) ────────────────────────────────

/**
 * Universo de instituciones para los tabs de apuntes: las que ya tienen
 * apuntes en la región ∪ las de la nómina. Dedupe insensible a mayúsculas y
 * espacios ("PDI" ≡ " pdi ") conservando la primera forma vista.
 */
export function institucionesSugeridas(
  deApuntes: string[],
  deNomina: string[],
): string[] {
  const vistas = new Map<string, string>()
  for (const raw of [...deApuntes, ...deNomina]) {
    const limpio = raw.trim()
    if (!limpio) continue
    const key = limpio.toLowerCase()
    if (!vistas.has(key)) vistas.set(key, limpio)
  }
  return Array.from(vistas.values())
}

// ── Guards de estado del cierre (idempotencia) ───────────────────────────────
// El claim atómico en BD (UPDATE ... WHERE estado='borrador') es la defensa
// real contra carreras; estos guards dan el código HTTP correcto ANTES de
// intentar y son la referencia única de la máquina de estados.

export type GuardResultado =
  | { ok: true }
  | { ok: false; status: 404 | 409 | 422; error: string }

type SesionEstado = Pick<EjeSesion, 'estado' | 'metricas_aplicadas' | 'acta_path'>

/** ¿Se puede cerrar la sesión? Solo un borrador se cierra. */
export function puedeCerrar(sesion: SesionEstado | null): GuardResultado {
  if (!sesion) return { ok: false, status: 404, error: 'Sesión no encontrada' }
  if (sesion.estado === 'cerrada') {
    return { ok: false, status: 409, error: 'La sesión ya está cerrada' }
  }
  return { ok: true }
}

/**
 * ¿Se puede (re)generar el acta? Solo sobre una sesión cerrada, con métricas
 * ya aplicadas (nunca generar acta sobre un cierre a medio aplicar) y SIN
 * acta previa (regla 5 del spec: el acta no se regenera — es el registro
 * oficial de lo que se cerró).
 */
export function puedeRegenerarActa(sesion: SesionEstado | null): GuardResultado {
  if (!sesion) return { ok: false, status: 404, error: 'Sesión no encontrada' }
  if (sesion.estado !== 'cerrada') {
    return { ok: false, status: 409, error: 'La sesión no está cerrada — el acta se genera al cerrar' }
  }
  if (!sesion.metricas_aplicadas) {
    return { ok: false, status: 409, error: 'El cierre quedó incompleto (métricas sin aplicar) — contacta a la división' }
  }
  if (sesion.acta_path) {
    return { ok: false, status: 409, error: 'El acta ya fue generada y no se regenera' }
  }
  return { ok: true }
}
