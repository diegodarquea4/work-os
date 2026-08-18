/**
 * Tipos del modo «Autoridades» del Mapa (Panel Territorial SUBDERE portado a work-os).
 *
 * Fuente de datos: proyecto Supabase externo de Francisca Barros (solo lectura, anon).
 * Estos tipos describen (1) las filas crudas de las 12 tablas y (2) las estructuras
 * indexadas que arma `source.ts` (espejo de `cargarDatos()` del PTS), sobre las que
 * operan las funciones puras de `derive.ts` / `carrito.ts`.
 *
 * Convención de llaves (ver `politica.ts`): `codigo_region` viene como string
 * zero-padded ('01'..'16') y `codigo_comuna` (CUT) como string de 5 ('01402').
 * work-os usa esos mismos códigos pero numéricos en sus geojson — la reconciliación
 * (padStart) vive en el borde (TerritorialProvider), NO acá.
 */

export type Lado = 'IZQ' | 'DER' | 'IND'

export type NivelAutoridad = 'alcalde' | 'gobernador' | 'diputado' | 'senador' | 'delegado'

/** Clasificación política precomputada por el PTS (dos criterios). */
export type ClaveLado = 'lado_abierto' | 'lado_cerrado'

export type AnioMunicipal = '2021' | '2024'

/** Estado de los controles del modo Autoridades (espejo de `state` en el PTS). */
export interface TerrState {
  year: AnioMunicipal
  lado: ClaveLado
  nivel: NivelAutoridad
  congresoAnio: string
  coloreoCongreso: 'comuna' | 'distrito'
  periodoDelegado: string
}

// ── Objetos anidados en la ficha de comuna (espejo exacto de las props del PTS) ──

/** Rival en la elección (columna JSONB `contrincantes`). */
export interface Contrincante {
  nombre: string
  partido?: string | null
  pacto?: string | null
  votos?: number | null
  pct?: number | null
}

export interface AlcaldeObj {
  nombre: string
  partido: string | null
  pct: number | null
  votos: number | null
  reelecto: boolean | null
  lado_cerrado: Lado | null
  lado_abierto: Lado | null
  voto_obligatorio: boolean | null
  total_validos: number | null
  contrincantes: Contrincante[] | null
  poblacion: number | null
  tamano: string | null
  tope_reeleccion?: { nota: string } | null
}

export interface ResultadoComunal {
  gano: boolean | null
  vuelta_usada: string | null
  ganador_comuna: string | null
  pct_en_comuna: number | null
  votos_en_comuna: number | null
}

export interface GobernadorObj {
  nombre: string
  partido: string | null
  lista: string | null
  pct: number | null
  votos: number | null
  lado_cerrado: Lado | null
  lado_abierto: Lado | null
  voto_obligatorio: boolean | null
  contrincantes: Contrincante[] | null
  resultado_comunal?: ResultadoComunal
}

export interface ReeleccionMunicipal {
  puede_repostular: boolean
  estado_confianza: string // 'verificado' | 'estimado' | 'tbd'
}

/** Props de una comuna: espejo del feature.properties reconstruido en `cargarDatos()`. */
export interface ComunaProps {
  codigo_comuna: string
  comuna: string
  codigo_region: string
  region: string
  poblacion?: number | null
  tamano?: string | null
  alcalde_2021?: AlcaldeObj
  alcalde_2024?: AlcaldeObj
  reeleccion_2028?: ReeleccionMunicipal
  gobernador_2021?: GobernadorObj
  gobernador_2024?: GobernadorObj
  gobernador_reeleccion_2028?: ReeleccionMunicipal
}

export interface RegionInfo {
  codigo_region: string
  region: string
  n_comunas: number | null
}

// ── Congreso (diputados / senadores) ──

/** Fila cruda de candidato tal como viene de la tabla (con su territorio). */
export interface CongresoRow {
  id: number
  codigo_comuna: string | null
  /** En la BD es numérico; como se usa de llave se coacciona a string al indexar. */
  anio: string | number
  nombre: string
  partido: string | null
  votos: number
  electo: boolean
  distrito?: string
  circunscripcion?: string
}

/** Candidato agregado a nivel territorio (votos sumados entre comunas). */
export interface CongresoCandidato {
  nombre: string
  partido: string | null
  votos: number
  electo: boolean
}

export interface CongresoIndex {
  /** codigo_comuna -> año -> filas crudas (ordenadas desc por votos). */
  porComunaAnio: Record<string, Record<string, CongresoRow[]>>
  /** territorio -> año -> candidatos agregados (ordenados desc por votos). */
  porTerritorioAnio: Record<string, Record<string, CongresoCandidato[]>>
}

export interface CongresoReeleccionRow {
  id: number
  cargo: 'diputado' | 'senador'
  territorio: string
  nombre: string
  periodos_consecutivos: number
  puede_repostular: boolean
  confianza_dato: string | null
  /** La tabla congreso_reeleccion NO trae partido; el bloque se resuelve vía personasPartido. */
  partido?: string | null
}

export interface DelegadoRow {
  id: number
  codigo_region: string
  presidente: string
  nombre: string
  partido: string | null
  cargo: string | null
  periodo_especifico: string | null
}

/** Estructura completa que consume la UI (espejo del `return` de `cargarDatos()`). */
export interface TerritorialData {
  comunaPropsByCut: Record<string, ComunaProps>
  comunasByRegion: Record<string, ComunaProps[]>
  regionesById: Record<string, RegionInfo>
  /** codigo_region en orden ascendente (para iterar de forma determinística). */
  regionOrder: string[]
  DIPUTADOS: CongresoIndex
  SENADORES: CongresoIndex
  CONGRESO_REELECCION: {
    diputado: Record<string, CongresoReeleccionRow>
    senador: Record<string, CongresoReeleccionRow>
  }
  DELEGADOS_POR_REGION: Record<string, Record<string, DelegadoRow[]>>
}
