import { describe, it, expect } from 'vitest'
import { capabilitiesForProfile, can, ALL_CAPABILITY_KEYS } from '@/lib/permissions'

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
