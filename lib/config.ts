// Shared configuration constants — single source of truth for colors and labels
// used across ProjectTrackerModal, ProjectsPanel, KanbanView, NationalDashboard

export const SEMAFORO_CONFIG = {
  verde: { dot: 'bg-green-500', ring: 'ring-green-300', label: 'En verde'    },
  ambar: { dot: 'bg-amber-400', ring: 'ring-amber-300', label: 'En revisión' },
  rojo:  { dot: 'bg-red-500',   ring: 'ring-red-300',   label: 'Bloqueado'   },
  gris:  { dot: 'bg-gray-300',  ring: 'ring-gray-200',  label: 'Sin evaluar' },
} as const

export type SemaforoKey = keyof typeof SEMAFORO_CONFIG

export const EJE_COLORS: Record<string, string> = {
  'Eje 1: Infraestructura y Conectividad':           'bg-blue-100 text-blue-700',
  'Eje 2: Energía y Medio Ambiente':                 'bg-yellow-100 text-yellow-700',
  'Eje 3: Salud y Servicios Básicos':                'bg-green-100 text-green-700',
  'Eje 4: Seguridad y Soberanía':                    'bg-red-100 text-red-700',
  'Eje 5: Desarrollo Productivo e Innovación':       'bg-purple-100 text-purple-700',
  'Eje 6: Familia, Educación y Equidad Territorial': 'bg-pink-100 text-pink-700',
}

export type EjeGobierno = 'Economía' | 'Seguridad' | 'Social'

export const EJE_GOBIERNO: Record<string, EjeGobierno> = {
  'Eje 1: Infraestructura y Conectividad':           'Economía',
  'Eje 2: Energía y Medio Ambiente':                 'Economía',
  'Eje 3: Salud y Servicios Básicos':                'Social',
  'Eje 4: Seguridad y Soberanía':                    'Seguridad',
  'Eje 5: Desarrollo Productivo e Innovación':       'Economía',
  'Eje 6: Familia, Educación y Equidad Territorial': 'Social',
}

export function prioridadColor(p: 'Alta' | 'Media' | 'Baja') {
  return p === 'Alta'  ? { bg: 'bg-red-100',   text: 'text-red-700',   flag: 'text-red-500'   } :
         p === 'Media' ? { bg: 'bg-amber-100', text: 'text-amber-700', flag: 'text-amber-500' } :
                         { bg: 'bg-blue-100',  text: 'text-blue-700',  flag: 'text-blue-500'  }
}

/** Chip color for eje_gobierno value (compact, for inline use) */
export function ejeGobColor(eg: string | null): string {
  return eg === 'Seguridad' ? 'bg-red-50 text-red-700'
       : eg === 'Social'    ? 'bg-purple-50 text-purple-700'
       :                      'bg-blue-50 text-blue-700'
}

/** Header/banner color for eje_gobierno grouping (stronger background) */
export function ejeGobHeaderColor(eg: string | null): string {
  return eg === 'Economía'  ? 'bg-blue-100 text-blue-800'
       : eg === 'Social'    ? 'bg-purple-100 text-purple-800'
       : eg === 'Seguridad' ? 'bg-red-100 text-red-800'
       :                      'bg-gray-100 text-gray-600'
}

// ── Ministerios canónicos ─────────────────────────────────────────────────────
// Lista alineada con el cleanup de datos (migración 006). Es el catálogo desde
// el que se asignan los ministerios responsables en el panel.
// Incluye también entidades no-ministeriales que se trackean en el mismo campo
// (Municipalidad, Gobierno Regional, Poder Judicial, Ministerio Público, Bomberos).

export const MINISTERIOS_CANONICOS = [
  // Ejecutivo — orden por carga histórica en el panel
  'Ministerio de Obras Públicas',
  'Ministerio de Vivienda y Urbanismo',
  'Ministerio del Interior',
  'Ministerio de Educación',
  'Ministerio de Salud',
  'Ministerio de Transportes y Telecomunicaciones',
  'Ministerio de Agricultura',
  'Ministerio de Energía',
  'Ministerio de Economía, Fomento y Turismo',
  'Ministerio del Deporte',
  'Ministerio del Trabajo y Previsión Social',
  'Ministerio de Justicia y Derechos Humanos',
  'Ministerio de las Culturas, las Artes y el Patrimonio',
  'Ministerio del Medio Ambiente',
  'Ministerio de Desarrollo Social y Familia',
  'Ministerio de Minería',
  'Ministerio de Defensa Nacional',
  'Ministerio de la Mujer y la Equidad de Género',
  'Ministerio de Seguridad Pública',
  'Ministerio de Bienes Nacionales',
  'Ministerio Secretaría General de Gobierno',
  'Ministerio Secretaría General de la Presidencia',
  'Ministerio de Ciencia, Tecnología, Conocimiento e Innovación',
  'Ministerio de Hacienda',
  'Ministerio de Relaciones Exteriores',
  'Ministerio de Salud Pública',
  // Otras entidades trackeadas en el mismo campo
  'Gobierno Regional',
  'Municipalidad',
  'Poder Judicial',
  'Ministerio Público',
  'Bomberos de Chile',
] as const

/** Splittea un valor del campo `ministerio` en una lista de carteras.
 *  El formato canónico para multi-ministerio es "Min. A · Min. B" (separador "·").
 *  Si una iniciativa tiene multi-ministerio aparece en cada columna de la vista. */
export function splitMinisterios(raw: string | null | undefined): string[] {
  if (!raw) return []
  // Remover paréntesis y su contenido ("MINVU (Seremi IV)" → "MINVU"), sin
  // partir nombres compuestos con " y " (ej. "Vivienda y Urbanismo", "Trabajo y
  // Previsión Social", "Justicia y Derechos Humanos").
  const cleaned = raw.replace(/\s*\([^)]*\)\s*/g, ' ').trim()
  return cleaned
    .split(/\s*·\s*/)
    .map(s => s.trim())
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
}

/** Une una lista de carteras al formato canónico almacenado en la BD. */
export function joinMinisterios(list: string[]): string | null {
  const clean = list.map(s => s.trim()).filter(Boolean)
  return clean.length === 0 ? null : clean.join(' · ')
}
