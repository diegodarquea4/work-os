export type Region = {
  cod: string
  nombre: string
  capital: string
  lat: number
  lng: number
  zona: string
  shortCod: string  // 2-letter code for codigo_iniciativa prefix (e.g. AY-01-001)
  /** Superficie en km². Geografía fija — no viene de ninguna tabla de métricas. */
  km2: number
  comunasN: number
  provinciasN: number
}

/** Suma de superficie de las 16 regiones (INE). Denominador para "% del territorio nacional". */
export const TOTAL_KM2 = 756102

export const REGIONS: Region[] = [
  { cod: 'XV',   nombre: 'Arica y Parinacota',      capital: 'Arica',         lat: -18.4784, lng: -70.3126, zona: 'Norte Grande', shortCod: 'AP', km2: 16873,  comunasN: 4,  provinciasN: 2 },
  { cod: 'I',    nombre: 'Tarapacá',                capital: 'Iquique',       lat: -20.2307, lng: -70.1357, zona: 'Norte Grande', shortCod: 'TA', km2: 42226,  comunasN: 7,  provinciasN: 2 },
  { cod: 'II',   nombre: 'Antofagasta',             capital: 'Antofagasta',   lat: -23.6524, lng: -70.3954, zona: 'Norte Grande', shortCod: 'AN', km2: 126049, comunasN: 9,  provinciasN: 3 },
  { cod: 'III',  nombre: 'Atacama',                 capital: 'Copiapó',       lat: -27.3668, lng: -70.3317, zona: 'Norte Chico',  shortCod: 'AT', km2: 75176,  comunasN: 9,  provinciasN: 3 },
  { cod: 'IV',   nombre: 'Coquimbo',                capital: 'La Serena',     lat: -29.9027, lng: -71.2520, zona: 'Norte Chico',  shortCod: 'CQ', km2: 40580,  comunasN: 15, provinciasN: 3 },
  { cod: 'V',    nombre: 'Valparaíso',              capital: 'Valparaíso',    lat: -33.0472, lng: -71.6127, zona: 'Zona Central', shortCod: 'VP', km2: 16396,  comunasN: 38, provinciasN: 8 },
  { cod: 'RM',   nombre: 'Metropolitana',           capital: 'Santiago',      lat: -33.4569, lng: -70.6483, zona: 'Zona Central', shortCod: 'RM', km2: 15403,  comunasN: 52, provinciasN: 6 },
  { cod: 'VI',   nombre: "O'Higgins",               capital: 'Rancagua',      lat: -34.1708, lng: -70.7444, zona: 'Zona Central', shortCod: 'OH', km2: 16387,  comunasN: 33, provinciasN: 3 },
  { cod: 'VII',  nombre: 'Maule',                   capital: 'Talca',         lat: -35.4264, lng: -71.6554, zona: 'Zona Central', shortCod: 'ML', km2: 30296,  comunasN: 30, provinciasN: 4 },
  { cod: 'XVI',  nombre: 'Ñuble',                   capital: 'Chillán',       lat: -36.6063, lng: -72.1025, zona: 'Zona Central', shortCod: 'NB', km2: 13179,  comunasN: 21, provinciasN: 3 },
  { cod: 'VIII', nombre: 'Biobío',                  capital: 'Concepción',    lat: -36.8270, lng: -73.0498, zona: 'Sur',          shortCod: 'BI', km2: 24021,  comunasN: 33, provinciasN: 3 },
  { cod: 'IX',   nombre: 'La Araucanía',            capital: 'Temuco',        lat: -38.7359, lng: -72.5904, zona: 'Sur',          shortCod: 'AR', km2: 31842,  comunasN: 32, provinciasN: 2 },
  { cod: 'XIV',  nombre: 'Los Ríos',                capital: 'Valdivia',      lat: -39.8142, lng: -73.2459, zona: 'Sur',          shortCod: 'LR', km2: 18430,  comunasN: 12, provinciasN: 2 },
  { cod: 'X',    nombre: 'Los Lagos',               capital: 'Puerto Montt',  lat: -41.4718, lng: -72.9427, zona: 'Sur',          shortCod: 'LL', km2: 48584,  comunasN: 30, provinciasN: 4 },
  { cod: 'XI',   nombre: 'Aysén',                   capital: 'Coyhaique',     lat: -45.5712, lng: -72.0688, zona: 'Austral',      shortCod: 'AY', km2: 108494, comunasN: 10, provinciasN: 4 },
  { cod: 'XII',  nombre: 'Magallanes y Antártica',  capital: 'Punta Arenas',  lat: -53.1638, lng: -70.9171, zona: 'Austral',      shortCod: 'MG', km2: 132034, comunasN: 11, provinciasN: 4 },
]

export const ZONA_COLORS: Record<string, string> = {
  'Norte Grande': '#F59E0B',
  'Norte Chico':  '#EAB308',
  'Zona Central': '#3B82F6',
  'Sur':          '#22C55E',
  'Austral':      '#A855F7',
}

/** Maps our region codes to INE numeric codes (used for regional_metrics time-series table).
 *  NAC (0) is a special code for national-level series stored alongside regional data. */
export const INE_CODE: Record<string, number> = {
  XV: 15, I: 1,   II: 2,   III: 3,
  IV: 4,  V: 5,   RM: 13,  VI: 6,
  VII: 7, XVI: 16, VIII: 8, IX: 9,
  XIV: 14, X: 10, XI: 11,  XII: 12,
  NAC: 0,
}

/** Reverse of INE_CODE: numeric region id → our region cod string. */
export const INE_INVERSE: Record<number, string> = Object.fromEntries(
  Object.entries(INE_CODE).map(([cod, id]) => [id, cod])
)

/** Maps BCCh PIB regional codes (01-16) to our region string codes.
 *  Used in ine-sync to map F035 series to regionCod. */
export const BCCh_PIB_CODE: Record<string, string> = {
  '01': 'I',  '02': 'II',  '03': 'III', '04': 'IV',
  '05': 'V',  '06': 'VI',  '07': 'VII', '08': 'VIII',
  '09': 'IX', '10': 'X',   '11': 'XI',  '12': 'XII',
  '13': 'RM', '14': 'XIV', '15': 'XV',  '16': 'XVI',
}

/** ISO 3166-2:CL subdivision codes — prefix segment of codigo_iniciativa (XX-NNN-NNN) */
export const ISO_CODE: Record<string, string> = {
  XV: 'AP', I: 'TA',   II: 'AN',  III: 'AT',
  IV: 'CO', V: 'VS',   RM: 'RM',  VI: 'LI',
  VII: 'ML', XVI: 'NB', VIII: 'BI', IX: 'AR',
  XIV: 'LR', X: 'LL',  XI: 'AI',  XII: 'MA',
}
