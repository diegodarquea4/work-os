/**
 * Coordenadas de una iniciativa (migración 104): validación y parseo puros,
 * compartidos por la ficha (popover Ubicación), el importador Excel y los
 * tests. Sin Leaflet ni React acá.
 *
 * Los límites son los MISMOS que el CHECK `prioridades_ubicacion_en_chile`
 * de la BD: caja de Chile incluyendo Rapa Nui (lng ≈ -109.4), Juan
 * Fernández y el Territorio Antártico (lat hasta -90, lng hasta -53).
 * Su gracia es rechazar el error más común al tipear — latitud y longitud
 * invertidas ("-70.66, -33.45"): la "longitud" -33 queda fuera de la caja.
 */

export const CHILE_BBOX = {
  latMin: -90, latMax: -17,
  lngMin: -113, lngMax: -53,
} as const

export type Coordenada = { lat: number; lng: number }

export function coordenadaValida(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= CHILE_BBOX.latMin && lat <= CHILE_BBOX.latMax
    && lng >= CHILE_BBOX.lngMin && lng <= CHILE_BBOX.lngMax
}

/** true si el par está fuera de la caja pero invirtiéndolo entra: lat/lng al revés. */
export function pareceInvertida(lat: number, lng: number): boolean {
  return !coordenadaValida(lat, lng) && coordenadaValida(lng, lat)
}

/**
 * Número decimal tolerante: acepta punto o coma como separador decimal
 * ("-33,4489" → -33.4489). Devuelve null si no es un número.
 */
export function parseDecimal(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  const t = raw.trim().replace(',', '.')
  if (t === '' || !/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

/**
 * Parsea lo que un usuario pega en el popover de Ubicación. Acepta:
 *   · "-33.4489, -70.6693"  /  "-33.4489 -70.6693"  /  "-33.4489;-70.6693"
 *   · coma decimal: "-33,4489, -70,6693" y "-33,4489 -70,6693"
 *   · URL de Google Maps: ".../@-33.4489,-70.6693,15z" o "...?q=-33.4489,-70.6693"
 * Devuelve null si no logra sacar exactamente dos números o si el par queda
 * fuera de la caja de Chile (incluye el caso invertido — el caller decide si
 * ofrece dar vuelta el par con `pareceInvertida`).
 */
export function parseCoordenada(texto: string): Coordenada | null {
  const t = texto.trim()
  if (!t) return null

  // URL de Google Maps: primero "@lat,lng", si no "q=lat,lng" / "query=lat,lng".
  const url = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    ?? t.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (url) return armar(Number(url[1]), Number(url[2]))

  // Texto libre: extraer los números. Si solo hay un separador y las comas
  // son decimales ("-33,4489 -70,6693"), los tokens se separan por espacio.
  const tokens = t.split(/[;\s]+|,\s+/).map(s => s.trim()).filter(Boolean)
  let nums: number[] = []
  if (tokens.length === 2) {
    nums = tokens.map(parseDecimal).filter((n): n is number => n != null)
  }
  if (nums.length !== 2) {
    // Formato "lat,lng" pegado sin espacio (punto decimal).
    const m = t.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
    if (!m) return null
    nums = [Number(m[1]), Number(m[2])]
  }
  return armar(nums[0], nums[1])
}

function armar(lat: number, lng: number): Coordenada | null {
  if (!coordenadaValida(lat, lng)) return null
  return { lat, lng }
}

/** Formato de despliegue: 4 decimales (~11 m), punto decimal. */
export function formatoCoordenada(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}
