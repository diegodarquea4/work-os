/**
 * Tests del modo «Autoridades» (Panel Territorial portado). Foco: dolor, no cobertura.
 * Cubre los puntos donde una divergencia con el PTS pasaría desapercibida:
 * clasificación de partidos (+ fallback INDEPENDIENTE), desempate IZQ/DER/IND,
 * aclarado por %, fills en los 5 niveles, período de alcalde, próxima elección de
 * senador, procesarCongreso (dedup + agregación) y llaves de reconciliación.
 */

import { describe, it, expect } from 'vitest'
import {
  normPartido, ladoDePartido, ladoDeDelegado, nivelAclaradoPorPct, lightenColor,
  cutKey, regionKey, COLOR_HEX, titleCase, normComunaKey,
} from '@/lib/territorial/politica'
import {
  fillForComuna, fillForRegion, fillForTerritorioCongreso, activeLadoForComuna,
  computeStats, periodoTextoAlcalde, proximaEleccionSenador, procesarCongreso,
} from '@/lib/territorial/derive'
import { obtenerFilasCarrito } from '@/lib/territorial/carrito'
import type { TerritorialData, TerrState, ComunaProps, CongresoRow } from '@/lib/territorial/types'

// ── Fixtures ────────────────────────────────────────────────────────────────

function comuna(over: Partial<ComunaProps> & { codigo_comuna: string; codigo_region: string }): ComunaProps {
  return { comuna: 'X', region: 'R', ...over }
}

/** Data mínima con 1 región ('01'), 2 comunas, alcaldes 2024, un gobernador y congreso. */
function makeData(): TerritorialData {
  const c1 = comuna({
    codigo_comuna: '01101', comuna: 'Alfa', codigo_region: '01', region: 'Tarapacá',
    alcalde_2024: { nombre: 'JUAN PEREZ', partido: 'UDI', pct: 55, votos: 100, reelecto: true, lado_cerrado: 'DER', lado_abierto: 'DER', voto_obligatorio: true, total_validos: 200, contrincantes: null, poblacion: 1000, tamano: 'Chica' },
    gobernador_2024: { nombre: 'ANA SOTO', partido: 'PS', lista: null, pct: 48, votos: 500, lado_cerrado: 'IZQ', lado_abierto: 'IZQ', voto_obligatorio: true, contrincantes: null, resultado_comunal: { gano: true, vuelta_usada: '1', ganador_comuna: 'ANA SOTO', pct_en_comuna: 40, votos_en_comuna: 200 } },
    reeleccion_2028: { puede_repostular: true, estado_confianza: 'verificado' },
  })
  const c2 = comuna({
    codigo_comuna: '01107', comuna: 'Beta', codigo_region: '01', region: 'Tarapacá',
    alcalde_2024: { nombre: 'LUZ DIAZ', partido: 'PC', pct: 60, votos: 120, reelecto: false, lado_cerrado: 'IZQ', lado_abierto: 'IZQ', voto_obligatorio: true, total_validos: 200, contrincantes: null, poblacion: 2000, tamano: 'Media' },
    gobernador_2024: { nombre: 'ANA SOTO', partido: 'PS', lista: null, pct: 48, votos: 500, lado_cerrado: 'IZQ', lado_abierto: 'IZQ', voto_obligatorio: true, contrincantes: null, resultado_comunal: { gano: false, vuelta_usada: '1', ganador_comuna: 'OTRO', pct_en_comuna: 12, votos_en_comuna: 50 } },
    reeleccion_2028: { puede_repostular: false, estado_confianza: 'verificado' },
  })
  const diputadosRows: CongresoRow[] = [
    { id: 1, codigo_comuna: '01101', anio: '2025', nombre: 'D UNO', partido: 'RN', votos: 90, electo: true, distrito: 'DISTRITO 2' },
    { id: 2, codigo_comuna: '01101', anio: '2025', nombre: 'D DOS', partido: 'PS', votos: 50, electo: true, distrito: 'DISTRITO 2' },
    { id: 2, codigo_comuna: '01101', anio: '2025', nombre: 'D DOS', partido: 'PS', votos: 50, electo: true, distrito: 'DISTRITO 2' }, // duplicado por id → se descarta
    { id: 3, codigo_comuna: '01107', anio: '2025', nombre: 'D DOS', partido: 'PS', votos: 30, electo: false, distrito: 'DISTRITO 2' },
  ]
  const DIPUTADOS = procesarCongreso(diputadosRows, 'distrito')

  const senadoresRows: CongresoRow[] = [
    { id: 10, codigo_comuna: '01101', anio: '2025', nombre: 'S UNO', partido: 'UDI', votos: 200, electo: true, circunscripcion: 'CIRCUNSCRIPCION SENATORIAL 1' },
    { id: 11, codigo_comuna: '01101', anio: '2021', nombre: 'S VIEJO', partido: 'PPD', votos: 150, electo: true, circunscripcion: 'CIRCUNSCRIPCION SENATORIAL 2' },
  ]
  const SENADORES = procesarCongreso(senadoresRows, 'circunscripcion')

  return {
    comunaPropsByCut: { '01101': c1, '01107': c2 },
    comunasByRegion: { '01': [c1, c2] },
    regionesById: { '01': { codigo_region: '01', region: 'Tarapacá', n_comunas: 2 } },
    regionOrder: ['01'],
    DIPUTADOS,
    SENADORES,
    CONGRESO_REELECCION: {
      diputado: { 'DISTRITO 2|D UNO': { id: 1, cargo: 'diputado', territorio: 'DISTRITO 2', nombre: 'D UNO', partido: 'RN', periodos_consecutivos: 2, puede_repostular: true, confianza_dato: 'verificado' } },
      senador: {
        'CIRCUNSCRIPCION SENATORIAL 1|S UNO': { id: 10, cargo: 'senador', territorio: 'CIRCUNSCRIPCION SENATORIAL 1', nombre: 'S UNO', partido: 'UDI', periodos_consecutivos: 1, puede_repostular: true, confianza_dato: 'verificado' },
        'CIRCUNSCRIPCION SENATORIAL 2|S VIEJO': { id: 11, cargo: 'senador', territorio: 'CIRCUNSCRIPCION SENATORIAL 2', nombre: 'S VIEJO', partido: 'PPD', periodos_consecutivos: 3, puede_repostular: false, confianza_dato: 'estimado' },
      },
    },
    DELEGADOS_POR_REGION: {
      '01': { 'Gabriel Boric Font': [{ id: 100, codigo_region: '01', presidente: 'Gabriel Boric Font', nombre: 'Delegada Uno', partido: 'FRVS / Ind.', cargo: 'Delegado', periodo_especifico: '2022-2026' }] },
    },
  }
}

const baseState: TerrState = {
  year: '2024', lado: 'lado_abierto', nivel: 'alcalde',
  congresoAnio: '2025', coloreoCongreso: 'comuna', periodoDelegado: 'Gabriel Boric Font',
}

// ── Clasificación de partidos ─────────────────────────────────────────────────

describe('ladoDePartido', () => {
  it('clasifica siglas y nombres completos', () => {
    expect(ladoDePartido('UDI')).toBe('DER')
    expect(ladoDePartido('Partido Socialista de Chile')).toBe('IZQ')
    expect(ladoDePartido('IND')).toBe('IND')
  })
  it('normaliza tildes y espacios', () => {
    expect(normPartido('  Renovación   Nacional ')).toBe('RENOVACION NACIONAL')
    expect(ladoDePartido('Renovación Nacional')).toBe('DER')
  })
  it('fallback: prefijo "INDEPENDIENTE <partido>" usa el lado del sufijo', () => {
    expect(ladoDePartido('INDEPENDIENTE UDI')).toBe('DER')
    expect(ladoDePartido('INDEPENDIENTE RD')).toBe('IZQ')
  })
  it('devuelve null para partido desconocido', () => {
    expect(ladoDePartido('PARTIDO INEXISTENTE')).toBeNull()
    expect(ladoDePartido('')).toBeNull()
  })
})

describe('ladoDeDelegado', () => {
  it('toma el primer tramo antes de "/" o "("', () => {
    expect(ladoDeDelegado('FRVS / Ind.')).toBe('IZQ')
    expect(ladoDeDelegado('RN (pro-gobierno)')).toBe('DER')
    expect(ladoDeDelegado(null)).toBeNull()
  })
})

// ── Colores y aclarado ────────────────────────────────────────────────────────

describe('nivelAclaradoPorPct', () => {
  it('pleno en >=70 y null; casi blanco en <=10', () => {
    expect(nivelAclaradoPorPct(70)).toBe(0)
    expect(nivelAclaradoPorPct(90)).toBe(0)
    expect(nivelAclaradoPorPct(null)).toBe(0)
    expect(nivelAclaradoPorPct(10)).toBeCloseTo(0.85)
    expect(nivelAclaradoPorPct(40)).toBeCloseTo(0.425) // punto medio
  })
})

describe('lightenColor', () => {
  it('0 no cambia, 1 llega a blanco', () => {
    expect(lightenColor('#C0392B', 0)).toBe('#c0392b')
    expect(lightenColor('#C0392B', 1)).toBe('#ffffff')
  })
})

// ── Fills en los 5 niveles ────────────────────────────────────────────────────

describe('fillForComuna', () => {
  const data = makeData()
  it('alcalde: usa el lado del criterio activo (abierto/cerrado)', () => {
    expect(fillForComuna(data, { ...baseState, nivel: 'alcalde' }, data.comunaPropsByCut['01101'])).toBe(COLOR_HEX.DER)
    expect(fillForComuna(data, { ...baseState, nivel: 'alcalde' }, data.comunaPropsByCut['01107'])).toBe(COLOR_HEX.IZQ)
  })
  it('gobernador: aclara el color base según pct_en_comuna', () => {
    const s: TerrState = { ...baseState, nivel: 'gobernador' }
    const full = fillForComuna(data, s, data.comunaPropsByCut['01101']) // pct 40 → aclarado
    const faded = fillForComuna(data, s, data.comunaPropsByCut['01107']) // pct 12 → muy aclarado
    expect(full).not.toBe(COLOR_HEX.IZQ) // aclarado, no pleno
    expect(faded).not.toBe(full)
    expect(lightenColor(COLOR_HEX.IZQ, nivelAclaradoPorPct(40))).toBe(full)
  })
  it('diputado por comuna: lado del más votado', () => {
    const s: TerrState = { ...baseState, nivel: 'diputado', coloreoCongreso: 'comuna' }
    expect(fillForComuna(data, s, data.comunaPropsByCut['01101'])).toBe(COLOR_HEX.DER) // RN 90 > PS 50
  })
  it('delegado: lado del delegado vigente del período', () => {
    const s: TerrState = { ...baseState, nivel: 'delegado' }
    expect(fillForComuna(data, s, data.comunaPropsByCut['01101'])).toBe(COLOR_HEX.IZQ) // FRVS
  })
})

describe('fillForRegion', () => {
  const data = makeData()
  it('alcalde: bloque mayoritario de las comunas (empate 1-1 → desempate IZQ)', () => {
    // c1 DER, c2 IZQ → empate → orden IZQ, DER, IND ⇒ IZQ gana
    expect(fillForRegion(data, { ...baseState, nivel: 'alcalde' }, '01')).toBe(COLOR_HEX.IZQ)
  })
  it('gobernador: color directo del gobernador regional (sin aclarar)', () => {
    expect(fillForRegion(data, { ...baseState, nivel: 'gobernador' }, '01')).toBe(COLOR_HEX.IZQ)
  })
})

describe('fillForTerritorioCongreso', () => {
  const data = makeData()
  it('mayoría de electos del territorio (RN + PS electos → empate → IZQ)', () => {
    // DISTRITO 2 electos: D UNO (RN=DER), D DOS (PS=IZQ) → 1-1 → desempate IZQ
    expect(fillForTerritorioCongreso(data, { ...baseState, nivel: 'diputado' }, 'DISTRITO 2')).toBe(COLOR_HEX.IZQ)
  })
  it('sin electos → NULL', () => {
    expect(fillForTerritorioCongreso(data, { ...baseState, nivel: 'senador' }, 'CIRCUNSCRIPCION SENATORIAL 99')).toBe(COLOR_HEX.NULL)
  })
})

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('computeStats', () => {
  const data = makeData()
  it('vista comunas: cuenta por lado activo', () => {
    const s = computeStats(data, { ...baseState, nivel: 'alcalde' }, 'comunas', '01')
    expect(s).toMatchObject({ IZQ: 1, DER: 1, IND: 0, NULL: 0, total: 2, unidad: 'comunas' })
  })
  it('vista regiones: cuenta la región por su color agregado', () => {
    const s = computeStats(data, { ...baseState, nivel: 'alcalde' }, 'regiones', null)
    expect(s.total).toBe(1)
    expect(s.IZQ).toBe(1) // la única región queda IZQ por el desempate
  })
})

// ── Período de alcalde y próxima elección ─────────────────────────────────────

describe('periodoTextoAlcalde', () => {
  const data = makeData()
  it('no puede repostular → 3er período', () => {
    expect(periodoTextoAlcalde(data.comunaPropsByCut['01107'])).toBe('3er período (no puede repostular)')
  })
  it('reelecto + puede repostular → 2do período', () => {
    expect(periodoTextoAlcalde(data.comunaPropsByCut['01101'])).toBe('2do período')
  })
  it('excepción ALGARROBO/PUTRE → 1er período aunque sea reelecto', () => {
    const p = comuna({ codigo_comuna: '05602', comuna: 'Algarrobo', codigo_region: '05', region: 'Valparaíso',
      alcalde_2024: { nombre: 'X', partido: 'IND', pct: 1, votos: 1, reelecto: true, lado_cerrado: 'IND', lado_abierto: 'IND', voto_obligatorio: true, total_validos: 1, contrincantes: null, poblacion: 1, tamano: 'Chica' },
      reeleccion_2028: { puede_repostular: true, estado_confianza: 'verificado' } })
    expect(periodoTextoAlcalde(p)).toBe('1er período')
  })
  it('tbd → null', () => {
    const p = comuna({ codigo_comuna: '01109', codigo_region: '01', reeleccion_2028: { puede_repostular: true, estado_confianza: 'tbd' } })
    expect(periodoTextoAlcalde(p)).toBeNull()
  })
})

describe('proximaEleccionSenador', () => {
  const data = makeData()
  it('electo en 2025 → 2033; si no → 2029', () => {
    expect(proximaEleccionSenador(data, 'CIRCUNSCRIPCION SENATORIAL 1')).toBe(2033) // tuvo electo 2025
    expect(proximaEleccionSenador(data, 'CIRCUNSCRIPCION SENATORIAL 2')).toBe(2029) // solo 2021
  })
})

// ── procesarCongreso ──────────────────────────────────────────────────────────

describe('procesarCongreso', () => {
  const data = makeData()
  it('dedup por id y agrega votos por nombre entre comunas', () => {
    // D DOS aparece en 01101 (50, electo) y 01107 (30, no electo); el dup por id=2 se descarta.
    const agg = data.DIPUTADOS.porTerritorioAnio['DISTRITO 2']['2025']
    const dDos = agg.find((c) => c.nombre === 'D DOS')!
    expect(dDos.votos).toBe(80) // 50 + 30
    expect(dDos.electo).toBe(true) // OR de electos
  })
  it('porComunaAnio ordena desc por votos', () => {
    const lista = data.DIPUTADOS.porComunaAnio['01101']['2025']
    expect(lista.map((r) => r.nombre)).toEqual(['D UNO', 'D DOS']) // 90 > 50
  })
})

// ── activeLadoForComuna edge (por distrito) ───────────────────────────────────

describe('activeLadoForComuna congreso por distrito', () => {
  const data = makeData()
  it('coloreo por distrito usa la mayoría del territorio, no la comuna', () => {
    const s: TerrState = { ...baseState, nivel: 'diputado', coloreoCongreso: 'distrito' }
    expect(activeLadoForComuna(data, s, data.comunaPropsByCut['01101'])).toBe('IZQ') // empate → IZQ
  })
})

// ── Carrito ───────────────────────────────────────────────────────────────────

describe('obtenerFilasCarrito', () => {
  const data = makeData()
  it('alcalde pasadas: una fila por comuna con alcalde del año', () => {
    const filas = obtenerFilasCarrito(data, baseState, 'alcalde', 'pasadas')
    expect(filas).toHaveLength(2)
    expect(filas[0].datos).toMatchObject({ Comuna: 'Alfa', Nombre: 'Juan Perez', Partido: 'UDI' })
  })
  it('alcalde proximas: excluye tbd, incluye período', () => {
    const filas = obtenerFilasCarrito(data, baseState, 'alcalde', 'proximas')
    expect(filas).toHaveLength(2)
    const alfa = filas.find((f) => f.etiqueta === 'Alfa')!
    expect(alfa.datos['Período']).toBe('2do período')
  })
  it('gobernador pasadas: dedup por región', () => {
    const filas = obtenerFilasCarrito(data, baseState, 'gobernador', 'pasadas')
    expect(filas).toHaveLength(1)
    expect(filas[0].datos).toMatchObject({ 'Región': 'Tarapacá', Nombre: 'Ana Soto' })
  })
  it('senador proximas: incluye próxima elección calculada', () => {
    const filas = obtenerFilasCarrito(data, baseState, 'senador', 'proximas')
    const viejo = filas.find((f) => f.etiqueta === 'S Viejo')!
    expect(viejo.datos['Próxima elección']).toBe(2029)
  })
  it('delegado pasadas: fila por delegado con gobierno y período', () => {
    const filas = obtenerFilasCarrito(data, baseState, 'delegado', 'pasadas')
    expect(filas).toHaveLength(1)
    expect(filas[0].datos).toMatchObject({ Gobierno: 'Gabriel Boric Font', Nombre: 'Delegada Uno' })
  })
})

// ── Llaves de reconciliación ──────────────────────────────────────────────────

describe('llaves work-os ↔ PTS', () => {
  it('cutKey / regionKey zero-padean el numérico de work-os', () => {
    expect(cutKey(1402)).toBe('01402')
    expect(cutKey(13101)).toBe('13101')
    expect(regionKey(1)).toBe('01')
    expect(regionKey(13)).toBe('13')
  })
  it('titleCase / normComunaKey', () => {
    expect(titleCase('JUAN PEREZ')).toBe('Juan Perez')
    expect(normComunaKey('Ñuñoa')).toBe('NUNOA')
  })
})
