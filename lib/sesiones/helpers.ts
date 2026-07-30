/**
 * Helpers puros del módulo Sesiones (comités mig 044 + Gabinete Regional
 * mig 046) — sin dependencias de Supabase ni de React, para que la lógica
 * crítica sea testeable en vitest.
 *
 * Reglas de negocio (spec §8 + spec gabinete §8):
 *  - Cerrar sesión con métrica suma: valor_actual += valor de la sesión.
 *  - Cerrar con pulso: valor_actual = valor (reemplaza; foto semanal).
 *  - Compromiso abierto = pendiente | en_curso (aparece en la zona 1 de la
 *    sesión siguiente hasta quedar cumplido).
 *  - Sesión cerrada es inmutable; el acta NO se regenera si ya existe.
 *  - Zona 1 del gabinete = propios ∪ escalados ∪ mandatos, sin duplicados.
 *  - El path del acta SIEMPRE empieza con region_cod (policy de storage).
 */

import type {
  EjeSesion, SesionCompromiso, SesionIniciativa,
  ComiteInstitucion, ComiteMetrica, SesionComiteValor,
} from '@/lib/types'

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

// ── Reporte por institución del Comité Policial (mig 048) ────────────────────

/** Instituciones fijas del Comité Policial, en orden de presentación. */
export const COMITE_INSTITUCIONES: { key: ComiteInstitucion; label: string }[] = [
  { key: 'carabineros', label: 'Carabineros' },
  { key: 'pdi',         label: 'PDI' },
  { key: 'armada',      label: 'Armada' },
  { key: 'gendarmeria', label: 'Gendarmería' },
]

/** Fila de la ficha/acta: definición (catálogo) + valor reportado (o null). */
export type FilaComite = { metrica: ComiteMetrica; valor: SesionComiteValor | null }

/** ¿La fila tiene algún dato reportado (número, texto, observación o desglose)? */
export function tieneValorComite(v: SesionComiteValor | null): boolean {
  if (!v) return false
  return v.valor_num != null
    || !!(v.valor_texto && v.valor_texto.trim())
    || !!(v.observaciones && v.observaciones.trim())
    || (Array.isArray(v.desglose) && v.desglose.length > 0)
}

/**
 * Agrupa el catálogo por institución (orden estable) y adjunta el valor
 * reportado en la sesión (o null → fila vacía para digitar). Mantiene TODAS las
 * métricas activas para la ficha; `soloConValor=true` filtra a las que tienen
 * dato (para el acta — no imprimir ítems en blanco).
 */
export function agruparPorInstitucion(
  catalogo: ComiteMetrica[],
  valores: SesionComiteValor[],
  soloConValor = false,
): { institucion: ComiteInstitucion; label: string; filas: FilaComite[] }[] {
  const porMetrica = new Map<number, SesionComiteValor>()
  for (const v of valores) porMetrica.set(v.metrica_id, v)
  return COMITE_INSTITUCIONES.map(inst => {
    const filas = catalogo
      .filter(m => m.institucion === inst.key && m.activo)
      .sort((a, b) => a.orden - b.orden || a.id - b.id)
      .map(m => ({ metrica: m, valor: porMetrica.get(m.id) ?? null }))
      .filter(f => !soloConValor || tieneValorComite(f.valor))
    return { institucion: inst.key, label: inst.label, filas }
  })
}

/**
 * Texto del valor principal para ficha/acta. Numérico → número (miles es-CL) +
 * unidad; texto → el texto; vacío → "—".
 */
export function formatoValorComite(v: SesionComiteValor | null, m: ComiteMetrica): string {
  if (m.tipo === 'texto') {
    const t = v?.valor_texto?.trim()
    return t && t.length > 0 ? t : '—'
  }
  if (v?.valor_num == null) return '—'
  const num = v.valor_num.toLocaleString('es-CL')
  return m.unidad ? `${num} ${m.unidad}` : num
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

// ── Zona 1 del gabinete: clasificación de compromisos ───────────────────────

/**
 * Origen de un compromiso en la zona 1 de la sesión de gabinete:
 *  - 'gabinete': creado en una sesión de gabinete y gestionado ahí.
 *  - 'escalado': compromiso de comité (instancia='eje') marcado
 *    escalado_a_gabinete — el comité lo sigue viendo; acá se verifica también.
 *  - 'mandato': compromiso dirigido POR el gabinete a un comité
 *    (instancia='eje' con sesion_origen_id de una sesión de gabinete) — el
 *    gabinete verifica su avance aunque se gestione en el comité.
 */
export type OrigenCompromisoGabinete = 'gabinete' | 'escalado' | 'mandato'

export type CompromisoClasificado = SesionCompromiso & { origenTipo: OrigenCompromisoGabinete }

/**
 * Merge + dedupe de las tres listas de la zona 1 del gabinete. Un mandato que
 * además fue escalado aparece UNA vez con origenTipo='escalado' (es el flag
 * más informativo para el gabinete: "el comité no pudo con esto"). Orden por
 * created_at ascendente (id como desempate estable).
 */
export function clasificarCompromisosGabinete(
  propios: SesionCompromiso[],
  escalados: SesionCompromiso[],
  mandatos: SesionCompromiso[],
): CompromisoClasificado[] {
  const porId = new Map<number, CompromisoClasificado>()
  for (const c of propios)   porId.set(c.id, { ...c, origenTipo: 'gabinete' })
  for (const c of mandatos)  porId.set(c.id, { ...c, origenTipo: 'mandato' })
  for (const c of escalados) porId.set(c.id, { ...c, origenTipo: 'escalado' })
  return Array.from(porId.values()).sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id,
  )
}

// ── Zona 3 del gabinete: agenda de iniciativas ───────────────────────────────

/**
 * Qué iniciativas en foco FALTAN en la agenda guardada de la sesión — son las
 * que la precarga inserta en sesion_iniciativas al abrir el borrador. NO
 * devuelve las guardadas que dejaron de estar en foco: una vez en la agenda,
 * la iniciativa se queda (sacarla es acción explícita del usuario). Esto
 * también protege el UNIQUE(sesion_id, prioridad_id): nunca re-inserta.
 */
export function filasZona3Faltantes(
  enFoco: { id: number }[],
  guardadas: Pick<SesionIniciativa, 'prioridad_id'>[],
): number[] {
  const ya = new Set(guardadas.map(g => g.prioridad_id))
  const faltantes: number[] = []
  for (const p of enFoco) {
    if (!ya.has(p.id) && !faltantes.includes(p.id)) faltantes.push(p.id)
  }
  return faltantes
}

// ── Panorama por eje (bloque 2 de la sesión / sección III del acta) ─────────

export type PanoramaEje = {
  eje: string
  rojo: number
  ambar: number
  verde: number
  gris: number
  avgPct: number
  total: number
}

/**
 * Agregación de semáforos y avance por eje sobre las iniciativas de la
 * región — la misma fuente que "Ejes estratégicos" de Mi Región, congelada
 * al momento del cierre para el acta. Orden alfabético por eje.
 */
export function panoramaPorEje(
  rows: { eje: string | null; estado_semaforo: string | null; pct_avance: number | null }[],
): PanoramaEje[] {
  const porEje = new Map<string, { rojo: number; ambar: number; verde: number; gris: number; sumaPct: number; total: number }>()
  for (const r of rows) {
    const eje = (r.eje ?? '').trim() || 'Sin eje'
    let acc = porEje.get(eje)
    if (!acc) {
      acc = { rojo: 0, ambar: 0, verde: 0, gris: 0, sumaPct: 0, total: 0 }
      porEje.set(eje, acc)
    }
    const sem = r.estado_semaforo
    if (sem === 'rojo') acc.rojo++
    else if (sem === 'ambar') acc.ambar++
    else if (sem === 'verde') acc.verde++
    else acc.gris++
    acc.sumaPct += r.pct_avance ?? 0
    acc.total++
  }
  return Array.from(porEje.entries())
    .map(([eje, a]) => ({
      eje,
      rojo: a.rojo,
      ambar: a.ambar,
      verde: a.verde,
      gris: a.gris,
      avgPct: a.total > 0 ? Math.round(a.sumaPct / a.total) : 0,
      total: a.total,
    }))
    .sort((a, b) => a.eje.localeCompare(b.eje, 'es'))
}

// ── Path del acta en storage ─────────────────────────────────────────────────

/**
 * Path del acta en el bucket privado comite-docs. INVARIANTE: el primer
 * segmento es SIEMPRE region_cod — las policies de storage.objects filtran
 * por foldername[1] (mig 044); si esto se rompe, las DPR no pueden descargar
 * actas. Por eso el gabinete va en {region}/gabinete/… y NO en
 * gabinete/{region}/… como sugería el spec.
 */
export function actaStoragePath(
  s: Pick<EjeSesion, 'id' | 'region_cod' | 'instancia' | 'fecha'>,
): string {
  return s.instancia === 'gabinete'
    ? `${s.region_cod}/gabinete/${s.id}/acta-${s.fecha}.pdf`
    : `${s.region_cod}/${s.id}/acta-${s.fecha}.pdf`
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
 *
 * `metricas_aplicadas` es el marcador genérico de "cierre core completo":
 * el cierre de GABINETE no aplica métricas pero lo setea igual — sin eso
 * el reintento de acta de una sesión de gabinete daría 409 para siempre.
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
