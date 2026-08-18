/**
 * Derivaciones puras del modo «Autoridades»: dado el estado de los controles
 * (`TerrState`) y la data indexada (`TerritorialData`), calculan colores, mayorías,
 * estadísticas y textos. Portado verbatim del PTS (fillForComuna, fillForRegion,
 * fillForTerritorioCongreso, activeLadoForComuna, renderStats, periodoTextoAlcalde,
 * proximaEleccionSenador, procesarCongreso).
 *
 * Todo es puro y determinístico: sin efectos, sin `state` global, sin Date/random.
 */

import {
  COLOR_HEX, LADO_ORDEN, EXCEPCION_PERIODO_1RO,
  ladoDePartido, ladoDeDelegado, normComunaKey, lightenColor, nivelAclaradoPorPct, ladoDeColor,
} from './politica'
import type {
  Lado, TerrState, TerritorialData, ComunaProps, CongresoIndex, CongresoRow,
  DelegadoRow, NivelAutoridad,
} from './types'

const NIVELES_CONGRESO: ReadonlySet<NivelAutoridad> = new Set(['diputado', 'senador'])

export function esNivelCongreso(nivel: NivelAutoridad): boolean {
  return NIVELES_CONGRESO.has(nivel)
}

function datosCongresoActivos(data: TerritorialData, state: TerrState): CongresoIndex {
  return state.nivel === 'diputado' ? data.DIPUTADOS : data.SENADORES
}

function campoTerritorioCongreso(state: TerrState): 'distrito' | 'circunscripcion' {
  return state.nivel === 'diputado' ? 'distrito' : 'circunscripcion'
}

/** Bloque dominante entre un conjunto de electos (desempate IZQ→DER→IND). null si 0. */
function mayoriaLadoDeElectos(electos: { partido: string | null }[]): Lado | null {
  const counts: Record<Lado, number> = { IZQ: 0, DER: 0, IND: 0 }
  electos.forEach((e) => { const l = ladoDePartido(e.partido); if (l) counts[l]++ })
  const max = Math.max(counts.IZQ, counts.DER, counts.IND)
  if (max === 0) return null
  return LADO_ORDEN.find((k) => counts[k] === max) || null
}

export function ladoParaComunaCongreso(data: TerritorialData, state: TerrState, codigoComuna: string): Lado | null {
  const datos = datosCongresoActivos(data, state)
  const lista = (datos.porComunaAnio[codigoComuna] || {})[state.congresoAnio]
  if (!lista || !lista.length) return null
  if (state.coloreoCongreso === 'comuna') {
    return ladoDePartido(lista[0].partido)
  }
  // por distrito: mayoría de bloque entre los electos de ese territorio
  const territorio = lista[0][campoTerritorioCongreso(state)] as string | undefined
  if (!territorio) return null
  const electos = ((datos.porTerritorioAnio[territorio] || {})[state.congresoAnio] || []).filter((c) => c.electo)
  return mayoriaLadoDeElectos(electos)
}

export function delegadoActualDeRegion(data: TerritorialData, state: TerrState, codigoRegion: string): DelegadoRow | null {
  const porPresidente = data.DELEGADOS_POR_REGION[codigoRegion]
  if (!porPresidente) return null
  const lista = porPresidente[state.periodoDelegado]
  if (!lista || !lista.length) return null
  // si hubo más de una persona en el período, mostramos la más reciente (última tal como viene ordenada)
  return lista[lista.length - 1]
}

export function activeLadoForComuna(data: TerritorialData, state: TerrState, props: ComunaProps): Lado | null {
  if (esNivelCongreso(state.nivel)) {
    return ladoParaComunaCongreso(data, state, props.codigo_comuna)
  }
  if (state.nivel === 'delegado') {
    const actual = delegadoActualDeRegion(data, state, props.codigo_region)
    return actual ? ladoDeDelegado(actual.partido) : null
  }
  if (state.nivel === 'alcalde') {
    const al = props[`alcalde_${state.year}`]
    return al ? (al[state.lado] || null) : null
  }
  const gob = props[`gobernador_${state.year}`]
  return gob ? (gob[state.lado] || null) : null
}

/** Color de relleno de una comuna. En gobernador aclara según el % de votos en la comuna. */
export function fillForComuna(data: TerritorialData, state: TerrState, props: ComunaProps): string {
  const lado = activeLadoForComuna(data, state, props)
  const base = lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
  if (state.nivel === 'gobernador') {
    const gob = props[`gobernador_${state.year}`]
    if (gob && gob.resultado_comunal && lado) {
      const nivel = nivelAclaradoPorPct(gob.resultado_comunal.pct_en_comuna)
      if (nivel > 0) return lightenColor(base, nivel)
    }
  }
  return base
}

/**
 * Color de una región completa. En "gobernador" es directo (color del gobernador
 * regional, sin aclarar). En el resto, es el bloque MAYORITARIO de sus comunas.
 */
export function fillForRegion(data: TerritorialData, state: TerrState, codigoRegion: string): string {
  if (state.nivel === 'gobernador') {
    const sample = (data.comunasByRegion[codigoRegion] || [])[0]
    if (!sample) return COLOR_HEX.NULL
    const lado = activeLadoForComuna(data, state, sample)
    return lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
  }
  const comunas = data.comunasByRegion[codigoRegion] || []
  const counts: Record<Lado, number> = { IZQ: 0, DER: 0, IND: 0 }
  comunas.forEach((p) => { const lado = activeLadoForComuna(data, state, p); if (lado) counts[lado]++ })
  const max = Math.max(counts.IZQ, counts.DER, counts.IND)
  if (max === 0) return COLOR_HEX.NULL
  const winner = LADO_ORDEN.find((k) => counts[k] === max)!
  return COLOR_HEX[winner]
}

/** Color de un territorio de congreso (distrito/circunscripción): mayoría de electos. */
export function fillForTerritorioCongreso(data: TerritorialData, state: TerrState, territorio: string): string {
  const datos = datosCongresoActivos(data, state)
  const electos = ((datos.porTerritorioAnio[territorio] || {})[state.congresoAnio] || []).filter((c) => c.electo)
  const lado = mayoriaLadoDeElectos(electos)
  return lado ? COLOR_HEX[lado] : COLOR_HEX.NULL
}

export interface TerritorialStats {
  IZQ: number
  DER: number
  IND: number
  NULL: number
  total: number
  unidad: 'regiones' | 'comunas'
}

/**
 * Cuenta unidades por bloque para la stat bar (espejo de renderStats).
 * - view 'regiones': cuenta las 16 regiones por su color agregado.
 * - view 'comunas': cuenta las comunas de `activeRegion` por su lado activo.
 */
export function computeStats(
  data: TerritorialData,
  state: TerrState,
  view: 'regiones' | 'comunas',
  activeRegion: string | null,
): TerritorialStats {
  const counts = { IZQ: 0, DER: 0, IND: 0, NULL: 0 }
  let total: number
  if (view === 'regiones') {
    data.regionOrder.forEach((rid) => {
      const color = fillForRegion(data, state, rid)
      counts[ladoDeColor(color)]++
    })
    total = data.regionOrder.length
  } else {
    const comunas = (activeRegion && data.comunasByRegion[activeRegion]) || []
    comunas.forEach((p) => {
      const lado = activeLadoForComuna(data, state, p)
      counts[lado || 'NULL']++
    })
    total = comunas.length
  }
  return { ...counts, total, unidad: view === 'regiones' ? 'regiones' : 'comunas' }
}

/** Texto del período del alcalde para la ficha de reelección. null si tbd / sin dato. */
export function periodoTextoAlcalde(props: ComunaProps): string | null {
  const r = props.reeleccion_2028
  const al = props.alcalde_2024
  if (!r || r.estado_confianza === 'tbd') return null
  if (!r.puede_repostular) return '3er período (no puede repostular)'
  if (EXCEPCION_PERIODO_1RO.has(normComunaKey(props.comuna))) return '1er período'
  if (al && al.reelecto === true) return '2do período'
  return '1er período'
}

/** Año de la próxima elección de una circunscripción senatorial (2033 si votó en 2025, si no 2029). */
export function proximaEleccionSenador(data: TerritorialData, territorio: string): number {
  const lista2025 = (data.SENADORES.porTerritorioAnio[territorio] || {})['2025']
  const votoEn2025 = !!lista2025 && lista2025.some((c) => c.electo)
  return votoEn2025 ? 2033 : 2029
}

/** Partido del candidato que matchea una fila de reelección de congreso (por nombre normalizado). */
export function personasPartido(
  data: TerritorialData,
  state: TerrState,
  territorio: string,
  nombre: string,
): string | null {
  const datos = datosCongresoActivos(data, state)
  const candidatos = (datos.porTerritorioAnio[territorio] || {})[state.congresoAnio] || []
  const match = candidatos.find((c) => normComunaKey(c.nombre) === normComunaKey(nombre))
  return match ? match.partido : null
}

/**
 * Indexa filas crudas de congreso en {porComunaAnio, porTerritorioAnio}.
 * - Dedup por `id` (red de seguridad contra duplicados de paginación).
 * - porComunaAnio: codigo_comuna → año → filas crudas (orden desc por votos).
 * - porTerritorioAnio: territorio → año → candidatos agregados por nombre
 *   (votos sumados entre comunas, electo = OR), orden desc por votos.
 */
export function procesarCongreso(rowsCrudas: CongresoRow[], campoTerritorio: 'distrito' | 'circunscripcion'): CongresoIndex {
  const vistos = new Set<number>()
  const rows = rowsCrudas.filter((r) => {
    if (vistos.has(r.id)) return false
    vistos.add(r.id)
    return true
  })

  const porComunaAnio: Record<string, Record<string, CongresoRow[]>> = {}
  const acumTerritorioAnio: Record<string, Record<string, Record<string, { nombre: string; partido: string | null; votos: number; electo: boolean }>>> = {}

  rows.forEach((r) => {
    const comunaKey = r.codigo_comuna
    if (comunaKey) {
      if (!porComunaAnio[comunaKey]) porComunaAnio[comunaKey] = {}
      if (!porComunaAnio[comunaKey][r.anio]) porComunaAnio[comunaKey][r.anio] = []
      porComunaAnio[comunaKey][r.anio].push(r)
    }
    const terr = r[campoTerritorio] as string | undefined
    if (terr == null) return
    if (!acumTerritorioAnio[terr]) acumTerritorioAnio[terr] = {}
    if (!acumTerritorioAnio[terr][r.anio]) acumTerritorioAnio[terr][r.anio] = {}
    const key = normComunaKey(r.nombre)
    const bucket = acumTerritorioAnio[terr][r.anio]
    if (!bucket[key]) bucket[key] = { nombre: r.nombre, partido: r.partido, votos: 0, electo: false }
    bucket[key].votos += r.votos
    if (r.electo) bucket[key].electo = true
  })

  const porTerritorioAnio: Record<string, Record<string, { nombre: string; partido: string | null; votos: number; electo: boolean }[]>> = {}
  Object.keys(acumTerritorioAnio).forEach((terr) => {
    porTerritorioAnio[terr] = {}
    Object.keys(acumTerritorioAnio[terr]).forEach((anio) => {
      porTerritorioAnio[terr][anio] = Object.values(acumTerritorioAnio[terr][anio])
    })
  })

  Object.values(porComunaAnio).forEach((porAnio) => {
    Object.values(porAnio).forEach((lista) => lista.sort((a, b) => b.votos - a.votos))
  })
  Object.values(porTerritorioAnio).forEach((porAnio) => {
    Object.values(porAnio).forEach((lista) => lista.sort((a, b) => b.votos - a.votos))
  })

  return { porComunaAnio, porTerritorioAnio }
}
