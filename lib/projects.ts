import fs from 'fs'
import path from 'path'

export type Iniciativa = {
  n: number
  region: string
  cod: string
  capital: string
  zona: string
  eje: string
  eje_gobierno: string | null
  nombre: string
  descripcion: string | null
  ministerio: string
  prioridad: 'Alta' | 'Media' | 'Baja'
  etapa_actual: string | null
  estado_termino_gobierno: string | null
  proximo_hito: string | null
  fecha_proximo_hito: string | null
  fuente_financiamiento: string | null
  codigo_bip: string | null
  inversion_mm: number | null
  comuna: string | null
  rat: string | null
  estado_semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'
  pct_avance: number
  responsable: string | null
  codigo_iniciativa: string | null
}

export function getIniciativas(): Iniciativa[] {
  const filePath = path.join(process.cwd(), 'data', 'prioridades_territoriales.csv')
  const content = fs.readFileSync(filePath, 'utf-8')
  return parseCSV(content)
}

/** @deprecated Use getIniciativas() */
export const getProjects = getIniciativas
/** @deprecated Use Iniciativa */
export type Project = Iniciativa

function parseCSV(content: string): Project[] {
  // Split into records respecting quoted fields that may contain newlines
  const records: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]
    if (ch === '"') {
      inQuote = !inQuote
      current += ch
    } else if (ch === '\n' && !inQuote) {
      records.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) records.push(current)

  function parseFields(line: string): string[] {
    const fields: string[] = []
    let field = ''
    let inQ = false
    for (const ch of line) {
      if (ch === '"') {
        inQ = !inQ
      } else if (ch === ',' && !inQ) {
        fields.push(field.trim())
        field = ''
      } else {
        field += ch
      }
    }
    fields.push(field.trim())
    return fields
  }

  const rows = records
    .filter(r => r.trim())
    .map(r => parseFields(r))

  // Skip header row
  return rows.slice(1).map(f => ({
    n: parseInt(f[0]) || 0,
    region: f[1] || '',
    cod: f[2] || '',
    capital: f[3] || '',
    zona: f[4] || '',
    eje: f[5] || '',
    eje_gobierno: null,
    nombre: f[6] || '',
    descripcion: null,
    ministerio: f[7] || '',
    prioridad: (f[8] || 'Media') as 'Alta' | 'Media' | 'Baja',
    etapa_actual: null,
    estado_termino_gobierno: null,
    proximo_hito: null,
    fecha_proximo_hito: null,
    fuente_financiamiento: null,
    codigo_bip: null,
    inversion_mm: null,
    comuna: null,
    rat: null,
    estado_semaforo: 'gris' as const,
    pct_avance: 0,
    responsable: null,
    codigo_iniciativa: null,
  }))
}
