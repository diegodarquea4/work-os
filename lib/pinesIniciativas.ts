import type { Iniciativa, Capa } from '@/lib/projects'
import type { SemaforoKey } from '@/lib/config'

/**
 * Pines del drill comunal del Mapa (migración 104): dado el listado de
 * iniciativas de la región, arma la lista plana de puntos que dibuja
 * `PinesIniciativasLayer`. Puro y determinístico — sin Leaflet, sin React,
 * sin Date/random — para que el orden de entrada no mueva los pines de
 * lugar entre renders.
 *
 * Reglas de producto (Diego, 2026-09-11 — reemplaza el diseño original del
 * 2026-09-10): SOLO van como pin las iniciativas con `ubicacion_lat/lng`
 * cargada. Las que tienen comuna pero no coordenada exacta NO se aproximan
 * al centroide — simplemente no aparecen (se cuentan en `sinUbicacion` para
 * el contador de avance, nada más). El diseño anterior las dibujaba en el
 * centro de su comuna; Diego lo descartó explícitamente porque prefiere ver
 * el drill vacío antes que un pin que no representa una ubicación real.
 * - Las de `alcance_regional` (sin comuna) tampoco van como pin: se
 *   devuelven aparte (`regionales`) para listarlas al costado, como antes.
 * - Varias EXACTAS que comparten coordenada (duplicado real o copiado del
 *   mismo punto) se DESPARRAMAN alrededor en espiral de girasol, en metros,
 *   independiente del zoom — si no, una taparía a la otra.
 */

export type PinIniciativa = {
  /** PK — llave del pin (n NO es único). */
  id: number
  n: number
  lat: number
  lng: number
  semaforo: SemaforoKey
  capa: Capa
  nombre: string
}

export type PinesResultado = {
  pines: PinIniciativa[]
  /** Iniciativas de alcance regional (excluidas del mapa), ya filtradas por capa. */
  regionales: Iniciativa[]
  /** Con capa activa, sin alcance regional, pero sin `ubicacion_lat/lng` — no van como pin. */
  sinUbicacion: number
}

const METROS_POR_GRADO_LAT = 111_320
const ANGULO_DORADO_RAD = (137.508 * Math.PI) / 180

/** Radio base del desparrame (m), crece suave con la cantidad y se acota. */
export function radioDesparrame(count: number): number {
  const r = 60 * Math.sqrt(count / 20)
  return Math.min(250, Math.max(60, r))
}

/**
 * Desplazamiento del k-ésimo punto de un grupo (k=0 queda en el centro):
 * espiral de girasol r = R·√k, θ = k·137.508°. Devuelve [dLat, dLng] en grados.
 */
export function offsetGirasol(k: number, radioM: number, latBase: number): [number, number] {
  if (k === 0) return [0, 0]
  const r = radioM * Math.sqrt(k)
  const theta = k * ANGULO_DORADO_RAD
  const dNorte = r * Math.cos(theta)
  const dEste  = r * Math.sin(theta)
  const dLat = dNorte / METROS_POR_GRADO_LAT
  const dLng = dEste / (METROS_POR_GRADO_LAT * Math.cos((latBase * Math.PI) / 180))
  return [dLat, dLng]
}

function tieneCoordenada(p: Iniciativa): p is Iniciativa & { ubicacion_lat: number; ubicacion_lng: number } {
  return p.ubicacion_lat != null && p.ubicacion_lng != null
    && Number.isFinite(p.ubicacion_lat) && Number.isFinite(p.ubicacion_lng)
}

export function construirPines(
  iniciativas: Iniciativa[],
  capas: ReadonlySet<Capa>,
): PinesResultado {
  const regionales: Iniciativa[] = []
  const base: PinIniciativa[] = []
  let sinUbicacion = 0

  for (const p of iniciativas) {
    if (!capas.has(p.capa)) continue
    if (p.alcance_regional) { regionales.push(p); continue }
    if (!tieneCoordenada(p)) { sinUbicacion++; continue }
    base.push({
      id: p.id, n: p.n, semaforo: p.estado_semaforo, capa: p.capa, nombre: p.nombre,
      lat: p.ubicacion_lat, lng: p.ubicacion_lng,
    })
  }

  // Orden canónico por id: el desparrame de cada grupo depende del índice,
  // así que sin esto el orden de entrada movería los pines entre renders.
  base.sort((a, b) => a.id - b.id)
  regionales.sort((a, b) => a.id - b.id)

  // Agrupar por punto (5 decimales ≈ 1 m) y desparramar dentro del grupo —
  // dos iniciativas con la MISMA coordenada exacta (edificio compartido,
  // o copy-paste) no deben quedar una encima de la otra.
  const grupos = new Map<string, PinIniciativa[]>()
  for (const pin of base) {
    const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`
    const arr = grupos.get(key) ?? []
    arr.push(pin)
    grupos.set(key, arr)
  }

  const pines: PinIniciativa[] = []
  for (const grupo of grupos.values()) {
    const radio = radioDesparrame(grupo.length)
    grupo.forEach((pin, k) => {
      const [dLat, dLng] = offsetGirasol(k, radio, pin.lat)
      pines.push({ ...pin, lat: pin.lat + dLat, lng: pin.lng + dLng })
    })
  }
  pines.sort((a, b) => a.id - b.id)

  return { pines, regionales, sinUbicacion }
}

/** Distancia aproximada en metros entre dos puntos (equirectangular — sirve a escala comunal). */
export function distanciaM(a: [number, number], b: [number, number]): number {
  const dLat = (b[0] - a[0]) * METROS_POR_GRADO_LAT
  const dLng = (b[1] - a[1]) * METROS_POR_GRADO_LAT * Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180)
  return Math.hypot(dLat, dLng)
}
