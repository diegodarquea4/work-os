// Unique color per region — consistent across the app
export const REGION_COLORS: Record<string, string> = {
  'Arica y Parinacota':    '#E76F51',
  'Tarapacá':              '#F4A261',
  'Antofagasta':           '#E9C46A',
  'Atacama':               '#8AB17D',
  'Coquimbo':              '#2A9D8F',
  'Valparaíso':            '#457B9D',
  'Metropolitana':         '#1D3557',
  "O'Higgins":             '#6A4C93',
  'Maule':                 '#9E2A2B',
  'Ñuble':                 '#C77DFF',
  'Biobío':                '#3A86FF',
  'La Araucanía':          '#06D6A0',
  'Los Ríos':              '#118AB2',
  'Los Lagos':             '#073B4C',
  'Aysén':                 '#4CC9F0',
  'Magallanes y Antártica':'#7209B7',
}

export function getRegionColor(regionName: string): string {
  // Partial match for safety
  const key = Object.keys(REGION_COLORS).find(k =>
    regionName.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(regionName.toLowerCase())
  )
  return key ? REGION_COLORS[key] : '#6B7280'
}
