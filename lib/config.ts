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
