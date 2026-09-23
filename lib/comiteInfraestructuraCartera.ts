import type { Iniciativa } from '@/lib/projects'
import { CAPA_OPCIONES } from '@/lib/capas'
import { SEMAFORO_CONFIG } from '@/lib/config'
import { splitMinisterio } from '@/lib/ministerios'

/**
 * Filtros, orden y export de la cartera del Comité de Infraestructura a
 * pantalla completa. Puro salvo el Excel, que importa `xlsx` recién al usarse
 * (mismo criterio que lib/comiteEconomico.ts — no engorda el bundle inicial).
 *
 * Los filtros NO son los del Comité Económico y no pueden serlo: los suyos
 * (plazo, priorizado, riesgo, SEREMI líder, permiso PAS) son columnas de
 * `comite_economico_proyecto`, su tabla propia. Acá la cartera son
 * `prioridades_territoriales`, así que se filtra por lo que una iniciativa sí
 * tiene: megaproyecto, semáforo, ministerio, comuna, capa y etapa.
 *
 * Semántica, la misma que los filtros del Mapa: Y entre filtros distintos, O
 * dentro de cada uno. Y las OPCIONES se calculan sobre la cartera completa, no
 * sobre lo ya filtrado — si dependieran de la selección propia, al elegir una
 * las demás desaparecerían y no habría cómo volver a agregarlas.
 */

/** Marcadores para "no tiene el dato", que igual hay que poder pedir. */
export const SIN_MEGAPROYECTO = '__sin_megaproyecto__'
export const SIN_COMUNA       = '__sin_comuna__'
export const SIN_ETAPA        = '__sin_etapa__'

export type FiltrosCartera = {
  megaproyecto: Set<string>
  semaforo:     Set<string>
  ministerio:   Set<string>
  comuna:       Set<string>
  capa:         Set<string>
  etapa:        Set<string>
}

export function filtrosVacios(): FiltrosCartera {
  return {
    megaproyecto: new Set(), semaforo: new Set(), ministerio: new Set(),
    comuna: new Set(), capa: new Set(), etapa: new Set(),
  }
}

export function hayFiltros(f: FiltrosCartera): boolean {
  return f.megaproyecto.size > 0 || f.semaforo.size > 0 || f.ministerio.size > 0
    || f.comuna.size > 0 || f.capa.size > 0 || f.etapa.size > 0
}

/**
 * Megaproyectos de una iniciativa = sus tags que están en la curaduría de la
 * región (mig 061). Puede pertenecer a varios, igual que en el preview.
 */
export function megaproyectosDe(p: Iniciativa, curados: readonly string[]): string[] {
  const tags = p.tags ?? []
  return curados.filter(m => tags.includes(m))
}

function comunaDe(p: Iniciativa): string | null {
  const c = (p.comuna ?? '').trim()
  return c || null
}

function etapaDe(p: Iniciativa): string | null {
  const e = (p.etapa_actual ?? '').trim()
  return e || null
}

/** Y entre filtros, O dentro de cada uno. */
export function filtrarCartera(
  lista: Iniciativa[],
  f: FiltrosCartera,
  curados: readonly string[],
): Iniciativa[] {
  if (!hayFiltros(f)) return lista
  return lista.filter(p => {
    if (f.semaforo.size && !f.semaforo.has(p.estado_semaforo ?? 'gris')) return false
    if (f.capa.size && !f.capa.has(p.capa ?? '')) return false

    if (f.megaproyecto.size) {
      const suyos = megaproyectosDe(p, curados)
      const calza = suyos.length === 0
        ? f.megaproyecto.has(SIN_MEGAPROYECTO)
        : suyos.some(m => f.megaproyecto.has(m))
      if (!calza) return false
    }

    if (f.ministerio.size) {
      const suyos = splitMinisterio(p.ministerio)
      if (!suyos.some(m => f.ministerio.has(m))) return false
    }

    if (f.comuna.size) {
      const c = comunaDe(p)
      if (!(c ? f.comuna.has(c) : f.comuna.has(SIN_COMUNA))) return false
    }

    if (f.etapa.size) {
      const e = etapaDe(p)
      if (!(e ? f.etapa.has(e) : f.etapa.has(SIN_ETAPA))) return false
    }

    return true
  })
}

export type OpcionCartera = { value: string; label: string; count: number }

function ordenarPorLabel(a: OpcionCartera, b: OpcionCartera): number {
  return a.label.localeCompare(b.label, 'es')
}

/** Las opciones de cada filtro, con su conteo, sobre la cartera COMPLETA. */
export function opcionesCartera(lista: Iniciativa[], curados: readonly string[]) {
  const cuenta = (vals: (string | null)[], sinValor: string) => {
    const m = new Map<string, number>()
    for (const v of vals) {
      const k = v ?? sinValor
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }

  // Megaproyecto: una iniciativa puede estar en varios, así que suma en cada
  // uno (igual que el agrupado del preview).
  const mega = new Map<string, number>()
  for (const p of lista) {
    const suyos = megaproyectosDe(p, curados)
    if (suyos.length === 0) mega.set(SIN_MEGAPROYECTO, (mega.get(SIN_MEGAPROYECTO) ?? 0) + 1)
    for (const m of suyos) mega.set(m, (mega.get(m) ?? 0) + 1)
  }

  const minis = new Map<string, number>()
  for (const p of lista) {
    for (const m of splitMinisterio(p.ministerio)) minis.set(m, (minis.get(m) ?? 0) + 1)
  }

  const comunas = cuenta(lista.map(comunaDe), SIN_COMUNA)
  const etapas  = cuenta(lista.map(etapaDe), SIN_ETAPA)
  const semaf   = cuenta(lista.map(p => p.estado_semaforo ?? 'gris'), 'gris')
  const capas   = cuenta(lista.map(p => p.capa ?? null), '')

  return {
    megaproyecto: Array.from(mega, ([value, count]) => ({
      value, count, label: value === SIN_MEGAPROYECTO ? 'Sin megaproyecto' : value,
    })).sort(ordenarPorLabel),

    semaforo: (['verde', 'ambar', 'rojo', 'gris'] as const)
      .filter(k => semaf.has(k))
      .map(k => ({ value: k as string, count: semaf.get(k) ?? 0, label: SEMAFORO_CONFIG[k].label })),

    ministerio: Array.from(minis, ([value, count]) => ({ value, count, label: value }))
      .sort(ordenarPorLabel),

    comuna: Array.from(comunas, ([value, count]) => ({
      value, count, label: value === SIN_COMUNA ? 'Sin comuna' : value,
    })).sort(ordenarPorLabel),

    capa: CAPA_OPCIONES
      .filter(c => capas.has(c.key))
      .map(c => ({ value: c.key as string, count: capas.get(c.key) ?? 0, label: c.largo })),

    etapa: Array.from(etapas, ([value, count]) => ({
      value, count, label: value === SIN_ETAPA ? 'Sin etapa registrada' : value,
    })).sort(ordenarPorLabel),
  }
}

// ── Orden ────────────────────────────────────────────────────────────────────
// Sin columnas de inversión ni mano de obra: el Económico ordena por esas
// porque su tabla las tiene cargadas a mano; en una iniciativa `inversion_mm`
// viene vacía casi siempre. Se ordena por lo que sí está siempre.

export type OrdenCartera = 'nombre' | 'avance_desc' | 'avance_asc' | 'semaforo'

/** Rojo primero: es el orden con que el comité mira su cartera. */
const PESO_SEMAFORO: Record<string, number> = { rojo: 0, ambar: 1, gris: 2, verde: 3 }

export function ordenarCartera(lista: Iniciativa[], orden: OrdenCartera): Iniciativa[] {
  const copia = [...lista]
  switch (orden) {
    case 'avance_desc':
      return copia.sort((a, b) => (b.pct_avance ?? 0) - (a.pct_avance ?? 0))
    case 'avance_asc':
      return copia.sort((a, b) => (a.pct_avance ?? 0) - (b.pct_avance ?? 0))
    case 'semaforo':
      return copia.sort((a, b) =>
        (PESO_SEMAFORO[a.estado_semaforo ?? 'gris'] ?? 9) - (PESO_SEMAFORO[b.estado_semaforo ?? 'gris'] ?? 9)
        || a.nombre.localeCompare(b.nombre, 'es'))
    default:
      return copia.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }
}

/** Las que el comité mira primero: semáforo rojo. */
export function requierenAtencion(lista: Iniciativa[]): Iniciativa[] {
  return lista.filter(p => p.estado_semaforo === 'rojo')
}

// ── Excel ────────────────────────────────────────────────────────────────────

function slug(texto: string): string {
  const sinTildes = texto.toLowerCase().replace(/[áàäâ]/g, 'a').replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i').replace(/[óòöô]/g, 'o').replace(/[úùüû]/g, 'u').replace(/ñ/g, 'n')
  return sinTildes.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/** Descarga la cartera TAL COMO SE VE: ya filtrada y ordenada por el llamador. */
export async function exportCarteraInfraXlsx(
  lista: Iniciativa[],
  regionNombre: string,
  curados: readonly string[],
): Promise<void> {
  if (lista.length === 0) return

  const capaCorto = new Map(CAPA_OPCIONES.map(c => [c.key as string, c.corto]))

  const filas = lista.map(p => ({
    'N°':           p.n,
    'Iniciativa':   p.nombre,
    'Megaproyecto': megaproyectosDe(p, curados).join('; '),
    'Semáforo':     SEMAFORO_CONFIG[(p.estado_semaforo ?? 'gris') as keyof typeof SEMAFORO_CONFIG]?.label ?? '',
    'Avance (%)':   p.pct_avance ?? 0,
    'Capa':         capaCorto.get(p.capa ?? '') ?? '',
    'Ministerio':   p.ministerio ?? '',
    'Comuna':       p.comuna ?? (p.alcance_regional ? 'Alcance regional' : ''),
    'Etapa actual': p.etapa_actual ?? '',
    'Próximo hito': p.proximo_hito ?? '',
    'Fecha hito':   p.fecha_proximo_hito ?? '',
    'Responsable':  p.responsable ?? '',
    'Eje':          p.eje ?? '',
    'Código BIP':   p.codigo_bip ?? '',
  }))

  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(filas)
  ws['!cols'] = [
    { wch: 7 }, { wch: 48 }, { wch: 24 }, { wch: 12 }, { wch: 11 }, { wch: 6 },
    { wch: 32 }, { wch: 20 }, { wch: 24 }, { wch: 30 }, { wch: 12 }, { wch: 22 },
    { wch: 26 }, { wch: 14 },
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cartera comité')

  const fecha = new Date().toLocaleDateString('en-CA')
  XLSX.writeFile(wb, `cartera_infraestructura_${slug(regionNombre)}_${fecha}.xlsx`)
}
