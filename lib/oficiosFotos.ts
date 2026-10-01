/**
 * Las dos cuentas del control de gestión de oficios, puras y testeadas.
 *
 * ── 1. El atraso de un oficio que se cierra ────────────────────────────────
 *
 * Un hecho de un instante: cuántos días tarde llegó. Se calcula una vez y se
 * guarda (mig 122, `dias_atraso_al_cerrar`). No se recalcula contra `now()`,
 * porque un oficio respondido hace un año seguiría «atrasándose» y ahí está el
 * bug de los 855 días promedio.
 *
 * ── 2. La foto del stock ───────────────────────────────────────────────────
 *
 * Cuántos vencidos tenía cada organismo en un momento. Eso NO se reconstruye de
 * ninguna fila —los resueltos ya no están y los abiertos tenían otro atraso—,
 * así que hay que anotarlo por adelantado: una foto al cerrar cada sesión, con
 * un respaldo si pasan 20 días sin ninguna.
 *
 * Todo acá es una función pura sobre filas ya leídas. La ruta pone el I/O.
 */

import { claveOrganismo } from '@/lib/seiaScraper'

/** Días entre dos fechas ISO (`'2026-09-30'`). Positivo si `b` es posterior. */
function diasEntre(a: string, b: string): number | null {
  // Mediodía UTC: con medianoche, un cambio de hora corre el resultado un día.
  const ta = Date.parse(`${a}T12:00:00Z`)
  const tb = Date.parse(`${b}T12:00:00Z`)
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return null
  return Math.round((tb - ta) / 86_400_000)
}

/**
 * Días de atraso de un oficio a una fecha dada. Positivo = vencido; 0 o
 * negativo = todavía en plazo (o respondido antes). `null` si no hay fecha
 * límite, que es distinto de cero y no se puede promediar con nada.
 */
export function diasDeAtraso(fechaLimite: string | null | undefined, alDia: string): number | null {
  if (!fechaLimite) return null
  return diasEntre(fechaLimite.slice(0, 10), alDia.slice(0, 10))
}

/**
 * El atraso que hay que congelar cuando un oficio deja de estar pendiente.
 * `cuando` puede venir como timestamp ISO completo: lo que importa es el día.
 */
export function atrasoAlCerrar(
  fechaLimite: string | null | undefined,
  cuando: string,
): number | null {
  return diasDeAtraso(fechaLimite, cuando)
}

/** Los tres motivos que la mig 122 acepta. */
export type MotivoCierre = 'respondio' | 'expediente_cerrado' | 'cerrado_a_mano'

/** `true` si ese motivo cuenta como atraso imputable al organismo. */
export function cuentaComoAtraso(motivo: MotivoCierre | null | undefined): boolean {
  // Un expediente con RCA, término anticipado o desistimiento no se responde
  // nunca más: el proyecto se murió. Cobrarle ese atraso al organismo es falso.
  return motivo === 'respondio' || motivo === 'cerrado_a_mano'
}

// ── La foto ──────────────────────────────────────────────────────────────────

/** Lo que la foto necesita de cada oficio pendiente. */
export type OficioParaFoto = {
  region_cod: string | null
  oaeca_sea: string | null
  oaeca_nombre: string | null
  ministerio: string | null
  fecha_limite: string | null
  proyecto_privado_id: number | null
}

/** Una fila de `oficios_foto_oaeca`, lista para escribir. */
export type FilaFoto = {
  region_cod: string
  tomada_el: string
  oaeca: string
  ministerio: string | null
  pendientes: number
  vencidos: number
  dias_atraso_total: number
  de_cartera: number
  vencidos_de_cartera: number
}

/**
 * Agrupa los oficios PENDIENTES de una región en una fila por organismo.
 *
 * `de_cartera` / `vencidos_de_cartera` van aparte porque son lo único
 * comparable entre regiones: el 2026-09-30, de 546 pendientes en el país solo
 * 90 pertenecían a un proyecto de alguna cartera y 456 venían sueltos del Excel
 * nacional. Sin el corte, la región que subió el archivo más grande parece la
 * que trabaja peor — Valparaíso encabezaba con 92 pendientes y cero proyectos.
 *
 * Un organismo sin nada pendiente NO genera fila: la foto dice qué había, no
 * qué no había, y con 217 organismos en el país lo segundo es casi todo.
 */
export function armarFoto(
  oficios: OficioParaFoto[],
  regionCod: string,
  tomadaEl: string,
): FilaFoto[] {
  const porOrganismo = new Map<string, FilaFoto>()

  for (const o of oficios) {
    if (o.region_cod !== regionCod) continue
    const nombre = o.oaeca_sea ?? o.oaeca_nombre
    if (!nombre) continue
    const k = claveOrganismo(nombre)
    if (!k) continue

    let fila = porOrganismo.get(k)
    if (!fila) {
      fila = {
        region_cod: regionCod,
        tomada_el: tomadaEl,
        oaeca: nombre,
        ministerio: o.ministerio ?? null,
        pendientes: 0,
        vencidos: 0,
        dias_atraso_total: 0,
        de_cartera: 0,
        vencidos_de_cartera: 0,
      }
      porOrganismo.set(k, fila)
    }
    // El ministerio lo escribe el SEIA por oficio; si una fila vino sin él,
    // gana la primera que lo traiga en vez de dejar el grupo sin ministerio.
    if (!fila.ministerio && o.ministerio) fila.ministerio = o.ministerio

    const deCartera = o.proyecto_privado_id != null
    fila.pendientes++
    if (deCartera) fila.de_cartera++

    const atraso = diasDeAtraso(o.fecha_limite, tomadaEl)
    if (atraso != null && atraso > 0) {
      fila.vencidos++
      fila.dias_atraso_total += atraso
      if (deCartera) fila.vencidos_de_cartera++
    }
  }

  // Los peores primero: es el orden en que se lee y ahorra ordenar al leer.
  return [...porOrganismo.values()].sort(
    (a, b) => b.vencidos - a.vencidos || b.pendientes - a.pendientes || a.oaeca.localeCompare(b.oaeca),
  )
}

/**
 * ¿Le toca al cron sacar la foto de respaldo?
 *
 * La foto normal la saca el cierre de una sesión, que es cuando el número
 * significa algo. Pero si la región no sesiona —se postergó la reunión, se
 * tomaron vacaciones— la serie quedaría con un hueco y a los dos meses no habría
 * nada que comparar. Pasados `diasMax` días, la saca el cron.
 *
 * 20 y no 15: el comité sesiona cada quince días, así que a los 15 justos el
 * respaldo le ganaría de mano a la sesión que se hace al día siguiente y la foto
 * quedaría fechada un día antes de la reunión, que es peor dato.
 */
export function necesitaRespaldo(
  ultimaFoto: string | null | undefined,
  hoy: string,
  diasMax = 20,
): boolean {
  if (!ultimaFoto) return true   // nunca se sacó ninguna
  const d = diasEntre(ultimaFoto.slice(0, 10), hoy.slice(0, 10))
  if (d == null) return true     // fecha ilegible: mejor una foto de más
  return d >= diasMax
}

// ── Leer la serie ────────────────────────────────────────────────────────────

/** Una foto ya guardada, como la devuelve la tabla. */
export type FotoGuardada = {
  tomada_el: string
  oaeca: string
  ministerio: string | null
  vencidos: number
  dias_atraso_total: number
  vencidos_de_cartera: number
}

export type PuntoSerie = {
  tomada_el: string
  vencidos: number
  /** Promedio de días de atraso de los vencidos. `null` si no hubo ninguno. */
  atrasoPromedio: number | null
  organismosConAtraso: number
}

/**
 * La serie de una región: un punto por foto.
 *
 * El promedio se calcula acá con la suma y la cuenta, y no promediando los
 * promedios de cada organismo — que daría otro número, porque uno con 9 oficios
 * pesaría lo mismo que uno con 1. Por eso la tabla guarda `dias_atraso_total`.
 */
export function serieDeFotos(fotos: FotoGuardada[]): PuntoSerie[] {
  const porDia = new Map<string, { vencidos: number; suma: number; orgs: number }>()
  for (const f of fotos) {
    const g = porDia.get(f.tomada_el) ?? { vencidos: 0, suma: 0, orgs: 0 }
    g.vencidos += f.vencidos
    g.suma += f.dias_atraso_total
    if (f.vencidos > 0) g.orgs++
    porDia.set(f.tomada_el, g)
  }
  return [...porDia.entries()]
    .map(([tomada_el, g]) => ({
      tomada_el,
      vencidos: g.vencidos,
      atrasoPromedio: g.vencidos > 0 ? g.suma / g.vencidos : null,
      organismosConAtraso: g.orgs,
    }))
    .sort((a, b) => a.tomada_el.localeCompare(b.tomada_el))
}
