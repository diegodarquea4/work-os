/**
 * Carga de datos del modo «Autoridades». Lee el SNAPSHOT estático generado por
 * `scripts/snapshot-territorial.mjs` (`public/territorial/snapshot.json` + `fotos.json`),
 * NO la Supabase de Francisca en runtime: una descarga por CDN (cacheada) en vez de
 * ~55 requests paginados, y CERO dependencia externa en producción. El snapshot se
 * regenera y commitea cuando Francisca actualiza datos.
 *
 * `assembleTerritorial(raw)` (puro, testeable) arma las estructuras indexadas y chequea
 * el contrato de columnas (falta una → error ruidoso, no mapa gris). SIN geometrías:
 * work-os usa sus propios geojson.
 */

import { procesarCongreso } from './derive'
import { normComunaKey } from './politica'
import type {
  TerritorialData, ComunaProps, RegionInfo, AlcaldeObj, GobernadorObj,
  CongresoRow, CongresoReeleccionRow, DelegadoRow, AnioMunicipal, Contrincante,
} from './types'

const SNAPSHOT_PATH = '/territorial/snapshot.json'
const FOTOS_PATH = '/territorial/fotos.json'

// ── Contrato: si una tabla no trae una columna esperada, fallar ruidoso ──────
function assertColumns(tabla: string, rows: Record<string, unknown>[], expected: string[]): void {
  if (!rows.length) return // tabla vacía: no podemos verificar, no reventamos
  const row = rows[0]
  const faltantes = expected.filter((c) => !(c in row))
  if (faltantes.length) {
    throw new Error(
      `Modo Autoridades: la tabla "${tabla}" no trae la(s) columna(s) [${faltantes.join(', ')}]. ` +
      'Cambió el esquema del Panel Territorial de SUBDERE.',
    )
  }
}

export interface RawTerritorial {
  regiones: Record<string, unknown>[]
  comunas: Record<string, unknown>[]
  alcaldes: Record<string, unknown>[]
  gobernadores: Record<string, unknown>[]
  gobernador_resultado_comunal: Record<string, unknown>[]
  diputados_candidatos: Record<string, unknown>[]
  senadores_candidatos: Record<string, unknown>[]
  congreso_reeleccion: Record<string, unknown>[]
  delegados_presidenciales: Record<string, unknown>[]
}

/**
 * Ensambla las estructuras indexadas a partir de las filas crudas. PURO (testeable
 * offline). Verifica el contrato de columnas antes de armar nada.
 */
export function assembleTerritorial(raw: RawTerritorial): TerritorialData {
  assertColumns('regiones', raw.regiones, ['codigo_region', 'nombre'])
  assertColumns('comunas', raw.comunas, ['codigo_comuna', 'codigo_region', 'nombre', 'region'])
  assertColumns('alcaldes', raw.alcaldes, ['codigo_comuna', 'anio', 'nombre', 'lado_abierto', 'lado_cerrado', 'puede_repostular_2028', 'confianza_dato'])
  assertColumns('gobernadores', raw.gobernadores, ['codigo_region', 'anio', 'nombre', 'lado_abierto', 'lado_cerrado', 'puede_repostular_proxima', 'confianza_dato'])
  assertColumns('gobernador_resultado_comunal', raw.gobernador_resultado_comunal, ['codigo_comuna', 'anio', 'pct_gobernador_en_comuna'])
  assertColumns('diputados_candidatos', raw.diputados_candidatos, ['codigo_comuna', 'anio', 'nombre', 'votos', 'electo', 'distrito'])
  assertColumns('senadores_candidatos', raw.senadores_candidatos, ['codigo_comuna', 'anio', 'nombre', 'votos', 'electo', 'circunscripcion'])
  assertColumns('congreso_reeleccion', raw.congreso_reeleccion, ['cargo', 'territorio', 'nombre', 'periodos_consecutivos', 'puede_repostular'])
  assertColumns('delegados_presidenciales', raw.delegados_presidenciales, ['codigo_region', 'presidente', 'nombre', 'partido'])

  // Índices intermedios
  const alcaldesPorComuna: Record<string, Record<string, Record<string, unknown>>> = {}
  raw.alcaldes.forEach((a) => {
    const key = String(a.codigo_comuna)
    ;(alcaldesPorComuna[key] = alcaldesPorComuna[key] || {})[String(a.anio)] = a
  })
  const gobernadoresPorRegion: Record<string, Record<string, Record<string, unknown>>> = {}
  raw.gobernadores.forEach((g) => {
    const key = String(g.codigo_region)
    ;(gobernadoresPorRegion[key] = gobernadoresPorRegion[key] || {})[String(g.anio)] = g
  })
  const resultadoComunalPorComuna: Record<string, Record<string, Record<string, unknown>>> = {}
  raw.gobernador_resultado_comunal.forEach((rc) => {
    const key = String(rc.codigo_comuna)
    ;(resultadoComunalPorComuna[key] = resultadoComunalPorComuna[key] || {})[String(rc.anio)] = rc
  })

  const anios: AnioMunicipal[] = ['2021', '2024']

  const comunaPropsByCut: Record<string, ComunaProps> = {}
  const comunasByRegion: Record<string, ComunaProps[]> = {}

  raw.comunas.forEach((c) => {
    const codigoComuna = String(c.codigo_comuna)
    const codigoRegion = String(c.codigo_region)
    const props: ComunaProps = {
      codigo_comuna: codigoComuna,
      comuna: String(c.nombre),
      codigo_region: codigoRegion,
      region: String(c.region),
      poblacion: (c.poblacion as number) ?? null,
      tamano: (c.tamano as string) ?? null,
    }

    for (const anio of anios) {
      const al = (alcaldesPorComuna[codigoComuna] || {})[anio]
      if (al) {
        const alObj: AlcaldeObj = {
          nombre: al.nombre as string, partido: (al.partido as string) ?? null, pct: (al.pct as number) ?? null,
          votos: (al.votos as number) ?? null, reelecto: (al.reelecto as boolean) ?? null,
          lado_cerrado: (al.lado_cerrado as AlcaldeObj['lado_cerrado']) ?? null,
          lado_abierto: (al.lado_abierto as AlcaldeObj['lado_abierto']) ?? null,
          voto_obligatorio: (al.voto_obligatorio as boolean) ?? null, total_validos: (al.total_validos as number) ?? null,
          contrincantes: (al.contrincantes as Contrincante[] | null) ?? null,
          poblacion: (c.poblacion as number) ?? null, tamano: (c.tamano as string) ?? null,
        }
        if (al.tope_reeleccion) alObj.tope_reeleccion = al.tope_reeleccion as { nota: string }
        props[`alcalde_${anio}`] = alObj
        if (anio === '2024' && al.puede_repostular_2028 !== null && al.confianza_dato !== null) {
          props.reeleccion_2028 = { puede_repostular: al.puede_repostular_2028 as boolean, estado_confianza: al.confianza_dato as string }
        }
      }

      const gob = (gobernadoresPorRegion[codigoRegion] || {})[anio]
      if (gob) {
        const gobObj: GobernadorObj = {
          nombre: gob.nombre as string, partido: (gob.partido as string) ?? null, lista: (gob.lista as string) ?? null,
          pct: (gob.pct as number) ?? null, votos: (gob.votos as number) ?? null,
          lado_cerrado: (gob.lado_cerrado as GobernadorObj['lado_cerrado']) ?? null,
          lado_abierto: (gob.lado_abierto as GobernadorObj['lado_abierto']) ?? null,
          voto_obligatorio: (gob.voto_obligatorio as boolean) ?? null, contrincantes: (gob.contrincantes as Contrincante[] | null) ?? null,
        }
        const rc = (resultadoComunalPorComuna[codigoComuna] || {})[anio]
        if (rc) {
          gobObj.resultado_comunal = {
            gano: (rc.gano as boolean) ?? null, vuelta_usada: (rc.vuelta_usada as string) ?? null,
            ganador_comuna: (rc.ganador_comuna as string) ?? null,
            pct_en_comuna: (rc.pct_gobernador_en_comuna as number) ?? null,
            votos_en_comuna: (rc.votos_gobernador_en_comuna_verif as number) ?? null,
          }
        }
        props[`gobernador_${anio}`] = gobObj
        if (anio === '2024' && gob.puede_repostular_proxima !== null && gob.confianza_dato !== null) {
          props.gobernador_reeleccion_2028 = { puede_repostular: gob.puede_repostular_proxima as boolean, estado_confianza: gob.confianza_dato as string }
        }
      }
    }

    comunaPropsByCut[codigoComuna] = props
    ;(comunasByRegion[codigoRegion] = comunasByRegion[codigoRegion] || []).push(props)
  })

  const regionesById: Record<string, RegionInfo> = {}
  raw.regiones.forEach((r) => {
    const key = String(r.codigo_region)
    regionesById[key] = { codigo_region: key, region: String(r.nombre), n_comunas: (r.n_comunas as number) ?? null }
  })
  const regionOrder = Object.keys(regionesById).sort()

  const DIPUTADOS = procesarCongreso(raw.diputados_candidatos as unknown as CongresoRow[], 'distrito')
  const SENADORES = procesarCongreso(raw.senadores_candidatos as unknown as CongresoRow[], 'circunscripcion')

  const CONGRESO_REELECCION: TerritorialData['CONGRESO_REELECCION'] = { diputado: {}, senador: {} }
  ;(raw.congreso_reeleccion as unknown as CongresoReeleccionRow[]).forEach((r) => {
    const cargo = r.cargo
    if (cargo !== 'diputado' && cargo !== 'senador') return
    CONGRESO_REELECCION[cargo][`${r.territorio}|${normComunaKey(r.nombre)}`] = r
  })

  const DELEGADOS_POR_REGION: Record<string, Record<string, DelegadoRow[]>> = {}
  ;(raw.delegados_presidenciales as unknown as DelegadoRow[]).forEach((d) => {
    const rid = String(d.codigo_region)
    const porRegion = (DELEGADOS_POR_REGION[rid] = DELEGADOS_POR_REGION[rid] || {})
    ;(porRegion[d.presidente] = porRegion[d.presidente] || []).push(d)
  })

  return { comunaPropsByCut, comunasByRegion, regionesById, regionOrder, DIPUTADOS, SENADORES, CONGRESO_REELECCION, DELEGADOS_POR_REGION }
}

/** Lee el snapshot estático y arma la estructura. Se ejecuta una vez al entrar al modo. */
export async function loadTerritorial(): Promise<TerritorialData> {
  const res = await fetch(SNAPSHOT_PATH)
  if (!res.ok) throw new Error(`Modo Autoridades: no se pudo cargar el snapshot (HTTP ${res.status}). ¿Falta correr scripts/snapshot-territorial.mjs?`)
  const raw = (await res.json()) as RawTerritorial
  return assembleTerritorial(raw)
}

// Caché de las fotos (base64) — un solo fetch del archivo, indexado por región+año.
type FotoRow = { codigo_region: string; anio: string | number; foto_base64: string | null }
let fotosIndex: Map<string, string | null> | null = null
let fotosInflight: Promise<Map<string, string | null>> | null = null

function loadFotosIndex(): Promise<Map<string, string | null>> {
  if (fotosIndex) return Promise.resolve(fotosIndex)
  if (!fotosInflight) {
    fotosInflight = fetch(FOTOS_PATH)
      .then((r) => (r.ok ? (r.json() as Promise<FotoRow[]>) : []))
      .then((rows) => {
        const idx = new Map<string, string | null>()
        rows.forEach((f) => idx.set(`${f.codigo_region}|${f.anio}`, f.foto_base64 ?? null))
        fotosIndex = idx
        fotosInflight = null
        return idx
      })
      .catch(() => { fotosInflight = null; return new Map() })
  }
  return fotosInflight
}

/** Foto del gobernador (base64) bajo demanda. `regionCod` en formato PTS ('01'..'16'). */
export async function loadFotoGobernador(regionCod: string, anio: string): Promise<string | null> {
  const idx = await loadFotosIndex()
  return idx.get(`${regionCod}|${anio}`) ?? null
}
