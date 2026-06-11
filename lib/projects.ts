import fs from 'fs'
import path from 'path'

export type Iniciativa = {
  // PK estable de prioridades_territoriales (UNIQUE, BTREE). Usar SIEMPRE
  // como llave de mutación (.eq('id', ...)). Etapa 5 de la consolidación
  // backend dejó de usar n como llave de write porque n NO es UNIQUE en
  // BD: era un bug latente. n sigue siendo el número de orden de negocio.
  // FK lógicas en seguimientos / documentos / semaforo_log SIGUEN apuntando
  // a n — eso queda como deuda separada.
  id: number
  n: number
  region: string
  cod: string
  capital: string
  zona: string
  eje: string
  // FK al catálogo formal `region_ejes` (migración 015). Nullable durante
  // la transición — las iniciativas pre-migración pueden no tenerlo. El
  // string `eje` se mantiene como dato denormalizado hasta la limpieza.
  eje_id?: number | null
  eje_gobierno: string | null
  nombre: string
  descripcion: string | null
  ministerio: string | null
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
  origen: string | null
  en_foco: boolean
  tags: string[]
  // Diferenciador admin-only (migración 017). Marca casos de la Mesa
  // Interministerial de Desalojos. El seguimiento estructurado vive aparte
  // en `desalojo_detalle` / `desalojo_seguimientos` / `desalojo_log`.
  es_desalojo: boolean
}

export function getIniciativas(): Iniciativa[] {
  const filePath = path.join(process.cwd(), 'data', 'prioridades_territoriales.csv')
  const content = fs.readFileSync(filePath, 'utf-8')
  return parseCSV(content)
}

function parseCSV(content: string): Iniciativa[] {
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
  // Nota: este fallback CSV se usa solo en dev sin Supabase. En ese contexto
  // no hay PK real: usamos n como id sintético. En prod la app pasa por
  // Supabase y mapRow asigna el id real.
  return rows.slice(1).map(f => ({
    id: parseInt(f[0]) || 0,
    n: parseInt(f[0]) || 0,
    region: f[1] || '',
    cod: f[2] || '',
    capital: f[3] || '',
    zona: f[4] || '',
    eje: f[5] || '',
    eje_gobierno: null,
    nombre: f[6] || '',
    descripcion: null,
    ministerio: f[7] || null,
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
    origen: null,
    en_foco: false,
    tags: [],
    es_desalojo: false,
  }))
}
