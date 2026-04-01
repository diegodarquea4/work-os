export type Region = {
  cod: string
  nombre: string
  capital: string
  lat: number
  lng: number
  zona: string
}

export const REGIONS: Region[] = [
  { cod: 'XV', nombre: 'Arica y Parinacota', capital: 'Arica',        lat: -18.4784, lng: -70.3126, zona: 'Norte Grande' },
  { cod: 'I',  nombre: 'Tarapacá',           capital: 'Iquique',      lat: -20.2307, lng: -70.1357, zona: 'Norte Grande' },
  { cod: 'II', nombre: 'Antofagasta',        capital: 'Antofagasta',  lat: -23.6524, lng: -70.3954, zona: 'Norte Grande' },
  { cod: 'III',nombre: 'Atacama',            capital: 'Copiapó',      lat: -27.3668, lng: -70.3317, zona: 'Norte Chico'  },
  { cod: 'IV', nombre: 'Coquimbo',           capital: 'La Serena',    lat: -29.9027, lng: -71.2520, zona: 'Norte Chico'  },
  { cod: 'V',  nombre: 'Valparaíso',         capital: 'Valparaíso',   lat: -33.0472, lng: -71.6127, zona: 'Zona Central' },
  { cod: 'RM', nombre: 'Metropolitana',      capital: 'Santiago',     lat: -33.4569, lng: -70.6483, zona: 'Zona Central' },
  { cod: 'VI', nombre: "O'Higgins",          capital: 'Rancagua',     lat: -34.1708, lng: -70.7444, zona: 'Zona Central' },
  { cod: 'VII',nombre: 'Maule',              capital: 'Talca',        lat: -35.4264, lng: -71.6554, zona: 'Zona Central' },
  { cod: 'XVI',nombre: 'Ñuble',              capital: 'Chillán',      lat: -36.6063, lng: -72.1025, zona: 'Zona Central' },
  { cod: 'VIII',nombre: 'Biobío',            capital: 'Concepción',   lat: -36.8270, lng: -73.0498, zona: 'Sur'          },
  { cod: 'IX', nombre: 'La Araucanía',       capital: 'Temuco',       lat: -38.7359, lng: -72.5904, zona: 'Sur'          },
  { cod: 'XIV',nombre: 'Los Ríos',           capital: 'Valdivia',     lat: -39.8142, lng: -73.2459, zona: 'Sur'          },
  { cod: 'X',  nombre: 'Los Lagos',          capital: 'Puerto Montt', lat: -41.4718, lng: -72.9427, zona: 'Sur'          },
  { cod: 'XI', nombre: 'Aysén',              capital: 'Coyhaique',    lat: -45.5712, lng: -72.0688, zona: 'Austral'      },
  { cod: 'XII',nombre: 'Magallanes y Antártica', capital: 'Punta Arenas', lat: -53.1638, lng: -70.9171, zona: 'Austral' },
]

export const ZONA_COLORS: Record<string, string> = {
  'Norte Grande': '#F59E0B',
  'Norte Chico':  '#EAB308',
  'Zona Central': '#3B82F6',
  'Sur':          '#22C55E',
  'Austral':      '#A855F7',
}
