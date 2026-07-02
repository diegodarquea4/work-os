/**
 * Parser mínimo de WKT (Well-Known Text) POLYGON — el formato canónico que
 * exporta PostGIS/QGIS/OGR. Solo `POLYGON` simple (ring exterior sin holes);
 * `MULTIPOLYGON` u otros tipos se rechazan con mensaje claro.
 *
 * Diseño:
 *   - Convención de orden: WKT usa `lng lat`. Devolvemos `[lng, lat]` (formato
 *     GeoJSON canónico) para que un solo borde (renderer) traduzca a
 *     `[lat, lng]` que espera Leaflet.
 *   - Cierra el ring automáticamente si el primer y último vértice difieren.
 *     Guarda el shape sin el vértice de cierre duplicado — el consumidor
 *     (Polygon de react-leaflet) no lo necesita.
 *   - Cero dependencias.
 */

export type WktParseError = { ok: false; error: string }
export type WktParseOk<T> = { ok: true; value: T }
export type WktParseResult<T> = WktParseOk<T> | WktParseError

const LNG_RANGE = [-180, 180] as const
const LAT_RANGE = [-90, 90] as const

/**
 * Parsea `POLYGON((lng lat, lng lat, ...))` a un array de [lng, lat].
 * Devuelve el ring exterior SIN el vértice de cierre duplicado
 * (Leaflet/GeoJSON aceptan ambas formas; nosotros normalizamos a la abierta).
 */
export function parseWktPolygon(input: string): WktParseResult<[number, number][]> {
  const raw = input.trim()
  if (!raw) return { ok: false, error: 'Ingresá un polígono WKT.' }

  const upper = raw.toUpperCase()
  if (upper.startsWith('MULTIPOLYGON')) {
    return { ok: false, error: 'MULTIPOLYGON no está soportado — dividí en polígonos individuales.' }
  }
  if (!upper.startsWith('POLYGON')) {
    return { ok: false, error: 'Formato inválido. Se esperaba `POLYGON((lng lat, lng lat, ...))`.' }
  }

  // Extrae contenido entre paréntesis externo.
  // POLYGON((...)) o POLYGON  ((...)) con whitespace variable.
  const match = raw.match(/POLYGON\s*\(\s*\((.+)\)\s*\)\s*$/i)
  if (!match) {
    return { ok: false, error: 'No se pudo extraer los vértices. Verificá que uses paréntesis dobles: `POLYGON((...))`.' }
  }

  const ring = match[1].trim()
  const pairs = ring.split(',').map(p => p.trim()).filter(Boolean)
  if (pairs.length < 3) {
    return { ok: false, error: 'Un polígono necesita al menos 3 vértices.' }
  }

  const coords: [number, number][] = []
  for (let i = 0; i < pairs.length; i++) {
    const parts = pairs[i].split(/\s+/).filter(Boolean)
    if (parts.length < 2) {
      return { ok: false, error: `Vértice ${i + 1} inválido: se esperaban dos números separados por espacio.` }
    }
    const lng = Number(parts[0])
    const lat = Number(parts[1])
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return { ok: false, error: `Vértice ${i + 1}: coordenadas no numéricas.` }
    }
    if (lng < LNG_RANGE[0] || lng > LNG_RANGE[1]) {
      return { ok: false, error: `Vértice ${i + 1}: longitud ${lng} fuera de rango (-180..180).` }
    }
    if (lat < LAT_RANGE[0] || lat > LAT_RANGE[1]) {
      return { ok: false, error: `Vértice ${i + 1}: latitud ${lat} fuera de rango (-90..90).` }
    }
    coords.push([lng, lat])
  }

  // Normalizar: quitar vértice de cierre si el usuario lo puso (WKT lo requiere).
  const first = coords[0]
  const last  = coords[coords.length - 1]
  if (coords.length >= 4 && first[0] === last[0] && first[1] === last[1]) {
    coords.pop()
  }

  if (coords.length < 3) {
    return { ok: false, error: 'Después de deduplicar el vértice de cierre queda con menos de 3 vértices.' }
  }

  return { ok: true, value: coords }
}

/**
 * Serializa `[[lng, lat], ...]` a `POLYGON((lng lat, ...))` — cierra el ring
 * repitiendo el primer vértice al final (WKT lo requiere).
 */
export function toWktPolygon(coords: [number, number][]): string {
  if (coords.length < 3) throw new Error('Un polígono necesita al menos 3 vértices.')
  const closed = coords[0][0] === coords[coords.length - 1][0] && coords[0][1] === coords[coords.length - 1][1]
    ? coords
    : [...coords, coords[0]]
  const inside = closed.map(([lng, lat]) => `${lng} ${lat}`).join(', ')
  return `POLYGON((${inside}))`
}
