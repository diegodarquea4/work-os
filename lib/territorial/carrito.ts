/**
 * Carrito de descarga del modo «Autoridades»: arma las filas seleccionables por
 * (nivel, modo) y exporta a Excel (una hoja por categoría). Portado verbatim del PTS
 * (obtenerFilasCarrito, NOMBRE_CATEGORIA_HOJA, descargas xlsx).
 *
 * `obtenerFilasCarrito` es puro y testeable. Las exportaciones (`exportCarritoXlsx`,
 * `exportCircunscripciones2029`) tienen efecto de navegador (descargan un archivo) e
 * importan `xlsx` de forma perezosa para no arrastrarlo al bundle de la ruta ni a los
 * tests de node.
 */

import { titleCase, normComunaKey } from './politica'
import { proximaEleccionSenador, periodoTextoAlcalde } from './derive'
import type { TerritorialData, TerrState, NivelAutoridad } from './types'

export type CarritoModo = 'pasadas' | 'proximas'

export interface CarritoFila {
  grupo: string
  id: string
  etiqueta: string
  detalle: string
  datos: Record<string, string | number | null>
}

export interface CarritoItem {
  id: string
  categoria: string
  nivel: NivelAutoridad
  modo: CarritoModo
  datos: Record<string, string | number | null>
}

export const NOMBRE_CATEGORIA_HOJA: Record<string, string> = {
  alcalde_pasadas: 'Alcaldes', alcalde_proximas: 'Alcaldes - Próxima elección',
  gobernador_pasadas: 'Gobernadores', gobernador_proximas: 'Gobernadores - Próxima elección',
  diputado_pasadas: 'Diputados', diputado_proximas: 'Diputados - Próxima elección',
  senador_pasadas: 'Senadores', senador_proximas: 'Senadores - Próxima elección',
  delegado_pasadas: 'Delegados presidenciales',
}

/** Todas las comunas en orden determinístico (por CUT). */
function comunasEnOrden(data: TerritorialData) {
  return Object.keys(data.comunaPropsByCut).sort().map((cut) => data.comunaPropsByCut[cut])
}

export function obtenerFilasCarrito(
  data: TerritorialData,
  state: TerrState,
  nivel: NivelAutoridad,
  modo: CarritoModo,
): CarritoFila[] {
  const filas: CarritoFila[] = []

  if (nivel === 'alcalde' && modo === 'pasadas') {
    comunasEnOrden(data).forEach((p) => {
      const al = p[`alcalde_${state.year}`]
      if (!al) return
      filas.push({
        grupo: p.region, id: `alc_${p.codigo_comuna}_${state.year}`, etiqueta: p.comuna,
        detalle: `${titleCase(al.nombre)} · ${al.partido || 'S/D'}${al.pct != null ? ' · ' + al.pct.toFixed(2) + '%' : ''}`,
        datos: { Comuna: p.comuna, 'Región': p.region, 'Año': state.year, Nombre: titleCase(al.nombre), Partido: al.partido, '% Votos': al.pct, Votos: al.votos },
      })
    })
  }

  if (nivel === 'alcalde' && modo === 'proximas') {
    comunasEnOrden(data).forEach((p) => {
      const r = p.reeleccion_2028
      if (!r || r.estado_confianza === 'tbd') return
      const al = p.alcalde_2024
      const periodo = periodoTextoAlcalde(p) || ''
      filas.push({
        grupo: p.region, id: `alcprox_${p.codigo_comuna}`, etiqueta: p.comuna,
        detalle: `${al ? titleCase(al.nombre) : 'S/D'} · ${r.puede_repostular ? 'Sí puede' : 'No puede'} · ${periodo}`,
        datos: { Comuna: p.comuna, 'Región': p.region, 'Alcalde actual': al ? titleCase(al.nombre) : '', 'Período': periodo, '¿Puede repostular 2028?': r.puede_repostular ? 'Sí' : 'No', 'Confianza del dato': r.estado_confianza },
      })
    })
  }

  if (nivel === 'gobernador' && modo === 'pasadas') {
    const vistos = new Set<string>()
    comunasEnOrden(data).forEach((p) => {
      if (vistos.has(p.codigo_region)) return
      const gob = p[`gobernador_${state.year}`]
      if (!gob) return
      vistos.add(p.codigo_region)
      filas.push({
        grupo: p.region, id: `gob_${p.codigo_region}_${state.year}`, etiqueta: p.region,
        detalle: `${titleCase(gob.nombre)} · ${gob.partido || 'S/D'}${gob.pct != null ? ' · ' + gob.pct.toFixed(2) + '%' : ''}`,
        datos: { 'Región': p.region, 'Año': state.year, Nombre: titleCase(gob.nombre), Partido: gob.partido, '% Votos': gob.pct, Votos: gob.votos },
      })
    })
  }

  if (nivel === 'gobernador' && modo === 'proximas') {
    const vistos = new Set<string>()
    comunasEnOrden(data).forEach((p) => {
      if (vistos.has(p.codigo_region)) return
      const r = p.gobernador_reeleccion_2028
      if (!r) return
      vistos.add(p.codigo_region)
      const gob = p.gobernador_2024
      filas.push({
        grupo: p.region, id: `gobprox_${p.codigo_region}`, etiqueta: p.region,
        detalle: `${gob ? titleCase(gob.nombre) : 'S/D'} · ${r.puede_repostular ? 'Sí puede' : 'No puede'}`,
        datos: { 'Región': p.region, 'Gobernador actual': gob ? titleCase(gob.nombre) : '', '¿Puede repostular 2028?': r.puede_repostular ? 'Sí' : 'No', 'Confianza del dato': r.estado_confianza },
      })
    })
  }

  if ((nivel === 'diputado' || nivel === 'senador') && modo === 'pasadas') {
    const datos = nivel === 'diputado' ? data.DIPUTADOS : data.SENADORES
    const campoTerr = nivel === 'diputado' ? 'Distrito' : 'Circunscripción'
    Object.keys(datos.porTerritorioAnio).forEach((terr) => {
      const lista = (datos.porTerritorioAnio[terr] || {})[state.congresoAnio] || []
      lista.filter((c) => c.electo).forEach((c) => {
        filas.push({
          grupo: terr, id: `${nivel}_${terr}_${state.congresoAnio}_${normComunaKey(c.nombre)}`, etiqueta: titleCase(c.nombre),
          detalle: `${c.partido || 'S/D'} · ${c.votos.toLocaleString('es-CL')} votos`,
          datos: { [campoTerr]: terr, 'Año': state.congresoAnio, Nombre: titleCase(c.nombre), Partido: c.partido, Votos: c.votos },
        })
      })
    })
  }

  if (nivel === 'diputado' && modo === 'proximas') {
    Object.values(data.CONGRESO_REELECCION.diputado || {}).forEach((r) => {
      filas.push({
        grupo: r.territorio, id: `diputadoprox_${r.territorio}_${normComunaKey(r.nombre)}`, etiqueta: titleCase(r.nombre),
        detalle: `${r.periodos_consecutivos}º período · ${r.puede_repostular ? 'Sí puede' : 'No puede'} (2029)`,
        datos: { Distrito: r.territorio, Nombre: titleCase(r.nombre), 'Períodos consecutivos': r.periodos_consecutivos, '¿Puede repostular 2029?': r.puede_repostular ? 'Sí' : 'No', 'Confianza del dato': r.confianza_dato },
      })
    })
  }

  if (nivel === 'senador' && modo === 'proximas') {
    Object.values(data.CONGRESO_REELECCION.senador || {}).forEach((r) => {
      const proxima = proximaEleccionSenador(data, r.territorio)
      filas.push({
        grupo: r.territorio, id: `senadorprox_${r.territorio}_${normComunaKey(r.nombre)}`, etiqueta: titleCase(r.nombre),
        detalle: `${r.periodos_consecutivos}º período · ${r.puede_repostular ? 'Sí puede' : 'No puede'} (${proxima})`,
        datos: { 'Circunscripción': r.territorio, Nombre: titleCase(r.nombre), 'Períodos consecutivos': r.periodos_consecutivos, 'Próxima elección': proxima, [`¿Puede repostular ${proxima}?`]: r.puede_repostular ? 'Sí' : 'No', 'Confianza del dato': r.confianza_dato },
      })
    })
  }

  if (nivel === 'delegado' && modo === 'pasadas') {
    Object.keys(data.DELEGADOS_POR_REGION).forEach((rid) => {
      const nombreRegion = data.regionesById[rid]?.region || rid
      const porPresidente = data.DELEGADOS_POR_REGION[rid]
      Object.keys(porPresidente).forEach((presidente) => {
        porPresidente[presidente].forEach((d) => {
          filas.push({
            grupo: nombreRegion, id: `deleg_${rid}_${presidente}_${normComunaKey(d.nombre)}`, etiqueta: d.nombre,
            detalle: `${presidente} · ${d.partido || 'S/D'} · ${d.periodo_especifico || ''}`,
            datos: { 'Región': nombreRegion, Gobierno: presidente, Nombre: d.nombre, Partido: d.partido, Cargo: d.cargo, 'Período': d.periodo_especifico },
          })
        })
      })
    })
  }

  return filas
}

/** Descarga el carrito a Excel: una hoja por categoría. Efecto de navegador. */
export async function exportCarritoXlsx(carrito: CarritoItem[]): Promise<void> {
  if (carrito.length === 0) return
  const XLSX = await import('xlsx')
  const porCategoria: Record<string, Record<string, string | number | null>[]> = {}
  carrito.forEach((item) => { (porCategoria[item.categoria] = porCategoria[item.categoria] || []).push(item.datos) })
  const wb = XLSX.utils.book_new()
  Object.keys(porCategoria).forEach((cat) => {
    const nombreHoja = (NOMBRE_CATEGORIA_HOJA[cat] || cat).slice(0, 31)
    const ws = XLSX.utils.json_to_sheet(porCategoria[cat])
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja)
  })
  XLSX.writeFile(wb, 'carrito_panel_territorial.xlsx')
}

/** Descarga las circunscripciones que votan en 2029 (senador actual electo en 2021, no 2025). */
export async function exportCircunscripciones2029(data: TerritorialData): Promise<void> {
  const XLSX = await import('xlsx')
  const territoriosCon2025 = new Set<string>()
  Object.keys(data.SENADORES.porTerritorioAnio).forEach((terr) => {
    const lista2025 = (data.SENADORES.porTerritorioAnio[terr] || {})['2025']
    if (lista2025 && lista2025.some((c) => c.electo)) territoriosCon2025.add(terr)
  })

  const filas: Record<string, string | number | null>[] = []
  Object.values(data.CONGRESO_REELECCION.senador || {}).forEach((r) => {
    if (territoriosCon2025.has(r.territorio)) return
    const candidato = (data.SENADORES.porTerritorioAnio[r.territorio]?.['2021'] || [])
      .find((c) => normComunaKey(c.nombre) === normComunaKey(r.nombre))
    filas.push({
      'Circunscripción': r.territorio,
      Nombre: candidato ? candidato.nombre : r.nombre,
      Partido: candidato ? candidato.partido : '',
      'Períodos consecutivos': r.periodos_consecutivos,
      '¿Puede repostular en 2029?': r.puede_repostular ? 'Sí' : 'No',
      'Confianza del dato': r.confianza_dato,
    })
  })

  filas.sort((a, b) => String(a['Circunscripción']).localeCompare(String(b['Circunscripción'])))

  const ws = XLSX.utils.json_to_sheet(filas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Circunscripciones 2029')
  XLSX.writeFile(wb, 'circunscripciones_elecciones_2029.xlsx')
}
