import type { UserProfile, UserRole } from '@/lib/apiAuth'

/**
 * Catálogo único de capacidades del panel (Fase 0 del plan "Capas de usuarios").
 *
 * DOS FAMILIAS de claves, cada una concedible por región:
 *   - Visibilidad de sección (`sec.*`): grueso, on/off de una pestaña.
 *   - Funciones (resto): ultra-granular, una por acción.
 *
 * En Fase 0 esto es ADITIVO y en su mayoría dormido: `/api/me` ya devuelve las
 * capacidades espejo del rol (para el nuevo hook `useCan`), pero los 5 hooks
 * legacy y la RLS siguen intactos. El enforcement duro (RLS/triggers →
 * `current_user_can`) llega en Fases 2/3. La tabla `user_capabilities` +
 * `current_user_can()` (mig 065) son la fuente de verdad de la BD; el backfill
 * espejo se hace con `capabilitiesForProfile()` (misma lógica, una sola fuente).
 *
 * INVARIANTE DE NO-REGRESIÓN: `ROLE_PRESETS` reproduce EXACTAMENTE los gates de
 * hoy (ver el inventario del plan). Cambiar un default acá cambia el acceso.
 */

// ── Secciones (visibilidad de pestaña) ──────────────────────────────────────
export const SECTIONS = [
  { key: 'sec.mapa',      label: 'Mapa' },
  { key: 'sec.dashboard', label: 'Dashboard' },
  { key: 'sec.gabinete',  label: 'Gabinete (Kanban)' },
  { key: 'sec.mi_region', label: 'Mi Región' },
  { key: 'sec.metricas',  label: 'Métricas' },
  { key: 'sec.desalojos', label: 'Desalojos' },
  { key: 'sec.prego',     label: 'PREGO' },
  { key: 'sec.permisos',  label: 'Permisos (Usuarios)' },
] as const

// ── Funciones (permisos por acción), agrupadas por sección ──────────────────
export const FUNCTIONS = [
  // Ficha de iniciativa
  { key: 'iniciativa.editar_operativo',    label: 'Editar operativo (semáforo/avance/responsable)', group: 'Ficha de iniciativa' },
  { key: 'iniciativa.editar_definicional', label: 'Editar definicional (nombre/ministerio/etapa/…)', group: 'Ficha de iniciativa' },
  { key: 'iniciativa.editar_capa',         label: 'Editar capa',                                     group: 'Ficha de iniciativa' },
  { key: 'iniciativa.marcar_foco',         label: 'Marcar en foco',                                  group: 'Ficha de iniciativa' },
  { key: 'iniciativa.marcar_desalojo',     label: 'Marcar como desalojo',                            group: 'Ficha de iniciativa' },
  { key: 'iniciativa.eliminar',            label: 'Eliminar iniciativa',                             group: 'Ficha de iniciativa' },
  { key: 'iniciativa.seguimiento_crear',   label: 'Crear seguimiento',                               group: 'Ficha de iniciativa' },
  { key: 'iniciativa.documento_subir',     label: 'Subir documento',                                 group: 'Ficha de iniciativa' },
  { key: 'iniciativa.gestionar_ajeno',     label: 'Editar/borrar ítems de otros',                    group: 'Ficha de iniciativa' },
  // Dashboard
  { key: 'dashboard.importar',      label: 'Importar Excel',    group: 'Dashboard' },
  { key: 'dashboard.edicion_masiva', label: 'Edición masiva',   group: 'Dashboard' },
  { key: 'dashboard.exportar',      label: 'Exportar',          group: 'Dashboard' },
  // Planificación (carta Gantt de tareas — mig 063)
  { key: 'planificacion.ver',         label: 'Ver planificación',      group: 'Planificación' },
  { key: 'planificacion.editar',      label: 'Crear/editar tareas',    group: 'Planificación' },
  { key: 'planificacion.exportar_pdf', label: 'Exportar Gantt a PDF',  group: 'Planificación' },
  // Mi Región
  { key: 'region.proponer',       label: 'Proponer actualización', group: 'Mi Región' },
  { key: 'region.minuta_generar', label: 'Generar/regenerar minuta', group: 'Mi Región' },
  { key: 'region.gestionar_ejes', label: 'Gestionar catálogo de ejes', group: 'Mi Región' },
  // Métricas de eje
  { key: 'metrica.definir',        label: 'Definir métrica',   group: 'Métricas de eje' },
  { key: 'metrica.reportar_valor', label: 'Reportar valor',    group: 'Métricas de eje' },
  // Comités (por instancia)
  { key: 'comite.policial.operar',        label: 'Operar Comité Policial',        group: 'Comités' },
  { key: 'comite.politico.operar',        label: 'Operar Comité Político',        group: 'Comités' },
  { key: 'comite.economico.operar',       label: 'Operar Comité Económico',       group: 'Comités' },
  { key: 'comite.gabinete.operar',        label: 'Operar Gabinete Regional',      group: 'Comités' },
  { key: 'comite.infraestructura.operar', label: 'Operar Comité de Infraestructura', group: 'Comités' },
  { key: 'comite.infraestructura.cerrar', label: 'Cerrar sesión de Infraestructura', group: 'Comités' },
  { key: 'comite.infraestructura.configurar', label: 'Configurar Comité de Infraestructura', group: 'Comités' },
  { key: 'comite.borrar_sesion',          label: 'Borrar sesión del historial',   group: 'Comités' },
  { key: 'comite.seia_sync',              label: 'Sincronizar SEIA',              group: 'Comités' },
  // Desalojos
  { key: 'desalojos.editar',         label: 'Editar desalojos',        group: 'Desalojos' },
  { key: 'desalojos.descargar_docs', label: 'Descargar docs firmados', group: 'Desalojos' },
  // PREGO
  { key: 'prego.editar', label: 'Editar PREGO', group: 'PREGO' },
  // Permisos / transversales
  { key: 'usuarios.gestionar',      label: 'Gestionar usuarios',            group: 'Permisos' },
  { key: 'docs_regionales.gestionar', label: 'Gestionar documentos regionales', group: 'Documentos regionales' },
  { key: 'proposals.aprobar',       label: 'Aprobar/rechazar propuestas',   group: 'Propuestas' },
] as const

export type CapabilityKey =
  | (typeof SECTIONS)[number]['key']
  | (typeof FUNCTIONS)[number]['key']

/** Todas las claves válidas, para validación en la UI/API (Fase 1). */
export const ALL_CAPABILITY_KEYS: CapabilityKey[] = [
  ...SECTIONS.map(s => s.key),
  ...FUNCTIONS.map(f => f.key),
]

/** Una capacidad concedida a un usuario: (clave, región). `'*'` = todas las regiones. */
export type UserCapability = { key: CapabilityKey; region: string }

/**
 * `can(caps, key, region?)` — helper puro. Verdadero si el usuario tiene la
 * clave concedida para `region` específica O para `'*'` (todas). Sin `region`,
 * verdadero si tiene la clave en cualquier región (ver la sección, tener el
 * permiso en al menos una región).
 */
export function can(caps: UserCapability[], key: CapabilityKey, region?: string): boolean {
  if (region === undefined) return caps.some(c => c.key === key)
  return caps.some(c => c.key === key && (c.region === '*' || c.region === region))
}

// ── Presets por rol (ESPEJO EXACTO de los gates de hoy) ──────────────────────
// `all`    → una fila con region '*'.
// `scoped` → una fila por cada region_cod del usuario (regional/viewer filtrado).
type RegionPolicy = 'all' | 'scoped'
type PresetEntry = readonly [CapabilityKey, RegionPolicy]

// Secciones que ve cada rol (todas 'all' — la sección se ve; los datos dentro
// se acotan por otras capacidades/RLS).
const SEC_STAFF_FULL: PresetEntry[] = [
  ['sec.mapa', 'all'], ['sec.dashboard', 'all'], ['sec.gabinete', 'all'],
  ['sec.mi_region', 'all'], ['sec.metricas', 'all'], ['sec.prego', 'all'],
]
const SEC_REGIONAL_VIEWER: PresetEntry[] = [
  ['sec.mapa', 'all'], ['sec.dashboard', 'all'], ['sec.gabinete', 'all'],
  ['sec.mi_region', 'all'], ['sec.metricas', 'all'], ['sec.desalojos', 'all'],
]

export const ROLE_PRESETS: Record<UserRole, PresetEntry[]> = {
  // admin: todo, en todas las regiones.
  admin: [
    ...SEC_STAFF_FULL, ['sec.desalojos', 'all'], ['sec.permisos', 'all'],
    ['iniciativa.editar_operativo', 'all'], ['iniciativa.editar_definicional', 'all'],
    ['iniciativa.editar_capa', 'all'], ['iniciativa.marcar_foco', 'all'],
    ['iniciativa.marcar_desalojo', 'all'], ['iniciativa.eliminar', 'all'],
    ['iniciativa.seguimiento_crear', 'all'], ['iniciativa.documento_subir', 'all'],
    ['iniciativa.gestionar_ajeno', 'all'],
    ['dashboard.importar', 'all'], ['dashboard.edicion_masiva', 'all'], ['dashboard.exportar', 'all'],
    ['planificacion.ver', 'all'], ['planificacion.editar', 'all'], ['planificacion.exportar_pdf', 'all'],
    ['region.proponer', 'all'], ['region.minuta_generar', 'all'], ['region.gestionar_ejes', 'all'],
    ['metrica.definir', 'all'], ['metrica.reportar_valor', 'all'],
    ['comite.policial.operar', 'all'], ['comite.politico.operar', 'all'],
    ['comite.economico.operar', 'all'], ['comite.gabinete.operar', 'all'],
    ['comite.infraestructura.operar', 'all'], ['comite.infraestructura.cerrar', 'all'],
    ['comite.infraestructura.configurar', 'all'], ['comite.borrar_sesion', 'all'], ['comite.seia_sync', 'all'],
    ['desalojos.editar', 'all'], ['desalojos.descargar_docs', 'all'],
    ['prego.editar', 'all'], ['usuarios.gestionar', 'all'],
    ['docs_regionales.gestionar', 'all'], ['proposals.aprobar', 'all'],
  ],
  // editor ≈ admin, SIN: desalojos (excluido), permisos, import, minuta,
  // marcar_desalojo, borrar_sesion, aprobar propuestas.
  editor: [
    ...SEC_STAFF_FULL,
    ['iniciativa.editar_operativo', 'all'], ['iniciativa.editar_definicional', 'all'],
    ['iniciativa.editar_capa', 'all'], ['iniciativa.marcar_foco', 'all'],
    ['iniciativa.eliminar', 'all'],
    ['iniciativa.seguimiento_crear', 'all'], ['iniciativa.documento_subir', 'all'],
    ['iniciativa.gestionar_ajeno', 'all'],
    ['dashboard.edicion_masiva', 'all'], ['dashboard.exportar', 'all'],
    ['planificacion.ver', 'all'], ['planificacion.editar', 'all'], ['planificacion.exportar_pdf', 'all'],
    ['region.proponer', 'all'], ['region.gestionar_ejes', 'all'],
    ['metrica.definir', 'all'], ['metrica.reportar_valor', 'all'],
    ['comite.policial.operar', 'all'], ['comite.politico.operar', 'all'],
    ['comite.economico.operar', 'all'], ['comite.gabinete.operar', 'all'],
    ['comite.infraestructura.operar', 'all'], ['comite.infraestructura.cerrar', 'all'],
    ['comite.infraestructura.configurar', 'all'], ['comite.seia_sync', 'all'],
    ['prego.editar', 'all'], ['docs_regionales.gestionar', 'all'],
  ],
  // regional: secciones 'all'; capacidades operativas 'scoped' a sus region_cods.
  regional: [
    ...SEC_REGIONAL_VIEWER,
    ['iniciativa.editar_operativo', 'scoped'],
    ['iniciativa.marcar_foco', 'all'],
    ['iniciativa.seguimiento_crear', 'all'], ['iniciativa.documento_subir', 'all'],
    ['dashboard.edicion_masiva', 'scoped'], ['dashboard.exportar', 'all'],
    ['planificacion.ver', 'scoped'], ['planificacion.editar', 'scoped'], ['planificacion.exportar_pdf', 'all'],
    ['region.proponer', 'scoped'],
    ['metrica.reportar_valor', 'scoped'],
    ['comite.policial.operar', 'scoped'], ['comite.politico.operar', 'scoped'],
    ['comite.economico.operar', 'scoped'], ['comite.gabinete.operar', 'scoped'],
    ['comite.infraestructura.operar', 'scoped'], ['comite.infraestructura.cerrar', 'scoped'],
  ],
  // viewer: secciones 'all'; solo puede aportar (seguimiento/documento abiertos)
  // + tareas/planificación 'scoped' (post mig 064). Sin operar comités.
  viewer: [
    ...SEC_REGIONAL_VIEWER,
    ['iniciativa.marcar_foco', 'all'],
    ['iniciativa.seguimiento_crear', 'all'], ['iniciativa.documento_subir', 'all'],
    ['dashboard.exportar', 'all'],
    ['planificacion.ver', 'scoped'], ['planificacion.editar', 'scoped'],
  ],
}

/**
 * Deriva las capacidades espejo de un perfil (rol × region_cods). Fuente única
 * usada por `/api/me` (lo que ve el cliente) y por el backfill de
 * `user_capabilities`. Determinístico → reproduce exactamente el acceso de hoy.
 */
export function capabilitiesForProfile(
  profile: Pick<UserProfile, 'role' | 'region_cods'>,
): UserCapability[] {
  const preset = ROLE_PRESETS[profile.role] ?? ROLE_PRESETS.viewer
  const out: UserCapability[] = []
  for (const [key, policy] of preset) {
    if (policy === 'all') {
      out.push({ key, region: '*' })
    } else {
      for (const cod of profile.region_cods) out.push({ key, region: cod })
    }
  }
  return out
}

/**
 * Mapa `eje_sesiones.instancia` (valor en BD) → capacidad de OPERAR ese comité.
 * OJO: la BD usa nombres históricos que NO coinciden con los slugs del catálogo
 * — `'eje'` = Comité Policial (se ancla al eje con sesiones habilitadas) e
 * `'inversion'` = Comité Económico. Por eso el mapeo es explícito. Instancia
 * desconocida → null (el gate debe fallar cerrado). Fuente única para gatear las
 * rutas de sesiones (cerrar/acta) por capacidad + región.
 */
export function operarCapForInstancia(instancia: string): CapabilityKey | null {
  switch (instancia) {
    case 'eje':             return 'comite.policial.operar'
    case 'politico':        return 'comite.politico.operar'
    case 'inversion':       return 'comite.economico.operar'
    case 'gabinete':        return 'comite.gabinete.operar'
    case 'infraestructura': return 'comite.infraestructura.operar'
    default:                return null
  }
}

/**
 * Capacidad requerida para CERRAR una sesión de esa instancia. Infraestructura
 * tiene un cap de cierre propio (mig 064); el resto pliega el cierre en operar.
 */
export function cerrarCapForInstancia(instancia: string): CapabilityKey | null {
  if (instancia === 'infraestructura') return 'comite.infraestructura.cerrar'
  return operarCapForInstancia(instancia)
}
