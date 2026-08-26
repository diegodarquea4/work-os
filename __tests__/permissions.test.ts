import { describe, it, expect } from 'vitest'
import {
  capabilitiesForProfile, can, ALL_CAPABILITY_KEYS,
  operarCapForInstancia, cerrarCapForInstancia, defaultRegionScopeForCap, isGlobalCap,
} from '@/lib/permissions'

/**
 * Región por defecto al conceder una capacidad (Usuarios → Permisos). El bug
 * previo: toda cap nueva arrancaba en '*' (todas), lo que sobre-concedía a un
 * usuario de región las 16 regiones. Ahora sigue el footprint del usuario.
 */
describe('defaultRegionScopeForCap — región por defecto al conceder', () => {
  it('usuario con acceso a todas (sin region_cods) → todas para cualquier cap', () => {
    expect(defaultRegionScopeForCap('region.gestionar_ejes', [])).toEqual({ mode: 'all', cods: [] })
    expect(defaultRegionScopeForCap('comite.gabinete.operar', [])).toEqual({ mode: 'all', cods: [] })
  })

  it('usuario de región → sus regiones para caps operativas', () => {
    expect(defaultRegionScopeForCap('comite.gabinete.operar', ['X'])).toEqual({ mode: 'scoped', cods: ['X'] })
    expect(defaultRegionScopeForCap('metrica.definir', ['XIV'])).toEqual({ mode: 'scoped', cods: ['XIV'] })
    // multi-región: todas las suyas
    expect(defaultRegionScopeForCap('region.gestionar_ejes', ['X', 'XIV'])).toEqual({ mode: 'scoped', cods: ['X', 'XIV'] })
  })

  it('usuario de región → globales (secciones + preset regional "all") quedan en todas', () => {
    expect(defaultRegionScopeForCap('sec.dashboard', ['X'])).toEqual({ mode: 'all', cods: [] })
    expect(defaultRegionScopeForCap('sec.permisos', ['X'])).toEqual({ mode: 'all', cods: [] })     // sec.* siempre global
    expect(defaultRegionScopeForCap('dashboard.exportar', ['X'])).toEqual({ mode: 'all', cods: [] })
    expect(defaultRegionScopeForCap('iniciativa.seguimiento_crear', ['X'])).toEqual({ mode: 'all', cods: [] })
    expect(defaultRegionScopeForCap('iniciativa.marcar_foco', ['X'])).toEqual({ mode: 'all', cods: [] })
  })

  it('cap operativa no-preset (admin) concedida a usuario de región → fail-closed (scoped, nunca "*")', () => {
    expect(defaultRegionScopeForCap('desalojos.editar', ['VIII'])).toEqual({ mode: 'scoped', cods: ['VIII'] })
    expect(defaultRegionScopeForCap('iniciativa.eliminar', ['VIII'])).toEqual({ mode: 'scoped', cods: ['VIII'] })
  })
})

/**
 * `isGlobalCap` decide, en el editor de Permisos, qué caps van como sí/no (sin
 * picker de región, guardadas en '*') vs cuáles muestran el manejo granular por
 * región. Globales = secciones + las que el preset regional marca 'all'.
 */
describe('isGlobalCap — sí/no vs acotable por región', () => {
  it('secciones y globales del preset regional son globales (sí/no)', () => {
    expect(isGlobalCap('sec.dashboard')).toBe(true)
    expect(isGlobalCap('sec.permisos')).toBe(true)
    expect(isGlobalCap('dashboard.exportar')).toBe(true)
    expect(isGlobalCap('iniciativa.marcar_foco')).toBe(true)
    expect(isGlobalCap('iniciativa.seguimiento_crear')).toBe(true)
    expect(isGlobalCap('iniciativa.documento_subir')).toBe(true)
    expect(isGlobalCap('planificacion.exportar_pdf')).toBe(true)
  })
  it('las operativas NO son globales (acotables por región)', () => {
    expect(isGlobalCap('metrica.definir')).toBe(false)
    expect(isGlobalCap('region.gestionar_ejes')).toBe(false)
    expect(isGlobalCap('desalojos.editar')).toBe(false)
    expect(isGlobalCap('comite.policial.operar')).toBe(false)
    expect(isGlobalCap('iniciativa.editar_operativo')).toBe(false)
    expect(isGlobalCap('metrica.reportar_valor')).toBe(false)
  })
})

/**
 * Mapeo instancia (BD) → capacidad de comité. Los nombres de la BD NO coinciden
 * con los slugs del catálogo ('eje'=policial, 'inversion'=económico): estos casos
 * blindan esa desalineación (un template `comite.${instancia}.operar` fallaría).
 */
describe('operar/cerrarCapForInstancia — mapeo histórico', () => {
  it('eje → Comité Policial', () => {
    expect(operarCapForInstancia('eje')).toBe('comite.policial.operar')
  })
  it('inversion → Comité Económico', () => {
    expect(operarCapForInstancia('inversion')).toBe('comite.economico.operar')
  })
  it('politico / gabinete / infraestructura mapean directo', () => {
    expect(operarCapForInstancia('politico')).toBe('comite.politico.operar')
    expect(operarCapForInstancia('gabinete')).toBe('comite.gabinete.operar')
    expect(operarCapForInstancia('infraestructura')).toBe('comite.infraestructura.operar')
  })
  it('instancia desconocida → null (fail-closed)', () => {
    expect(operarCapForInstancia('otra')).toBeNull()
    expect(cerrarCapForInstancia('otra')).toBeNull()
  })
  it('cerrar de infraestructura usa el cap de cierre propio; el resto pliega en operar', () => {
    expect(cerrarCapForInstancia('infraestructura')).toBe('comite.infraestructura.cerrar')
    expect(cerrarCapForInstancia('eje')).toBe('comite.policial.operar')
    expect(cerrarCapForInstancia('inversion')).toBe('comite.economico.operar')
  })
  it('todas las caps devueltas existen en el catálogo', () => {
    for (const inst of ['eje', 'politico', 'inversion', 'gabinete', 'infraestructura']) {
      expect(ALL_CAPABILITY_KEYS).toContain(operarCapForInstancia(inst))
      expect(ALL_CAPABILITY_KEYS).toContain(cerrarCapForInstancia(inst))
    }
  })
})

/**
 * Fase 0 capas de usuarios — INVARIANTE DE NO-REGRESIÓN.
 * `capabilitiesForProfile` debe reproducir EXACTAMENTE los gates de hoy. Estos
 * casos fijan los puntos que romperían el acceso si se toca un preset.
 */
describe('capas de usuarios — espejo de roles (Fase 0)', () => {
  const admin    = capabilitiesForProfile({ role: 'admin',    region_cods: [] })
  const editor   = capabilitiesForProfile({ role: 'editor',   region_cods: [] })
  const regional = capabilitiesForProfile({ role: 'regional', region_cods: ['X', 'XIV'] })
  const viewer   = capabilitiesForProfile({ role: 'viewer',   region_cods: ['X'] })

  it('admin: todo, en todas las regiones', () => {
    expect(can(admin, 'usuarios.gestionar')).toBe(true)
    expect(can(admin, 'desalojos.editar')).toBe(true)
    expect(can(admin, 'sec.permisos')).toBe(true)
    expect(can(admin, 'iniciativa.editar_operativo', 'II')).toBe(true) // '*' cubre cualquier región
  })

  it('editor: como admin salvo admin-only, desalojos y permisos', () => {
    expect(can(editor, 'iniciativa.editar_definicional')).toBe(true)
    expect(can(editor, 'prego.editar')).toBe(true)
    expect(can(editor, 'comite.infraestructura.configurar')).toBe(true)
    expect(can(editor, 'usuarios.gestionar')).toBe(false)
    expect(can(editor, 'dashboard.importar')).toBe(false)
    expect(can(editor, 'region.minuta_generar')).toBe(false)
    expect(can(editor, 'sec.desalojos')).toBe(false)
    expect(can(editor, 'desalojos.editar')).toBe(false)
    expect(can(editor, 'comite.borrar_sesion')).toBe(false)
    expect(can(editor, 'proposals.aprobar')).toBe(false)
  })

  it('regional: operativo scopeado a sus regiones, definicional bloqueado', () => {
    expect(can(regional, 'iniciativa.editar_operativo', 'X')).toBe(true)
    expect(can(regional, 'iniciativa.editar_operativo', 'XIV')).toBe(true)
    expect(can(regional, 'iniciativa.editar_operativo', 'II')).toBe(false)      // fuera de sus regiones
    expect(can(regional, 'iniciativa.editar_definicional', 'X')).toBe(false)
    expect(can(regional, 'comite.infraestructura.operar', 'X')).toBe(true)
    expect(can(regional, 'comite.infraestructura.configurar', 'X')).toBe(false) // staff-only (mig 064)
    expect(can(regional, 'sec.mi_region')).toBe(true)
    expect(can(regional, 'sec.permisos')).toBe(false)
    expect(can(regional, 'iniciativa.marcar_foco', 'II')).toBe(true)            // abierto a todos ('*')
  })

  it('viewer: lectura + aportar; nada operativo ni comités', () => {
    expect(can(viewer, 'iniciativa.editar_operativo', 'X')).toBe(false)
    expect(can(viewer, 'iniciativa.marcar_foco', 'X')).toBe(false)  // RLS UPDATE excluye viewer hoy
    expect(can(viewer, 'iniciativa.seguimiento_crear')).toBe(true)  // INSERT abierto
    expect(can(viewer, 'planificacion.ver', 'X')).toBe(true)        // scopeado post-mig 064
    expect(can(viewer, 'planificacion.ver', 'II')).toBe(false)
    expect(can(viewer, 'planificacion.exportar_pdf')).toBe(false)   // mig 064 R3
    expect(can(viewer, 'comite.policial.operar', 'X')).toBe(false)
    expect(can(viewer, 'sec.prego')).toBe(false)
    expect(can(viewer, 'sec.desalojos')).toBe(true)                 // lectura scopeada
  })

  it('can(): región undefined = "en cualquier región"', () => {
    expect(can(regional, 'iniciativa.editar_operativo')).toBe(true)  // la tiene en X/XIV
    expect(can(viewer, 'iniciativa.editar_operativo')).toBe(false)
  })

  it('regional/viewer sin region_cods: sin capacidades scopeadas, sí las de sección', () => {
    const r0 = capabilitiesForProfile({ role: 'regional', region_cods: [] })
    expect(can(r0, 'iniciativa.editar_operativo', 'X')).toBe(false)
    expect(can(r0, 'sec.mi_region')).toBe(true)
  })

  it('todas las claves concedidas están en el catálogo', () => {
    const keys = new Set<string>(ALL_CAPABILITY_KEYS)
    for (const role of [admin, editor, regional, viewer]) {
      for (const c of role) expect(keys.has(c.key)).toBe(true)
    }
  })
})
