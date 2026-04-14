import fs from 'fs'
import path from 'path'

export type Iniciativa = {
  n: number
  region: string
  cod: string
  capital: string
  zona: string
  eje: string
  meta: string
  ministerios: string[]
  prioridad: 'Alta' | 'Media'
  plazo: string
  estado_semaforo: 'verde' | 'ambar' | 'rojo' | 'gris'
  pct_avance: number
  responsable: string | null
  fecha_limite: string | null
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
    meta: f[6] || '',
    ministerios: (f[7] || '').split('\n').map(m => m.trim()).filter(Boolean),
    prioridad: (f[8] || 'Media') as 'Alta' | 'Media',
    plazo: f[9] || '',
    estado_semaforo: 'gris' as const,
    pct_avance: 0,
    responsable: null,
    fecha_limite: null,
    codigo_iniciativa: null,
  }))
}
